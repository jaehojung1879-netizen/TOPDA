/*
 * Boundary Test — 법령·규제가 갈리는 경계값을 1원 단위로 훑는다
 * ===========================================================================
 * 실행: node scripts/check_calc_boundaries.mjs
 *
 * golden test 는 "대표값의 정답"을 고정한다. 그러나 실제 사고는 거의 언제나
 * **경계에서** 난다 — 6억원 이하인지 초과인지, 2년을 채웠는지, 15억원인지 15억 1원인지.
 * 여기서는 각 경계마다 (직전 / 정확히 / 직후) 세 점을 찍고, 조문이 정한 쪽으로
 * 갈라지는지 확인한다.
 *
 * ⚠ "직전 = 직후" 를 기대하는 것이 아니다. 조문이 계단식이면 계단이 나와야 하고,
 *   연속식이면 연속이어야 한다. 어느 쪽인지를 케이스마다 명시한다.
 */
import { loadCalcFunctions, makeRunner } from './lib/calc_engine.mjs';

const { fns, rates } = loadCalcFunctions([
  'calcAcquisitionTax', 'calcTransferTax', 'calcProgressiveTax', 'calcBrokerageFee',
  'calcStampDuty', 'calcSubscriptionScore', 'calcJeonseMonthly', 'legalConversionCapPct',
  'loanRatesCfg', 'RATES_DSR', 'loanRegionConfig', 'suggestLtvPercent',
  'loanPriorRules', 'suggestStressAdd', 'dsrAnnualFactor', 'calcMortgageLimit',
]);

const R = makeRunner('[Boundary] 법정 경계값 전수 점검');

const acq = (o) => fns.calcAcquisitionTax({
  homes: 1, regulated: false, areaOver85: false, firstHome: false, ...o,
});
const tt = (o) => fns.calcTransferTax({
  sellPrice: 1000000000, buyPrice: 500000000, cost: 0,
  holdYears: 5, liveYears: 0, homes: 1, onlyHome: false, regulated: false, ...o,
});

const expectRate = (r, want, label) => {
  if (Math.abs(r - want) > 1e-9) throw new Error(`${label}: 세율 ${r} ≠ ${want}`);
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. 취득세 — 지방세법 제11조·제13조의2, 지방세특례제한법 제36조의3·제36조의5
 * ═════════════════════════════════════════════════════════════════════════ */

R.check('취득세 6억원 경계 — 이하 1%, 초과 누진식 (연속)', () => {
  expectRate(acq({ price: 599999999 }).baseRate, 0.01, '6억 직전');
  expectRate(acq({ price: 600000000 }).baseRate, 0.01, '정확히 6억 (「이하」)');
  // 6억 + 1원의 계산식 결과는 0.0100000000666…, 법정 반올림 후 0.01
  expectRate(acq({ price: 600000001 }).baseRate, 0.01, '6억 + 1원 (반올림 후)');
});

R.check('취득세 9억원 경계 — 이하 누진식, 초과 3% (연속)', () => {
  expectRate(acq({ price: 899999999 }).baseRate, 0.03, '9억 직전 (계산식이 3%에 수렴)');
  expectRate(acq({ price: 900000000 }).baseRate, 0.03, '정확히 9억 (「이하」, 계산식 결과 3%)');
  expectRate(acq({ price: 900000001 }).baseRate, 0.03, '9억 + 1원 (다목 3%)');
});

R.check('취득세 누진 구간의 법정 반올림이 실제로 적용된다', () => {
  // 지방세법 제11조①8호 나목: 소수 다섯째 자리에서 반올림 → 넷째 자리
  const cases = [
    [650000000, 0.0133], // (6.5×2/3−3)/100 = 0.0133333… → 0.0133
    [700000000, 0.0167], // 0.0166666…  → 0.0167
    [750000000, 0.0200],
    [800000000, 0.0233], // 0.0233333…  → 0.0233
    [850000000, 0.0267], // 0.0266666…  → 0.0267
  ];
  for (const [price, want] of cases) {
    expectRate(acq({ price }).baseRate, want, `${price / 1e8}억`);
    // 반올림 자릿수 자체도 확인한다 — 넷째 자리를 넘는 소수가 남아 있으면 안 된다.
    const digits = acq({ price }).baseRate * 10000;
    if (Math.abs(digits - Math.round(digits)) > 1e-9) {
      throw new Error(`${price}: 세율이 소수 넷째 자리로 반올림되지 않았습니다 (${acq({ price }).baseRate})`);
    }
  }
});

R.check('취득세 주택 수 경계 1 / 2 / 3 / 4+ (조정 · 비조정)', () => {
  const price = 800000000;
  // 조정대상지역
  expectRate(acq({ price, homes: 1, regulated: true }).baseRate, 0.0233, '조정 1주택');
  expectRate(acq({ price, homes: 2, regulated: true }).baseRate, 0.08, '조정 2주택');
  expectRate(acq({ price, homes: 3, regulated: true }).baseRate, 0.12, '조정 3주택');
  expectRate(acq({ price, homes: 4, regulated: true }).baseRate, 0.12, '조정 4주택');
  // 비조정
  expectRate(acq({ price, homes: 2, regulated: false }).baseRate, 0.0233, '비조정 2주택 (중과 없음)');
  expectRate(acq({ price, homes: 3, regulated: false }).baseRate, 0.08, '비조정 3주택');
  expectRate(acq({ price, homes: 4, regulated: false }).baseRate, 0.12, '비조정 4주택');
});

R.check('취득세 일시적 2주택 — 2주택이지만 1주택 세율', () => {
  const r = acq({ price: 800000000, homes: 2, regulated: true, tempTwoHome: true });
  expectRate(r.baseRate, 0.0233, '일시적 2주택');
  if (r.isHeavy) throw new Error('일시적 2주택이 중과로 판정됐습니다.');
  if (r.scenarioKey !== 'temp-two-home') throw new Error(`시나리오 키 ${r.scenarioKey}`);
});

R.check('생애최초 감면 12억원 경계', () => {
  if (acq({ price: 1200000000, firstHome: true }).firstHomeDeduct !== 2000000) throw new Error('12억 정확히 → 감면 적용돼야 합니다.');
  if (acq({ price: 1200000001, firstHome: true }).firstHomeDeduct !== 0) throw new Error('12억 + 1원 → 감면 배제돼야 합니다.');
});

R.check('출산·양육 감면 12억원 경계 및 생애최초와의 배타 적용', () => {
  const at12 = acq({ price: 1200000000, childbirth: true });
  if (at12.firstHomeDeduct !== 5000000) throw new Error('12억 정확히 → 출산·양육 500만원');
  if (acq({ price: 1200000001, childbirth: true }).firstHomeDeduct !== 0) throw new Error('12억 + 1원 → 감면 배제');
  const both = acq({ price: 800000000, firstHome: true, childbirth: true });
  if (both.appliedReliefKey !== 'childbirth') throw new Error('유리한 쪽(출산·양육)이 적용돼야 합니다.');
  if (both.firstHomeDeduct !== 5000000) throw new Error('중복 합산되면 안 됩니다(200만 + 500만 ≠ 700만).');
});

R.check('전용 85㎡ 경계 — 농특세 부과 여부', () => {
  if (acq({ price: 800000000, areaOver85: false }).ruralTax !== 0) throw new Error('85㎡ 이하는 농특세 비과세');
  if (acq({ price: 800000000, areaOver85: true }).ruralTax <= 0) throw new Error('85㎡ 초과는 농특세 과세');
});

R.check('지방 미분양 감면 6억원 · 85㎡ 경계', () => {
  const base = { homes: 3, regulated: true, unsold2026: true };
  if (!acq({ ...base, price: 600000000 }).unsoldEligible) throw new Error('6억 정확히 → 감면 대상');
  if (acq({ ...base, price: 600000001 }).unsoldEligible) throw new Error('6억 + 1원 → 감면 배제');
  if (acq({ ...base, price: 500000000, areaOver85: true }).unsoldEligible) throw new Error('85㎡ 초과 → 감면 배제');
});

R.check('증여 중과 판정은 시가표준액 3억원 경계로 갈린다', () => {
  const g = (std) => acq({
    price: 500000000, regulated: true, acqType: 'gift',
    giftMarketValue: 500000000, giftStdValue: std, giftDonorMultiHome: true,
  });
  expectRate(g(299999999).baseRate, 0.035, '시가표준액 3억 직전');
  expectRate(g(300000000).baseRate, 0.12, '정확히 3억 (「3억원 이상」)');
  expectRate(g(300000001).baseRate, 0.12, '3억 + 1원');
});

R.check('취득 원인별 세율 — 매매·분양·상속·증여·원시·재개발', () => {
  const p = 500000000;
  expectRate(acq({ price: p, acqType: 'purchase' }).baseRate, 0.01, '매매');
  expectRate(acq({ price: p, acqType: 'presale' }).baseRate, 0.01, '분양 신축(유상거래 세율)');
  expectRate(acq({ price: p, acqType: 'original' }).baseRate, 0.028, '원시취득');
  expectRate(acq({ price: p, acqType: 'redevelop' }).baseRate, 0.028, '재개발 조합원(개략)');
  expectRate(acq({ price: p, acqType: 'inherit', inheritNoHome: true }).baseRate, 0.008, '상속 무주택 특례');
  expectRate(acq({ price: p, acqType: 'inherit', inheritNoHome: false }).baseRate, 0.028, '상속 그 외');
  expectRate(acq({ price: p, acqType: 'gift', giftMarketValue: p }).baseRate, 0.035, '증여');
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. 양도소득세 — 소득세법 제55·89·95·103·104조
 * ═════════════════════════════════════════════════════════════════════════ */

R.check('양도세 보유 1년 경계 — 응당일 기준 (계단식)', () => {
  const at = (sellDate) => tt({ acquireDate: '2025-03-10', sellDate, holdYears: 0, homes: 1 });
  const before = at('2026-03-09');
  const on = at('2026-03-10');
  if (before.holdYears !== 0) throw new Error(`응당일 직전 보유기간 ${before.holdYears}년 (기대 0)`);
  if (on.holdYears !== 1) throw new Error(`응당일 보유기간 ${on.holdYears}년 (기대 1)`);
  if (before.rate !== 0.70) throw new Error(`응당일 직전 세율 ${before.rate} (기대 0.70)`);
  if (on.rate !== 0.60) throw new Error(`응당일 세율 ${on.rate} (기대 0.60)`);
});

R.check('양도세 보유 2년 경계 — 단기 해제 (응당일 기준)', () => {
  const at = (sellDate) => tt({ acquireDate: '2024-03-10', sellDate, holdYears: 0, homes: 1 });
  if (at('2026-03-09').rate !== 0.60) throw new Error('2년 직전은 60%여야 합니다.');
  if (at('2026-03-10').rate === 0.60) throw new Error('2년 응당일에는 단기세율이 풀려야 합니다.');
});

R.check('양도세 12억원 경계 — 1세대1주택 비과세 → 안분 (연속)', () => {
  const one = (sellPrice) => fns.calcTransferTax({
    sellPrice, buyPrice: 700000000, cost: 0, holdYears: 5, liveYears: 5,
    homes: 1, onlyHome: true, regulated: false,
  });
  if (!one(1199999999).exempted) throw new Error('12억 직전은 비과세');
  if (!one(1200000000).exempted) throw new Error('정확히 12억은 비과세 (「초과」가 고가주택)');
  if (one(1200000001).exempted) throw new Error('12억 + 1원은 안분 과세');
  if (one(1200000001).total > 1000) throw new Error('12억 + 1원에서 세액이 급등하면 안 됩니다.');
});

R.check('장기보유특별공제 표1 — 연 단위 계단 (3·4·15년)', () => {
  const rate = (holdYears) => tt({ holdYears, homes: 2 }).ltDeductRate;
  if (rate(2) !== 0) throw new Error('2년은 공제 없음');
  if (Math.abs(rate(3) - 0.06) > 1e-9) throw new Error(`3년 ${rate(3)} ≠ 6%`);
  // 3.9년도 「3년 이상 4년 미만」이므로 6% 그대로여야 한다 (소수 연수 보간 금지)
  if (Math.abs(rate(3.9) - 0.06) > 1e-9) throw new Error(`3.9년 ${rate(3.9)} ≠ 6% — 소수 연수가 보간되고 있습니다.`);
  if (Math.abs(rate(4) - 0.08) > 1e-9) throw new Error(`4년 ${rate(4)} ≠ 8%`);
  if (Math.abs(rate(15) - 0.30) > 1e-9) throw new Error(`15년 ${rate(15)} ≠ 30%`);
  if (Math.abs(rate(30) - 0.30) > 1e-9) throw new Error(`30년 ${rate(30)} ≠ 30% (상한)`);
});

R.check('장기보유특별공제 표2 — 거주 2년 경계에서 8% 구간이 있다', () => {
  const r = (liveYears) => fns.calcTransferTax({
    sellPrice: 2000000000, buyPrice: 1000000000, cost: 0, holdYears: 10, liveYears,
    homes: 1, onlyHome: true, regulated: false,
  }).ltDeductRate;
  // 거주 2년 미만이면 표2 를 못 쓰고 표1(보유 10년 = 20%)
  if (Math.abs(r(1) - 0.20) > 1e-9) throw new Error(`거주 1년 ${r(1)} ≠ 표1 20%`);
  // 거주 2년: 보유분 40% + 거주분 8% = 48%
  if (Math.abs(r(2) - 0.48) > 1e-9) throw new Error(`거주 2년 ${r(2)} ≠ 48%`);
  // 거주 3년: 40% + 12% = 52%
  if (Math.abs(r(3) - 0.52) > 1e-9) throw new Error(`거주 3년 ${r(3)} ≠ 52%`);
  if (Math.abs(r(10) - 0.80) > 1e-9) throw new Error(`거주 10년 ${r(10)} ≠ 80%`);
});

R.check('1세대1주택 비과세 — 취득 당시 조정대상지역이면 거주 2년 요건', () => {
  const r = (liveYears, acquiredInRegulatedArea) => fns.calcTransferTax({
    sellPrice: 1000000000, buyPrice: 600000000, cost: 0, holdYears: 5, liveYears,
    homes: 1, onlyHome: true, regulated: false, acquiredInRegulatedArea,
  });
  if (!r(0, false).exempted) throw new Error('취득 당시 비조정 → 거주 없이도 비과세');
  if (r(0, true).exempted) throw new Error('취득 당시 조정 + 거주 0년 → 비과세 안 됨');
  if (r(1, true).exempted) throw new Error('취득 당시 조정 + 거주 1년 → 비과세 안 됨');
  if (!r(2, true).exempted) throw new Error('취득 당시 조정 + 거주 2년 → 비과세');
  if (!r(0, true).notes.some((n) => n.kind === 'warn')) throw new Error('거주요건 미충족을 결과에 밝혀야 합니다.');
});

R.check('양도세 기본세율 8구간의 모든 경계', () => {
  const edges = [14000000, 50000000, 88000000, 150000000, 300000000, 500000000, 1000000000];
  const rates8 = [0.06, 0.15, 0.24, 0.35, 0.38, 0.40, 0.42, 0.45];
  for (let i = 0; i < edges.length; i += 1) {
    const at = fns.calcProgressiveTax(edges[i]);
    const after = fns.calcProgressiveTax(edges[i] + 1);
    if (Math.abs(at.marginalRate - rates8[i]) > 1e-9) throw new Error(`과세표준 ${edges[i]}: 한계세율 ${at.marginalRate} ≠ ${rates8[i]}`);
    if (Math.abs(after.marginalRate - rates8[i + 1]) > 1e-9) throw new Error(`과세표준 ${edges[i] + 1}: 한계세율 ${after.marginalRate} ≠ ${rates8[i + 1]}`);
    // 누진공제 방식이 맞다면 경계에서 세액이 연속이어야 한다.
    const taxAt = Math.max(0, edges[i] * at.marginalRate - at.deduction);
    const taxAfter = Math.max(0, (edges[i] + 1) * after.marginalRate - after.deduction);
    if (Math.abs(taxAfter - taxAt) > 1) throw new Error(`과세표준 ${edges[i]} 경계에서 세액 불연속: ${taxAt} → ${taxAfter}`);
  }
});

R.check('다주택 중과 한시 유예 종료일 경계', () => {
  const until = rates.transferTax.multiHomeSurchargeWaiverUntil;
  const at = (sellDate) => tt({ sellDate, homes: 3, regulated: true, holdYears: 5 });
  if (!at(until).surchargeWaived) throw new Error(`유예 종료일(${until}) 당일은 유예 적용`);
  if (at('2026-05-10').surchargeWaived) throw new Error('종료일 다음 날은 유예 미적용');
  // 경과규정: 종료일까지 계약 + 계약금 수령 → 계약일부터 4개월 이내 양도까지 유예
  const grace = tt({
    sellDate: '2026-08-01', homes: 3, regulated: true, holdYears: 5,
    contractDate: '2026-05-01', downPaymentReceived: true,
  });
  if (!grace.graceApplied) throw new Error('경과규정이 적용돼야 합니다.');
  const tooLate = tt({
    sellDate: '2026-10-01', homes: 3, regulated: true, holdYears: 5,
    contractDate: '2026-05-01', downPaymentReceived: true,
  });
  if (tooLate.graceApplied) throw new Error('계약일부터 4개월을 넘기면 경과규정 미적용');
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. 대출 한도 — 금융위 대책
 * ═════════════════════════════════════════════════════════════════════════ */

const ml = (o) => fns.calcMortgageLimit({
  ltvPercent: 40, region: 'regulated', income: 1000000000,
  dsrLimitPercent: 40, rate: 4, stressAdd: 3, termYears: 30, repayType: 'equal', ...o,
});

R.check('가격대별 한도 15억 / 25억 경계 (규정 자체가 계단식)', () => {
  if (ml({ price: 1499999999 }).priceCap !== 600000000) throw new Error('15억 직전 → 6억');
  if (ml({ price: 1500000000 }).priceCap !== 600000000) throw new Error('정확히 15억 → 6억 (「이하」)');
  if (ml({ price: 1500000001 }).priceCap !== 400000000) throw new Error('15억 + 1원 → 4억');
  if (ml({ price: 2500000000 }).priceCap !== 400000000) throw new Error('정확히 25억 → 4억');
  if (ml({ price: 2500000001 }).priceCap !== 200000000) throw new Error('25억 + 1원 → 2억');
});

R.check('지역 경계 — 가격대별 한도는 수도권·규제지역에만 적용', () => {
  for (const region of ['metroNonRegulated', 'regulated']) {
    if (!ml({ price: 2000000000, region }).priceCapApplies) throw new Error(`${region} 는 가격대별 한도 적용`);
  }
  const prov = ml({ price: 2000000000, region: 'provincialNonRegulated' });
  if (prov.priceCapApplies) throw new Error('지방 비규제는 가격대별 한도 미적용');
  if (Number.isFinite(prov.priceCap)) throw new Error('지방 비규제의 priceCap 은 무한대여야 합니다.');
});

R.check('보유 유형별 LTV 경계 — 무주택 / 생애최초 / 처분조건부 / 1주택 유지 / 다주택', () => {
  const table = rates.loan.ltvByRegion;
  for (const [region, row] of Object.entries(table)) {
    for (const [ownership, want] of Object.entries(row)) {
      const got = fns.suggestLtvPercent(region, ownership).value;
      if (got !== want) throw new Error(`${region}.${ownership}: ${got}% ≠ ${want}%`);
    }
  }
  // 수도권·규제지역의 1주택 미처분·다주택은 주택구입 목적 주담대 금지(LTV 0)
  if (table.regulated.keep1 !== 0 || table.regulated.multi !== 0) throw new Error('규제지역 1주택 유지·다주택 LTV 는 0이어야 합니다.');
});

R.check('DSR 한도율 40% / 50% 경계', () => {
  const at40 = ml({ price: 1000000000, dsrLimitPercent: 40, income: 100000000 });
  const at50 = ml({ price: 1000000000, dsrLimitPercent: 50, income: 100000000 });
  if (!(at50.dsrLimit > at40.dsrLimit)) throw new Error('50% 한도가 40%보다 커야 합니다.');
  if (Math.abs(at50.dsrLimit / at40.dsrLimit - 50 / 40) > 1e-6) {
    throw new Error('DSR 한도가 한도율에 비례하지 않습니다.');
  }
});

R.check('스트레스 금리 — 지역·금리유형별 가산폭', () => {
  const want = {
    metroNonRegulated: 3.00, regulated: 3.00, provincialNonRegulated: 0.75,
  };
  for (const [region, v] of Object.entries(want)) {
    const got = fns.suggestStressAdd(region, 'variable', 'new').value;
    if (Math.abs(got - v) > 1e-9) throw new Error(`${region} 변동금리 가산 ${got}%p ≠ ${v}%p`);
  }
  // 금리유형: 변동 100% / 혼합 80% / 주기 40% / 고정 0%
  const ratios = { variable: 1.0, mixed: 0.8, periodic: 0.4, fixed: 0 };
  for (const [rateType, ratio] of Object.entries(ratios)) {
    const got = fns.suggestStressAdd('regulated', rateType, 'new').value;
    if (Math.abs(got - 3.0 * ratio) > 1e-9) throw new Error(`${rateType} 가산 ${got}%p ≠ ${3.0 * ratio}%p`);
  }
});

R.check('경과규정 시행일 전/후 — 종전 규정으로 돌아간다', () => {
  const now = ml({ price: 2000000000, grandfather: 'new' });
  const prior = ml({ price: 2000000000, grandfather: 'preContract' });
  if (now.priceCap !== 400000000) throw new Error('현행 20억 → 4억');
  if (prior.priceCap !== 600000000) throw new Error('경과규정 20억 → 시가 무관 6억');
  const priorStress = fns.suggestStressAdd('regulated', 'variable', 'preContract');
  if (Math.abs(priorStress.value - 1.5) > 1e-9) throw new Error(`경과규정 스트레스 ${priorStress.value}%p ≠ 1.5%p`);
  // 지방은 이미 0.75%p 이므로 경과규정 때문에 되레 올라가면 안 된다.
  const provPrior = fns.suggestStressAdd('provincialNonRegulated', 'variable', 'preContract');
  if (provPrior.value > 0.75 + 1e-9) throw new Error(`지방 경과규정 가산이 올라갔습니다 (${provPrior.value}%p)`);
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. 중개보수 · 인지세 · 전월세 전환 · 청약가점
 * ═════════════════════════════════════════════════════════════════════════ */

R.check('중개보수 매매 구간 경계 전수 (5천만·2억·9억·12억·15억)', () => {
  const want = [
    [49999999, 0.006], [50000000, 0.005],
    [199999999, 0.005], [200000000, 0.004],
    [899999999, 0.004], [900000000, 0.005],
    [1199999999, 0.005], [1200000000, 0.006],
    [1499999999, 0.006], [1500000000, 0.007],
  ];
  for (const [price, rate] of want) {
    const got = fns.calcBrokerageFee({ price, type: 'sale', includeVat: false }).capRate;
    if (Math.abs(got - rate) > 1e-12) throw new Error(`${price}: 상한요율 ${got} ≠ ${rate}`);
  }
});

R.check('중개보수 임대차 구간 경계 전수 (5천만·1억·6억·12억·15억)', () => {
  const want = [
    [49999999, 0.005], [50000000, 0.004],
    [99999999, 0.004], [100000000, 0.003],
    [599999999, 0.003], [600000000, 0.004],
    [1199999999, 0.004], [1200000000, 0.005],
    [1499999999, 0.005], [1500000000, 0.006],
  ];
  for (const [price, rate] of want) {
    const got = fns.calcBrokerageFee({ price, type: 'jeonse', includeVat: false }).capRate;
    if (Math.abs(got - rate) > 1e-12) throw new Error(`${price}: 상한요율 ${got} ≠ ${rate}`);
  }
});

R.check('보증부 월세 환산 5천만원 경계 — ×100 / ×70', () => {
  // 보증금 2,000만 + 월세 30만 → ×100 이면 5,000만(경계 이상) → ×100 유지
  const at = fns.calcBrokerageFee({ price: 0, type: 'monthly', deposit: 20000000, monthlyRent: 300000, includeVat: false });
  if (at.amount !== 50000000) throw new Error(`정확히 5천만원 → ×100 유지 (실제 ${at.amount})`);
  // 보증금 2,000만 + 월세 29만 → ×100 이면 4,900만(미만) → ×70 재환산
  const below = fns.calcBrokerageFee({ price: 0, type: 'monthly', deposit: 20000000, monthlyRent: 290000, includeVat: false });
  if (below.amount !== 20000000 + 290000 * 70) throw new Error(`5천만원 미만 → ×70 재환산 (실제 ${below.amount})`);
});

R.check('인지세 구간 경계 전수', () => {
  const want = [
    [10000000, 0], [10000001, 20000],
    [30000000, 20000], [30000001, 40000],
    [50000000, 40000], [50000001, 70000],
    [100000000, 70000], [100000001, 150000],
    [1000000000, 150000], [1000000001, 350000],
  ];
  for (const [price, amount] of want) {
    const got = fns.calcStampDuty(price);
    if (got !== amount) throw new Error(`${price}: 인지세 ${got} ≠ ${amount}`);
  }
});

R.check('전월세 전환율 법정 상한 — 10% 하드캡이 걸리는 자리', () => {
  const cap = fns.legalConversionCapPct();
  // 현행 기준금리 기준으로 상한이 min(10%, 기준금리+2%p) 인지
  const expected = Math.min(cap.hardCapPct, cap.baseRatePct + cap.addPct);
  if (Math.abs(cap.cap - expected) > 1e-9) throw new Error(`상한 ${cap.cap}% ≠ ${expected}%`);
  if (cap.cap > 10 + 1e-9) throw new Error('10% 하드캡을 넘습니다.');
});

R.check('청약가점 구간 경계 — 무주택 1년·통장 6개월/1년·부양가족 6명', () => {
  const s = (o) => fns.calcSubscriptionScore({ noHomeYears: 5, dependents: 2, accountYears: 5, ...o });
  if (s({ noHomeYears: 0 }).s1 !== 0) throw new Error('무주택 0년 → 0점');
  if (s({ noHomeYears: 0.9 }).s1 !== 2) throw new Error('1년 미만 → 2점');
  if (s({ noHomeYears: 1 }).s1 !== 4) throw new Error('1년 → 4점');
  if (s({ noHomeYears: 15 }).s1 !== 32) throw new Error('15년 → 32점 (상한)');
  if (s({ noHomeYears: 20 }).s1 !== 32) throw new Error('20년도 32점 (상한)');
  if (s({ accountYears: 0.49 }).s3 !== 1) throw new Error('통장 6개월 미만 → 1점');
  if (s({ accountYears: 0.5 }).s3 !== 2) throw new Error('통장 6개월 → 2점');
  if (s({ accountYears: 1 }).s3 !== 3) throw new Error('통장 1년 → 3점');
  if (s({ accountYears: 15 }).s3 !== 17) throw new Error('통장 15년 → 17점 (상한)');
  if (s({ dependents: 6 }).s2 !== 35) throw new Error('부양가족 6명 → 35점 (상한)');
  if (s({ dependents: 10 }).s2 !== 35) throw new Error('부양가족 10명도 35점 (상한)');
});

R.finish();
