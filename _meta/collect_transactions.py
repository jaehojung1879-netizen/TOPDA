#!/usr/bin/env python3
"""국토교통부 아파트 매매 실거래가 → site/assets/transactions.json (실거래가 조회 페이지용).

collect_apartments.py 가 '단지 집계'라면, 이 수집기는 '개별 거래 원장'을 그대로 모읍니다.
시군구(LAWD)별 최근 N개월 거래를 평탄한 리스트로 저장합니다.
"""
import datetime as dt
import os
import sys

import lib_pdata as L

MOLIT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
MONTHS_BACK = 6
TX_JSON = os.path.join(L.SITE_ASSETS, "transactions.json")


def recent_months(n):
    today = dt.date.today().replace(day=1)
    out = []
    for _ in range(n):
        d = (today - dt.timedelta(days=1)).replace(day=1)
        today = d
        out.append(d.strftime("%Y%m"))
    return out


def fetch(lawd_cd, region_name, ym, service_key):
    root = L.get_xml(MOLIT, {
        "serviceKey": service_key, "LAWD_CD": lawd_cd, "DEAL_YMD": ym,
        "numOfRows": 1000, "pageNo": 1,
    })
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
        deals.append({
            "apt": g("aptNm"), "region_key": region_name.split()[-1],
            "region": f"{region_name} {g('umdNm')}",
            "area_m2": round(area, 1), "pyeong": round(area / 3.3058),
            "price": price, "floor": int(g("floor") or 0),
            "date": f"{y:04d}-{m:02d}-{d:02d}", "build_year": int(g("buildYear") or 0) or None,
        })
    return deals


def main():
    service_key = L.key("DATA_GO_KR_KEY", required=True)
    months = recent_months(MONTHS_BACK)
    all_deals = []
    for region, lawd in L.LAWD.items():
        for ym in months:
            try:
                all_deals += fetch(lawd, region, ym, service_key)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {region} {ym} 실패: {e}", file=sys.stderr)
        print(f"[{region}] 누적 {len(all_deals)}건")
    if not all_deals:
        print("수집 결과 없음 — 기존 transactions.json 유지")
        return
    all_deals.sort(key=lambda d: d["date"], reverse=True)
    data = {
        "_meta": {"source": "국토교통부 실거래가 OpenAPI", "currency_unit": "만원"},
        "as_of": dt.date.today().strftime("%Y-%m"), "deals": all_deals,
    }
    L.save_json_safe(TX_JSON, data, min_items_key="deals")


if __name__ == "__main__":
    main()
