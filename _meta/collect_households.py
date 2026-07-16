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
import os
import sys

import lib_pdata as L
# collect_apartments의 K-apt 헬퍼 재사용(중복 구현 방지).
import collect_apartments as CA

APARTMENTS_JSON = CA.APARTMENTS_JSON
TRANSACTIONS_JSON = os.path.join(L.SITE_ASSETS, "transactions.json")
HOUSEHOLDS_JSON = os.path.join(L.SITE_ASSETS, "households.json")


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


def main():
    kapt_key = L.key(L.KAPT_KEYS)
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

    need = sum(len(v) for v in by_region.values())
    regions = list(dict.fromkeys(list(by_region) + list(extra_by_region)))
    print(f"세대수 보강 대상 — 큐레이션 {need}개 · 실거래전용 {extra_need}개 / {len(regions)}개 지역")
    stat = {"list_ok": 0, "list_empty": 0, "codes": 0, "matched": 0, "filled": 0, "extra_filled": 0, "dong_ok": 0}
    unmatched = []   # 이름매칭 실패 샘플 — 매칭률이 낮을 때 표기 차이를 바로 볼 수 있게

    # 시간 예산: 스텝 타임아웃으로 강제 종료되면 진행분이 통째로 유실된다(2026-07-03:
    # 25분 내내 돌고 저장 0건). 마감 전에 멈추고, 지역 단위로 중간 저장(checkpoint)한다.
    deadline = L.deadline_from_env()
    saved_filled = 0        # apartments.json 마지막 저장 시점의 filled
    saved_extra = 0         # households.json 마지막 저장 시점의 extra_filled

    for region in regions:
        if L.out_of_time(deadline, margin_sec=30):
            print(f"시간 예산 소진 — 남은 지역은 다음 실행에서 이어서 보강 (누적 {stat['filled']}건)")
            break
        lawd = L.LAWD[region]
        kmap = CA.kapt_map(lawd, kapt_key)
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
            if L.out_of_time(deadline, margin_sec=30):
                break
            code = CA.kapt_match(kmap, a["name"], CA._dong_of(a))
            if not code:
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
            if L.out_of_time(deadline, margin_sec=30):
                break
            code = CA.kapt_match(kmap, name, dong)
            if not code:
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
        print(f"[{region}] 매칭 진행 — 누적 세대수확보 큐레이션 {stat['filled']} · 실거래전용 {stat['extra_filled']}")
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
    if (need or extra_need) and not (stat["filled"] or stat["extra_filled"]):
        print("  ! 세대수 0건 — 위 단계 카운터로 원인 확인(권한/목록빈값/이름매칭/기본정보응답).", file=sys.stderr)
        for d in getattr(CA, "_info_diag", []):
            print(f"    · 기본정보 실패 샘플: {d}", file=sys.stderr)

    if stat["filled"] > saved_filled:
        L.save_json_safe(APARTMENTS_JSON, data, min_items_key="apartments")
    if stat["extra_filled"] > saved_extra:
        hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
        L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    if not (stat["filled"] or stat["extra_filled"]):
        print("변경 없음 — 저장 생략")


if __name__ == "__main__":
    main()
