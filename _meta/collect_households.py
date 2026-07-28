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
import concurrent.futures as cf
import datetime as dt
import json
import os
import sys

import lib_pdata as L
# collect_apartments의 K-apt 헬퍼 재사용(중복 구현 방지).
import collect_apartments as CA
# 원장 단지명 규칙(동 병합)은 수집기와 같은 정의를 써야 한다.
import collect_transactions as CT

APARTMENTS_JSON = CA.APARTMENTS_JSON
TRANSACTIONS_JSON = os.path.join(L.SITE_ASSETS, "transactions.json")
HOUSEHOLDS_JSON = os.path.join(L.SITE_ASSETS, "households.json")
# 단지별 지번 주소(collect_transactions.py 생성). K-apt 매칭 없이도 좌표를 찍을 수 있는
# 경로라, K-apt 수록범위 밖 단지(전국의 약 30%)의 역거리·초등학교 공백을 푸는 데 쓴다.
COMPLEX_ADDR_JSON = os.path.join(L.SITE_ASSETS, "complex_addr.json")
# 지역별 보강 커버리지 리포트. 로그로만 남기면 실행이 끝난 뒤 확인하기 어렵고(스텝 로그가
# 수천 줄이라 tail로 닿지 않는다), 무엇보다 "K-apt에 아예 없어서"인지 "이름이 안 맞아서"인지를
# 가르는 데 매번 이 숫자가 필요하다. 커밋되는 파일로 남겨 언제든 바로 읽는다.
COVERAGE_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "data", "households_coverage.json")


def deals_only_names(apts):
    """실거래 원장에만 있는 단지를 지역별로. {region_key: [(name, dong, dongs), ...]}

    dong(법정동)은 세대수 매칭 정확도를 높이는 데 쓴다(일반명 충돌 해소). dongs는 그
    단지명이 원장에서 걸친 법정동 전체 집합으로, 붙인 결과를 주소로 사후 검증할 때
    쓴다 — 전국 1.9%는 한 이름이 여러 동에 걸쳐 있어(예: '벽산블루밍' 상현동·신봉동)
    하나만 보고 판정하면 멀쩡한 매칭을 반려하게 된다."""
    tx = L.load_json(TRANSACTIONS_JSON, default=None) or {}
    in_apts = {(a.get("region_key"), a.get("name")) for a in apts}
    order, dongs = {}, {}
    for d in tx.get("deals", []):
        rk, name = d.get("region_key"), d.get("apt")
        if not (rk and name) or rk not in L.LAWD:
            continue
        if (rk, name) in in_apts:
            continue
        dong = CA._dong_of({"region": d.get("region"), "region_key": rk})
        if (rk, name) not in order:
            order[(rk, name)] = dong    # 매칭에 쓰는 대표 동(첫 거래 기준, 기존 동작)
        if dong:
            dongs.setdefault((rk, name), set()).add(dong)
    out = {}
    for (rk, name), dong in order.items():
        out.setdefault(rk, []).append((name, dong, dongs.get((rk, name), set())))
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


def purge_contradicting(hh_map, extra_by_region):
    """저장된 주소가 실거래 원장의 법정동과 어긋나는 기존 항목을 걷어낸다. 걷어낸 키 목록 반환.

    주소 검증(addr_contradicts_dong)은 새로 붙이는 건에만 걸리므로, 그 규칙이 생기기 전에
    이름만 보고 붙은 항목은 그대로 남는다 — 2026-07-27 실측 69건이 그렇다('목동두산위브'에
    신월동의 '신정뉴타운두산위브'가, '전농동삼성래미안'에 이문동 단지가 붙어 있었다).
    걷어낸 자리는 다시 보강 대상이 되므로 같은 실행에서 올바르게 재매칭된다.

    저장된 주소만으로 판정하므로 API 호출이 없다. 판정 근거가 없는 항목(주소 미보유)은
    건드리지 않는다 — 근거 없이 지우면 멀쩡한 세대수까지 잃는다."""
    dongs = {}
    for rk, entries in extra_by_region.items():
        for name, _dong, ds in entries:
            dongs[f"{rk}|{name}"] = ds
    bad = [k for k, v in hh_map.items()
           if CA.addr_contradicts_dong(v.get("addr"), dongs.get(k, set()))]
    for k in bad:
        del hh_map[k]
    return bad


def migrate_building_suffix_entries(hh_map, ledger_keys):
    """동 병합으로 옛 이름이 된 항목의 데이터를 합쳐진 단지로 옮긴다. 옮긴 키 목록 반환.

    collect_transactions.py가 '진명101동'·'102동'을 '진명'으로 합치면, 그 전에 옛 이름으로
    쌓아둔 세대수·좌표·역·학교가 고아가 된다(2026-07-27 실측 6건 — '동문2차아파트501동'이
    세대수 128과 좌표를 들고 있었다). 다시 받으려면 API를 또 불러야 하므로 그냥 옮긴다.

    원장에서 사라진 이름이면서 기본명이 원장에 있을 때만 옮긴다. 원장에 아직 옛 이름이
    남아 있으면 병합 대상이 아니었다는 뜻이므로 손대지 않는다.
    합칠 곳에 이미 값이 있으면 덮어쓰지 않는다 — 빈 항목만 채운다.
    """
    moved = []
    for key in list(hh_map):
        if key in ledger_keys:
            continue
        rk, _, name = key.partition("|")
        base = CT.building_base_name(name)
        if not base or f"{rk}|{base}" not in ledger_keys:
            continue
        src = hh_map.pop(key)
        cur = hh_map.get(f"{rk}|{base}")
        if cur is None:
            hh_map[f"{rk}|{base}"] = src
        else:
            for k, v in src.items():
                cur.setdefault(k, v)
        moved.append(key)
    return moved


def unlock_bad_addr_once(hh_data, hh_map, marker="2026-07-28"):
    """옛 버그로 잠긴 addr_bad 표식을 한 번만 푼다. 푼 개수 반환.

    geocode_kakao가 네트워크 오류·429까지 '결과 없음'과 뭉뚱그려 돌려주던 시절, 호출부가
    그걸 '이 주소는 영영 안 됨'으로 기록했다(2026-07-28 실측 274건). 그중 일부는 멀쩡한
    주소인데 그때 마침 호출이 실패한 것뿐이라 영구히 잃은 셈이다. 이제 두 경우를 구분하니
    한 번은 풀어 재시도할 기회를 준다.

    주소는 표식과 함께 지워졌으므로 여기서는 표식만 없앤다 — 지번 시딩이 다시 채운다.
    좌표를 이미 얻은 항목은 건드리지 않는다. 매 실행 반복하면 진짜 불량 주소를 계속
    다시 부르게 되므로 _meta에 표식을 남겨 한 번만 돈다.
    """
    meta = hh_data.setdefault("_meta", {})
    if meta.get("addr_bad_reset") == marker:
        return 0
    n = 0
    for e in hh_map.values():
        if e.pop("addr_bad", None) and e.get("lat") is None:
            n += 1
    meta["addr_bad_reset"] = marker
    return n


def seed_jibun_addrs(hh_map, addr_map, apts):
    """실거래 지번 주소를 좌표 없는 단지에 심는다. 심은 키 수 반환.

    좌표·역·초등학교는 주소가 있어야 붙는데, 지금은 그 주소를 K-apt에서만 받는다.
    K-apt는 의무관리대상만 실어 전국 단지의 71%밖에 못 덮고(2026-07-27 실측), 그래서
    파인더 노출 단지의 78%가 '역거리 정보 없음'이다. 실거래 원장의 지번은 거래가 있으면
    항상 오므로, 매칭 여부와 무관하게 위치를 확보할 수 있다.

    주소만 심고 세대수는 건드리지 않는다 — 세대수는 여전히 K-apt/건축물대장의 몫이다.
    이미 좌표나 주소가 있으면 손대지 않는다(지오코딩 실패 표식 addr_bad도 존중).
    """
    have_coords = {f"{a.get('region_key')}|{a.get('name')}"
                   for a in apts if a.get("lat") is not None}
    seeded = 0
    for key, val in addr_map.items():
        # 값은 {addr, sgg, umd, bun, ji} 객체다. 주소 문자열만 쓰던 초기 형식도 받아 준다.
        addr = val.get("addr") if isinstance(val, dict) else val
        if not addr or key in have_coords:
            continue
        e = hh_map.get(key)
        if e is None:
            hh_map[key] = {"addr": addr}   # 세대수 없는 위치 전용 항목
            seeded += 1
        elif not e.get("addr") and e.get("lat") is None and not e.get("addr_bad"):
            e["addr"] = addr
            seeded += 1
    return seeded


def addr_backfill_queue(hh_map, extra_by_region):
    """주소를 다시 물어봐야 할 기존 항목을 지역별로. {region_key: [(name, dong, dongs), ...]}

    세대수는 확보했는데 주소가 없는 항목이 대상이다. 주소가 있어야 좌표·역·초등학교를
    붙일 수 있는데, 이 항목들은 households가 있다는 이유로 보강 대상에서 빠져 다시
    조회되지 않는다 — 파인더에서 영영 '역거리 정보 없음'으로 남는다.

    제외 대상:
      addr      이미 주소가 있다(위치 보강 패스가 알아서 처리한다).
      no_addr   K-apt가 주소를 주지 않는 단지로 확인됐다. 매 실행 같은 호출을 반복하지 않는다.
      addr_bad  주소는 받았지만 지오코딩이 안 되는 주소다(위치 보강 패스가 표식을 남긴다).
    """
    out = {}
    for rk, entries in extra_by_region.items():
        for name, dong, dongs in entries:
            e = hh_map.get(f"{rk}|{name}")
            if not e or e.get("addr") or e.get("no_addr") or e.get("addr_bad"):
                continue
            out.setdefault(rk, []).append((name, dong, dongs))
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
    # 동 병합으로 옛 이름이 된 항목을 먼저 옮긴다. 안 옮기면 애써 모은 세대수·좌표가
    # 고아가 되고, 합쳐진 단지는 처음부터 다시 API를 불러야 한다.
    ledger_keys = ({f"{rk}|{n}" for rk, es in extra_by_region.items() for (n, _d, _ds) in es}
                   | {f"{a.get('region_key')}|{a.get('name')}" for a in apts})
    unlocked = unlock_bad_addr_once(hh_data, hh_map)
    if unlocked:
        print(f"지오코딩 실패 표식 {unlocked:,}건 해제 — 옛 버그로 요청 실패까지 "
              f"영구 잠금된 항목이다. 지번 주소를 다시 붙여 재시도한다")

    migrated = migrate_building_suffix_entries(hh_map, ledger_keys)
    if migrated:
        print(f"동 병합 반영 — 옛 이름 항목 {len(migrated)}개의 세대수·좌표를 합쳐진 단지로 이관")

    # 기존 항목 재검증 — 주소 검증은 새로 붙이는 건에만 걸리므로, 그 전에 잘못 붙은 것은
    # 그대로 남는다. 걷어내야 재매칭 대상이 되어 이번 실행에서 바로잡힌다.
    purged = purge_contradicting(hh_map, extra_by_region)

    # 주소 백필 대기열 — 세대수는 확보했는데 주소가 없어 좌표·역·학교를 못 붙인 항목.
    # 주소 수집은 2026-07-22에 들어왔고, 그 전에 채워진 항목은 households가 있다는 이유로
    # 보강 대상에서 빠져 다시 조회되지 않는다(실측 2,549건 = households.json의 44.6%).
    # 지오코딩 대기열은 0건이라 처리 속도가 아니라 '주소를 못 받은 것'이 병목이다 —
    # 그대로 두면 파인더에서 영영 '역거리 정보 없음'으로 남는다.
    # extra_by_region은 아래에서 기보강분이 걸러지므로, 그 전에 대기열을 떠둔다.
    # 실거래 지번으로 주소를 먼저 심는다. K-apt 왕복 없이 좌표를 확보할 수 있으므로
    # 아래 주소 백필 대기열도 그만큼 줄어든다 — 순서가 바뀌면 헛돈다.
    addr_map = (L.load_json(COMPLEX_ADDR_JSON, default=None) or {}).get("map") or {}
    seeded = seed_jibun_addrs(hh_map, addr_map, apts) if addr_map else 0
    if seeded:
        print(f"실거래 지번으로 주소 {seeded:,}건 확보 — K-apt 미매칭 단지 포함")
    elif not addr_map:
        print("complex_addr.json 없음 — 지번 기반 위치 보강 생략"
              "(collect_transactions.py를 먼저 실행해야 생성된다)", file=sys.stderr)

    backfill = addr_backfill_queue(hh_map, extra_by_region)
    backfill_need = sum(len(v) for v in backfill.values())

    extra_need = 0
    for rk, entries in extra_by_region.items():
        # 위치 전용 항목(지번 주소만 있고 세대수 없음)이 섞이므로 '키 존재'가 아니라
        # '세대수 확보 여부'로 걸러야 한다 — 아니면 세대수 보강 대상에서 통째로 빠진다.
        entries[:] = [e for e in entries
                      if not (hh_map.get(f"{rk}|{e[0]}") or {}).get("households")]
        extra_need += len(entries)

    # 지역별 기보강 단지 수(루프 시작 시점 고정). 리포트에서 kapt_list와 견줄 분모
    # total = target + filled 을 만드는 데 쓴다. target이 '아직 못 채운 잔여분'이라
    # 이 값을 더해야 그 지역의 전체 실거래 단지 수가 된다.
    prior_filled = {}
    for a in apts:
        if a.get("households") and a.get("region_key"):
            prior_filled[a["region_key"]] = prior_filled.get(a["region_key"], 0) + 1
    for k, v in hh_map.items():
        if not v.get("households"):
            continue    # 위치 전용 항목은 세대수 보강분이 아니다(커버리지 분모 오염 방지)
        rk = k.split("|", 1)[0]
        prior_filled[rk] = prior_filled.get(rk, 0) + 1

    if purged:
        print(f"기존 항목 재검증 — 주소의 법정동이 어긋나 {len(purged)}건 제거 "
              f"(재매칭 대상으로 되돌림): {', '.join(k.split('|')[-1] for k in purged[:8])}"
              + (" …" if len(purged) > 8 else ""), file=sys.stderr)

    need = sum(len(v) for v in by_region.values())
    regions = list(dict.fromkeys(list(by_region) + list(extra_by_region)))
    print(f"세대수 보강 대상 — 큐레이션 {need}개 · 실거래전용 {extra_need}개 / {len(regions)}개 지역"
          f" · 주소 백필 대기 {backfill_need}개")
    stat = {"list_ok": 0, "list_empty": 0, "codes": 0, "matched": 0, "filled": 0, "extra_filled": 0,
            "dong_ok": 0, "addr_reject": 0, "addr_backfill": 0}
    # 한 실행에서 백필할 상한. 수집 시간을 늘리지 않고 며칠에 걸쳐 메운다.
    MAX_BACKFILL = 300
    backfilled = 0
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
        # 지번 시딩(#158)이 주소 백필을 대체하면서 K-apt 루프의 할 일이 크게 줄었고,
        # 남은 미보강분은 대부분 K-apt 수록범위 밖이라 더 돌려도 안 붙는다. 반대로
        # 지오코딩 대기열은 7천 건대라 여기가 병목이다 — 몫을 25% → 50%로 옮긴다.
        loc_budget_min = float(os.environ.get("LOC_BUDGET_MIN", "0") or 0) or budget_min * 0.5
        region_deadline = deadline - loc_budget_min * 60
    saved_filled = 0        # apartments.json 마지막 저장 시점의 filled
    saved_extra = 0         # households.json 마지막 저장 시점의 extra_filled
    saved_backfill = 0      # households.json 마지막 저장 시점의 addr_backfill

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
            a_dong = CA._dong_of(a)
            code, via = CA.kapt_match_via(kmap, a["name"], a_dong)
            if not code:
                r_unmatched.append(a["name"])
                if len(unmatched) < 10:
                    unmatched.append(f"{region}/{a['name']}")
                continue
            hh, yr, addr = CA.kapt_info(code, kapt_key)
            # 이름만으로 붙은 건(via='sig')은 주소로 사후 검증한다. 법정동이 어긋나면
            # 다른 단지이므로 붙이지 않는다 — 엉뚱한 세대수가 붙는 게 비어 있는 것보다 나쁘다.
            if via == "sig" and CA.addr_contradicts_dong(addr, {a_dong} if a_dong else set()):
                stat["addr_reject"] += 1
                r_unmatched.append(a["name"])
                continue
            stat["matched"] += 1
            if hh:
                a["households"] = hh
                stat["filled"] += 1
            if yr and not a.get("built_year"):
                a["built_year"] = yr
        # 2) 실거래 원장에만 있는 단지 — households.json에 축적 (법정동 병용)
        for name, dong, dongs in extra_by_region.get(region, []):
            if L.out_of_time(region_deadline, margin_sec=30):
                break
            code, via = CA.kapt_match_via(kmap, name, dong)
            if not code:
                r_unmatched.append(name)
                continue
            hh, yr, addr = CA.kapt_info(code, kapt_key)
            if via == "sig" and CA.addr_contradicts_dong(addr, dongs):
                stat["addr_reject"] += 1
                r_unmatched.append(name)
                continue
            stat["matched"] += 1
            if hh:
                entry = {"households": hh}
                if yr:
                    entry["built_year"] = yr
                if addr:
                    entry["addr"] = addr   # 좌표·역·학교 보강용 (아래 위치 보강 패스)
                hh_map[f"{region}|{name}"] = entry
                stat["extra_filled"] += 1
        # 3) 주소 백필 — 세대수는 있으나 주소가 없어 위치 보강을 못 한 항목을 다시 물어본다.
        #    kaptCode를 저장해두지 않으므로 이름으로 재매칭한 뒤 기본정보를 한 번 더 부른다.
        for name, dong, dongs in backfill.get(region, []):
            if backfilled >= MAX_BACKFILL or L.out_of_time(region_deadline, margin_sec=30):
                break
            entry = hh_map.get(f"{region}|{name}")
            if entry is None or entry.get("addr"):
                continue
            code, via = CA.kapt_match_via(kmap, name, dong)
            if not code:
                continue
            _hh, _yr, addr = CA.kapt_info(code, kapt_key)
            if not addr:
                # K-apt가 이 단지의 주소를 주지 않는다 — 매 실행 같은 호출을 반복하지 않도록
                # 표식을 남긴다. 나중에 수록이 바뀌면 이 표식만 지우면 다시 시도한다.
                entry["no_addr"] = True
                continue
            if via == "sig" and CA.addr_contradicts_dong(addr, dongs):
                stat["addr_reject"] += 1
                continue
            entry["addr"] = addr
            stat["addr_backfill"] += 1
            backfilled += 1

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
        if stat["extra_filled"] > saved_extra or stat["addr_backfill"] > saved_backfill:
            hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
            if L.save_json_safe(HOUSEHOLDS_JSON, hh_data):
                saved_extra = stat["extra_filled"]
                saved_backfill = stat["addr_backfill"]

    # ── 위치 보강 패스: 주소는 있는데 좌표가 없는 실거래 전용 단지에 Kakao 지오코딩 +
    # 최근접 역/초등학교를 점진 채운다(단지당 3회 호출 — 회당 상한·시간예산 내).
    # 맞춤찾기의 '역거리·초등학교 정보 없음' 공백을 해소하는 핵심 경로.
    # 지번 시딩으로 주소 보유 단지가 한 번에 1만여 개 늘어난다. 보폭이 좁으면 대기열이
    # 몇 달씩 남으므로 넓힌다. 단지당 Kakao 3회(지오코딩+역+학교)이고, 실제 상한은 아래
    # out_of_time(위치보강 몫으로 떼어둔 예산)이 잡으므로 이 값은 안전 상한일 뿐이다.
    # 단지당 Kakao 3회(지오코딩+역+학교)라 순차로는 초당 한 건 남짓이다. 대기열이 7천 건대라
    # 순차로는 20일이 걸린다 — 호출은 전부 대기시간이 지배하므로 스레드로 겹쳐 부른다.
    # 네트워크만 병렬로 하고 hh_map 쓰기는 메인 스레드가 모아서 한다(자료구조 경합 회피).
    MAX_LOC = 3000          # 안전 상한 — 실제 상한은 아래 예산(out_of_time)이 잡는다
    LOC_WORKERS = 4
    loc_filled, loc_bad, loc_retry = 0, 0, 0
    if os.environ.get("KAKAO_REST_API_KEY"):
        pending = [k for k, e in hh_map.items() if e.get("addr") and e.get("lat") is None]

        def _locate(key_):
            """네트워크만 담당. (키, 결과, 사유) — 결과 None이면 사유로 처리를 가른다."""
            entry = hh_map[key_]
            try:
                geo = L.geocode_kakao(entry["addr"], strict=True)
            except Exception:  # noqa: BLE001 — 이번에 못 물어본 것(네트워크·429 등)
                return key_, None, "retry"
            if not geo:
                return key_, None, "bad"     # 주소 자체가 지오코딩되지 않는다
            lng, lat = geo
            out = {"lat": round(lat, 6), "lng": round(lng, 6)}
            try:
                sub = L.nearest_kakao(lng, lat, category_code="SW8")
                if sub:
                    out["subway"] = {"station": sub[0], "distance_m": sub[1]}
                sch = L.nearest_school_kakao(lng, lat)
                if sch:
                    out["elementary"] = {"name": CA.clean_school(sch[0]), "distance_m": sch[1]}
            except Exception:  # noqa: BLE001 — 좌표는 얻었으니 역·학교는 다음 실행에 채운다
                pass
            return key_, out, "ok"

        # 배치 단위로 넘기고 배치 사이에서만 예산을 본다. 초과분은 최대 한 배치라
        # 예측 가능하고, 스케줄링 코드가 단순해 검증하기 쉽다.
        BATCH = LOC_WORKERS * 4
        with cf.ThreadPoolExecutor(max_workers=LOC_WORKERS) as pool:
            for i in range(0, len(pending), BATCH):
                if loc_filled + loc_bad >= MAX_LOC or L.out_of_time(deadline, margin_sec=30):
                    break
                for key_, out, why in pool.map(_locate, pending[i:i + BATCH]):
                    if why == "ok":
                        hh_map[key_].update(out)
                        loc_filled += 1
                    elif why == "bad":
                        # 주소가 잘못된 것만 잠근다. 요청 실패(retry)는 표식 없이 두어
                        # 다음 실행이 다시 시도한다 — 여기서 잠그면 영구 유실이다.
                        hh_map[key_]["addr_bad"] = True
                        hh_map[key_].pop("addr", None)
                        loc_bad += 1
                    else:
                        loc_retry += 1
        print(f"[위치보강] 좌표 {loc_filled:,}건 · 주소불가 {loc_bad:,} · "
              f"일시실패(다음 실행 재시도) {loc_retry:,} · 대기 {len(pending):,}")
        if loc_filled or loc_bad:
            hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
            L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    else:
        print("[위치보강] KAKAO_REST_API_KEY 없음 — 좌표·역·학교 보강 생략", file=sys.stderr)

    print(f"[K-apt] 목록성공 {stat['list_ok']}/빈 {stat['list_empty']} · 단지코드 {stat['codes']}개"
          f"(법정동보유 {stat['dong_ok']}) · 이름매칭 {stat['matched']}"
          f"(주소불일치 반려 {stat['addr_reject']}) · 주소백필 {stat['addr_backfill']}"
          f"/{backfill_need} → "
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
                    # 이름만으로 붙었다가 주소의 법정동이 어긋나 반려된 수.
                    # 늘어난다면 이름 규칙이 과하게 느슨해진 신호다.
                    "addr_reject": stat["addr_reject"],
                    # 기존 항목 중 주소가 어긋나 걷어낸 수(소급 정리분).
                    "addr_purged": len(purged),
                    # 주소가 없어 위치 보강을 못 하던 항목을 다시 조회해 채운 수 / 남은 대기열.
                    "addr_backfill": stat["addr_backfill"],
                    "addr_backfill_queue": backfill_need,
                    # 실거래 지번으로 주소를 확보한 수(K-apt 미매칭 단지 포함).
                    "jibun_seeded": seeded,
                    "dong_indexed": stat["dong_ok"],
                },
                "regions": per_region,
            }, f, ensure_ascii=False, indent=1)
        print(f"[리포트] {COVERAGE_JSON} 저장 — 지역 {len(per_region)}개")
    except Exception as e:  # noqa: BLE001 — 리포트 실패가 수집 결과를 버리게 두지 않는다
        print(f"[리포트] 저장 실패(무시): {e}", file=sys.stderr)

    if stat["filled"] > saved_filled:
        L.save_json_safe(APARTMENTS_JSON, data, min_items_key="apartments")
    # 제거만 일어난 날에도 저장해야 잘못 붙은 항목이 남지 않는다.
    if (stat["extra_filled"] > saved_extra or stat["addr_backfill"] > saved_backfill
            or purged or seeded or migrated or unlocked):
        hh_data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
        L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    if not (stat["filled"] or stat["extra_filled"] or stat["addr_backfill"]
            or purged or seeded or migrated or unlocked):
        print("변경 없음 — 저장 생략")


if __name__ == "__main__":
    main()
