#!/usr/bin/env python3
"""단지 공시가격 레코드에 **평형별 추정 시가표준액**을 붙인다.

■ 문제 (2026-08-02, 사용자 지적)

  "단지별 공시가격을 가져오려면 평형을 가져와야지"

`collect_official_price.py` 가 저장하는 값은 단지 전체 호의 **중앙값** 하나다. 그런데
공시가격은 평형마다 다르다. 헬리오시티처럼 39㎡~111㎡ 가 섞인 단지에서 34평 소유자에게
중앙값을 주면 시가표준액이 크게 어긋나고, 그 값으로 계산하는 국민주택채권 매입액과
증여 취득세 중과 판정(3억 기준)까지 함께 틀어진다.

■ 왜 이 방법인가 — 그리고 무엇을 못 하는가

정공법은 건축물대장 주택가격(호별 가격)을 전유부 면적(getBrExposPubuseAreaInfo)과
동·호 기준으로 조인해 '이 평형의 공시가격'을 실측하는 것이다. 그건 아직 못 한다:
API 키가 필요하고 이 작업 환경에서는 apis.data.go.kr 이 막혀 있어(HTTP 000) 응답
필드명을 확인할 수 없다. 검증 못 한 스크래핑 코드는 넣지 않는 것이 이 저장소의 규칙이다.

대신 이미 가진 데이터로 **단지 자신의 비율**을 써서 추정한다.

    추정 공시가격(평형) = 단지 공시가격 중앙값 × ( 평형 실거래 중앙값 / 단지 실거래 중앙값 )

전국 평균 현실화율 같은 외부 상수를 쓰지 않고 그 단지가 실제로 보인 공시/실거래 관계를
그대로 재사용하므로, 단지 단위의 편차(입지·연식·현실화율 차이)는 비율에서 자동으로
상쇄된다. 남는 오차는 '한 단지 안에서 평형별로 공시/실거래 비가 얼마나 다른가'뿐이고,
둘 다 면적에 비례해 움직이므로 그 편차는 작다.

그래도 **추정은 추정이다.** 그래서:
  - 수집된 실제 호별 공시가격 분포 [min, max] 밖으로는 나가지 않게 자른다.
  - 화면에서 '추정'으로 분류해 표시하고 산식을 함께 밝힌다(공시가격알리미 링크 포함).
  - 표본이 얕은 평형은 아예 만들지 않는다(중앙값이 한두 건에 휘둘린다).

정확한 값이 필요한 사람은 본인 호의 공시가격을 직접 넣어야 한다 — 그 안내를 지운 적이
없고, 이 추정이 그 안내를 대신하지도 않는다.

■ 출력

official_price.json 의 각 레코드에 `u` 를 붙인다.

    "u": [[59, 18, 412000000], [84, 25, 578000000], ...]
          전용㎡  평       추정 공시가격(원)

    python3 _meta/build_official_price_units.py
    python3 _meta/build_official_price_units.py --check   # 최신인지 검사 (CI)
"""
import argparse
import json
import os
import statistics
import sys
from collections import defaultdict

SITE_ASSETS = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "site", "assets"))
OP_JSON = os.path.join(SITE_ASSETS, "official_price.json")
TX_JSON = os.path.join(SITE_ASSETS, "transactions.json")

PYEONG_M2 = 3.3058          # 1평 = 3.3058㎡
MIN_TRADES_PER_BAND = 3     # 이보다 적으면 그 평형의 중앙값을 믿지 않는다
MIN_BANDS = 2               # 평형이 하나뿐이면 중앙값이 곧 그 평형이라 붙일 이유가 없다
MIN_TRADES_TOTAL = 6        # 단지 실거래 중앙값(분모)이 흔들리지 않을 최소 표본


def pyeong(area_m2):
    """전용㎡ → 평(반올림). 화면에 '84㎡(25평)'으로 보여주기 위한 값이다."""
    return int(round(area_m2 / PYEONG_M2))


def bands(deals, min_per_band=MIN_TRADES_PER_BAND):
    """단지 거래 목록 → {반올림 전용㎡: 실거래 중앙값(만원)}.

    반올림 단위를 1㎡로 두는 것은 finder_index 와 같은 규약이다(84.9㎡ 와 84.97㎡ 를
    같은 평형으로 본다). 표본이 얕은 평형은 버린다 — 한 건짜리 중앙값은 그 평형의
    대표값이 아니라 그 거래의 층·향일 뿐이다."""
    by = defaultdict(list)
    for d in deals:
        area, price = d.get("area_m2"), d.get("price")
        if not area or not price or price <= 0:
            continue
        by[round(float(area))].append(price)
    return {a: statistics.median(v) for a, v in by.items() if len(v) >= min_per_band}


def estimate_units(rec, deals):
    """공시가격 레코드 + 단지 거래 목록 → [[전용㎡, 평, 추정 공시가격(원)], ...].

    조건을 못 채우면 빈 목록을 준다 — 근거가 얕으면 추정을 만들지 않는다."""
    med = rec.get("med")
    lo, hi = rec.get("min"), rec.get("max")
    if not (med and med > 0):
        return []
    prices = [d["price"] for d in deals
              if d.get("price") and d["price"] > 0 and d.get("area_m2")]
    if len(prices) < MIN_TRADES_TOTAL:
        return []
    band_med = bands(deals)
    if len(band_med) < MIN_BANDS:
        return []
    all_med = statistics.median(prices)
    if not all_med > 0:
        return []

    out = []
    for area in sorted(band_med):
        est = med * (band_med[area] / all_med)
        # 실제로 수집된 호별 공시가격 범위 밖은 추정이 아니라 외삽이다 — 잘라 둔다.
        if lo:
            est = max(est, lo)
        if hi:
            est = min(est, hi)
        # 만원 단위로 떨군다. 원 단위 끝자리는 추정에 없는 정밀도다.
        out.append([area, pyeong(area), int(round(est / 10000)) * 10000])
    return out


def load_deals_by_complex(path=TX_JSON):
    """'지역키|단지명' → 거래 목록."""
    with open(path, encoding="utf-8") as f:
        deals = json.load(f).get("deals") or []
    by = defaultdict(list)
    for d in deals:
        by[f"{d.get('region_key')}|{d.get('apt')}"].append(d)
    return by


def build(op, deals_by_complex):
    """official_price 문서를 제자리에서 갱신하고 (붙인 수, 지운 수)를 돌려준다."""
    added = removed = 0
    for key, rec in (op.get("map") or {}).items():
        units = estimate_units(rec, deals_by_complex.get(key) or [])
        if units:
            if rec.get("u") != units:
                added += 1
            rec["u"] = units
        elif "u" in rec:
            # 거래가 끊겨 근거가 사라졌으면 옛 추정을 남겨두지 않는다.
            del rec["u"]
            removed += 1
    return added, removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="갱신이 필요하면 1로 종료(파일을 쓰지 않음)")
    args = ap.parse_args()

    with open(OP_JSON, encoding="utf-8") as f:
        before = f.read()
    op = json.loads(before)

    deals_by_complex = load_deals_by_complex()
    added, removed = build(op, deals_by_complex)

    with_units = sum(1 for r in (op.get("map") or {}).values() if r.get("u"))
    total = len(op.get("map") or {})
    print(f"평형별 추정: {with_units}/{total}개 단지 (갱신 {added} · 제거 {removed})")

    # 들여쓰기 없이 쓴다 — 수집기(collect_official_price.save)와 같은 규약이다.
    # 다르게 쓰면 다음 수집 실행이 파일 전체를 되돌려 매번 통짜 diff 가 난다.
    # 비교도 '실제로 쓸 문자열' 기준으로 한다. 값만 비교하면 표현(들여쓰기)이 어긋난
    # 파일을 최신이라고 통과시킨다.
    after = json.dumps(op, ensure_ascii=False, separators=(",", ":")) + "\n"
    if before == after:
        return 0
    if args.check:
        print("\nofficial_price.json 의 평형별 추정이 최신이 아닙니다.\n"
              "  python3 _meta/build_official_price_units.py", file=sys.stderr)
        return 1
    with open(OP_JSON, "w", encoding="utf-8") as f:
        f.write(after)
    return 0


if __name__ == "__main__":
    sys.exit(main())
