#!/usr/bin/env python3
"""맞춤 내집 찾기 전용 경량 인덱스 생성 → site/assets/finder_index.json

왜 필요한가
  파인더(site/calculators/search.html)는 단지를 점수화해 순위를 매기는 화면이라
  개별 거래 한 건 한 건이 아니라 **단지별 집계**만 있으면 된다. 그런데 지금까지는
  실거래 원장(transactions.json)을 통째로 받아 브라우저에서 매번 다시 집계했다.
  12개월 확장으로 원장이 59MB가 되면서 방문할 때마다 60MB를 내려받고 30만 건을
  파싱하게 됐고(로컬에서도 4.3초, 모바일에선 수십 초), 이게 "로딩이 너무 오래
  걸린다"의 원인이다.

  이 스크립트가 그 집계를 빌드 시점에 미리 계산해 둔다. 브라우저는 완성된 값을
  읽기만 하면 된다.

무엇을 담나 (키를 짧게 쓰는 이유: 15,000개 × 키 이름이 그대로 용량이다)
  n  단지명           rk 지역키          r  지역(법정동 포함)
  by 준공연도          c  유효 거래 수     lt 최근 거래일
  av 평균가           hi 최고가          lo 최저가
  ua ㎡당 평균(만원)    mf 관측 최고층      r6 최근 6개월 거래 수
  u  평형 [[전용㎡, 최근가], ...]
  ph 월별 가격 이력(최대 12) — ㎡당 평균 × 대표면적
  d  최신 유효 거래 [[날짜, 전용㎡, 가격, 층], ...]  (모달 표시용, 상한 RECENT_DEALS)
  x  최신 해제 거래   [[날짜, 전용㎡, 가격, 층], ...]  (상한 RECENT_CANCELED)

원칙
  · 해제(취소) 신고분은 c/av/hi/lo/ua/ph/r6 어디에도 넣지 않는다. x로만 싣는다.
  · 단지 식별은 '지역키|단지명' 복합키다. 단지명만 쓰면 전국 동명 단지가 합쳐진다
    (실측 827개 단지명이 2개 이상 지역에 중복, '삼환'은 14개 지역).
  · 추정·보간을 하지 않는다. 값이 없으면 키를 아예 넣지 않는다.
"""
import datetime as dt
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(BASE, "site")
TX = os.path.join(SITE, "assets", "transactions.json")
OUT = os.path.join(SITE, "assets", "finder_index.json")

# 모달이 '최근 실거래'로 보여주는 행 수(12)에 맞춘다. 더 담으면 그만큼 용량만 늘고
# 화면에는 나오지 않는다. 전체 내역은 실거래가 조회 페이지로 링크한다.
RECENT_DEALS = 12
RECENT_CANCELED = 5
PRICE_HISTORY_MONTHS = 12
RECENT_TX_DAYS = 180        # 거래 활성도(유동성) 점수의 기준 창


def load_deals():
    with open(TX, encoding="utf-8") as f:
        tx = json.load(f)
    return tx.get("deals", []), tx.get("_meta", {}), tx.get("updated", "")


def window_of(deals):
    """원장이 실제로 담고 있는 기간. 선언된 수집 창이 아니라 실측값을 쓴다 —
    12개월 수집기가 며칠에 걸쳐 채워지는 동안 없는 기간을 있다고 말하지 않기 위해서."""
    lo = hi = ""
    for d in deals:
        mo = (d.get("date") or "")[:7]
        if not mo:
            continue
        if not lo or mo < lo:
            lo = mo
        if not hi or mo > hi:
            hi = mo
    if not lo:
        return {"months": 0, "from": "", "to": ""}
    months = (int(hi[:4]) - int(lo[:4])) * 12 + (int(hi[5:7]) - int(lo[5:7])) + 1
    return {"months": months, "from": lo, "to": hi}


def build(deals):
    groups = {}
    for d in deals:
        rk, name, date = d.get("region_key"), d.get("apt"), d.get("date")
        area, price = d.get("area_m2"), d.get("price")
        if not (rk and name and date and area and price):
            continue
        g = groups.get((rk, name))
        if g is None:
            g = groups[(rk, name)] = {"valid": [], "canceled": [], "d": d}
        (g["canceled"] if d.get("canceled") else g["valid"]).append(d)

    cutoff = (dt.date.today() - dt.timedelta(days=RECENT_TX_DAYS)).isoformat()
    out = []
    for (rk, name), g in groups.items():
        valid = g["valid"]
        if not valid:
            continue          # 전 거래가 해제인 단지는 유효 가격이 없어 싣지 않는다
        # 정렬 키를 (날짜, 층)으로 둔다 — 같은 날 여러 건이 신고된 단지에서 '최근 실거래'가
        # 실행할 때마다 달라지지 않게 하고, 단지 페이지(build_complex_pages)와 같은 거래를
        # 가리키게 하기 위해서다. 파인더와 단지 페이지가 서로 다른 '최근가'를 말하면 안 된다.
        valid.sort(key=lambda x: (x["date"], x.get("floor") or 0))
        canceled = sorted(g["canceled"], key=lambda x: x["date"])
        any_d = g["d"]

        prices = [x["price"] for x in valid]
        units_m2 = [x["price"] / x["area_m2"] for x in valid]
        areas = sorted(x["area_m2"] for x in valid)
        rep_area = areas[len(areas) // 2]

        # 평형별 최신 거래가 (전용㎡ 반올림 기준)
        by_band = {}
        for x in valid:
            band = round(x["area_m2"])
            slot = by_band.get(band)
            if not slot or slot["date"] < x["date"]:
                by_band[band] = x
        units = [[b, by_band[b]["price"]] for b in sorted(by_band)]

        # 월별 ㎡당 평균 × 대표면적. 단순 가격 평균은 평형 구성이 바뀌면 왜곡된다
        # (85㎡→52㎡ 거래 전환이 상승장을 폭락으로 보이게 했던 사례).
        months = {}
        for x in valid:
            months.setdefault(x["date"][:7], []).append(x["price"] / x["area_m2"])
        ph = [round(sum(v) / len(v) * rep_area)
              for _, v in sorted(months.items())[-PRICE_HISTORY_MONTHS:]]

        rec = {
            "n": name, "rk": rk, "r": any_d.get("region") or rk,
            "c": len(valid), "lt": valid[-1]["date"],
            "av": round(sum(prices) / len(prices)),
            "hi": max(prices), "lo": min(prices),
            "ua": round(sum(units_m2) / len(units_m2)),
            "r6": sum(1 for x in valid if x["date"] >= cutoff),
            "u": units, "ph": ph,
            "d": [[x["date"], x["area_m2"], x["price"], x.get("floor") or 0]
                  for x in valid[-RECENT_DEALS:][::-1]],
        }
        # 같은 평형 직전 거래 — 모달의 변동률(%)에 쓴다. 표시용 거래 목록은 최근
        # RECENT_DEALS건으로 잘려 있어 브라우저에서는 직전 거래를 못 찾는 경우가 많다
        # (거래가 많은 단지일수록 그렇다). 전 기간에서 찾아 미리 실어 보낸다.
        last = valid[-1]
        last_py = round(last["area_m2"] / 3.3058)
        for prev in reversed(valid[:-1]):
            if round(prev["area_m2"] / 3.3058) == last_py:
                rec["pv"] = [prev["date"], prev["price"]]
                break

        by = any_d.get("build_year")
        if by:
            rec["by"] = by
        mf = max((x.get("floor") or 0) for x in valid)
        if mf:
            rec["mf"] = mf
        if canceled:
            # x는 표시용 상한을 두지만 xc(총 해제 건수)는 그대로 싣는다 — 화면의
            # '해제 N건 집계 제외'가 상한에 잘린 숫자를 말하면 안 되기 때문.
            rec["xc"] = len(canceled)
            rec["x"] = [[x["date"], x["area_m2"], x["price"], x.get("floor") or 0]
                        for x in canceled[-RECENT_CANCELED:][::-1]]
        out.append(rec)

    out.sort(key=lambda r: (r["rk"], r["n"]))
    return out


def main():
    deals, meta, updated = load_deals()
    complexes = build(deals)
    doc = {
        "_meta": {
            "source": meta.get("source", "국토교통부 실거래가 OpenAPI"),
            "currency_unit": "만원",
            "note": "맞춤 내집 찾기 전용 사전집계본. 해제(취소) 거래는 집계에서 제외하고 x에만 담는다. "
                    "전체 거래 내역은 transactions.json을 참조한다.",
            "keys": "n=단지명 rk=지역키 r=지역 by=준공 c=유효거래수 lt=최근거래일 "
                    "av=평균가 hi=최고 lo=최저 ua=㎡당평균 mf=최고층 r6=최근6개월거래 "
                    "u=[전용㎡,최근가] ph=월별가격이력 d=최신거래 x=해제거래",
        },
        "updated": updated or dt.date.today().isoformat(),
        "window": window_of(deals),
        "complexes": complexes,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT) / 1048576
    tx_size = os.path.getsize(TX) / 1048576
    print(f"[ok] finder_index.json — 단지 {len(complexes):,}개 · {size:.1f}MB "
          f"(원장 {tx_size:.1f}MB 대비 {size / tx_size * 100:.0f}%)")
    print(f"     집계 구간 {doc['window']['from']} ~ {doc['window']['to']} "
          f"({doc['window']['months']}개월)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
