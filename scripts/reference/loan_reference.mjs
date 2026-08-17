/*
 * 대출 한도·DSR — 독립 Reference Formula
 * ===========================================================================
 * ⚠ app.js 의 dsrAnnualFactor / calcMortgageLimit 과 코드를 공유하지 않는다.
 *   특히 상환액은 **폐쇄형 공식 대신 월별 시뮬레이션**으로 구한다. production 이
 *   쓰는 등비수열 공식에 오타가 나도 여기서 잡히도록 일부러 다른 방법을 썼다.
 *
 * ─ 근거 ────────────────────────────────────────────────────────────────────
 * 은행업감독규정 [별표6] 및 은행 여신업무기준
 *   — 차주단위 DSR = (모든 가계대출의 연간 원리금상환액) ÷ 연소득
 *   — 신용대출 연간 원금상환액 = 대출총액 ÷ 5년
 *   — 비주택담보대출(오피스텔 外) 산정만기 8년, 기타담보대출 10년,
 *     주담대 원금일시상환 대출기간(최대 10년), 장기카드대출 3년(분할상환 5년)
 * 금융위 「가계부채 관리 강화 방안」(2025.6.27) — 수도권·규제지역 주담대 6억원 한도
 * 금융위 「대출수요 관리 방안」(2025.10.15 발표, 10.16 시행)
 *   — 가격대별 한도 15억 이하 6억 / 15~25억 4억 / 25억 초과 2억
 *   — 규제지역 LTV 40%, 스트레스 금리 하한 3% (수도권·규제지역)
 * 스트레스 DSR 3단계 — 한도 산정 시 실제 금리에 스트레스 가산금리를 더해 역산
 * ===========================================================================
 */

/**
 * 원리금균등 상환 — 월별 시뮬레이션으로 월 상환액을 역산한다.
 * (이분법: 월 상환액 M 을 조정해 만기 잔액이 0 이 되는 값을 찾는다)
 */
export function annuityMonthlyPayment(principal, annualRatePct, months) {
  if (principal <= 0 || months <= 0) return 0;
  const i = annualRatePct / 100 / 12;
  if (i === 0) return principal / months;
  const residual = (M) => {
    let bal = principal;
    for (let k = 0; k < months; k += 1) bal = bal * (1 + i) - M;
    return bal;
  };
  let lo = 0;
  let hi = principal * (1 + i * months); // 확실히 과잉인 상한
  for (let it = 0; it < 200; it += 1) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 원리금균등 총이자 = 월상환액 × 개월수 − 원금 */
export function annuityTotalInterest(principal, annualRatePct, months) {
  return annuityMonthlyPayment(principal, annualRatePct, months) * months - principal;
}

/** 원금균등 — 월별 시뮬레이션. 회차별 상환액 배열을 돌려준다. */
export function equalPrincipalSchedule(principal, annualRatePct, months) {
  const i = annualRatePct / 100 / 12;
  const principalPart = principal / months;
  const rows = [];
  let bal = principal;
  for (let k = 0; k < months; k += 1) {
    const interest = bal * i;
    rows.push({ principal: principalPart, interest, payment: principalPart + interest });
    bal -= principalPart;
  }
  return rows;
}

export function equalPrincipalTotalInterest(principal, annualRatePct, months) {
  return equalPrincipalSchedule(principal, annualRatePct, months)
    .reduce((s, r) => s + r.interest, 0);
}

/**
 * DSR 산입용 연간 원리금상환액.
 *  · 원리금균등: 매달 같으므로 월상환액 × 12
 *  · 원금균등:  (원금 + 총이자) ÷ 대출연수 — 연평균
 *    (은행 DSR 원장이 연평균으로 표시된다는 점을 실측으로 확인한 값. rates.js 주석 참조)
 */
export function dsrAnnualPayment(principal, annualRatePct, months, repayType) {
  if (principal <= 0 || months <= 0) return 0;
  if (repayType === 'principal') {
    const totalInterest = equalPrincipalTotalInterest(principal, annualRatePct, months);
    return (principal + totalInterest) / (months / 12);
  }
  return annuityMonthlyPayment(principal, annualRatePct, months) * 12;
}

/** 신용대출의 DSR 연간 원리금 = 대출총액 ÷ 5년 + 대출총액 × 금리 */
export function creditLoanAnnualPayment(balance, annualRatePct, annualizeYears = 5) {
  if (balance <= 0) return 0;
  return balance / annualizeYears + balance * (annualRatePct / 100);
}

/**
 * 주택담보대출 한도 = min(LTV 한도, 지역 가격대별 한도, DSR 한도).
 * DSR 한도는 스트레스 가산금리를 더한 금리로 역산한다.
 */
export function referenceMortgageLimit({
  price, ltvPercent, priceCap = Infinity,
  income, existingAnnualDebt = 0, dsrLimitPercent,
  rate, stressAdd = 0, termYears, repayType = 'equal',
}) {
  const ltvLimit = price * (ltvPercent / 100);
  const availAnnual = Math.max(0, income * (dsrLimitPercent / 100) - existingAnnualDebt);
  const months = termYears * 12;
  // 원금 1원당 연간 원리금 → 여유 상환액을 그 값으로 나누면 한도가 나온다.
  const perWon = dsrAnnualPayment(1, rate + stressAdd, months, repayType);
  const dsrLimit = perWon > 0 ? availAnnual / perWon : 0;
  const limit = Math.max(0, Math.min(ltvLimit, priceCap, dsrLimit));
  return { ltvLimit, priceCap, dsrLimit, limit };
}

/**
 * 금융위 「대출수요 관리 방안」(2025.10.15) 가격대별 한도.
 * ⚠ 판정 기준은 매매가가 아니라 **대출 신청일 기준 시가**다.
 */
export function metroPriceCap(marketValue) {
  if (marketValue <= 1500000000) return 600000000;
  if (marketValue <= 2500000000) return 400000000;
  return 200000000;
}
