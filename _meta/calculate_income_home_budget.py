#!/usr/bin/env python3
"""Reproduce the rounded examples in income-home-budget.html."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Assumptions:
    bank_dsr: float = 0.40
    annual_actual_rate: float = 0.043
    stress_rate: float = 0.030
    term_years: int = 30
    purchase_cash: int = 150_000_000


A = Assumptions()


def principal_from_monthly_payment(payment: float, annual_rate: float, years: int) -> float:
    monthly_rate = annual_rate / 12
    months = years * 12
    return payment * (1 - (1 + monthly_rate) ** -months) / monthly_rate


def monthly_payment(principal: float, annual_rate: float, years: int) -> float:
    monthly_rate = annual_rate / 12
    months = years * 12
    return principal * monthly_rate / (1 - (1 + monthly_rate) ** -months)


def dsr_loan_limit(income: int) -> float:
    monthly_dsr_payment = income * A.bank_dsr / 12
    assessment_rate = A.annual_actual_rate + A.stress_rate
    return principal_from_monthly_payment(monthly_dsr_payment, assessment_rate, A.term_years)


def purchase_price_limit(income: int, ltv: float) -> tuple[float, float, str]:
    dsr_limit = dsr_loan_limit(income)
    ltv_price_limit = A.purchase_cash / (1 - ltv)
    price = min(A.purchase_cash + dsr_limit, ltv_price_limit)
    loan = price - A.purchase_cash
    reason = "DSR" if A.purchase_cash + dsr_limit <= ltv_price_limit else "LTV"
    return price, loan, reason


def eok(value: float) -> str:
    return f"{value / 100_000_000:.3f}억원"


if __name__ == "__main__":
    print("가정:", A)
    for income in (40_000_000, 50_000_000, 60_000_000, 70_000_000, 80_000_000, 100_000_000):
        print(f"연소득 {income // 10_000:,}만원: DSR 대출 {eok(dsr_loan_limit(income))}")
    for label, ltv in (("수도권 비규제지역", 0.70), ("규제지역", 0.40)):
        price, loan, reason = purchase_price_limit(50_000_000, ltv)
        print(f"{label}: 집값 {eok(price)}, 대출 {eok(loan)}, 제한 {reason}")
    loan = dsr_loan_limit(50_000_000)
    print(f"2.43억원 사례 실제 월 상환액: {monthly_payment(loan, A.annual_actual_rate, A.term_years):,.0f}원")
    print(f"월 100만원 상환 예산의 대출원금: {eok(principal_from_monthly_payment(1_000_000, A.annual_actual_rate, A.term_years))}")
