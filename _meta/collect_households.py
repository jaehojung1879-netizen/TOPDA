#!/usr/bin/env python3
"""단지 세대수·준공연도 보강 (K-apt 전용, Kakao 미사용)
  → site/assets/apartments.json  (맞춤찾기 큐레이션 단지)
  → site/assets/households.json  (실거래 원장에만 있는 단지 — 종합검색·정적 페이지용)

문제: collect_apartments.py는 신규 단지 Kakao 지오코딩(단지당 3회)이 느려 35분 타임아웃에
먼저 걸리고, 그 뒤에 오던 K-apt 세대수 보강이 거의 실행되지 못했다(전 1193개 중 30개만 채워짐).

해결: 세대수 보강만 떼어 별도 스텝으로 빠르게 끝까지 돌린다. 좌표·역·학교 없이
  지역목록(AptListService) 1회/지역 + 기본정보(AptBasisInfoService) 1회/단지
만 호출하므로 가볍다. 권한(403)·이름매칭·세대수응답 단계별 카운터로 원인을 즉시 진단한다.

2026-07 확장: 실거래(transactions.json)에만 있는 단지는 apartments.json 밖이라 세대수가
영영 안 붙었다(왕십리자이 민원). 지역 목록(kmap)을 이미 손에 든 김에 그 지역의
실거래-전용 단지도 함께 보강해 households.json에 축적한다. 우선순위는 큐레이션 단지 먼저.
"""
import datetime as dt
import json
import os
import sys

import lib_pdata as L
# collect_apartments의 K-apt 헬퍼 재사용(중복 구현 방지).
import collect_apartments as CA

APARTMENTS_JSON = CA.APARTMENTS_JSON
TRANSACTIONS_JSON = os.path.join(L.SITE_ASSETS, "transactions.json")
HOUSEHOLDS_JSON = os.path.join(L.SITE_ASSETS, "households.json")
# 지역별 보강 커버리지 리포트. 로그로만 남기면 실행이 끝난 뒤 확인하기 어렵고(스텝 로그가
# 수천 줄이라 tail로 닿지 않는다), 무엇보다 "K-apt에 아예 없어서"인지 "이름이 안 맞아서"인지를
# 가르는 데 매번 이 숫자가 필요하다. 커밋되는 파일로 남겨 언제든 바로 읽는다.
COVERAGE_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "data", "households_coverage.json")


def deals_only_names(apts):
    """실거래 원장에만 있는 단지를 지역별로. {region_key: [(name, dong), ...]}
    dong(법정동)은 세대수 매칭 정확도를 높이는 데 쓴다(일반명 충돌 해소)."""
    tx = L.load_json(TRANSACTIONS_JSON, default=None) or {}
    in_apts = {(a.get("region_key"), a.get("name")) for a in apts}
    out = {}
    seen = set()
    for d in tx.get("deals", []):
        rk, name = d.get("region_key"), d.get("apt")
        if not (rk and name) or rk not in L.LAWD:
            continue
        if (rk, name) in in_apts or (rk, name) in seen:
            continue
        seen.add((rk, name))
        dong = CA._dong_of({"region": d.get("region"), "region_key": rk})
        out.setdefault(rk, []).append((name, dong))
    return out


def _merge_kmaps(maps):
    """여러 LAWD 코드에서 받은 K-apt 단지목록을 하나로 합친다.
    같은 변형키를 서로 다른 코드가 주장하면 kapt_map과 같은 규칙으로 ''(모호) 표식."""
    out = {"sig": {}, "dong": {}, "n": 0, "n_dong": 0}
    for m in maps:
        if not m:
            continue
        out["n"] += m.get("n", 0)
        out["n_dong"] += m.get("n_dong", 0)
        for k, v in m.get("sig", {}).items():
            out["sig"][k] = "" if (k in out["sig"] and out["sig"][k] != v) else v
        for dong, tbl in m.get("dong", {}).items():
            cur = out["dong"].setdefault(dong, {})
            for k, v in tbl.items():
                cur[k] = "" if (k in cur and cur[k] != v) else v
    return out


def _recent_yms(n=2):
    """최근 n개월(YYYYMM) — LAWD 자가탐색이 코드 유효성을 확인하는 데 쓴다."""
    d = dt.date.today().replace(day=1)
    out = []
    for _ in range(n):
        out.append(d.strftime("%Y%m"))
        d = (d - dt.timedelta(days=1)).replace(day=1)
    return out


def region_coverage(target, filled, kapt_list):
    """지역별 커버리지 판정 지표. target·filled·kapt_list → total·kapt_ratio·name_gap.

    분모는 항상 total = target(잔여 보강대상) + filled(기보강)이다. target만 kapt_list와
    견주면 이미 채운 몫이 분모에서 빠져 K-apt 수록범위를 과대평가한다 — 2026-07-27
    리포트가 전국 kapt_list 11,542 ≥ target 9,164라 '표기 차이'로 읽혔지만, 실제 분모인
    전체 단지 16,241 대비로는 0.71이었다(79개 지역 중 kapt_list ≥ total은 13곳뿐).
    두 경우의 조치가 정반대라 이 분모를 틀리면 엉뚱한 곳을 고치게 된다.

    kapt_ratio : K-apt 목록이 그 지역 전체 실거래 단지를 덮는 비율(상한 추정).
                 1.0에 못 미치는 몫은 의무관리대상 외라 이름 규칙을 고쳐도 안 붙는다.
    name_gap   : K-apt에 있을 법한데 아직 못 붙인 단지 수(상한). 이름 정규화로 회수
                 가능한 최대치이므로, 이 값이 큰 지역부터 손대면 된다.
    """
    total = target + filled
    # K-apt 목록에는 실거래가 없는 단지(임대 등)도 섞여 있어 total을 넘을 수 있다.
    # 그대로 빼면 회수 여지가 부풀려지므로 total에서 자른다.
    listed = min(kapt_list, total)
    return {
        "total": total,
        "kapt_ratio": round(kapt_list / total, 2) if total else None,
        "name_gap": max(0, listed - filled),
    }


def main():
    kapt_key = L.key(L.KAPT_KEYS)
    # 실거래 API 키 — LAWD 자가탐색이 후보 코드의 거래 유무를 확인하는 데만 쓴다.
    trade_key = L.key(L.DATA_GO_KEYS)
    recent_yms = _recent_yms(2)
    if not kapt_key:
        print("[K-apt] 키 없음(DATA_GO_APT_BASIC_INFO/DATA_GO_*) — 세대수 보강 건너뜀", file=sys.stderr)
        return
    data = L.load_json(APARTMENTS_JSON, default=None)
    if not data or not data.get("apartments"):
        print("apartments.json 없음/비어 있음 — 보강 생략", file=sys.stderr)
        return
    apts = data["apartments"]

    # 세대수 없는 단지를 지역(region_key)별로 묶는다.
    by_region = {}
    for a in apts:
        if a.get("households"):
            continue
        rk = a.get("region_key")
        if rk in L.LAWD:
            by_region.setdefault(rk, []).append(a)

    # 실거래 원장에만 있는 단지(왕십리자이 류) — 이미 확보한 것은 제외.
    hh_data = L.load_json(HOUSEHOLDS_JSON, default=None) or {
        "_meta": {"source": "K-apt 공동주택 기본정보(AptBasisInfoService)",
                  "note": "실거래 원장에만 있는 단지의 세대수·준공연도. '지역|단지명' 키."},
        "map": {},
    }
    hh_map = hh_data.setdefault("map", {})
    extra_by_region = deals_only_names(apts)
    extra_need = 0
    for rk, entries in extra_by_region.items():
        entries[:] = [(n, d) for (n, d) in entries if f"{rk}|{n}" not in hh_map]
        extra_need += len(entries)

    # 지역별 기보강 단지 수(루프 시작 시점 고정). 리포트에서 kapt_list와 견줄 분모
    # total = target + filled 을 만드는 데 쓴다. target이 '아직 못 채운 잔여분'이라
    # 이 값을 더해야 그 지역의 전체 실거래 단지 수가 된다.
    prior_filled = {}
    for a in apts:
        if a.get("households") and a.get("region_key"):
            prior_filled[a["region_key"]] = prior_filled.get(a["region_key"], 0) + 1
    for k in hh_map:
        rk = k.split("|", 1)[0]
        prior_filled[rk] = prior_filled.get(rk, 0) + 1

    need = sum(len(v) for v in by_region.values())
    regions = list(dict.fromkeys(list(by_region) + list(extra_by_region)))
    print(f"세대수 보강 대상 — 큐레이션 {need}개 · 실거래전용 {extra_need}개 / {len(regions)}개 지역")
    stat = {"list_ok": 0, "list_empty": 0, "codes": 0, "matched": 0, "filled": 0, "extra_filled": 0, "dong_ok": 0}
    unmatched = []   # 이름매칭 실패 샘플
    per_region = []            # 지역별 커버리지(리포트 파일로 저장)
    unmatched_by_region = []   # 매칭률이 낮은 지역 진단(대상/목록/매칭 + 미매칭 이름 예시) — 매칭률이 낮을 때 표기 차이를 바로 볼 수 있게

    # 시간 예산: 스텝 타임아웃으로 강제 종료되면 진행분이 통째로 유실된다(2026-07-03:
    # 25분 내내 돌고 저장 0건). 마감 전에 멈추고, 지역 단위로 중간 저장(checkpoint)한다.
    deadline = L.deadline_from_env()   # 전체 마감(위치보강 포함) — 저장 시점 계산 등에 사용
    # 세대수 확보 지역 루프 전용 내부 마감(전체보다 이르게). 안 두면 대상이 큰 날
    # (2026-07-16: 실거래전용 9,596개) 지역 루프가 전체 예산을 다 써버려 아래 위치보강
    # 패스가 시작부터 out_of_time으로 0건이 된다 — 위치보강 몫을 마지막에 확실히 남긴다.
    region_deadline = deadline
    if deadline is not None:
        budget_min = float(os.environ.get("TIME_BUDGET_MIN", "20") or 20)
        loc_budget_min = min(5.0, budget_min * 0.25)
        region_deadline = deadline - loc_budget_min * 60
    saved_filled = 0        # apartments.json 마지막 저장 시점의 filled
    saved_extra = 0         # households.json 마지막 저장 시점의 extra_filled

    for region in regions:
        if L.out_of_time(region_deadline, margin_sec=30):
            print(f"시간 예산 소진 — 남은 지역은 다음 실행에서 이어서 보강 (누적 {stat['filled']}건)")
            break
        # 행정구역 개편으로 기본 LAWD 코드가 죽은 지역(화성시 41590 폐지, 인천 서구 검단구
        # 분리)은 그 코드로 K-apt를 물으면 단지목록이 빈다. 실거래·전세가율·단지 수집기는
        # 모두 자가탐색(resolve_lawd_codes)을 쓰는데 이 수집기만 빠져 있었다 — 그 결과
        # 인천 서구(190개)·경기 화성시(353개) 단지가 세대수 0% 상태로 남아 있었다.
        # 채택된 코드가 여러 개면 각각의 목록을 합쳐 쓴다.
        matched_before = stat["matched"]
        r_unmatched = []   # 이 지역에서 실제로 매칭 실패한 이름(진단 샘플의 원천)
        codes = ([L.LAWD[region]] if not trade_key
                 else L.resolve_lawd_codes(region, L.LAWD[region], trade_key, recent_yms))
        maps, auth_fail = [], False
        for code in codes:
            m = CA.kapt_map(code, kapt_key)
            if m is None:
                auth_fail = True
                break
            maps.append(m)
        kmap = None if auth_fail else _merge_kmaps(maps)
        if kmap is None:    # 403 권한 오류 → 활용신청 필요. 더 돌려도 동일하므로 중단.
            print("‼ K-apt 권한 오류(403) — data.go.kr에서 '공동주택 단지목록(AptListService)'·"
                  "'공동주택 기본정보(AptBasisInfoService)' API를 같은 계정으로 활용신청·승인하세요. "
                  "승인 후 다시 실행하면 세대수가 채워집니다.", file=sys.stderr)
            break
        if kmap.get("n"):
            stat["list_ok"] += 1
            stat["codes"] += kmap["n"]
            stat["dong_ok"] += kmap.get("n_dong", 0)
        else:
            stat["list_empty"] += 1
            continue
        # 1) 큐레이션 단지(맞춤찾기 노출) 먼저 — 법정동 병용 매칭
        for a in by_region.get(region, []):
            if L.out_of_time(region_deadline, margin_sec=30):
                break
            code = CA.kapt_match(kmap, a["name"], CA._dong_of(a))
            if not code:
                r_unmatched.append(a["name"])
                if len(unmatched) < 10:
                    unmatched.append(f"{region}/{a['name']}")
                continue
            stat["matched"] += 1
            hh, yr, _addr = CA.kapt_info(code, kapt_key)
            if hh:
                a["households"] = hh
                stat["filled"] += 1
            if yr and not a.get("built_year"):
                a["built_year"] = yr
        # 2) 실거래 원장에만 있는 단지 — households.json에 축적 (법정동 병용)
        for name, dong in extra_by_region.get(region, []):
            if L.out_of_time(region_deadline, margin_sec=30):
                break
            code = CA.kapt_match(kmap, name, dong)
            if not code:
                r_unmatched.append(name)
                continue
            stat["matched"] += 1
            hh, yr, addr = CA.kapt_info(code, kapt_key)
            if hh:
                entry = {"households": hh}
                if yr:
                    entry["built_year"] = yr
                if addr:
                    entry["addr"] = addr   # 좌표·역·학교 보강용 (아래 위치 보강 패스)
                hh_map[f"{region}|{name}"] = entry
                stat["extra_filled"] += 1
        # 지역별 진단 — 남은 미보강분이 'K-apt에 아예 없어서'인지 '이름이 안 맞아서'인지를
        # 가른다. 목록(K-apt 단지 수)을 대상 수가 아니라 전체 단지 수(total = 잔여 + 기보강)와
        # 견줘야 한다. 대상은 잔여분이라 분모로 쓰면 수록범위가 부풀려진다 — region_coverage 참고.
        # 이 두 경우의 대응이 정반대라 로그에 남긴다.
        r_target = len(by_region.get(region, [])) + len(extra_by_region.get(region, []))
        r_matched = stat["matched"] - matched_before
        cov = region_coverage(r_target, prior_filled.get(region, 0), kmap.get("n", 0))
        per_region.append({
            "region": region, "target": r_target, "filled": prior_filled.get(region, 0),
            "total": cov["total"], "kapt_list": kmap.get("n", 0),
            "kapt_ratio": cov["kapt_ratio"], "name_gap": cov["name_gap"],
            "matched": r_matched, "codes": codes,
            "unmatched_sample": r_unmatched[:8],
        })
        print(f"[{region}] 대상 {r_target}/전체 {cov['total']} · K-apt목록 {kmap.get('n', 0)}"
              f"(덮개 {cov['kapt_ratio']}) · 매칭 {r_matched} · 회수여지 {cov['name_gap']}"
              f" · 코드 {','.join(codes)}"
              f" — 누적 큐레이션 {stat['filled']} · 실거래전용 {stat['extra_filled']}")
        if r_target and r_matched * 2 < r_target and len(unmatched_by_region) < 8:
            unmatched_by_region.append(
                f"{region}(대상{r_target}/전체{cov['total']}/목록{kmap.get('n', 0)}"
                f"/덮개{cov['kapt_ratio']}/매칭{r_matched}): {', '.join(r_unmatched[:6])}")
        # 지역 단위 체크포인트 — 이후 어떤 이유로 중단돼도 여기까지의 확보분은 남는다.
        if stat["filled"] > saved_filled:
            if L.save_json_safe(APARTMENTS_JSON, data, min_items_key="apartments"):
                saved_filled = stat["filled"]
        if stat["extra_filled"] > saved_extra:
            hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
            if L.save_json_safe(HOUSEHOLDS_JSON, hh_data):
                saved_extra = stat["extra_filled"]

    # ── 위치 보강 패스: 주소는 있는데 좌표가 없는 실거래 전용 단지에 Kakao 지오코딩 +
    # 최근접 역/초등학교를 점진 채운다(단지당 3회 호출 — 회당 상한·시간예산 내).
    # 맞춤찾기의 '역거리·초등학교 정보 없음' 공백을 해소하는 핵심 경로.
    MAX_LOC = 150
    loc_filled = 0
    if os.environ.get("KAKAO_REST_API_KEY"):
        for key_, entry in hh_map.items():
            if loc_filled >= MAX_LOC or L.out_of_time(deadline, margin_sec=30):
                break
            if entry.get("lat") or not entry.get("addr"):
                continue
            try:
                geo = L.geocode_kakao(entry["addr"])
                if not geo:
                    entry["addr_bad"] = True   # 지오코딩 불가 주소 — 재시도 방지
                    entry.pop("addr", None)
                    continue
                lng, lat = geo
                entry["lat"], entry["lng"] = round(lat, 6), round(lng, 6)
                sub = L.nearest_kakao(lng, lat, category_code="SW8")
                if sub:
                    entry["subway"] = {"station": sub[0], "distance_m": sub[1]}
                sch = L.nearest_school_kakao(lng, lat)
                if sch:
                    entry["elementary"] = {"name": CA.clean_school(sch[0]), "distance_m": sch[1]}
                loc_filled += 1
            except Exception as e:  # noqa: BLE001 — 개별 실패는 다음 단지로
                print(f"  ! 위치 보강 실패 {key_}: {e}", file=sys.stderr)
        if loc_filled:
            hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
            L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    else:
        print("[위치보강] KAKAO_REST_API_KEY 없음 — 좌표·역·학교 보강 생략", file=sys.stderr)

    print(f"[K-apt] 목록성공 {stat['list_ok']}/빈 {stat['list_empty']} · 단지코드 {stat['codes']}개"
          f"(법정동보유 {stat['dong_ok']}) · 이름매칭 {stat['matched']} → "
          f"세대수확보 큐레이션 {stat['filled']} · 실거래전용 {stat['extra_filled']}건 · "
          f"위치보강 {loc_filled}건")
    if unmatched:
        print(f"  · 미매칭 샘플({len(unmatched)}): {', '.join(unmatched)}", file=sys.stderr)
    for line in unmatched_by_region:
        print(f"  · 매칭률 낮은 지역 — {line}", file=sys.stderr)
    if (need or extra_need) and not (stat["filled"] or stat["extra_filled"]):
        print("  ! 세대수 0건 — 위 단계 카운터로 원인 확인(권한/목록빈값/이름매칭/기본정보응답).", file=sys.stderr)
        for d in getattr(CA, "_info_diag", []):
            print(f"    · 기본정보 실패 샘플: {d}", file=sys.stderr)

    # 커버리지 리포트 저장 — 다음 조치를 정하는 근거다. 판정은 반드시 total(=target+filled)을
    # 분모로 본다. target은 '아직 못 채운 잔여분'이라 kapt_list와 직접 견주면 이미 채운 몫이
    # 빠져 수록범위가 부풀려진다.
    #   kapt_ratio << 1  → K-apt 수록범위 한계(의무관리대상만). 이름 규칙을 고쳐도 안 붙으므로
    #                      다른 출처(건축물대장 등)를 찾아야 한다.
    #   kapt_ratio ≈ 1 이상인데 name_gap 이 큼 → 표기 차이. 정규화 규칙으로 회수된다.
    # name_gap 내림차순으로 정렬해 손댈 값어치가 큰 지역이 위에 오게 한다.
    try:
        os.makedirs(os.path.dirname(COVERAGE_JSON), exist_ok=True)
        per_region.sort(key=lambda r: -r["name_gap"])
        tot_complexes = sum(r["total"] for r in per_region)
        tot_prior = sum(r["filled"] for r in per_region)
        tot_kapt = sum(r["kapt_list"] for r in per_region)
        with open(COVERAGE_JSON, "w", encoding="utf-8") as f:
            json.dump({
                "as_of": dt.date.today().strftime("%Y-%m-%d"),
                "note": "지역별 세대수 보강 커버리지. total=그 지역 전체 실거래 단지"
                        "(target 잔여분 + filled 기보강), kapt_list=K-apt 단지목록 수, "
                        "kapt_ratio=kapt_list/total(수록범위 상한), "
                        "name_gap=K-apt에 있을 법한데 아직 못 붙인 수(이름 규칙으로 회수 가능한 상한), "
                        "matched=이번 실행의 이름매칭 성공. "
                        "kapt_ratio가 1보다 많이 작으면 수록범위 한계라 이름 규칙을 고쳐도 소용없고, "
                        "1에 가까운데 name_gap이 크면 표기 차이다. "
                        "target만 kapt_list와 견주면 분모가 틀려 반대로 읽히니 주의.",
                "total": {
                    "complexes": tot_complexes,      # 전체 실거래 단지(분모)
                    "filled": tot_prior,             # 이번 실행 시작 시점까지 보강된 수
                    "target": need + extra_need,     # 남은 보강 대상
                    "kapt_list": tot_kapt,
                    "kapt_ratio": round(tot_kapt / tot_complexes, 2) if tot_complexes else None,
                    "name_gap": sum(r["name_gap"] for r in per_region),
                    "matched_this_run": stat["matched"],
                    "filled_this_run": stat["filled"] + stat["extra_filled"],
                },
                "regions": per_region,
            }, f, ensure_ascii=False, indent=1)
        print(f"[리포트] {COVERAGE_JSON} 저장 — 지역 {len(per_region)}개")
    except Exception as e:  # noqa: BLE001 — 리포트 실패가 수집 결과를 버리게 두지 않는다
        print(f"[리포트] 저장 실패(무시): {e}", file=sys.stderr)

    if stat["filled"] > saved_filled:
        L.save_json_safe(APARTMENTS_JSON, data, min_items_key="apartments")
    if stat["extra_filled"] > saved_extra:
        hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
        L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    if not (stat["filled"] or stat["extra_filled"]):
        print("변경 없음 — 저장 생략")


if __name__ == "__main__":
    main()
