#!/usr/bin/env python3
"""Reproduce the illustrative mortgage prepayment figures used in the article."""

from decimal import Decimal, ROUND_HALF_UP


WON = Decimal("1")
MONTH = Decimal("0.01")


def won(value: Decimal) -> int:
    return int(value.quantize(WON, rounding=ROUND_HALF_UP))


def months(value: Decimal) -> Decimal:
    return value.quantize(MONTH, rounding=ROUND_HALF_UP)


def calculate(
    prepayment: Decimal,
    loan_rate: Decimal,
    fee_rate: Decimal,
    elapsed_days: Decimal,
    fee_period_days: Decimal = Decimal("1095"),
    alternative_after_tax_rate: Decimal = Decimal("0"),
) -> dict[str, int | Decimal]:
    remaining_days = max(fee_period_days - elapsed_days, Decimal("0"))
    fee = prepayment * fee_rate * remaining_days / fee_period_days
    first_month_interest_saved = prepayment * loan_rate / Decimal("12")
    first_month_alternative_return = prepayment * alternative_after_tax_rate / Decimal("12")
    monthly_net_benefit = first_month_interest_saved - first_month_alternative_return
    break_even = fee / monthly_net_benefit if monthly_net_benefit > 0 else Decimal("Infinity")
    return {
        "fee": won(fee),
        "first_month_interest_saved": won(first_month_interest_saved),
        "first_month_alternative_return": won(first_month_alternative_return),
        "break_even_months": months(break_even),
    }


def main() -> None:
    prepayment = Decimal("100000000")
    loan_rate = Decimal("0.043")
    fee_rate = Decimal("0.0055")

    print("상환액 1억원, 대출금리 4.3%, 수수료율 0.55%, 수수료 기간 3년")
    for label, elapsed_days in (("대출 직후", 0), ("1년 경과", 365), ("2년 경과", 730)):
        result = calculate(prepayment, loan_rate, fee_rate, Decimal(elapsed_days))
        print(label, result)

    print("1년 경과, 세후 대체수익률 2.5% 가정")
    print(calculate(
        prepayment,
        loan_rate,
        fee_rate,
        Decimal("365"),
        alternative_after_tax_rate=Decimal("0.025"),
    ))


if __name__ == "__main__":
    main()
