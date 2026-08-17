/*
 * 중개보수 · 전월세전환율 · 인지세 · 청약가점 — 독립 Reference Formula
 * ===========================================================================
 * ⚠ app.js 와 코드를 공유하지 않는다. 법령·조례의 요율표를 조문 순서 그대로 옮겨
 *   적고, production 이 쓰는 분기 구조와는 다른 방식(표 순회)으로 판정한다.
 * ===========================================================================
 */

/* ── 중개보수 ───────────────────────────────────────────────────────────────
 * 공인중개사법 제32조 제4항, 같은 법 시행규칙 제20조 및 [별표1]
 *  · 주택의 중개보수 상한요율은 국토교통부령이 정한 범위에서 **시·도 조례**로 정한다.
 *    아래 표는 서울특별시 조례(및 대부분 시·도가 채택한 표준) 기준이다.
 *  · 거래금액이 일정 구간 미만이면 한도액이 별도로 있다.
 *  · 보증부 월세: 거래금액 = 보증금 + (월 차임 × 100).
 *    그 합이 5천만원 미만이면 보증금 + (월 차임 × 70) 으로 다시 계산한다.
 *  · 주거용 오피스텔(전용 85㎡ 이하 + 일정 설비): 매매·교환 0.5%, 임대차 0.4%
 *  · 그 밖의 중개대상물(상가·토지 등): 0.9% 이내에서 협의
 */
export const BROKERAGE_SALE_TABLE = [
  { under: 50000000, rate: 0.006, cap: 250000 },
  { under: 200000000, rate: 0.005, cap: 800000 },
  { under: 900000000, rate: 0.004, cap: null },
  { under: 1200000000, rate: 0.005, cap: null },
  { under: 1500000000, rate: 0.006, cap: null },
  { under: Infinity, rate: 0.007, cap: null },
];

export const BROKERAGE_LEASE_TABLE = [
  { under: 50000000, rate: 0.005, cap: 200000 },
  { under: 100000000, rate: 0.004, cap: 300000 },
  { under: 600000000, rate: 0.003, cap: null },
  { under: 1200000000, rate: 0.004, cap: null },
  { under: 1500000000, rate: 0.005, cap: null },
  { under: Infinity, rate: 0.006, cap: null },
];

/** 보증부 월세의 거래금액 환산 (시행규칙 제20조 제5항) */
export function monthlyRentTransactionAmount(deposit, monthlyRent) {
  const high = deposit + monthlyRent * 100;
  if (high >= 50000000) return high;
  return deposit + monthlyRent * 70;
}

/**
 * 중개보수 (부가세 제외 기준). type: 'sale' | 'lease' | 'officetel-sale'
 * | 'officetel-lease' | 'other'
 */
export function referenceBrokerageFee({ amount, type }) {
  if (type === 'officetel-sale') return { rate: 0.005, cap: null, fee: amount * 0.005 };
  if (type === 'officetel-lease') return { rate: 0.004, cap: null, fee: amount * 0.004 };
  if (type === 'other') return { rate: 0.009, cap: null, fee: amount * 0.009 };
  const table = type === 'sale' ? BROKERAGE_SALE_TABLE : BROKERAGE_LEASE_TABLE;
  const row = table.find((r) => amount < r.under);
  const raw = amount * row.rate;
  const fee = row.cap != null ? Math.min(raw, row.cap) : raw;
  return { rate: row.rate, cap: row.cap, fee };
}

/* ── 전월세 전환율 상한 ──────────────────────────────────────────────────────
 * 주택임대차보호법 제7조의2 (월차임 전환 시 산정률의 제한)
 *   전세보증금의 전부·일부를 월 단위 차임으로 전환하는 경우 그 산정률은
 *   다음 중 **낮은 비율**을 넘을 수 없다.
 *     1. 대통령령으로 정하는 비율 (시행령 제9조 제1항 — 연 1할, 즉 10%)
 *     2. 한국은행 공시 기준금리 + 대통령령으로 정하는 이율
 *        (시행령 제9조 제2항 — 연 2%)
 * ⚠ 이 상한은 **기존 계약의 전세 → 월세 전환**에 적용된다. 신규 계약의 조건은
 *   시장에서 정해지며 이 상한의 적용 대상이 아니다.
 */
export function referenceConversionCapPct(bokBaseRatePct) {
  return Math.min(10.0, bokBaseRatePct + 2.0);
}

/** 보증금 → 월세 환산: 월세 = 전환대상 보증금 × 전환율 ÷ 12 */
export function referenceDepositToMonthly(convertibleDeposit, annualRatePct) {
  return (convertibleDeposit * (annualRatePct / 100)) / 12;
}

/* ── 인지세 ──────────────────────────────────────────────────────────────────
 * 인지세법 제3조 제1항 제1호 — 부동산 소유권 이전에 관한 증서
 *   1천만원 초과 3천만원 이하        2만원
 *   3천만원 초과 5천만원 이하        4만원
 *   5천만원 초과 1억원 이하          7만원
 *   1억원 초과 10억원 이하          15만원
 *   10억원 초과                     35만원
 *   (1천만원 이하는 비과세 — 같은 조 제3항 및 주택 관련 비과세 규정)
 */
export function referenceStampDuty(price) {
  if (price <= 10000000) return 0;
  if (price <= 30000000) return 20000;
  if (price <= 50000000) return 40000;
  if (price <= 100000000) return 70000;
  if (price <= 1000000000) return 150000;
  return 350000;
}

/* ── 청약가점 ────────────────────────────────────────────────────────────────
 * 주택공급에 관한 규칙 제28조 및 [별표1] (가점제 산정기준표) — 총점 84점
 *   무주택기간   최대 32점 (1년 미만 2점, 1년마다 2점씩, 15년 이상 32점)
 *   부양가족수   최대 35점 (0명 5점, 1명마다 5점씩, 6명 이상 35점)
 *   청약통장     최대 17점 (6개월 미만 1점, 6개월~1년 2점, 이후 1년마다 1점,
 *                          15년 이상 17점)
 *   배우자 통장 가입기간의 50%를 합산(최대 3점), 합산 후에도 통장 점수 상한 17점.
 */
export function referenceSubscriptionScore({ noHomeYears, dependents, accountYears, spouseAccountYears = 0 }) {
  // 무주택기간: 산정 개시 전(만30세 미만 미혼 등)이면 0점, 1년 미만 2점, 이후 연 +2점
  const noHome = noHomeYears <= 0 ? 0
    : noHomeYears < 1 ? 2
      : Math.min(32, 2 + Math.floor(noHomeYears) * 2);
  const dep = Math.min(35, 5 + Math.min(dependents, 6) * 5);
  // 청약통장 가입기간 점수표
  const accountPoints = (y) => (y < 0.5 ? 1 : y < 1 ? 2 : Math.min(17, 2 + Math.floor(y)));
  const own = accountPoints(accountYears);
  // 배우자 통장은 **가입기간 점수의 50%** 를 최대 3점까지 합산한다(연수의 50%가 아니다).
  const spouseBonus = spouseAccountYears > 0
    ? Math.min(3, Math.floor(accountPoints(spouseAccountYears) * 0.5))
    : 0;
  const account = Math.min(17, own + spouseBonus);
  return { noHome, dependents: dep, account, total: noHome + dep + account };
}
