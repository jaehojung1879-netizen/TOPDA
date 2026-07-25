import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../site/assets/app.js', import.meta.url), 'utf8');
const coreStart = appSource.indexOf('function calcTransferTax(input)');
const coreEnd = appSource.indexOf('\n(function () {', coreStart);

assert.ok(coreStart >= 0 && coreEnd > coreStart, '양도소득세 공통 계산 함수를 찾을 수 없습니다.');

const context = vm.createContext({
  window: {
    TOPDA_RATES: {
      transferTax: {
        multiHomeSurchargeWaiverUntil: '2026-05-09',
        multiHomeSurchargeWaiverMinHoldYears: 2,
      },
    },
  },
});

vm.runInContext(
  `${appSource.slice(coreStart, coreEnd)}
globalThis.transferTaxCore = { calcTransferTax, calcProgressiveTax };`,
  context,
);

const { calcTransferTax } = context.transferTaxCore;
const closeTo = (actual, expected, message) => {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} !== ${expected}`);
};

const exempt = calcTransferTax({
  sellPrice: 1_200_000_000,
  buyPrice: 700_000_000,
  cost: 30_000_000,
  holdYears: 6,
  liveYears: 4,
  homes: 1,
  onlyHome: true,
  regulated: false,
});
assert.equal(exempt.exempted, true);
assert.equal(exempt.total, 0);

const highValue = calcTransferTax({
  sellPrice: 1_500_000_000,
  buyPrice: 900_000_000,
  cost: 25_000_000,
  holdYears: 8,
  liveYears: 5,
  homes: 1,
  onlyHome: true,
  regulated: false,
});
closeTo(highValue.taxableGainRatio, 0.2, '고가 1주택 안분 비율');
closeTo(highValue.ltDeductRate, 0.52, '고가 1주택 장기보유특별공제율');
closeTo(highValue.total, 7_576_800, '고가 1주택 총세액');

const heavy = calcTransferTax({
  sellPrice: 1_000_000_000,
  buyPrice: 500_000_000,
  cost: 0,
  holdYears: 5,
  liveYears: 0,
  homes: 2,
  onlyHome: false,
  regulated: true,
  sellDate: '2026-06-01',
});
assert.equal(heavy.surchargeRatePct, 20);
assert.equal(heavy.ltDeductRate, 0);
closeTo(heavy.total, 299_816_000, '조정지역 2주택 중과 총세액');

const waived = calcTransferTax({
  sellPrice: 1_000_000_000,
  buyPrice: 500_000_000,
  cost: 0,
  holdYears: 5,
  liveYears: 0,
  homes: 2,
  onlyHome: false,
  regulated: true,
  sellDate: '2026-05-09',
});
assert.equal(waived.surchargeWaived, true);
assert.equal(waived.surchargeRatePct, 0);
closeTo(waived.ltDeductRate, 0.1, '중과 유예 시 장기보유특별공제율');
closeTo(waived.total, 168_366_000, '중과 유예 총세액');

const surchargeExempt = calcTransferTax({
  sellPrice: 1_000_000_000,
  buyPrice: 500_000_000,
  cost: 0,
  holdYears: 5,
  liveYears: 0,
  homes: 2,
  onlyHome: false,
  regulated: true,
  surchargeExempt: true,
  sellDate: '2026-06-01',
});
assert.equal(surchargeExempt.surchargeRatePct, 0);
closeTo(surchargeExempt.ltDeductRate, 0.1, '중과 배제 시 장기보유특별공제율');
closeTo(surchargeExempt.total, waived.total, '중과 배제 총세액');

const joint = calcTransferTax({
  sellPrice: 1_000_000_000,
  buyPrice: 400_000_000,
  cost: 0,
  holdYears: 5,
  liveYears: 0,
  homes: 1,
  onlyHome: false,
  regulated: false,
  jointOwners: 2,
});
closeTo(joint.total, 208_791_000, '단독명의 비교 세액');
closeTo(joint.jointTotal, 179_762_000, '2인 공동명의 합산 세액');
closeTo(joint.jointSavings, 29_029_000, '2인 공동명의 예상 절세액');
closeTo(joint.jointBasicDeduct, 5_000_000, '2인 공동명의 기본공제 합계');
closeTo(joint.jointTaxBase, 535_000_000, '2인 공동명의 과세표준 합계');
assert.equal(joint.jointMarginalRatePct, 38);
closeTo(joint.jointIncomeTax + joint.jointLocalTax, joint.jointTotal, '공동명의 국세·지방세 합계');

const nonhouseShortTerm = calcTransferTax({
  sellPrice: 500_000_000,
  buyPrice: 300_000_000,
  cost: 0,
  holdYears: 0.5,
  liveYears: 0,
  homes: 1,
  onlyHome: true,
  regulated: true,
  assetType: 'nonhouse',
});
assert.equal(nonhouseShortTerm.exempted, false);
assert.equal(nonhouseShortTerm.shortTermRatePct, 50);
assert.equal(nonhouseShortTerm.surchargeRatePct, 0);
closeTo(nonhouseShortTerm.total, 108_625_000, '비주택 1년 미만 총세액');

const dashboardStart = appSource.indexOf('function calcTransfer()');
const dashboardEnd = appSource.indexOf('\n    function calcLease()', dashboardStart);
const dashboardTransfer = appSource.slice(dashboardStart, dashboardEnd);
assert.match(dashboardTransfer, /const r = calcTransferTax\(\{/);
assert.doesNotMatch(dashboardTransfer, /progressiveTax\(/);
assert.match(appSource, /root\.querySelectorAll\('input, select'\)\.forEach\(\(el\) => \{\s*el\.addEventListener\('input', recalc\);/);

for (const page of [
  new URL('../site/calculators/total-cost-dashboard.html', import.meta.url),
  new URL('../site/en/calculators/total-cost-dashboard.html', import.meta.url),
]) {
  const html = fs.readFileSync(page, 'utf8');
  for (const name of ['sellDate', 'jointOwners', 'surchargeExempt']) {
    assert.match(html, new RegExp(`name="${name}"`), `${page.pathname}에 ${name} 입력이 없습니다.`);
  }
}

console.log('양도소득세 공통 로직 및 종합계산기 연동 시나리오 7개 통과');
