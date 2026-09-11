#!/usr/bin/env python3
"""Reproduce the figures used by site/posts/first-floor-apartment-price.html.

Each first-floor sale is compared with the median price of at least three sales
on floors 2+ in the same legal-dong, apartment and exclusive-area group, signed
within 45 days before or after it.  Canceled and malformed records are ignored.
The script reads the public-site transaction snapshot and does not modify files.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
import json
from pathlib import Path
from statistics import median, quantiles


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site/assets/transactions.json"
WINDOW_DAYS = 45
MIN_COMPARABLES = 3


def load_sales() -> list[dict]:
    raw = json.loads(SOURCE.read_text(encoding="utf-8"))
    sales = []
    for item in raw["deals"]:
        if item.get("canceled"):
            continue
        try:
            floor = int(item["floor"])
            area = float(item["area_m2"])
            price = float(item["price"])
            signed = date.fromisoformat(item["date"])
        except (KeyError, TypeError, ValueError):
            continue
        if floor <= 0 or area <= 0 or price <= 0:
            continue
        sales.append({**item, "floor": floor, "area_m2": area,
                      "price": price, "signed": signed})
    return sales


def matched_sales(sales: list[dict]) -> list[dict]:
    groups: dict[tuple[str, str, float], list[dict]] = defaultdict(list)
    for sale in sales:
        key = (sale["region"], sale["apt"], sale["area_m2"])
        groups[key].append(sale)

    matched = []
    for sale in sales:
        if sale["floor"] != 1:
            continue
        key = (sale["region"], sale["apt"], sale["area_m2"])
        comparables = [
            other["price"] for other in groups[key]
            if other["floor"] >= 2
            and abs((other["signed"] - sale["signed"]).days) <= WINDOW_DAYS
        ]
        if len(comparables) < MIN_COMPARABLES:
            continue
        reference = median(comparables)
        matched.append({"sale": sale, "gap": sale["price"] / reference - 1})
    return matched


def summary(label: str, rows: list[dict]) -> None:
    gaps = [row["gap"] for row in rows]
    q1, middle, q3 = quantiles(gaps, n=4, method="inclusive")
    lower = sum(gap < 0 for gap in gaps) / len(gaps)
    equal = sum(gap == 0 for gap in gaps) / len(gaps)
    higher = sum(gap > 0 for gap in gaps) / len(gaps)
    print(
        f"{label}: n={len(gaps):,}, median={middle:.3%}, "
        f"q1={q1:.3%}, q3={q3:.3%}, "
        f"lower={lower:.3%}, equal={equal:.3%}, higher={higher:.3%}"
    )


def main() -> None:
    sales = load_sales()
    matched = matched_sales(sales)
    summary("all", matched)

    regions = {
        "Seoul": {"서울"},
        "Gyeonggi/Incheon": {"경기", "인천"},
        "5 metros/Sejong": {"부산", "대구", "대전", "울산", "세종"},
    }
    for label, prefixes in regions.items():
        rows = [
            row for row in matched
            if row["sale"]["region_key"].split()[0] in prefixes
        ]
        summary(label, rows)

    area_groups = {
        "area <= 60": lambda area: area <= 60,
        "60 < area <= 85": lambda area: 60 < area <= 85,
        "area > 85": lambda area: area > 85,
    }
    for label, includes in area_groups.items():
        rows = [row for row in matched if includes(row["sale"]["area_m2"])]
        summary(label, rows)

    grouped: dict[tuple[str, str, float], list[float]] = defaultdict(list)
    for row in matched:
        sale = row["sale"]
        grouped[(sale["region"], sale["apt"], sale["area_m2"])].append(row["gap"])
    equal_weight_gaps = [median(gaps) for gaps in grouped.values()]
    print(
        f"equal-weight groups: n={len(equal_weight_gaps):,}, "
        f"median={median(equal_weight_gaps):.3%}"
    )
    print(
        f"source updated={json.loads(SOURCE.read_text(encoding='utf-8'))['updated']}, "
        f"valid sales={len(sales):,}, "
        f"apartments={len({(row['sale']['region'], row['sale']['apt']) for row in matched}):,}"
    )


if __name__ == "__main__":
    main()
