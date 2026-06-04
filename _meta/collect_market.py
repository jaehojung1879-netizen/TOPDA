#!/usr/bin/env python3
"""한국부동산원 R-ONE 부동산통계 → site/assets/market.json 갱신.

R-ONE OpenAPI
  GET https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do
  params: KEY, Type=json, STATBL_ID, DTACYCLE_CD(MM=월), CLS_ID(지역), ITM_ID,
          START_WRTTIME(YYYYMM), END_WRTTIME(YYYYMM), pIndex, pSize
  resp:   { "SttsApiTblData": [ {..head..}, {"row":[ {WRTTIME_DESC, DTA_VAL, CLS_NM, ...} ]} ] }

⚠ STATBL_ID / ITM_ID / CLS_ID 는 R-ONE '통계표 목록'에서 골라야 합니다.
  (OpenAPI 활용신청 후 reb.or.kr/r-one → 통계표별 식별자 확인)
  아래 CONFIG의 빈 값을 채우기 전까지는 기존 market.json을 보존합니다.
"""
import datetime as dt
import os
import sys

import lib_pdata as L

RONE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
MARKET_JSON = os.path.join(L.SITE_ASSETS, "market.json")

# ── 채워 넣을 설정 ─────────────────────────────────────────────
# STATBL_ID: 통계표 ID(예: 아파트 매매가격지수, 전세가격지수, 전세가율)
# ITM_ID:    항목 ID,  CLS_ID: 지역분류 코드(시군구)
CONFIG = {
    "sale_index":   {"STATBL_ID": "", "ITM_ID": ""},   # 아파트 매매가격지수
    "jeonse_index": {"STATBL_ID": "", "ITM_ID": ""},   # 아파트 전세가격지수
    "jeonse_ratio": {"STATBL_ID": "", "ITM_ID": ""},   # 아파트 전세가율
}
# 지역분류코드(CLS_ID) → 표시 이름. R-ONE 지역코드로 채우세요.
REGIONS = {
    # "11710": "서울 송파구",
}
MONTHS = 13  # 최근 13개월


def is_configured():
    return all(c["STATBL_ID"] for c in CONFIG.values()) and bool(REGIONS)


def fetch_series(metric, cls_id, start, end, api_key):
    cfg = CONFIG[metric]
    j = L.get_json(RONE, {
        "KEY": api_key, "Type": "json", "DTACYCLE_CD": "MM",
        "STATBL_ID": cfg["STATBL_ID"], "ITM_ID": cfg["ITM_ID"], "CLS_ID": cls_id,
        "START_WRTTIME": start, "END_WRTTIME": end, "pIndex": 1, "pSize": 100,
    })
    rows = []
    for block in j.get("SttsApiTblData", []):
        rows += block.get("row", []) if isinstance(block, dict) else []
    out = {}
    for r in rows:
        t = str(r.get("WRTTIME_DESC") or r.get("WRTTIME_IDTFR_ID") or "")[:7].replace(".", "-")
        try:
            out[t] = float(r.get("DTA_VAL"))
        except (TypeError, ValueError):
            continue
    return out


def main():
    api_key = L.key("REB_RONE_KEY", required=True)
    if not is_configured():
        print("[skip] R-ONE CONFIG(STATBL_ID/ITM_ID/REGIONS) 미설정 — 기존 market.json 유지")
        print("       reb.or.kr/r-one 통계표 목록에서 식별자를 채운 뒤 다시 실행하세요.")
        return
    end = dt.date.today().strftime("%Y%m")
    start = (dt.date.today().replace(day=1) - dt.timedelta(days=31 * MONTHS)).strftime("%Y%m")
    regions_out = []
    for cls_id, name in REGIONS.items():
        try:
            sale = fetch_series("sale_index", cls_id, start, end, api_key)
            jeon = fetch_series("jeonse_index", cls_id, start, end, api_key)
            ratio = fetch_series("jeonse_ratio", cls_id, start, end, api_key)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {name} 수집 실패: {e}", file=sys.stderr)
            continue
        months = sorted(set(sale) | set(jeon) | set(ratio))[-MONTHS:]
        series = [{
            "month": m,
            "sale_index": sale.get(m), "jeonse_index": jeon.get(m),
            "jeonse_ratio": ratio.get(m), "trades": None,
        } for m in months]
        if series:
            regions_out.append({"key": name, "series": series})
            print(f"[{name}] {len(series)}개월")
    if not regions_out:
        print("수집 결과 없음 — 기존 market.json 유지")
        return
    data = {
        "_meta": {"source": "한국부동산원 R-ONE", "note": "R-ONE OpenAPI 자동 수집"},
        "as_of": dt.date.today().strftime("%Y-%m"), "regions": regions_out,
    }
    L.save_json_safe(MARKET_JSON, data, min_items_key="regions")


if __name__ == "__main__":
    main()
