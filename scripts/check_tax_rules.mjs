/*
 * 세무 정확성 회귀 테스트 (P0 항목)
 * -----------------------------------------------------------------------
 * 이 파일은 "한 번 고친 세법 오류가 다시 들어오지 않게" 막는 것이 목적이다.
 * 각 케이스에는 근거 조문과 "왜 이 값이어야 하는지"를 주석으로 남긴다.
 *
 * 실행: node scripts/check_tax_rules.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appUrl = new URL('../site/assets/app.js', import.meta.url);
const appSource = fs.readFileSync(appUrl, 'utf8');

function functionBlock(startNeedle, endNeedle) {
  const start = appSource.indexOf(startNeedle);
  const end = appSource.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, `${startNeedle} 블록을 찾을 수 없습니다.`);
  return appSource.slice(start, end);
}

// rates.js를 그대로 로드 — 계산기와 같은 기준정보로 검증한다.
const ratesSource = fs.readFileSync(new URL('../site/assets/rates.js', import.meta.url), 'utf8');
const ratesContext = vm.createContext({ window: {} });
vm.runInContext(ratesSource, ratesContext);
const RATES = ratesContext.window.TOPDA_RATES;

const context = vm.createContext({ window: { TOPDA_RATES: RATES } });
vm.runInContext(
  [
    functionBlock('function calcAcquisitionTax(input)', '\n// scenarioKey'),
    functionBlock('function calcTransferTax(input)', '\n(function () {'),
    functionBlock('function calcBrokerageFee(opts)', '\n(function () {'),
    functionBlock('function legalConversionCapPct()', '\n(function () {'),
    functionBlock('function calcSubscriptionScore(', '\n(function () {'),
    'globalThis.cores = { calcAcquisitionTax, calcTransferTax, calcProgressiveTax,'
      + ' calcBrokerageFee, legalConversionCapPct, calcSubscriptionScore, calcJeonseMonthly };',
  ].join('\n'),
  context,
);

const {
  calcAcquisitionTax, calcTransferTax, calcBrokerageFee,
  legalConversionCapPct, calcSubscriptionScore,
} = context.cores;

let passed = 0;
const closeTo = (actual, expected, message, tol = 0.5) => {
  assert.ok(Math.abs(actual - expected) < tol, `${message}: ${actual} !== ${expected}`);
};
const check = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// ─────────────────────────────────────────────────────────────────────
console.log('\n[rates.js] 규칙 메타데이터');
// ─────────────────────────────────────────────────────────────────────

check('핵심 규칙 블록에 근거·검토일·적용기간 메타데이터가 있다', () => {
  const blocks = {
    'acquisitionTax.firstHomeRelief': RATES.acquisitionTax.firstHomeRelief,
    'acquisitionTax.childbirthRelief': RATES.acquisitionTax.childbirthRelief,
    'acquisitionTax.unsold2026Relief': RATES.acquisitionTax.unsold2026Relief,
    'transferTax.multiHomeSurchargeGrace': RATES.transferTax.multiHomeSurchargeGrace,
    'transferTax.carryoverBasis': RATES.transferTax.carryoverBasis,
    inheritGift: RATES.inheritGift,
    brokerage: RATES.brokerage,
    jeonseConversion: RATES.jeonseConversion,
    subscription: RATES.subscription,
  };
  for (const [key, block] of Object.entries(blocks)) {
    assert.ok(block, `${key} 블록이 없습니다.`);
    for (const field of ['effectiveFrom', 'reviewedAt', 'jurisdiction', 'confidence', 'source']) {
      assert.ok(block[field], `${key}.${field} 메타데이터가 없습니다.`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[P0-①] 지방 준공 후 미분양 — 법정 25% + 조례 0~25%');
// ─────────────────────────────────────────────────────────────────────

check('조례 미확인 시 법정 25%만 적용하고 추가 가능성을 안내한다', () => {
  const r = calcAcquisitionTax({
    price: 600_000_000, homes: 1, regulated: false, areaOver85: false, unsold2026: true,
  });
  closeTo(r.unsoldRatio, 0.25, '법정 감면율', 1e-9);
  closeTo(r.unsoldDeduct, 600_000_000 * 0.01 * 0.25, '법정 25% 감면액');
  assert.equal(r.unsoldLocalExtraKnown, false);
  assert.ok(r.notes.some((n) => n.kind === 'warn' && n.text.includes('최대 25%')),
    '조례 추가 감면 가능성 안내가 없습니다.');
});

check('조례 확인 시 법정 25% + 조례분이 합산된다 (최대 50%)', () => {
  for (const [extra, expected] of [[0, 0.25], [0.10, 0.35], [0.25, 0.50]]) {
    const r = calcAcquisitionTax({
      price: 600_000_000, homes: 1, regulated: false, areaOver85: false,
      unsold2026: true, unsold2026LocalExtra: extra,
    });
    closeTo(r.unsoldRatio, expected, `조례 ${extra * 100}%p 추가 시 최종 감면율`, 1e-9);
  }
});

check('결과 문구에 실제 적용 감면율이 들어간다 (50% 하드코딩 아님)', () => {
  const r = calcAcquisitionTax({
    price: 600_000_000, homes: 1, regulated: false, areaOver85: false, unsold2026: true,
  });
  assert.ok(r.scenario.includes('25%'), `실제 감면율이 문구에 없습니다: ${r.scenario}`);
  assert.ok(!r.scenario.includes('50%'), '조례 미확인인데 50%가 표시됩니다.');
});

check('요건 미충족 시 미적용 이유를 밝힌다', () => {
  const overArea = calcAcquisitionTax({
    price: 500_000_000, homes: 1, regulated: false, areaOver85: true, unsold2026: true,
  });
  assert.equal(overArea.unsoldEligible, false);
  assert.ok(overArea.notes.some((n) => n.kind === 'skip' && n.text.includes('85㎡')));

  const overPrice = calcAcquisitionTax({
    price: 700_000_000, homes: 1, regulated: false, areaOver85: false, unsold2026: true,
  });
  assert.equal(overPrice.unsoldEligible, false);
  assert.ok(overPrice.notes.some((n) => n.kind === 'skip' && n.text.includes('6억')));
});

check('미분양 감면 대상은 다주택 취득세 중과에서 제외된다', () => {
  const r = calcAcquisitionTax({
    price: 600_000_000, homes: 3, regulated: true, areaOver85: false, unsold2026: true,
  });
  assert.equal(r.isHeavy, false, '중과가 제외되어야 합니다.');
  closeTo(r.baseRate, 0.01, '표준세율 적용', 1e-9);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[P0-②] 신축 구분 — 원시취득 vs 분양받은 신축주택');
// ─────────────────────────────────────────────────────────────────────

check('직접 신축은 원시취득 2.8%', () => {
  const r = calcAcquisitionTax({ price: 800_000_000, homes: 1, acqType: 'original' });
  closeTo(r.baseRate, 0.028, '원시취득 세율', 1e-9);
  assert.equal(r.isPaidTransfer, false);
});

check('분양받은 신축주택은 유상거래 세율 (1~3% 또는 중과)', () => {
  // 8억 → 6~9억 누진식: (8 × 2/3 − 3)% = 2.3333…%
  //  ⚠ 지방세법 제11조 제1항 제8호 나목은 이 값을 "소수점 이하 다섯째 자리에서 반올림하여
  //    소수점 넷째 자리까지" 계산하도록 정한다 → 0.0233. 반올림 전 값(0.023333…)으로
  //    기대값을 두면 법정 절차를 빠뜨린 코드를 통과시키게 된다.
  const r = calcAcquisitionTax({ price: 800_000_000, homes: 1, acqType: 'presale' });
  closeTo(r.baseRate, 0.0233, '분양 신축 유상거래 누진세율(법정 반올림 후)', 1e-9);
  assert.equal(r.isPaidTransfer, true);
});

check('분양받은 신축주택도 다주택 중과 대상이 된다', () => {
  const r = calcAcquisitionTax({
    price: 800_000_000, homes: 3, regulated: true, acqType: 'presale',
  });
  assert.equal(r.isHeavy, true);
  closeTo(r.baseRate, 0.12, '조정지역 3주택 중과', 1e-9);
});

check('분양받은 신축주택은 생애최초 감면을 받을 수 있다', () => {
  const r = calcAcquisitionTax({
    price: 500_000_000, homes: 1, acqType: 'presale', firstHome: true,
  });
  closeTo(r.firstHomeDeduct, 2_000_000, '분양 신축 생애최초 감면');
});

check('분양 신축과 직접 신축의 지방교육세 산정 방식이 다르다', () => {
  const presale = calcAcquisitionTax({ price: 800_000_000, homes: 1, acqType: 'presale' });
  const original = calcAcquisitionTax({ price: 800_000_000, homes: 1, acqType: 'original' });
  // 유상거래: 본세 × 10% / 원시취득: (세율 − 2%) × 20%
  closeTo(presale.localEduTax, 800_000_000 * presale.baseRate * 0.10, '유상거래 지방교육세');
  closeTo(original.localEduTax, 800_000_000 * 0.008 * 0.20, '원시취득 지방교육세');
});

check('조합원 취득은 개략 추정임을 경고한다', () => {
  const r = calcAcquisitionTax({ price: 800_000_000, homes: 1, acqType: 'redevelop' });
  assert.ok(r.notes.some((n) => n.kind === 'warn' && n.text.includes('추가분담금')));
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[P0-③] 양도세 장기보유특별공제 — 거주 2년 8% 구간');
// ─────────────────────────────────────────────────────────────────────

const highValueBase = {
  sellPrice: 2_000_000_000, buyPrice: 1_000_000_000, cost: 0,
  homes: 1, onlyHome: true, regulated: false,
};

check('거주 2년(3년 미만) 고가 1주택은 거주 공제 8%를 받는다', () => {
  const r = calcTransferTax({ ...highValueBase, holdYears: 5, liveYears: 2 });
  // 보유 5년: 12% + 2×4% = 20%, 거주 2년: 8% → 합계 28%
  closeTo(r.ltDeductRate, 0.28, '보유 5년 + 거주 2년 장특공제율', 1e-9);
});

check('거주 3년은 12%, 이후 연 4%p씩 증가한다', () => {
  for (const [live, liveRate] of [[3, 0.12], [4, 0.16], [10, 0.40], [15, 0.40]]) {
    const r = calcTransferTax({ ...highValueBase, holdYears: 10, liveYears: live });
    closeTo(r.ltDeductRate, 0.40 + liveRate, `보유 10년 + 거주 ${live}년`, 1e-9);
  }
});

check('거주 2년 미만이면 표1(일반)로 계산된다', () => {
  const r = calcTransferTax({ ...highValueBase, holdYears: 5, liveYears: 1 });
  closeTo(r.ltDeductRate, 0.10, '거주 2년 미만은 표1 (연 2%)', 1e-9);
});

check('거주 2년 공제가 반영되어 세액이 줄어든다 (과다 계산 방지)', () => {
  const live2 = calcTransferTax({ ...highValueBase, holdYears: 5, liveYears: 2 });
  const live1 = calcTransferTax({ ...highValueBase, holdYears: 5, liveYears: 1 });
  assert.ok(live2.total < live1.total,
    '거주 2년이 거주 1년보다 세액이 커서는 안 됩니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[P0-④] 다주택 중과 유예 — 2026-05-09 경과규정');
// ─────────────────────────────────────────────────────────────────────

const heavyBase = {
  sellPrice: 1_000_000_000, buyPrice: 500_000_000, cost: 0,
  holdYears: 5, liveYears: 0, homes: 2, onlyHome: false, regulated: true,
};

check('유예 종료일 이전 양도는 종전대로 중과 면제', () => {
  const r = calcTransferTax({ ...heavyBase, sellDate: '2026-05-09' });
  assert.equal(r.surchargeWaived, true);
  assert.equal(r.graceApplied, false);
});

check('경과규정 없이 종료일 이후 양도하면 중과된다', () => {
  const r = calcTransferTax({ ...heavyBase, sellDate: '2026-06-01' });
  assert.equal(r.surchargeWaived, false);
  assert.equal(r.surchargeRatePct, 20);
});

check('종료일까지 계약 + 계약금 수령 → 4개월 이내 양도는 유예 유지', () => {
  const r = calcTransferTax({
    ...heavyBase, sellDate: '2026-08-01',
    contractDate: '2026-05-08', downPaymentReceived: true,
  });
  assert.equal(r.surchargeWaived, true, '경과규정으로 유예가 이어져야 합니다.');
  assert.equal(r.graceApplied, true);
  assert.equal(r.surchargeRatePct, 0);
  assert.ok(r.graceReason.includes('4개월'));
});

check('계약금을 받지 않았으면 경과규정이 적용되지 않는다', () => {
  const r = calcTransferTax({
    ...heavyBase, sellDate: '2026-08-01',
    contractDate: '2026-05-08', downPaymentReceived: false,
  });
  assert.equal(r.graceApplied, false);
  assert.equal(r.surchargeRatePct, 20);
});

check('계약일부터 4개월을 넘기면 유예가 끊긴다', () => {
  const r = calcTransferTax({
    ...heavyBase, sellDate: '2026-09-20',
    contractDate: '2026-05-08', downPaymentReceived: true,
  });
  assert.equal(r.graceApplied, false, '4개월 초과는 유예 대상이 아닙니다.');
});

check('신규 조정대상지역은 6개월까지 인정된다', () => {
  const r = calcTransferTax({
    ...heavyBase, sellDate: '2026-09-20',
    contractDate: '2026-05-08', downPaymentReceived: true, newRegulatedArea: true,
  });
  assert.equal(r.graceApplied, true);
  assert.ok(r.graceReason.includes('6개월'));
});

check('토지거래허가 대상은 허가 신청일부터 6개월 이내 양도까지 인정된다', () => {
  const r = calcTransferTax({
    ...heavyBase, sellDate: '2026-10-01',
    landPermitTarget: true, landPermitApplyDate: '2026-05-08',
  });
  assert.equal(r.graceApplied, true);
  assert.ok(r.graceReason.includes('토지거래허가'));
});

check('경과규정이 적용되면 장기보유특별공제도 되살아난다', () => {
  const graced = calcTransferTax({
    ...heavyBase, sellDate: '2026-08-01',
    contractDate: '2026-05-08', downPaymentReceived: true,
  });
  const heavy = calcTransferTax({ ...heavyBase, sellDate: '2026-08-01' });
  closeTo(graced.ltDeductRate, 0.10, '유예 시 장특공제 적용', 1e-9);
  assert.equal(heavy.ltDeductRate, 0, '중과 시 장특공제 배제');
  assert.ok(graced.total < heavy.total);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 증여재산 이월과세 (소득세법 제97조의2)');
// ─────────────────────────────────────────────────────────────────────

check('배우자·직계존비속 증여 부동산을 10년 내 양도하면 증여자 취득가액이 적용된다', () => {
  const r = calcTransferTax({
    sellPrice: 1_500_000_000, buyPrice: 1_200_000_000, cost: 0,
    holdYears: 5, liveYears: 0, homes: 2, onlyHome: false, regulated: false,
    sellDate: '2026-08-01',
    giftedFromRelative: true, giftReceivedDate: '2021-08-01',
    donorBuyPrice: 400_000_000,
  });
  assert.equal(r.carryoverApplied, true);
  closeTo(r.effectiveBuyPrice, 400_000_000, '증여자 취득가액 이월');
  closeTo(r.rawGain, 1_100_000_000, '이월 후 양도차익');
  closeTo(r.carryoverExtraGain, 800_000_000, '이월로 늘어난 차익');
});

check('증여일부터 10년이 지났으면 이월과세하지 않는다', () => {
  const r = calcTransferTax({
    sellPrice: 1_500_000_000, buyPrice: 1_200_000_000, cost: 0,
    holdYears: 12, liveYears: 0, homes: 2, onlyHome: false, regulated: false,
    sellDate: '2026-08-01',
    giftedFromRelative: true, giftReceivedDate: '2014-08-01',
    donorBuyPrice: 400_000_000,
  });
  assert.equal(r.carryoverApplied, false);
  closeTo(r.effectiveBuyPrice, 1_200_000_000, '이월 미적용 시 본인 취득가액');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 생애최초 · 출산·양육 감면');
// ─────────────────────────────────────────────────────────────────────

check('생애최초 일반 한도 200만원 / 소형 비아파트·인구감소지역 300만원', () => {
  const std = calcAcquisitionTax({ price: 500_000_000, homes: 1, firstHome: true });
  closeTo(std.firstHomeDeduct, 2_000_000, '일반 한도');
  const small = calcAcquisitionTax({
    price: 250_000_000, homes: 1, firstHome: true, firstHomeSmallHouse: true,
  });
  closeTo(small.firstHomeDeduct, Math.min(3_000_000, 250_000_000 * 0.01), '소형주택 한도');
});

check('출산·양육 감면 500만원이 계산된다', () => {
  const r = calcAcquisitionTax({ price: 800_000_000, homes: 1, childbirth: true });
  closeTo(r.firstHomeDeduct, 5_000_000, '출산·양육 감면');
  assert.equal(r.appliedReliefKey, 'childbirth');
});

check('생애최초와 출산 감면은 합산되지 않고 유리한 하나만 적용된다', () => {
  const r = calcAcquisitionTax({
    price: 800_000_000, homes: 1, firstHome: true, childbirth: true,
  });
  closeTo(r.firstHomeDeduct, 5_000_000, '중복 아닌 유리한 감면');
  assert.notEqual(r.firstHomeDeduct, 7_000_000, '두 감면을 단순 합산하면 안 됩니다.');
  assert.ok(r.notes.some((n) => n.text.includes('중복 적용되지 않습니다')));
});

check('12억 초과면 감면 미적용 이유를 밝힌다', () => {
  const r = calcAcquisitionTax({ price: 1_500_000_000, homes: 1, firstHome: true });
  closeTo(r.firstHomeDeduct, 0, '12억 초과 감면 배제');
  assert.ok(r.notes.some((n) => n.kind === 'skip' && n.text.includes('12억')));
});

check('중과 대상은 감면을 받지 못한다', () => {
  const r = calcAcquisitionTax({
    price: 800_000_000, homes: 3, regulated: true, firstHome: true,
  });
  closeTo(r.firstHomeDeduct, 0, '중과 시 감면 배제');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 중개보수 — 월세 환산·오피스텔·상가·협의요율·부가세');
// ─────────────────────────────────────────────────────────────────────

check('보증부 월세 거래금액 = 보증금 + 월세 × 100', () => {
  const r = calcBrokerageFee({ type: 'monthly', deposit: 100_000_000, monthlyRent: 1_000_000 });
  closeTo(r.amount, 200_000_000, '월세 환산 거래금액');
});

check('환산액이 5천만원 미만이면 월세 × 70으로 다시 환산한다', () => {
  // 보증금 1천만 + 월세 30만 × 100 = 4천만 → 5천만 미만이므로 재환산
  const r = calcBrokerageFee({ type: 'monthly', deposit: 10_000_000, monthlyRent: 300_000 });
  closeTo(r.amount, 10_000_000 + 300_000 * 70, '5천만 미만 재환산');
  assert.ok(r.conversionNote.includes('70'));
});

check('주거용 오피스텔은 매매 0.5% · 임대차 0.4%', () => {
  const sale = calcBrokerageFee({ type: 'officetel-sale', price: 300_000_000 });
  closeTo(sale.rate, 0.005, '오피스텔 매매 요율', 1e-9);
  closeTo(sale.fee, 1_500_000, '오피스텔 매매 보수');
  const lease = calcBrokerageFee({ type: 'officetel-monthly', deposit: 100_000_000, monthlyRent: 1_000_000 });
  closeTo(lease.rate, 0.004, '오피스텔 임대차 요율', 1e-9);
});

check('상가·토지는 0.9% 이내 협의', () => {
  const r = calcBrokerageFee({ type: 'other', price: 500_000_000 });
  closeTo(r.rate, 0.009, '주택 외 상한요율', 1e-9);
  closeTo(r.fee, 4_500_000, '주택 외 중개보수');
});

check('협의 요율이 상한을 넘으면 상한으로 제한하고 경고한다', () => {
  const r = calcBrokerageFee({ type: 'sale', price: 800_000_000, negotiatedRate: 1.5 });
  assert.equal(r.negotiatedExceeded, true);
  closeTo(r.rate, r.capRate, '상한으로 제한', 1e-9);
});

check('협의 요율이 상한 이내면 그대로 적용된다', () => {
  const r = calcBrokerageFee({ type: 'sale', price: 800_000_000, negotiatedRate: 0.3 });
  assert.equal(r.negotiatedExceeded, false);
  closeTo(r.rate, 0.003, '협의 요율 적용', 1e-9);
  closeTo(r.fee, 2_400_000, '협의 요율 중개보수');
});

check('부가세 미포함 옵션이 동작하고, 양 당사자 합계를 별도 제시한다', () => {
  const withVat = calcBrokerageFee({ type: 'sale', price: 800_000_000 });
  const noVat = calcBrokerageFee({ type: 'sale', price: 800_000_000, includeVat: false });
  closeTo(withVat.total, 3_520_000, 'VAT 포함 1인당');
  closeTo(noVat.total, 3_200_000, 'VAT 미포함 1인당');
  closeTo(withVat.bothParties, 7_040_000, '양 당사자 합계');
});

check('정액 한도 구간은 한도액으로 제한된다', () => {
  // 매매 5천만 미만: 0.6%, 한도 25만원 → 4천만 × 0.6% = 24만 (한도 이내)
  const under = calcBrokerageFee({ type: 'sale', price: 40_000_000 });
  closeTo(under.fee, 240_000, '한도 이내');
  assert.equal(under.capApplied, false);
  // 4,900만 × 0.6% = 29.4만 → 25만으로 제한
  const capped = calcBrokerageFee({ type: 'sale', price: 49_000_000 });
  closeTo(capped.fee, 250_000, '한도 적용');
  assert.equal(capped.capApplied, true);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 전월세 법정 전환율 상한 · 청약 배우자 통장');
// ─────────────────────────────────────────────────────────────────────

check('법정 전환율 상한 = min(10%, 기준금리 + 2%p)', () => {
  const cap = legalConversionCapPct();
  const expected = Math.min(10, RATES.jeonseConversion.baseRatePct + RATES.jeonseConversion.addPct);
  closeTo(cap.cap, expected, '법정 상한', 1e-9);
  assert.ok(cap.cap < 6, '기본값 6%가 법정 상한으로 오인되면 안 됩니다.');
});

check('배우자 청약통장 가입기간은 50%·최대 3점까지 합산된다', () => {
  const solo = calcSubscriptionScore({ noHomeYears: 5, dependents: 2, accountYears: 6 });
  const withSpouse = calcSubscriptionScore({
    noHomeYears: 5, dependents: 2, accountYears: 6, spouseAccountYears: 6,
  });
  // 본인 6년 → 8점, 배우자 8점의 50% = 4점 → 상한 3점
  assert.equal(solo.ownAccount, 8);
  assert.equal(withSpouse.spouseAccount, 3, '배우자 합산 상한 3점');
  assert.equal(withSpouse.s3, 11);
  assert.equal(withSpouse.total, solo.total + 3);
});

check('배우자 합산 후에도 청약통장 항목 상한 17점을 넘지 않는다', () => {
  const r = calcSubscriptionScore({
    noHomeYears: 15, dependents: 6, accountYears: 20, spouseAccountYears: 20,
  });
  assert.equal(r.s3, 17, '통장 항목 상한');
  assert.ok(r.total <= 84, '총점 84점 상한');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[구조] 계산기 간 일관성 — 중복 세율식 금지');
// ─────────────────────────────────────────────────────────────────────

check('경매 계산기가 자체 취득세 산식을 두지 않고 공통 엔진을 호출한다', () => {
  const start = appSource.indexOf("data-calc=\"auction-bid\"");
  const end = appSource.indexOf('\n// ===== Topic tabs', start);
  const auction = appSource.slice(start, end);
  assert.ok(!/function acquisitionRate\(/.test(auction),
    '경매 계산기에 별도 취득세 산식(acquisitionRate)이 남아 있습니다.');
  assert.ok(!/acqTax \* 1\.10/.test(auction),
    '취득세 × 1.10 단순 가산이 남아 있습니다.');
  assert.match(auction, /calcAcquisitionTax\(\{/,
    '경매 계산기가 공통 취득세 엔진을 호출하지 않습니다.');
});

check('종합계산기 자금계획 탭이 공통 엔진만 사용한다', () => {
  const start = appSource.indexOf('function calcPlan()');
  const end = appSource.indexOf('\n    function switchScn(', start);
  assert.ok(start >= 0 && end > start, 'calcPlan 블록을 찾을 수 없습니다.');
  const plan = appSource.slice(start, end);
  assert.match(plan, /acquisitionTotal\(/);
  assert.match(plan, /brokerFee\(/);
  assert.match(plan, /registrationCost\(/);
});

check('상속세 배우자공제에 순재산 × 30% 근사식이 남아 있지 않다', () => {
  assert.ok(!/netAssets \* 0\.3\b/.test(appSource),
    '배우자 상속공제에 순재산 30% 근사식이 남아 있습니다.');
  assert.match(appSource, /function spouseInheritDeduction\(/);
});

check('증여세가 10년 합산 누진 + 기납부세액공제를 수행한다', () => {
  const start = appSource.indexOf('function giftTaxAggregated(');
  assert.ok(start >= 0, 'giftTaxAggregated 함수가 없습니다.');
  const end = appSource.indexOf('\n    function renderChart(', start);
  const gift = appSource.slice(start, end > start ? end : start + 4000);
  assert.match(gift, /aggregatedValue/);
  assert.match(gift, /priorCredit/);
  assert.match(gift, /surchargeRate/);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[UI] 새 입력이 페이지에 존재하는지');
// ─────────────────────────────────────────────────────────────────────

check('취득세 페이지에 취득 원인 구분·조례 감면·출산 감면 입력이 있다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/acquisition-tax.html', import.meta.url), 'utf8');
  for (const needle of [
    'value="presale"', 'value="redevelop"',
    'name="unsold2026LocalExtra"', 'name="childbirth"', 'name="firstHomeSmallHouse"',
    'data-acq-notes',
  ]) {
    assert.ok(html.includes(needle), `취득세 페이지에 ${needle}이(가) 없습니다.`);
  }
  assert.ok(!/취득세 50% 감면/.test(html), '“취득세 50% 감면” 단정 문구가 남아 있습니다.');
});

check('양도세 페이지에 경과규정·이월과세 입력이 있다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/transfer-tax.html', import.meta.url), 'utf8');
  for (const needle of [
    'name="contractDate"', 'name="downPaymentReceived"', 'name="newRegulatedArea"',
    'name="landPermitTarget"', 'name="landPermitApplyDate"',
    'name="giftedFromRelative"', 'name="giftReceivedDate"', 'name="donorBuyPrice"',
  ]) {
    assert.ok(html.includes(needle), `양도세 페이지에 ${needle}이(가) 없습니다.`);
  }
});

check('종합계산기에 자금계획 탭과 상속·증여 정밀 입력이 있다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/total-cost-dashboard.html', import.meta.url), 'utf8');
  for (const needle of [
    'data-scn="plan"', 'data-scn-panel="plan"',
    'name="planEquity"', 'name="planDownPct"', 'name="planMgmt"',
    'name="spouseActualShare"', 'name="prevGiftTax"',
    'name="marriageBirthDeduct"', 'name="generationSkip"', 'value="stranger"',
    'data-estimate-note',
  ]) {
    assert.ok(html.includes(needle), `종합계산기에 ${needle}이(가) 없습니다.`);
  }
  // 기존 탭은 그대로 유지되어야 한다.
  for (const scn of ['sale', 'transfer', 'lease', 'inherit', 'gift']) {
    assert.ok(html.includes(`data-scn="${scn}"`), `기존 ${scn} 탭이 사라졌습니다.`);
  }
});

check('경매·중개보수·청약·전월세 페이지에 새 입력이 있다', () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const auction = read('../site/calculators/auction-bid.html');
  for (const n of ['name="areaOver85"', 'name="firstHome"', 'name="assetType"']) {
    assert.ok(auction.includes(n), `경매 페이지에 ${n}이(가) 없습니다.`);
  }
  const brokerage = read('../site/calculators/brokerage-fee.html');
  for (const n of ['value="monthly"', 'value="officetel-sale"', 'value="other"',
    'name="negotiatedRate"', 'name="includeVat"', 'name="monthlyRent"']) {
    assert.ok(brokerage.includes(n), `중개보수 페이지에 ${n}이(가) 없습니다.`);
  }
  assert.ok(read('../site/calculators/housing-subscription.html').includes('name="spouseAccountYears"'));
  assert.ok(read('../site/calculators/jeonse-monthly.html').includes('data-out="legalCap"'));
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 증여 취득세 — 시가인정액·시가표준액·승계채무 분리');
// ─────────────────────────────────────────────────────────────────────

check('세액은 시가인정액으로, 중과 판정은 시가표준액으로 한다', () => {
  // 시가인정액 5억(3억 초과)이지만 시가표준액 2.5억(3억 미만) → 중과 아님.
  //  하나의 price로 둘을 겸하면 여기서 12%가 잘못 걸린다.
  const r = calcAcquisitionTax({
    price: 500_000_000, homes: 2, regulated: true, areaOver85: false,
    acqType: 'gift', giftDonorMultiHome: true,
    giftMarketValue: 500_000_000, giftStdValue: 250_000_000,
  });
  assert.equal(r.baseRate, 0.035, '시가표준액이 3억 미만이면 중과 대상이 아닙니다.');
  closeTo(r.acquisition, 500_000_000 * 0.035, '세액은 시가인정액 기준');
});

check('시가표준액이 3억 이상이면 조정대상·다주택 증여는 12% 중과', () => {
  const r = calcAcquisitionTax({
    price: 500_000_000, homes: 2, regulated: true, areaOver85: false,
    acqType: 'gift', giftDonorMultiHome: true,
    giftMarketValue: 500_000_000, giftStdValue: 320_000_000,
  });
  assert.equal(r.baseRate, 0.12);
  closeTo(r.acquisition, 500_000_000 * 0.12, '중과 세액도 시가인정액 기준');
});

check('시가표준액 미입력이면 시가인정액으로 대신 판정하고 경고한다', () => {
  const r = calcAcquisitionTax({
    price: 500_000_000, homes: 2, regulated: true,
    acqType: 'gift', giftDonorMultiHome: true, giftMarketValue: 500_000_000,
  });
  assert.equal(r.baseRate, 0.12, '판정 근거가 없으면 보수적으로 시가인정액을 씁니다.');
  assert.ok(r.notes.some((n) => n.kind === 'warn' && /시가표준액/.test(n.text)),
    '시가표준액 미입력 경고가 없습니다.');
});

check('부담부증여는 무상취득 부분과 유상취득 부분을 나눠 계산한다', () => {
  // 시가인정액 6억, 승계 채무 2억 → 무상 4억(3.5%) + 유상 2억(1주택 표준세율 1%)
  const r = calcAcquisitionTax({
    price: 600_000_000, homes: 1, regulated: false, areaOver85: false,
    acqType: 'gift', giftMarketValue: 600_000_000, giftStdValue: 400_000_000,
    giftAssumedDebt: 200_000_000,
  });
  closeTo(r.giftFreeBase, 400_000_000, '무상취득 과세표준 = 시가인정액 − 채무');
  closeTo(r.acquisition, 400_000_000 * 0.035, '무상취득 세액');
  assert.ok(r.burdenedPaidPart, '유상취득 부분이 별도로 계산돼야 합니다.');
  closeTo(r.burdenedPaidPart.acquisition, 200_000_000 * 0.01, '유상취득 세액(2억 → 1%)');
  closeTo(r.combinedTotal, r.total + r.burdenedPaidPart.total, '무상 + 유상 합계');
  assert.ok(r.notes.some((n) => /부담부증여/.test(n.text)));
});

check('승계채무가 없으면 유상취득 부분을 만들지 않는다', () => {
  const r = calcAcquisitionTax({
    price: 600_000_000, homes: 1, acqType: 'gift', giftMarketValue: 600_000_000,
  });
  assert.equal(r.burdenedPaidPart, null);
  closeTo(r.combinedTotal, r.total, '채무가 없으면 합계 = 무상취득 세액');
});

check('증여 지방교육세·농특세도 무상취득 과세표준 기준으로 계산된다', () => {
  const r = calcAcquisitionTax({
    price: 600_000_000, homes: 1, areaOver85: true,
    acqType: 'gift', giftMarketValue: 600_000_000, giftAssumedDebt: 200_000_000,
  });
  // 과세표준 4억 × 0.2% = 80만원 (6억 기준이면 120만원이 나와 과다 계산된다)
  closeTo(r.ruralTax, 400_000_000 * 0.002, '농특세 과세표준');
  closeTo(r.localEduTax, 400_000_000 * (0.035 - 0.02) * 0.20, '지방교육세 과세표준');
});

check('기존 호출부(price만 전달)도 동작이 유지된다', () => {
  const r = calcAcquisitionTax({ price: 500_000_000, homes: 1, acqType: 'gift' });
  closeTo(r.acquisition, 500_000_000 * 0.035, '시가인정액 미입력 시 price를 그대로 사용');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 양도세 — 지분율 안분 · 날짜 기준 보유·거주기간');
// ─────────────────────────────────────────────────────────────────────

const jointBase = {
  sellPrice: 1_500_000_000, buyPrice: 700_000_000, cost: 30_000_000,
  holdYears: 8, liveYears: 0, homes: 2, onlyHome: false, regulated: false,
};

check('지분율을 주면 균등분할이 아니라 지분대로 안분한다', () => {
  const equal = calcTransferTax({ ...jointBase, jointOwners: 2 });
  const skewed = calcTransferTax({ ...jointBase, jointOwners: 2, ownerShares: [80, 20] });
  assert.equal(equal.jointOwners, 2);
  assert.equal(skewed.jointOwners, 2);
  assert.ok(skewed.jointTotal !== equal.jointTotal,
    '지분이 8:2인데 5:5와 세액이 같으면 지분율이 반영되지 않은 것입니다.');
  // 지분이 쏠릴수록 누진 분산 효과가 줄어 세액이 커진다.
  assert.ok(skewed.jointTotal > equal.jointTotal);
  closeTo(skewed.jointPerOwner[0].sharePct, 80, '소유자 1 지분율');
  closeTo(skewed.jointPerOwner[1].sharePct, 20, '소유자 2 지분율');
});

check('지분 합이 100이 아니어도 비율대로 정규화한다', () => {
  const a = calcTransferTax({ ...jointBase, jointOwners: 2, ownerShares: [80, 20] });
  const b = calcTransferTax({ ...jointBase, jointOwners: 2, ownerShares: [8, 2] });
  closeTo(a.jointTotal, b.jointTotal, '80:20과 8:2는 같은 비율');
});

check('지분율을 안 주면 기존 인원수 균등분할과 같다', () => {
  const before = calcTransferTax({ ...jointBase, jointOwners: 3 });
  const after = calcTransferTax({ ...jointBase, jointOwners: 3, ownerShares: null });
  closeTo(before.jointTotal, after.jointTotal, '균등분할 회귀');
  assert.equal(before.sharesEqual, true);
});

check('기본공제 250만원은 소유자마다 적용된다', () => {
  const r = calcTransferTax({ ...jointBase, jointOwners: 2, ownerShares: [50, 50] });
  closeTo(r.jointBasicDeduct, 5_000_000, '2인 공동 → 기본공제 500만원');
});

check('취득일·양도일을 주면 보유기간을 실제 일수로 계산한다', () => {
  // 정수 연수로는 2년이라 비과세인데, 실제로는 1년 11개월이라 단기 중과 대상인 경우.
  const r = calcTransferTax({
    sellPrice: 1_000_000_000, buyPrice: 700_000_000, cost: 0,
    holdYears: 2, liveYears: 0, homes: 1, onlyHome: true, regulated: false,
    acquireDate: '2024-03-01', sellDate: '2026-02-01',
  });
  assert.equal(r.holdFromDates, true);
  assert.ok(r.holdYears < 2, `실제 보유 ${r.holdYears}년`);
  assert.equal(r.exempted, false, '2년 미만이면 1세대1주택 비과세 대상이 아닙니다.');
  assert.equal(r.isShortTerm, true, '2년 미만은 단기보유 중과');
});

check('보유 2년을 하루라도 넘기면 비과세 요건을 충족한다', () => {
  const r = calcTransferTax({
    sellPrice: 1_000_000_000, buyPrice: 700_000_000, cost: 0,
    holdYears: 0, liveYears: 0, homes: 1, onlyHome: true, regulated: false,
    acquireDate: '2024-03-01', sellDate: '2026-03-05',
  });
  assert.equal(r.exempted, true);
});

check('거주 시작·종료일을 주면 거주기간을 실제 일수로 계산한다', () => {
  const r = calcTransferTax({
    sellPrice: 2_000_000_000, buyPrice: 1_000_000_000, cost: 0,
    holdYears: 10, liveYears: 0, homes: 1, onlyHome: true, regulated: false,
    residenceStartDate: '2016-01-01', residenceEndDate: '2026-01-01',
  });
  assert.equal(r.liveFromDates, true);
  closeTo(r.liveYears, 10, '거주 10년', 0.05);
  // 보유 10년(40%) + 거주 10년(40%) = 80%
  closeTo(r.ltDeductRate, 0.80, '장특공 표2 최대');
});

check('날짜를 주지 않으면 기존 정수 연수 입력을 그대로 쓴다 (회귀)', () => {
  const r = calcTransferTax({
    sellPrice: 2_000_000_000, buyPrice: 1_000_000_000, cost: 0,
    holdYears: 10, liveYears: 10, homes: 1, onlyHome: true, regulated: false,
  });
  assert.equal(r.holdFromDates, false);
  assert.equal(r.liveFromDates, false);
  closeTo(r.ltDeductRate, 0.80, '장특공 표2 최대');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[개선] 중개보수 — 시·도 조례 구분');
// ─────────────────────────────────────────────────────────────────────

check('서울은 조례 대조 완료로, 다른 시·도는 경고와 함께 표시된다', () => {
  const seoul = calcBrokerageFee({ price: 800_000_000, type: 'sale', region: 'KR-11' });
  assert.equal(seoul.regionUnverified, false);
  assert.equal(seoul.region.name, '서울특별시');
  const gyeonggi = calcBrokerageFee({ price: 800_000_000, type: 'sale', region: 'KR-41' });
  assert.equal(gyeonggi.regionUnverified, true);
  assert.ok(gyeonggi.regionWarn, '조례 미대조 경고 문구가 없습니다.');
  // 요율표 자체는 같으므로 금액은 동일해야 한다(경고만 다르다).
  closeTo(gyeonggi.fee, seoul.fee, '요율표는 동일');
});

check('오피스텔·상가·토지는 법령 상한이라 시·도 경고가 붙지 않는다', () => {
  for (const type of ['officetel-sale', 'other']) {
    const r = calcBrokerageFee({ price: 800_000_000, type, region: 'KR-41' });
    assert.equal(r.regionApplies, false, type);
    assert.equal(r.regionUnverified, false, type);
  }
});

check('시·도를 주지 않으면 기존처럼 서울 기준으로 계산한다 (회귀)', () => {
  const before = calcBrokerageFee({ price: 800_000_000, type: 'sale' });
  const seoul = calcBrokerageFee({ price: 800_000_000, type: 'sale', region: 'KR-11' });
  closeTo(before.fee, seoul.fee, '기본값 = 서울');
  closeTo(before.total, seoul.total, '기본값 = 서울(부가세 포함)');
});

check('중개보수 FAQ가 부가세 포함을 단정하지 않는다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/brokerage-fee.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('계산 결과는 부가가치세(10%)가 포함된 금액입니다.'),
    '부가세 체크를 해제할 수 있는데 FAQ가 포함을 단정하고 있습니다.');
  assert.ok(html.includes('name="bfRegion"'), '시·도 선택이 없습니다.');
  assert.ok(html.includes('data-out="bfRegionNote"'), '시·도 조례 안내 영역이 없습니다.');
});

check('양도세 페이지에 지분율·취득일·거주일 입력이 있다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/transfer-tax.html', import.meta.url), 'utf8');
  for (const n of [
    'name="ownerShare1"', 'name="ownerShare2"', 'name="acquireDate"',
    'name="residenceStartDate"', 'name="residenceEndDate"', 'data-out="periodNote"',
  ]) {
    assert.ok(html.includes(n), `양도세 페이지에 ${n}이(가) 없습니다.`);
  }
});

check('취득세 페이지(한국어·영어)에 증여 3분리 입력이 있다', () => {
  for (const p of ['../site/calculators/acquisition-tax.html', '../site/en/calculators/acquisition-tax.html']) {
    const html = fs.readFileSync(new URL(p, import.meta.url), 'utf8');
    for (const n of ['name="giftMarketValue"', 'name="giftStdValue"', 'name="giftAssumedDebt"', 'data-burdened-box']) {
      assert.ok(html.includes(n), `${p}에 ${n}이(가) 없습니다.`);
    }
  }
});

console.log(`\n세무 정확성 회귀 테스트 ${passed}개 통과\n`);
