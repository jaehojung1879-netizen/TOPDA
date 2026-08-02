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

// rates.js를 그대로 로드해 계산기와 같은 기준정보로 검증한다(값이 어긋나면 여기서 잡힌다).
const ratesSource = fs.readFileSync(new URL('../site/assets/rates.js', import.meta.url), 'utf8');
const ratesContext = vm.createContext({ window: {} });
vm.runInContext(ratesSource, ratesContext);
const RATES = ratesContext.window.TOPDA_RATES;

const context = vm.createContext({ window: { TOPDA_RATES: RATES } });

vm.runInContext(
  [
    functionBlock('function calcAcquisitionTax(input)', '\n// scenarioKey'),
    functionBlock('function calcBrokerageFee(opts)', '\n(function () {'),
    // calcMortgageLimit은 지역·LTV·스트레스 헬퍼(loanRegionConfig 등)에 의존하므로
    // 그 앞의 loanRatesCfg()부터 통째로 가져온다.
    functionBlock('function loanRatesCfg()', '\n// 전세대출'),
    'globalThis.cores = { calcAcquisitionTax, calcBrokerageFee, calcRti, calcMortgageLimit,'
      + ' loanRegionConfig, suggestLtvPercent, suggestStressAdd };',
  ].join('\n'),
  context,
);

const { calcAcquisitionTax, calcBrokerageFee, calcRti, calcMortgageLimit } = context.cores;
const closeTo = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} !== ${expected}`);
};

const temporaryTwoHome = calcAcquisitionTax({
  price: 800_000_000,
  homes: 2,
  regulated: true,
  areaOver85: false,
  firstHome: false,
  tempTwoHome: true,
});
assert.equal(temporaryTwoHome.isHeavy, false);
assert.equal(temporaryTwoHome.scenarioKey, 'temp-two-home');

// 지방 준공 후 미분양 감면 — 전국 일률 50%가 아니라 법정 25% + 조례 추가 0~25%.
// ① 조례 미확인(기본): 법정 25%만 적용되어야 한다.
const unsold = calcAcquisitionTax({
  price: 600_000_000,
  homes: 3,
  regulated: true,
  areaOver85: false,
  firstHome: false,
  unsold2026: true,
});
assert.equal(unsold.unsoldEligible, true);
assert.equal(unsold.isHeavy, false, '미분양 감면 대상은 다주택 중과에서 제외된다');
closeTo(unsold.unsoldRatio, 0.25, '조례 미확인 시 법정 감면율');
closeTo(unsold.unsoldDeduct, 1_500_000, '미분양 법정 25% 감면액'); // 6억 × 1% × 25%
closeTo(unsold.total, 5_100_000, '법정 25% 감면 후 총 취득세');   // 4.5M + 교육세 0.6M
assert.equal(unsold.unsoldLocalExtraKnown, false);
assert.ok(
  unsold.notes.some((n) => n.kind === 'warn' && n.text.includes('조례')),
  '조례 미확인 시 추가 감면 가능성을 결과에 밝혀야 한다',
);

// ② 조례 추가 25% 확인: 최종 50%.
const unsoldMax = calcAcquisitionTax({
  price: 600_000_000,
  homes: 3,
  regulated: true,
  areaOver85: false,
  firstHome: false,
  unsold2026: true,
  unsold2026LocalExtra: 0.25,
});
closeTo(unsoldMax.unsoldRatio, 0.5, '조례 최대 추가 시 최종 감면율');
closeTo(unsoldMax.unsoldDeduct, 3_000_000, '최종 50% 감면액');
closeTo(unsoldMax.total, 3_600_000, '최종 50% 감면 후 총 취득세');

// ③ 조례 추가 10%: 최종 35%.
const unsoldMid = calcAcquisitionTax({
  price: 600_000_000, homes: 1, regulated: false, areaOver85: false,
  firstHome: false, unsold2026: true, unsold2026LocalExtra: 0.10,
});
closeTo(unsoldMid.unsoldRatio, 0.35, '조례 10% 추가 시 최종 감면율');

// ④ 상한 초과 입력은 조례 상한(25%p)으로 제한된다.
const unsoldOver = calcAcquisitionTax({
  price: 600_000_000, homes: 1, regulated: false, areaOver85: false,
  firstHome: false, unsold2026: true, unsold2026LocalExtra: 0.9,
});
closeTo(unsoldOver.unsoldRatio, 0.5, '조례 추가 감면은 25%p로 제한된다');

// ⑤ 분양받은 신축주택은 원시취득 2.8%가 아니라 유상거래 세율로 계산되어야 한다.
const presale = calcAcquisitionTax({
  price: 800_000_000, homes: 1, regulated: false, areaOver85: false,
  firstHome: false, acqType: 'presale',
});
const selfBuilt = calcAcquisitionTax({
  price: 800_000_000, homes: 1, regulated: false, areaOver85: false,
  firstHome: false, acqType: 'original',
});
closeTo(presale.baseRate, 800_000_000 / 100_000_000 * 2 / 3 / 100 - 0.03, '분양 신축주택 유상거래 누진세율');
assert.equal(presale.isPaidTransfer, true);
closeTo(selfBuilt.baseRate, 0.028, '직접 신축은 원시취득 2.8%');
assert.ok(presale.total < selfBuilt.total, '분양 신축주택과 직접 신축의 세액은 달라야 한다');

// ⑥ 생애최초 300만원 한도(소형 비아파트·인구감소지역) / 출산·양육 500만원 한도
const firstHomeStandard = calcAcquisitionTax({
  price: 500_000_000, homes: 1, regulated: false, areaOver85: false, firstHome: true,
});
closeTo(firstHomeStandard.firstHomeDeduct, 2_000_000, '생애최초 일반 한도');
const firstHomeSmall = calcAcquisitionTax({
  price: 500_000_000, homes: 1, regulated: false, areaOver85: false,
  firstHome: true, firstHomeSmallHouse: true,
});
closeTo(firstHomeSmall.firstHomeDeduct, 3_000_000, '생애최초 소형주택 한도 300만원');
const childbirthOnly = calcAcquisitionTax({
  price: 500_000_000, homes: 1, regulated: false, areaOver85: false, childbirth: true,
});
closeTo(childbirthOnly.firstHomeDeduct, 5_000_000, '출산·양육 감면 500만원');
assert.equal(childbirthOnly.appliedReliefKey, 'childbirth');
// 중복 선택 시 단순 합산이 아니라 유리한 하나만 적용
const bothRelief = calcAcquisitionTax({
  price: 500_000_000, homes: 1, regulated: false, areaOver85: false,
  firstHome: true, childbirth: true,
});
closeTo(bothRelief.firstHomeDeduct, 5_000_000, '생애최초·출산 감면은 중복 합산하지 않는다');
assert.equal(bothRelief.appliedReliefKey, 'childbirth');

const giftStandard = calcAcquisitionTax({
  price: 500_000_000,
  acqType: 'gift',
  regulated: true,
  giftDonorMultiHome: false,
  areaOver85: false,
});
assert.equal(giftStandard.giftHeavyApplied, false);
closeTo(giftStandard.total, 19_000_000, '일반 증여 취득세');

const giftHeavy = calcAcquisitionTax({
  price: 500_000_000,
  acqType: 'gift',
  regulated: true,
  giftDonorMultiHome: true,
  areaOver85: false,
});
assert.equal(giftHeavy.giftHeavyApplied, true);
closeTo(giftHeavy.total, 62_000_000, '증여 중과 취득세');

const inherited = calcAcquisitionTax({
  price: 1_500_000_000,
  acqType: 'inherit',
  inheritNoHome: true,
  areaOver85: false,
});
closeTo(inherited.total, 12_000_000, '무주택 세대 상속 취득세 특례');

const brokerage = calcBrokerageFee({ price: 800_000_000, type: 'sale' });
closeTo(brokerage.total, 3_520_000, '매매 중개보수 VAT 포함');

const rti = calcRti({
  monthlyRent: 3_000_000,
  deposit: 500_000_000,
  loan: 400_000_000,
  annualRate: 4.5,
});
closeTo(rti.depositIncome, 17_500_000, '보증금 간주임대료');
closeTo(rti.annualRent, 53_500_000, 'RTI 연 임대수입');
closeTo(rti.ratio, 53_500_000 / 18_000_000, 'RTI 비율');

const mortgage = calcMortgageLimit({
  price: 800_000_000,
  ltvPercent: 70,
  regulatedMetro: true,
  income: 60_000_000,
  existingAnnualDebt: 0,
  rate: 4.5,
  stressAdd: 1.5,
  termYears: 30,
  dsrLimitPercent: 40,
  repayType: 'equal',
});
assert.equal(mortgage.binding.key, 'dsr');
assert.ok(mortgage.limit < mortgage.ltvLimit);
assert.ok(mortgage.limit < mortgage.priceCap);

const dashboardStart = appSource.indexOf('function calcSale()');
const dashboardEnd = appSource.indexOf('\n    function switchScn(', dashboardStart);
const dashboardSource = appSource.slice(dashboardStart, dashboardEnd);
for (const sharedCall of [
  'calcAcquisitionTax',
  'calcBrokerageFee',
  'calcRti',
  'calcMortgageLimit',
]) {
  assert.match(appSource, new RegExp(sharedCall), `${sharedCall} 공통 계산 함수가 없습니다.`);
}
assert.doesNotMatch(dashboardSource, /value \* 0\.035 \+ value \* 0\.003/);
assert.match(dashboardSource, /acqType: 'inherit'/);
assert.match(dashboardSource, /acqType: 'gift'/);

for (const page of [
  new URL('../site/calculators/total-cost-dashboard.html', import.meta.url),
  new URL('../site/en/calculators/total-cost-dashboard.html', import.meta.url),
]) {
  const html = fs.readFileSync(page, 'utf8');
  for (const name of [
    'tempTwoHome', 'unsold2026',
    'inheritNoHome', 'inheritAreaOver85',
    'giftRegulated', 'giftDonorMultiHome', 'giftAreaOver85',
  ]) {
    assert.match(html, new RegExp(`name="${name}"`), `${page.pathname}에 ${name} 입력이 없습니다.`);
  }
  assert.match(html, /data-mortgage-limit-box/);
}

for (const page of [
  new URL('../site/calculators/acquisition-tax.html', import.meta.url),
  new URL('../site/en/calculators/acquisition-tax.html', import.meta.url),
]) {
  const html = fs.readFileSync(page, 'utf8');
  assert.doesNotMatch(html, /name="giftHeavy"/);
  assert.match(html, /name="giftDonorMultiHome"/);
  assert.match(html, /data-acq-auto-status/);
}

console.log('종합계산기 공통 로직 연동 및 취득세 자동 판정 시나리오 8개 통과');
