#!/usr/bin/env python3
"""국토교통부 아파트 매매 실거래가 → site/assets/transactions.json (실거래가 조회 페이지용).

collect_apartments.py 가 '단지 집계'라면, 이 수집기는 '개별 거래 원장'을 그대로 모읍니다.
시군구(LAWD)별 최근 N개월 거래를 평탄한 리스트로 저장합니다.

2026-07 확장 — 단지 페이지(/apt/{지역}/{단지}/) 요구사항에 맞춘 3가지 변경:

 1) 수집 기간 6 → 12개월.
    단지 페이지의 '최근 12개월 거래 N건' 기준·분기별 추이(4개 분기 이상)를 6개월 데이터로는
    아예 계산할 수 없었다.

 2) 거래 해제(취소) 반영.
    API의 cdealType='O'(해제)·cdealDay를 파싱해 canceled/cancel_date로 남긴다. 지금까지는
    필드 자체가 없어 취소 거래가 정상 거래와 섞여 집계됐다.

 3) 전량 재수집 → (지역, 월) 단위 증분 갱신.
    12개월 × 81지역을 매일 전량 재수집하면 스텝 타임아웃 안에 못 끝난다. 기존 파일을 읽어
    (지역, 월) 쌍 단위로 '성공한 쌍만' 교체 병합하므로,
      · 시간 예산이 소진돼 중간에 멈춰도 이미 가진 데이터는 보존되고
      · 다음 실행이 이어서 채운다(며칠에 걸쳐 12개월이 채워진다).
    쌍 단위 '교체'라서 신고 정정으로 원장에서 사라진 거래도 정상적으로 빠진다(추가 병합이
    아님에 주의 — 단순 merge였다면 삭제된 거래가 영원히 남는다).

    갱신 우선순위:
      · 1순위 = 최근 RECENT_REFRESH_MONTHS개월 × 전 지역 (신고 지연·정정·해제가 몰리는 구간)
      · 2순위 = 나머지 과거 월 (미보유 월 우선 → 오래된 갱신 순, 지역은 날짜 기준 회전)

 4) 파일 크기 억제.
    12개월치는 현행 포맷으로 약 89MB — GitHub 파일 한도(100MB)에 근접하고, 이 파일은
    실거래가 조회 페이지가 통째로 내려받는다. 최소 포맷 저장 + 파생 필드 제거로 63MB
    수준으로 낮췄다. 제거한 필드는 모두 남은 값에서 그대로 복원된다.
      · sido   = region_key.split()[0]      (읽는 소비처 없음)
      · umd    = region.split()[-1]          (region이 이미 법정동까지 포함)

또한 numOfRows=1000 1페이지만 읽어 월 1,000건이 넘는 시군구는 조용히 잘렸다. totalCount를
보고 끝까지 페이지네이션한다.
"""
import datetime as dt
import os
import re
import sys

import lib_pdata as L

MOLIT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
MONTHS_BACK = 12
# 매 실행마다 무조건 다시 읽는 최근 개월 수. 국토부는 계약 후 30일 내 신고이고 해제 신고는
# 그보다 더 늦게 들어와, 최근 3개월이 계속 변한다.
RECENT_REFRESH_MONTHS = 3
ROWS = 1000
MAX_PAGES = 20          # 월 20,000건 초과 시군구는 없다(안전 상한 — 무한 루프 방지)
TX_JSON = os.path.join(L.SITE_ASSETS, "transactions.json")
# 단지별 지번 주소. 실거래 상세 API(RTMSDataSvcAptTradeDev)가 주는 jibun을 단지 단위로
# 접어 둔 것으로, K-apt 매칭 없이도 좌표를 찍을 수 있는 유일한 경로다. K-apt는 의무관리
# 대상만 실어 전국 단지의 71%밖에 못 덮지만(2026-07-27 실측), 지번은 거래가 있으면 항상
# 온다 — 역거리·초등학교 공백(파인더 노출 단지의 78%)을 푸는 열쇠다.
COMPLEX_ADDR_JSON = os.path.join(L.SITE_ASSETS, "complex_addr.json")


# 끝의 '숫자+동'. 앞자리가 쉼표·하이픈·숫자로 끝나면 여러 동을 나열한 정식 이름이므로
# 대상에서 뺀다 — 느슨하게 자르면 '대치우성아파트1동,2동,3동,5동,6동,7동'이
# '대치우성아파트1동,2동,3동,5동,6동,'으로, '유호엔시티101-103동'이 '유호엔시티101-'로
# 망가진다(2026-07-27 실측 8건).
_BLDG_SUFFIX = re.compile(r"^(?P<base>.*[^\s,\-·0-9])\s*\d+동$")


def building_base_name(name):
    """'시티프라디움더강남101동' → '시티프라디움더강남'. 해당 없으면 None."""
    m = _BLDG_SUFFIX.match(name or "")
    base = m.group("base").strip() if m else ""
    return base if len(base) >= 2 else None


def merge_building_suffix_names(deals):
    """동 단위로 쪼개져 들어온 단지를 한 단지로 합친다. {(지역, 옛이름): 새이름} 반환.

    국토부는 주상복합·도시형생활주택처럼 동별로 집합건물이 등록된 단지를 '시티프라디움
    더강남101동'·'201동'같이 별개 단지로 준다. 그대로 두면 파인더에 같은 단지가 여러 번
    나오고 거래건수·평균가·추천점수가 갈린다.

    이름 모양만 보고 자르지는 않는다. '동 접미가 건물 번호'라는 증거가 있을 때만 합친다.
      ① 같은 지역에 기본명 단지가 이미 있다
         (예: 서울 관악구 '관악푸르지오' 145건 + '관악푸르지오102동').
      ② 같은 기본명을 가진 동 항목이 둘 이상이다
         (예: 경기 화성시 '진명101동'·'102동'·'103동').
    둘 다 아닌 단독 항목(실측 112개)은 합쳐도 중복이 사라지지 않고 이름만 바뀌므로 둔다 —
    정식 이름에 동 번호가 들어간 단지를 잘못 개명할 위험만 진다.
    """
    names = {}
    for d in deals:
        rk, n = d.get("region_key"), d.get("apt")
        if rk and n:
            names.setdefault(rk, set()).add(n)
    groups = {}
    for rk, ns in names.items():
        for n in ns:
            base = building_base_name(n)
            if base:
                groups.setdefault((rk, base), []).append(n)
    rename = {}
    for (rk, base), members in groups.items():
        if base in names[rk] or len(members) >= 2:
            for n in members:
                rename[(rk, n)] = base
    for d in deals:
        new = rename.get((d.get("region_key"), d.get("apt")))
        if new:
            d["apt"] = new
    return rename


# 건축물대장(getBrTitleInfo) 조회 키. 실거래 상세 자료가 법정동시군구·읍면동·본번·부번
# 코드를 함께 주므로, 이것만 모아두면 단지명을 한 글자도 대조하지 않고 대장을 직접 부를 수
# 있다 — K-apt 이름매칭에서 겪은 문제(표기 차이·일반명 충돌·모호키)가 통째로 사라진다.
# 영문 항목명이 명세서마다 다르게 적혀 있어 후보를 순서대로 시도한다(K-apt 필드 처리와 동일).
_LOC_FIELDS = {
    "sgg": ("sggCd", "bjdongSggCd", "lawdCd"),
    "umd": ("umdCd", "bjdongCd", "umdNum"),
    "bun": ("bonbun", "landBonbun", "bjdongBonbunCd"),
    "ji":  ("bubun", "landBubun", "bjdongBubunCd"),
}
# 실제로 어떤 후보가 값을 줬는지 — 명세로 확인이 안 돼 실행 결과로 확정한다.
_loc_seen = {}


def _location_keys(g):
    """거래 항목에서 지번·행정코드를 뽑는다. {jibun, sgg, umd, bun, ji} (없는 키는 생략)."""
    out = {}
    jibun = g("jibun")
    if jibun:
        out["jibun"] = jibun
    for key, candidates in _LOC_FIELDS.items():
        for tag in candidates:
            v = g(tag)
            if v:
                out[key] = v
                _loc_seen.setdefault(key, tag)
                break
    return out


def recent_months(n):
    """오늘이 속한 달을 포함해 최근 n개월(YYYYMM 내림차순).
    국토부 실거래는 계약 후 신고에 시차가 있어 '현재 달'을 반드시 포함해야
    이번 달 거래가 누락되지 않는다(예전 버그: 지난달부터 시작해 당월 누락)."""
    d = dt.date.today().replace(day=1)
    out = []
    for _ in range(n):
        out.append(d.strftime("%Y%m"))
        d = (d - dt.timedelta(days=1)).replace(day=1)
    return out


def _parse_items(root, region_name):
    deals = []
    for it in root.iter("item"):
        def g(tag):
            el = it.find(tag)
            return (el.text or "").strip() if el is not None else ""
        try:
            price = int(g("dealAmount").replace(",", ""))
            area = float(g("excluUseAr"))
            y, m, d = int(g("dealYear")), int(g("dealMonth")), int(g("dealDay"))
        except ValueError:
            continue
        # 파생 가능한 필드는 싣지 않는다 — 12개월 확장으로 파일이 GitHub 100MB 한도에
        # 근접하기 때문(89MB 추정). sido는 어떤 소비처도 읽지 않고(= region_key.split()[0]),
        # 법정동은 region 문자열이 이미 담고 있다(= region.split()[-1]).
        rec = {
            "apt": g("aptNm"), "region_key": region_name,
            "region": f"{region_name} {g('umdNm')}",
            "area_m2": round(area, 1), "pyeong": round(area / 3.3058),
            "price": price, "floor": int(g("floor") or 0),
            "date": f"{y:04d}-{m:02d}-{d:02d}", "build_year": int(g("buildYear") or 0) or None,
        }
        # 지번·행정코드는 원장(58MB)에 싣지 않고 단지별로 한 번만 모은다 — 거래마다 실으면
        # 파일이 GitHub 100MB 한도에 더 가까워지는데, 쓰임새는 '단지 한 곳을 특정하기'뿐이다.
        loc = _location_keys(g)
        if loc:
            rec["_loc"] = loc   # main()에서 단지별로 접은 뒤 개별 거래에서는 제거한다
        # 거래 해제(취소). cdealType='O'가 해제 신고분. cdealDay는 'YY.MM.DD' 형식으로 온다.
        if g("cdealType").upper() == "O":
            rec["canceled"] = True
            cd = g("cdealDay")
            if cd:
                rec["cancel_date"] = cd
        deals.append(rec)
    return deals


def fetch(lawd_cd, region_name, ym, service_key):
    """(지역, 월) 전체 거래. totalCount 기준으로 끝까지 페이지네이션한다."""
    deals = []
    page = 1
    while page <= MAX_PAGES:
        root = L.get_xml(MOLIT, {
            "serviceKey": service_key, "LAWD_CD": lawd_cd, "DEAL_YMD": ym,
            "numOfRows": ROWS, "pageNo": page,
        })
        got = _parse_items(root, region_name)
        deals += got
        raw = len(list(root.iter("item")))
        total = root.findtext(".//totalCount")
        total = int(total.strip()) if (total or "").strip().isdigit() else None
        if raw < ROWS or (total is not None and page * ROWS >= total):
            break
        page += 1
    return deals


def load_existing(months):
    """기존 transactions.json → {(region_key, ym): [deal, ...]}. 수집 창 밖의 달은 버린다."""
    data = L.load_json(TX_JSON, default=None) or {}
    keep = set(months)
    pairs = {}
    for d in data.get("deals", []):
        rk, date = d.get("region_key"), d.get("date") or ""
        ym = date[:4] + date[5:7]
        if not rk or ym not in keep:
            continue
        pairs.setdefault((rk, ym), []).append(d)
    return pairs, (data.get("_fetched") or {})


def plan(months, pairs, fetched, today):
    """수집할 (region, ym) 순서. 최근 RECENT_REFRESH_MONTHS개월 전 지역이 먼저,
    그 다음 과거 월(미보유 우선 → 마지막 수집이 오래된 순). 지역 순서는 날짜로 회전시켜
    예산이 모자란 날에도 특정 지역만 계속 굶지 않게 한다."""
    regions = list(L.LAWD)
    off = today.toordinal() % max(len(regions), 1)
    regions = regions[off:] + regions[:off]

    recent, older = months[:RECENT_REFRESH_MONTHS], months[RECENT_REFRESH_MONTHS:]
    jobs = [(r, ym) for ym in recent for r in regions]
    rest = [(r, ym) for ym in older for r in regions]
    # 미보유 쌍을 먼저, 그 다음 마지막 수집이 오래된 순(빈 문자열=미수집이 가장 앞).
    rest.sort(key=lambda j: (j in pairs, fetched.get(f"{j[0]}|{j[1]}") or ""))
    return jobs + rest


def main():
    service_key = L.key(L.DATA_GO_KEYS, required=True)
    today = dt.date.today()
    months = recent_months(MONTHS_BACK)
    pairs, fetched = load_existing(months)
    fetched = {k: v for k, v in fetched.items() if k.split("|")[-1] in set(months)}
    print(f"수집 창 {months[-1]}~{months[0]} · 기존 보유 (지역,월) {len(pairs)}쌍 "
          f"/ 목표 {len(L.LAWD) * len(months)}쌍")

    deadline = L.deadline_from_env()
    jobs = plan(months, pairs, fetched, today)
    ok = fail = 0
    touched_regions = set()
    stamp = today.strftime("%Y-%m-%d")

    for region, ym in jobs:
        if L.out_of_time(deadline, margin_sec=60):
            print(f"시간 예산 소진 — {ok}쌍 갱신 후 중단. 남은 쌍은 다음 실행에서 이어서 수집")
            break
        lawd = L.LAWD[region]
        got = []
        failed = False
        for code in L.resolve_lawd_codes(region, lawd, service_key, months[:2]):
            try:
                got += fetch(code, region, ym, service_key)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {region} {ym} 실패: {e}", file=sys.stderr)
                failed = True
        if failed:
            # 실패한 쌍은 기존 데이터를 그대로 둔다(부분 응답으로 덮어써 거래를 잃지 않도록).
            fail += 1
            continue
        # 성공한 쌍만 '교체'. 0건 응답도 정상 결과이므로 빈 리스트로 교체한다
        # (해당 월 거래가 전부 정정·삭제된 경우를 반영).
        if got:
            pairs[(region, ym)] = got
        else:
            pairs.pop((region, ym), None)
        fetched[f"{region}|{ym}"] = stamp
        touched_regions.add(region)
        ok += 1

    all_deals = [d for v in pairs.values() for d in v]
    if not all_deals:
        print("수집 결과 없음 — 기존 transactions.json 유지")
        return

    # 전 기간 0건 지역 — 행정구역 개편 등으로 LAWD 코드가 죽었는지 진단
    live = {rk for (rk, _) in pairs}
    zero_regions = [f"{r}({L.LAWD[r]})" for r in L.LAWD if r not in live]
    if zero_regions:
        print(f"‼ 전 기간 0건 지역 {len(zero_regions)}개 — LAWD 코드 폐지·분할(행정구역 개편) 여부 점검: "
              + ", ".join(zero_regions), file=sys.stderr)

    all_deals.sort(key=lambda d: d["date"], reverse=True)
    # 동 단위로 쪼개진 단지를 먼저 합친다. 증분 갱신이라 이번에 다시 받지 않은 쌍의 거래도
    # 원장 전체를 대상으로 손봐야 옛 이름이 남지 않는다(다음 실행은 이미 합쳐진 이름을
    # 읽으므로 결과가 같다). 아래 지번 접기보다 앞서야 주소도 한 단지로 모인다.
    renamed = merge_building_suffix_names(all_deals)
    if renamed:
        targets = sorted({v for v in renamed.values()})
        print(f"[동 병합] 동별로 쪼개진 항목 {len(renamed)}개 → 단지 {len(targets)}개로 합침"
              f" (예: {', '.join(targets[:3])})")

    # 단지별 위치를 접는다. 같은 단지가 여러 지번에 걸치면(여러 동) 가장 흔한 지번을 쓴다 —
    # 대표 위치 한 점만 필요하고, 최빈값이 단지 중심에 가장 가깝다. 행정코드도 그 지번의
    # 것으로 함께 고정해야 주소와 대장 조회 키가 어긋나지 않는다.
    votes = {}
    for d in all_deals:
        loc = d.pop("_loc", None)
        if not loc or not loc.get("jibun"):
            continue
        key = f"{d['region_key']}|{d['apt']}"
        # region은 '시도 시군구 법정동'이라 지번만 붙이면 지오코딩 가능한 주소가 된다.
        rec = {"addr": f"{d['region']} {loc['jibun']}"}
        for k in ("sgg", "umd", "bun", "ji"):
            if loc.get(k):
                rec[k] = loc[k]
        tally = votes.setdefault(key, {})
        sig = rec["addr"]
        cur = tally.get(sig)
        tally[sig] = (cur[0] + 1, cur[1]) if cur else (1, rec)
    fresh = {k: max(v.values(), key=lambda c: c[0])[1] for k, v in votes.items()}
    # 증분 갱신이라 이번 실행에서 다시 받은 (지역,월) 쌍의 거래만 _jibun을 갖는다. 기존
    # 파일을 덮어쓰면 이번에 안 건드린 단지의 주소를 잃으므로 병합한다(이번 값 우선).
    prev = (L.load_json(COMPLEX_ADDR_JSON, default=None) or {}).get("map") or {}
    addr_map = dict(prev)
    addr_map.update(fresh)
    keyed = sum(1 for v in addr_map.values() if isinstance(v, dict) and v.get("umd"))
    if addr_map:
        L.save_json_safe(COMPLEX_ADDR_JSON, {
            "_meta": {"source": "국토교통부 실거래가 OpenAPI(상세 자료)",
                      "note": "'지역키|단지명' → {addr, sgg, umd, bun, ji}. addr은 좌표·역·학교 "
                              "보강용 지번 주소, 나머지는 건축물대장(getBrTitleInfo) 조회 키"
                              "(sigunguCd·bjdongCd·bun·ji). 한 단지가 여러 지번에 걸치면 최빈 지번.",
                      # 응답 항목명이 명세서에 영문으로 안 적혀 있어 실행 결과로 확정한다.
                      # 잡 로그는 잘려서 못 읽으므로 커밋되는 이 파일에 남긴다.
                      "resolved_fields": dict(_loc_seen),
                      "keyed": keyed},
            "as_of": today.strftime("%Y-%m-%d"),
            "map": addr_map,
        })
    print(f"[지번] 이번 실행 {len(fresh):,}개 · 누적 {len(addr_map):,}개 단지 주소"
          f"(건축물대장 조회키 보유 {keyed:,}개) → {os.path.basename(COMPLEX_ADDR_JSON)}")
    if _loc_seen:
        print(f"[행정코드] 실제 응답 항목명: {_loc_seen}")
    missing = [k for k in ("sgg", "umd", "bun", "ji") if k not in _loc_seen]
    if missing and fresh:
        print(f"‼ 행정코드 항목 미확인 {missing} — 후보 이름이 실제 응답과 다르다. "
              f"_LOC_FIELDS 후보를 늘려야 건축물대장 조회가 가능하다.", file=sys.stderr)

    canceled = sum(1 for d in all_deals if d.get("canceled"))
    data = {
        "_meta": {
            "source": "국토교통부 실거래가 OpenAPI",
            "currency_unit": "만원",
            "window_months": MONTHS_BACK,
            "note": "canceled=true는 국토부 해제(거래취소) 신고분. 집계에서 제외해야 한다.",
        },
        "as_of": today.strftime("%Y-%m"),
        "updated": stamp,
        "coverage": {"pairs": len(pairs), "target": len(L.LAWD) * len(months),
                     "months": len(months), "regions": len(live)},
        "_fetched": fetched,
        "deals": all_deals,
    }
    # 원장은 사람이 diff로 읽는 파일이 아니고 크기가 지배적이라 최소 포맷으로 저장한다
    # (indent=2 대비 약 23% 절감 — 12개월 89MB → 63MB).
    L.save_json_safe(TX_JSON, data, min_items_key="deals", indent=None)
    print(f"[ok] 갱신 {ok}쌍(실패 {fail}) · 지역 {len(touched_regions)}개 · "
          f"총 {len(all_deals):,}건(해제 {canceled:,}건) · "
          f"커버리지 {len(pairs)}/{len(L.LAWD) * len(months)}쌍")


if __name__ == "__main__":
    main()
