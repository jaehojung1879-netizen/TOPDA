/*
 * 양도소득세 — 법령 기준 독립 Reference Formula
 * ===========================================================================
 * ⚠ site/assets/app.js 의 calcTransferTax 와 코드를 공유하지 않는다. 조문만 보고
 *   다시 구현한 것이며, golden test 의 expected 값은 여기서 만든다.
 *
 * ─ 근거 ────────────────────────────────────────────────────────────────────
 * 소득세법 제55조 제1항        종합소득 기본세율 (= 양도소득 기본세율, 8구간)
 * 소득세법 제89조 제1항 제3호  1세대 1주택 양도소득 비과세
 *   └ 시행령 제154조 제1항     보유 2년 이상. **취득 당시 조정대상지역**이면 거주 2년 이상도 요건
 *   └ 시행령 제160조 제1항     고가주택(양도가액 12억원 초과) 안분
 *        과세대상 양도차익 = 양도차익 × (양도가액 − 12억원) / 양도가액
 * 소득세법 제95조 제2항        장기보유특별공제
 *   └ 표1(일반): 보유 3년 이상 4년 미만 6% … 15년 이상 30% (연 2%, **연 단위**)
 *   └ 표2(1세대1주택·거주 2년 이상): 보유분 + 거주분, 각 최대 40%, 합계 최대 80%
 * 소득세법 제95조 제4항        보유기간 = 취득일부터 양도일까지 (취득일 산입)
 * 소득세법 제103조 제1항       양도소득 기본공제 연 250만원
 * 소득세법 제104조 제1항       단기보유 세율
 *      주택·조합원입주권·분양권: 1년 미만 70% / 1년 이상 2년 미만 60%
 *      그 밖의 자산:             1년 미만 50% / 1년 이상 2년 미만 40%
 * 소득세법 제104조 제7항       조정대상지역 다주택 중과 (2주택 +20%p, 3주택 이상 +30%p)
 * 지방세법 제103조의3          개인지방소득세 = 소득세 산출세액의 10%
 *      (지방소득세 세율표는 소득세율의 정확히 1/10 이라 산출세액×10% 와 일치한다)
 * ===========================================================================
 */

/** 소득세법 제55조 제1항 — 기본세율 8구간 (누진공제 방식) */
export const BASIC_BRACKETS = [
  { upTo: 14000000, rate: 0.06, progressiveDeduction: 0 },
  { upTo: 50000000, rate: 0.15, progressiveDeduction: 1260000 },
  { upTo: 88000000, rate: 0.24, progressiveDeduction: 5760000 },
  { upTo: 150000000, rate: 0.35, progressiveDeduction: 15440000 },
  { upTo: 300000000, rate: 0.38, progressiveDeduction: 19940000 },
  { upTo: 500000000, rate: 0.40, progressiveDeduction: 25940000 },
  { upTo: 1000000000, rate: 0.42, progressiveDeduction: 35940000 },
  { upTo: Infinity, rate: 0.45, progressiveDeduction: 65940000 },
];

/**
 * 기본세율 산출세액을 **구간별 적산**으로 계산한다.
 * production 은 「과세표준 × 한계세율 − 누진공제」를 쓰므로, 적산 방식으로
 * 독립 검증하면 누진공제표 자체의 오타까지 잡힌다.
 */
export function basicRateTaxByStacking(taxBase) {
  if (taxBase <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of BASIC_BRACKETS) {
    const slice = Math.min(taxBase, b.upTo) - prev;
    if (slice > 0) tax += slice * b.rate;
    prev = b.upTo;
    if (taxBase <= b.upTo) break;
  }
  return tax;
}

/** 같은 과세표준에 적용되는 한계세율 */
export function marginalRate(taxBase) {
  for (const b of BASIC_BRACKETS) if (taxBase <= b.upTo) return b.rate;
  return 0.45;
}

/**
 * 보유기간(연) — 소득세법 제95조 제4항, 취득일 산입.
 * 취득일의 응당일(anniversary)에 도달하면 그 해 수를 채운 것으로 본다.
 * 예) 2024-01-10 취득 → 2025-01-10 양도 = 정확히 1년 (1년 이상)
 *                    → 2025-01-09 양도 = 1년 미만
 * ⚠ 365.2425 로 나누는 방식은 응당일을 「1년 미만」으로 잘못 분류한다.
 */
export function wholeYearsBetween(fromISO, toISO) {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  let years = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) years -= 1;
  return Math.max(0, years);
}

/** 장기보유특별공제 표1 (일반) — 보유 연수 기준, 3년 6% ~ 15년 30% */
export function ltDeductRateTable1(holdWholeYears) {
  if (holdWholeYears < 3) return 0;
  return Math.min(0.30, Math.floor(holdWholeYears) * 0.02);
}

/**
 * 장기보유특별공제 표2 (1세대 1주택, 거주 2년 이상) — 보유분 + 거주분.
 *  보유: 3년 12%, 이후 연 4%p, 최대 40% (10년)
 *  거주: 2년 이상 3년 미만 8%, 3년 12%, 이후 연 4%p, 최대 40% (10년)
 */
export function ltDeductRateTable2(holdWholeYears, liveWholeYears) {
  const hold = holdWholeYears >= 3
    ? Math.min(0.40, 0.12 + (Math.min(Math.floor(holdWholeYears), 10) - 3) * 0.04)
    : 0;
  let live = 0;
  if (liveWholeYears >= 3) live = Math.min(0.40, 0.12 + (Math.min(Math.floor(liveWholeYears), 10) - 3) * 0.04);
  else if (liveWholeYears >= 2) live = 0.08;
  return Math.min(0.80, hold + live);
}

/**
 * 양도소득세 총액(지방소득세 포함)의 독립 산정.
 *
 * 지원 범위 — golden test 가 다루는 범위로 한정한다. 여기서 다루지 않는 사안
 * (부담부증여, 조합원입주권 특례, 감면, 비거주자 등)은 golden case 를 만들지 않는다.
 */
export function referenceTransferTax({
  sellPrice,
  buyPrice,
  cost = 0,
  holdYears,          // 정수 연수 (또는 wholeYearsBetween 결과)
  liveYears = 0,
  homes = 1,
  onlyHome = false,
  regulated = false,
  assetType = 'house',
  surchargeWaived = false, // 다주택 중과 한시 유예 적용 여부
}) {
  const isHouse = assetType !== 'nonhouse';
  const rawGain = Math.max(0, sellPrice - buyPrice - cost);

  // ── 1세대 1주택 비과세 / 고가주택 안분 (제89조①3호, 시행령 제160조①) ──
  const oneHome = isHouse && homes === 1 && onlyHome && holdYears >= 2;
  let taxableRatio = 1;
  if (oneHome) {
    taxableRatio = sellPrice <= 1200000000 ? 0 : (sellPrice - 1200000000) / sellPrice;
  }
  if (taxableRatio === 0) {
    return {
      exempted: true, taxableGain: 0, ltDeduct: 0, taxBase: 0,
      incomeTax: 0, localTax: 0, total: 0,
    };
  }
  const taxableGain = rawGain * taxableRatio;

  // ── 단기보유 세율 (제104조①) ──
  let shortTermRate = null;
  if (holdYears < 1) shortTermRate = isHouse ? 0.70 : 0.50;
  else if (holdYears < 2) shortTermRate = isHouse ? 0.60 : 0.40;

  // ── 조정대상지역 다주택 중과 (제104조⑦) ──
  //   중과 대상은 장기보유특별공제가 배제된다 (제95조② 단서).
  const heavy = isHouse && !shortTermRate && regulated && homes >= 2 && !surchargeWaived;
  const surcharge = heavy ? (homes >= 3 ? 0.30 : 0.20) : 0;

  // ── 장기보유특별공제 (제95조②) ──
  let ltRate = 0;
  if (!shortTermRate && !heavy && holdYears >= 3) {
    ltRate = (oneHome && sellPrice > 1200000000 && liveYears >= 2)
      ? ltDeductRateTable2(holdYears, liveYears)
      : ltDeductRateTable1(holdYears);
  }
  const ltDeduct = taxableGain * ltRate;
  const incomeAmount = Math.max(0, taxableGain - ltDeduct);

  // ── 기본공제 250만원 (제103조①) ──
  const basicDeduct = Math.min(2500000, incomeAmount);
  const taxBase = Math.max(0, incomeAmount - basicDeduct);

  // ── 산출세액 ──
  let incomeTax;
  if (shortTermRate) {
    incomeTax = taxBase * shortTermRate;
  } else {
    incomeTax = basicRateTaxByStacking(taxBase) + taxBase * surcharge;
  }
  const localTax = incomeTax * 0.10; // 지방세법 제103조의3
  return {
    exempted: false, taxableGain, ltDeductRate: ltRate, ltDeduct, basicDeduct, taxBase,
    shortTermRate, surchargeRate: surcharge,
    incomeTax, localTax, total: incomeTax + localTax,
  };
}
