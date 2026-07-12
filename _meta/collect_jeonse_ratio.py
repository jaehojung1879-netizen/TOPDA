#!/usr/bin/env python3
"""지역별 전세가율(전세 중위가 ÷ 매매 중위가) → site/assets/jeonse_ratio.json

국토교통부 아파트 **매매**(RTMSDataSvcAptTradeDev)와 **전월세**(RTMSDataSvcAptRent)
실거래를 시군구(LAWD)별 최근 N개월 모아 중위가를 구하고, 전세가율을 산출한다.
지도 표시를 위해 Kakao로 지역 중심 좌표도 함께 붙인다.

R-ONE 평균가격 역산이 비는 문제(전 지역 null)를 우회해, **우리가 가진 DATA_GO 키만으로**
실거래 기반 전세가율을 직접 채운다. 합성·추정이 아니라 실거래 중위가 비율이라 근거가 분명하다.

설계 원칙(다른 수집기와 동일): 표준 라이브러리만, 실패·빈 결과면 기존 파일 보존.
"""
import datetime as dt
import os
import statistics
import sys

import lib_pdata as L

TRADE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
RENT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
OUT_JSON = os.path.join(L.SITE_ASSETS, "jeonse_ratio.json")
MONTHS_BACK = 3          # 최근 3개월 실거래 풀
MIN_SAMPLES = 5          # 매매·전세 각 최소 표본(미만이면 전세가율 산출 제외)


def recent_months(n):
    d = dt.date.today().replace(day=1)
    out = []
    for _ in range(n):
        out.append(d.strftime("%Y%m"))
        d = (d - dt.timedelta(days=1)).replace(day=1)
    return out


def _items(base, lawd, ym, key):
    """실거래 item 목록(dict) 반환. 실패 시 빈 리스트."""
    try:
        return L.get_items(base, {"serviceKey": key, "LAWD_CD": lawd,
                                  "DEAL_YMD": ym, "numOfRows": 1000, "pageNo": 1})
    except Exception as e:  # noqa: BLE001
        print(f"  ! {lawd} {ym} {base.split('/')[-1]} 실패: {e}", file=sys.stderr)
        return []


def _num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


# 광역시 공통 구명 — R-ONE 시군구 목록은 시도 없이 평면이라 '남구'가 어느 광역시인지
# 알 수 없다. 이런 이름은 구 단위 매칭을 건너뛰고 시도 단위 지수로 폴백한다.
AMBIGUOUS_GU = {"중구", "동구", "서구", "남구", "북구", "강서구"}


def _rone_ratio_lookup():
    """market.json(R-ONE) → {지역명: 최신 전세가율}. 시도·시군구 평면 이름."""
    market = L.load_json(os.path.join(L.SITE_ASSETS, "market.json"), default=None) or {}
    out = {}
    for r in market.get("regions", []):
        series = r.get("series") or []
        if not series:
            continue
        ratio = series[-1].get("jeonse_ratio")
        if ratio and 20 <= ratio <= 100:
            out[r.get("key") or ""] = round(float(ratio), 1)
    return out


def _region_ratio(region_key, rone):
    """'경기 수원시 영통구' → 영통구 → 수원시 → 경기 순으로 R-ONE 전세가율 탐색."""
    parts = region_key.split()
    for p in reversed(parts[1:]):        # 구 → 시 (구체적인 것 먼저)
        if p in rone and p not in AMBIGUOUS_GU:
            return rone[p], p
    sido = parts[0]
    if sido in rone:
        return rone[sido], sido
    return None, None


def estimate_from_rone(months):
    """전월세 API 미승인 동안의 폴백: 실거래 매매 중위가(실측) × R-ONE 전세가율(실측 통계)
    로 전세 중위가를 추정한다. 예시(seed)값 대신 근거 있는 추정치를 표시하기 위함.
    transactions.json은 같은 워크플로 앞 스텝에서 방금 수집된 것을 재사용(API 호출 0회)."""
    tx = L.load_json(os.path.join(L.SITE_ASSETS, "transactions.json"), default=None) or {}
    deals = tx.get("deals", [])
    rone = _rone_ratio_lookup()
    if not deals or not rone:
        return []
    cutoff = min(months)  # YYYYMM — 최근 N개월만
    by_region = {}
    for d in deals:
        rk, p, date = d.get("region_key"), d.get("price"), str(d.get("date") or "")
        if rk and p and date[:7].replace("-", "") >= cutoff:
            by_region.setdefault(rk, []).append(p)
    prev = L.load_json(OUT_JSON, default=None) or {}
    prev_coord = {(r.get("key") or r.get("name")): (r.get("lat"), r.get("lng"))
                  for r in (prev.get("regions") or [])}
    regions = []
    for rk, sales in by_region.items():
        if len(sales) < MIN_SAMPLES:
            continue
        ratio, matched = _region_ratio(rk, rone)
        if not ratio:
            continue
        sale_med = statistics.median(sales)
        lat, lng = prev_coord.get(rk) or (None, None)
        if lat is None and os.environ.get("KAKAO_REST_API_KEY"):
            coord = L.geocode_kakao(rk)
            if coord:
                lng, lat = round(coord[0], 6), round(coord[1], 6)
        regions.append({
            "key": rk, "sido": rk.split()[0], "name": rk, "lat": lat, "lng": lng,
            "sale_median": int(sale_med),
            "jeonse_median": int(sale_med * ratio / 100),   # 추정: 매매중위 × R-ONE 전세가율
            "jeonse_ratio": ratio,
            "ratio_region": matched,                        # 전세가율을 가져온 R-ONE 지역 단위
            "sale_n": len(sales), "jeonse_n": None,
        })
        print(f"[{rk}] R-ONE 추정 전세가율 {ratio}% (매매중위 {int(sale_med)}만 · 비율출처 {matched})")
    return regions


def main():
    key = L.key(L.DATA_GO_KEYS, required=True)
    months = recent_months(MONTHS_BACK)
    # 전월세 API 승인 선확인 — 미승인(403)이면 전 지역을 헛돌지 않고 R-ONE 추정 폴백으로 전환.
    # (2026-07-04 확인: RTMSDataSvcAptRent 403으로 매 실행 10분을 낭비하고 결과 0건이었음.
    #  2026-07-12까지 미승인 지속 → 시드 예시값 대신 실측 기반 추정치를 채운다)
    try:
        L.get_items(RENT, {"serviceKey": key, "LAWD_CD": "11680", "DEAL_YMD": months[0],
                           "numOfRows": 1, "pageNo": 1})
    except L.AuthError:
        print("‼ 전월세 실거래 API(RTMSDataSvcAptRent) 미승인(403) — data.go.kr에서 "
              "'아파트 전월세 실거래가 자료' 활용신청·승인 후 실거래 기반으로 자동 전환됩니다. "
              "그때까지 매매 실거래 중위가 × R-ONE 전세가율 추정치로 채웁니다.", file=sys.stderr)
        regions = estimate_from_rone(months)
        if not regions:
            print("추정 폴백도 실패(실거래/R-ONE 데이터 없음) — 기존 파일 유지")
            return
        regions.sort(key=lambda r: r["jeonse_ratio"], reverse=True)
        data = {
            "_meta": {
                "source": "국토교통부 아파트 매매 실거래가 + 한국부동산원 R-ONE 전세가율",
                "method": "매매 중위가(최근 3개월 실거래) × R-ONE 지역 전세가율 → 전세 중위가 추정",
                "currency_unit": "만원",
                "note": "전월세 실거래 API 승인 전 추정치. 승인 후 실거래 중위가 기준으로 자동 전환.",
            },
            "as_of": dt.date.today().strftime("%Y-%m"),
            "months": months,
            "estimated": True,
            "regions": regions,
        }
        L.save_json_safe(OUT_JSON, data, min_items_key="regions")
        return
    except Exception:  # noqa: BLE001 — 일시 오류는 본 수집에서 재시도
        pass
    regions = []
    total_jeonse = 0      # 전세 표본 총합 — 0이면 전월세 API 미승인 가능성
    # 시간 예산: 마감 전에 루프를 끊고, 수집 못 한 지역은 기존 파일 값으로 채워 저장한다.
    deadline = L.deadline_from_env()
    for region, lawd in L.LAWD.items():
        if L.out_of_time(deadline, margin_sec=60):
            print(f"시간 예산 소진 — 남은 지역은 기존 값 유지 (수집 {len(regions)}개 지역)")
            break
        sale, jeonse = [], []
        wolse_rent, wolse_dep = [], []   # 월세 계약(임차 시세) — 보증금·월세 중위가용
        for code in L.resolve_lawd_codes(region, lawd, key, months):
            for ym in months:
                for it in _items(TRADE, code, ym, key):
                    p = _num(it.get("dealAmount"))
                    if p:
                        sale.append(p)
                for it in _items(RENT, code, ym, key):
                    rent = _num(it.get("monthlyRent")) or 0
                    dep = _num(it.get("deposit"))
                    if dep and rent == 0:        # 순수 전세만(월세 제외)
                        jeonse.append(dep)
                    elif rent > 0:               # 월세 — 지역 임차 시세 형성 확인용
                        wolse_rent.append(rent)
                        if dep:
                            wolse_dep.append(dep)
        total_jeonse += len(jeonse)
        if len(sale) < MIN_SAMPLES or len(jeonse) < MIN_SAMPLES:
            print(f"[{region}] 표본 부족(매매 {len(sale)}·전세 {len(jeonse)}) — 제외")
            continue
        sale_med = statistics.median(sale)
        jeonse_med = statistics.median(jeonse)
        ratio = round(jeonse_med / sale_med * 100, 1)
        if not (20 <= ratio <= 100):         # 비정상 비율 배제(구성 편향 등)
            print(f"[{region}] 전세가율 {ratio}% 범위 밖 — 제외")
            continue
        # 지도용 좌표 — 지역 중심(없으면 None, 지도엔 빠지고 표엔 남김)
        coord = L.geocode_kakao(region) if os.environ.get("KAKAO_REST_API_KEY") else None
        entry = {
            "key": region,
            "sido": region.split()[0],
            "name": region,
            "lat": round(coord[1], 6) if coord else None,
            "lng": round(coord[0], 6) if coord else None,
            "sale_median": int(sale_med),       # 만원
            "jeonse_median": int(jeonse_med),    # 만원
            "jeonse_ratio": ratio,               # %
            "sale_n": len(sale),
            "jeonse_n": len(jeonse),
        }
        # 월세 시세(임차 형성) — 표본이 충분할 때만 (보증금·월세 중위, 만원)
        if len(wolse_rent) >= MIN_SAMPLES:
            entry["wolse_rent_median"] = int(statistics.median(wolse_rent))
            entry["wolse_deposit_median"] = int(statistics.median(wolse_dep)) if wolse_dep else None
            entry["wolse_n"] = len(wolse_rent)
        regions.append(entry)
        print(f"[{region}] 전세가율 {ratio}% (매매중위 {int(sale_med)}만 / 전세중위 {int(jeonse_med)}만)")

    if not regions:
        if total_jeonse == 0:
            print("‼ 전세 표본 0건 — 국토부 '아파트 전월세 실거래가'(RTMSDataSvcAptRent) API가 "
                  "서비스키에 활용신청·승인되지 않았을 가능성이 큽니다(매매는 정상 수집). "
                  "data.go.kr에서 해당 API를 같은 계정으로 활용신청하면 다음 실행부터 채워집니다.",
                  file=sys.stderr)
        print("수집 결과 없음 — 기존 jeonse_ratio.json 유지")
        return
    # 부분 수집 병합: 이번에 못 돈 지역(시간 예산·표본 부족)은 기존 파일 값을 유지해
    # 지도가 갑자기 비지 않도록 한다.
    prev = L.load_json(OUT_JSON, default=None) or {}
    seen = {r["key"] for r in regions}
    kept = [r for r in (prev.get("regions") or []) if (r.get("key") or r.get("name")) not in seen]
    if kept:
        print(f"기존 값 유지 지역 {len(kept)}개 (이번 실행 미수집)")
        regions += kept
    regions.sort(key=lambda r: r["jeonse_ratio"], reverse=True)
    data = {
        "_meta": {
            "source": "국토교통부 아파트 매매·전월세 실거래가 OpenAPI",
            "method": "지역별 최근 3개월 실거래 중위가 기준 전세가율(전세 중위 보증금 ÷ 매매 중위가)",
            "currency_unit": "만원",
            "note": "순수 전세(월세 0)만 사용. 표본 부족·비정상 비율 지역은 제외.",
        },
        "as_of": dt.date.today().strftime("%Y-%m"),
        "months": months,
        "regions": regions,
    }
    L.save_json_safe(OUT_JSON, data, min_items_key="regions")


if __name__ == "__main__":
    main()
