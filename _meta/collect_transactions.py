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

또한 numOfRows=1000 1페이지만 읽어 월 1,000건이 넘는 시군구는 조용히 잘렸다. totalCount를
보고 끝까지 페이지네이션한다.
"""
import datetime as dt
import os
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
        rec = {
            "apt": g("aptNm"), "region_key": region_name, "sido": region_name.split()[0],
            "region": f"{region_name} {g('umdNm')}",
            "umd": g("umdNm"),
            "area_m2": round(area, 1), "pyeong": round(area / 3.3058),
            "price": price, "floor": int(g("floor") or 0),
            "date": f"{y:04d}-{m:02d}-{d:02d}", "build_year": int(g("buildYear") or 0) or None,
        }
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
    L.save_json_safe(TX_JSON, data, min_items_key="deals")
    print(f"[ok] 갱신 {ok}쌍(실패 {fail}) · 지역 {len(touched_regions)}개 · "
          f"총 {len(all_deals):,}건(해제 {canceled:,}건) · "
          f"커버리지 {len(pairs)}/{len(L.LAWD) * len(months)}쌍")


if __name__ == "__main__":
    main()
