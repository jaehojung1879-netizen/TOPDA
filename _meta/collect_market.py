#!/usr/bin/env python3
"""한국부동산원 R-ONE 부동산통계 → site/assets/market.json 갱신.

R-ONE OpenAPI (SttsApiTblData.do)
  GET https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do
  params: KEY, Type=json, STATBL_ID, DTACYCLE_CD=MM, START_WRTTIME, END_WRTTIME, pIndex, pSize
  - CLS_ID(지역)를 지정하지 않으면 모든 지역(전국·시도·시군구) 행이 반환됨 → 자동으로 구 단위까지 수집.
  resp: { "SttsApiTblData": [ {..head..}, {"row":[ {CLS_NM, WRTTIME_IDTFR_ID, DTA_VAL, ...} ]} ] }

통계표 ID (월간, 아파트)
  매매가격지수 : A_2024_00045
  전세가격지수 : A_2024_00050
  전세가율(매매가격대비 전세가격비율) : R-ONE easyStat URL의 A_2024_xxxxx 확인 후 입력
"""
import datetime as dt
import os
import re
import sys

import lib_pdata as L

RONE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
MARKET_JSON = os.path.join(L.SITE_ASSETS, "market.json")
MONTHS = 13

# 월간 아파트 통계표 ID (지수)
METRICS = {
    "sale_index":   "A_2024_00045",  # 매매가격지수_아파트
    "jeonse_index": "A_2024_00050",  # 전세가격지수_아파트
}
# 평균가격 통계표 → 전세가율(전세평균/매매평균) 계산용
#  매매 평균가격: A_2024_00188 (확인). 전세 평균가격: 추정(검증으로 비정상 자동 배제).
AVG = {
    "sale_avg":   "A_2024_00188",
    "jeonse_avg": "A_2024_00190",
}


def norm_month(s):
    s = str(s or "")
    m = re.search(r"(\d{4})\D*(\d{2})", s)  # "202605" / "2026년 05월" / "2026.05"
    return f"{m.group(1)}-{m.group(2)}" if m else None


def fetch_metric(statbl_id, start, end, api_key):
    """STATBL_ID 한 표의 전 지역 시계열 → {지역명: {month: value}}."""
    out = {}
    page = 1
    while page <= 12:
        j = L.get_json(RONE, {
            "KEY": api_key, "Type": "json", "STATBL_ID": statbl_id, "DTACYCLE_CD": "MM",
            "START_WRTTIME": start, "END_WRTTIME": end, "pIndex": page, "pSize": 1000,
        })
        rows = []
        for block in (j.get("SttsApiTblData") or []):
            if isinstance(block, dict) and block.get("row"):
                rows = block["row"]
        if not rows:
            break
        for r in rows:
            region = (r.get("CLS_NM") or "").strip()
            mon = norm_month(r.get("WRTTIME_IDTFR_ID") or r.get("WRTTIME_DESC"))
            if not region or not mon:
                continue
            try:
                val = float(r.get("DTA_VAL"))
            except (TypeError, ValueError):
                continue
            out.setdefault(region, {})[mon] = val
        if len(rows) < 1000:
            break
        page += 1
    return out


def split_region(name):
    """'서울 송파구' → (sido='서울', leaf='송파구'). 공백 없으면 시도/전국 등 상위로 취급."""
    parts = name.split()
    if len(parts) >= 2:
        return parts[0], " ".join(parts[1:])
    return name, None


def main():
    api_key = L.key(L.RONE_KEYS, required=True)
    end = dt.date.today().strftime("%Y%m")
    start = (dt.date.today().replace(day=1) - dt.timedelta(days=31 * MONTHS)).strftime("%Y%m")

    metric_data = {}
    for metric, statbl in METRICS.items():
        if not statbl:
            print(f"[skip] {metric}: STATBL_ID 미설정")
            continue
        try:
            metric_data[metric] = fetch_metric(statbl, start, end, api_key)
            print(f"[{metric}] 지역 {len(metric_data[metric])}개 수집")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {metric} 수집 실패: {e}", file=sys.stderr)

    if not metric_data.get("sale_index"):
        print("매매가격지수 수집 실패 — 기존 market.json 유지")
        return

    # 평균가격 → 전세가율(전세평균/매매평균) 계산. 추정 통계표가 틀리면 비정상값으로 자동 배제.
    avg_data = {}
    for key, statbl in AVG.items():
        try:
            avg_data[key] = fetch_metric(statbl, start, end, api_key)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {key} 수집 실패: {e}", file=sys.stderr)
    ratio = {}  # {region: {month: 전세가율}}
    sale_avg, jeonse_avg = avg_data.get("sale_avg", {}), avg_data.get("jeonse_avg", {})
    for region, smonths in sale_avg.items():
        for mo, sv in smonths.items():
            jv = jeonse_avg.get(region, {}).get(mo)
            if sv and jv and jv < sv:
                r = round(jv / sv * 100, 1)
                if 25 <= r <= 100:  # 전세가율 정상 범위만 채택
                    ratio.setdefault(region, {})[mo] = r
    print(f"[jeonse_ratio] 계산된 지역 {len(ratio)}개")

    # 지역 합집합 → 월별 시계열 병합
    regions = sorted(set().union(*[set(metric_data.get('sale_index', {})), set(metric_data.get('jeonse_index', {}))]))
    out_regions = []
    for region in regions:
        sido, leaf = split_region(region)
        months = sorted(set().union(
            set(metric_data.get('sale_index', {}).get(region, {})),
            set(metric_data.get('jeonse_index', {}).get(region, {})),
        ))[-MONTHS:]
        series = []
        for mo in months:
            series.append({
                "month": mo,
                "sale_index": metric_data.get("sale_index", {}).get(region, {}).get(mo),
                "jeonse_index": metric_data.get("jeonse_index", {}).get(region, {}).get(mo),
                "jeonse_ratio": ratio.get(region, {}).get(mo),
            })
        if series:
            out_regions.append({"key": region, "sido": sido, "name": leaf or (region + " 전체"), "series": series})

    if not out_regions:
        print("수집 결과 없음 — 기존 market.json 유지")
        return
    data = {
        "_meta": {"source": "한국부동산원 R-ONE 전국주택가격동향(월간, 아파트)",
                  "note": "매매가격지수 A_2024_00045 · 전세가격지수 A_2024_00050"},
        "as_of": dt.date.today().strftime("%Y-%m"), "regions": out_regions,
    }
    L.save_json_safe(MARKET_JSON, data, min_items_key="regions")


if __name__ == "__main__":
    main()
