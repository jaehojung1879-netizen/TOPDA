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

const context = vm.createContext({
  window: {
    TOPDA_RATES: {
      acquisitionTax: {
        unsold2026Relief: {
          areaMaxSqm: 85,
          priceMax: 600_000_000,
          discountRatio: 0.5,
          excludeHeavySurcharge: true,
        },
      },
      loan: {
        metroPriceCaps: [
          { upToEok: 15, cap: 600_000_000 },
          { upToEok: 25, cap: 400_000_000 },
          { upToEok: Infinity, cap: 200_000_000 },
        ],
      },
    },
  },
});

vm.runInContext(
  [
    functionBlock('function calcAcquisitionTax(input)', '\n// scenarioKey'),
    functionBlock('function calcBrokerageFee({ price, type })', '\n(function () {'),
    functionBlock('function calcMortgageLimit(input)', '\n// 전세대출'),
    'globalThis.cores = { calcAcquisitionTax, calcBrokerageFee, calcRti, calcMortgageLimit };',
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

const unsold = calcAcquisitionTax({
  price: 600_000_000,
  homes: 3,
  regulated: true,
  areaOver85: false,
  firstHome: false,
  unsold2026: true,
});
assert.equal(unsold.unsoldEligible, true);
assert.equal(unsold.isHeavy, false);
closeTo(unsold.unsoldDeduct, 3_000_000, '미분양 취득세 50% 감면');
closeTo(unsold.total, 3_600_000, '미분양 감면 후 총 취득세');

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
