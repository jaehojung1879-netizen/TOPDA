/*
 * 대출 한도 회귀 테스트
 * -----------------------------------------------------------------------
 * 목적은 두 가지다.
 *
 *  1) 현행 규제값이 계산기에 실제로 반영돼 있는지 확인한다.
 *     — 규제지역 일반 LTV 40%(10·15 대책), 생애최초 전국 70%(6·27 대책),
 *       수도권·규제지역 스트레스 3.0%p, 지방 비규제 0.75%p,
 *       가격대별 한도는 수도권·규제지역에만 적용.
 *
 *  2) **한도가 과대 산출되지 않는지** 회귀로 막는다.
 *     이전 모델(규제 LTV 50% / 스트레스 1.5%p / 비규제 생애최초 80% /
 *     비규제는 가격대별 한도 없음)로 계산한 값과 비교해, 어떤 시나리오에서도
 *     새 결과가 더 크지 않아야 한다. 규제가 풀린 게 아니라 강화됐기 때문에,
 *     새 값이 더 크게 나온다면 그건 규제 반영 실수다.
 *
 * 실행: node scripts/check_loan_limit_rules.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../site/assets/app.js', import.meta.url), 'utf8');
function functionBlock(startNeedle, endNeedle) {
  const start = appSource.indexOf(startNeedle);
  const end = appSource.indexOf(endNeedle, start);
  assert.ok(start >= 0 && end > start, `${startNeedle} 블록을 찾을 수 없습니다.`);
  return appSource.slice(start, end);
}

const ratesSource = fs.readFileSync(new URL('../site/assets/rates.js', import.meta.url), 'utf8');
const ratesContext = vm.createContext({ window: {} });
vm.runInContext(ratesSource, ratesContext);
const RATES = ratesContext.window.TOPDA_RATES;

const context = vm.createContext({ window: { TOPDA_RATES: RATES } });
vm.runInContext(
  [
    functionBlock('function loanRatesCfg()', '\n// 전세대출'),
    'globalThis.cores = { calcMortgageLimit, loanRegionConfig, suggestLtvPercent, suggestStressAdd };',
  ].join('\n'),
  context,
);
const { calcMortgageLimit, loanRegionConfig, suggestLtvPercent, suggestStressAdd } = context.cores;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 P0-①] 규제지역 일반 LTV — 50%가 아니라 40%');
// ─────────────────────────────────────────────────────────────────────

check('규제지역 무주택·처분조건부 1주택 LTV는 40%다', () => {
  // 10·15 대책(2025.10.16 시행)으로 규제지역 일반 LTV가 70%→40%로 내려갔다.
  assert.equal(suggestLtvPercent('regulated', 'none').value, 40);
  assert.equal(suggestLtvPercent('regulated', 'replace').value, 40);
});

check('규제지역 생애최초는 LTV 하향에서 제외돼 70%를 유지한다', () => {
  assert.equal(suggestLtvPercent('regulated', 'first').value, 70);
});

check('생애최초 LTV는 전 지역 70%다 (6·27 대책으로 80%→70%)', () => {
  for (const region of ['metroNonRegulated', 'regulated', 'provincialNonRegulated']) {
    assert.equal(suggestLtvPercent(region, 'first').value, 70, region);
  }
});

check('수도권·규제지역의 다주택·미처분 1주택은 주택구입 주담대 금지(LTV 0%)', () => {
  for (const region of ['metroNonRegulated', 'regulated']) {
    assert.equal(suggestLtvPercent(region, 'multi').value, 0, region);
    assert.equal(suggestLtvPercent(region, 'keep1').value, 0, region);
  }
});

check('지방 비규제 다주택 LTV는 확정값이 아니라 추정값으로 표시된다', () => {
  const r = suggestLtvPercent('provincialNonRegulated', 'multi');
  assert.equal(r.value, 60);
  assert.equal(r.confidence, 'estimate', '관행값은 verified로 단정하면 안 됩니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 P0-②] 스트레스 가산금리 — 수도권·규제 3.0%p');
// ─────────────────────────────────────────────────────────────────────

check('수도권 비규제·규제지역 변동금리 스트레스 가산은 3.00%p다', () => {
  // 스트레스 금리 3.0% × 3단계 기본 적용비율 100% = 3.00%p (2025.10.16~)
  assert.equal(suggestStressAdd('metroNonRegulated', 'variable').value, 3);
  assert.equal(suggestStressAdd('regulated', 'variable').value, 3);
});

check('지방 비규제는 2단계 한시 유예로 0.75%p다', () => {
  // 스트레스 금리 1.5% × 2단계 적용비율 50% = 0.75%p
  const r = suggestStressAdd('provincialNonRegulated', 'variable');
  assert.equal(r.value, 0.75);
  assert.ok(r.validUntil, '한시 유예에는 종료일이 표시돼야 합니다.');
});

check('1.5%p가 수도권·규제지역 기본값으로 남아 있지 않다', () => {
  for (const region of ['metroNonRegulated', 'regulated']) {
    assert.notEqual(suggestStressAdd(region, 'variable').value, 1.5, region);
  }
});

check('금리유형이 고정에 가까울수록 가산이 줄어든다', () => {
  const v = suggestStressAdd('regulated', 'variable').value;
  const m = suggestStressAdd('regulated', 'mixed').value;
  const p = suggestStressAdd('regulated', 'periodic').value;
  const f = suggestStressAdd('regulated', 'fixed').value;
  assert.ok(v > m && m > p && p > f, `${v} > ${m} > ${p} > ${f}`);
  assert.equal(f, 0, '만기까지 순수 고정은 스트레스 가산이 없습니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 P0-③] 지역 3분류 — 가격대별 한도 적용 범위');
// ─────────────────────────────────────────────────────────────────────

check('지역이 「수도권 비규제 / 규제지역 / 지방 비규제」 3개로 나뉜다', () => {
  // vm 컨텍스트에서 온 배열이라 deepEqual은 realm 차이로 실패한다 — 문자열로 비교한다.
  const keys = Array.from(RATES.loan.regions).map((r) => r.key).join(',');
  assert.equal(keys, 'metroNonRegulated,regulated,provincialNonRegulated');
});

check('가격대별 한도는 수도권 비규제·규제지역에만 적용된다', () => {
  const base = { price: 2_000_000_000, income: 300_000_000, rate: 4, termYears: 30, dsrLimitPercent: 40 };
  const metro = calcMortgageLimit({ ...base, region: 'metroNonRegulated', ltvPercent: 70, stressAdd: 3 });
  const reg = calcMortgageLimit({ ...base, region: 'regulated', ltvPercent: 40, stressAdd: 3 });
  const prov = calcMortgageLimit({ ...base, region: 'provincialNonRegulated', ltvPercent: 70, stressAdd: 0.75 });
  assert.equal(metro.priceCapApplies, true);
  assert.equal(reg.priceCapApplies, true);
  assert.equal(prov.priceCapApplies, false);
  // 20억 주택 → 15~25억 구간이라 4억
  assert.equal(metro.priceCap, 400_000_000);
  assert.equal(prov.priceCap, Infinity);
});

check('수도권 비규제지역은 LTV 70%지만 가격대별 한도에 걸린다', () => {
  // 12억 주택 · LTV 70% = 8.4억이지만 15억 이하 구간 상한 6억으로 잘린다.
  const r = calcMortgageLimit({
    price: 1_200_000_000, region: 'metroNonRegulated', ltvPercent: 70, ownership: 'none',
    income: 400_000_000, rate: 4, stressAdd: 3, termYears: 40, dsrLimitPercent: 40,
  });
  assert.equal(r.binding.key, 'priceCap');
  assert.equal(r.limit, 600_000_000);
});

check('레거시 호출부(regulatedMetro boolean)도 계속 동작한다', () => {
  const a = calcMortgageLimit({
    price: 800_000_000, ltvPercent: 40, regulatedMetro: true,
    income: 60_000_000, rate: 4.5, stressAdd: 3, termYears: 30, dsrLimitPercent: 40,
  });
  assert.equal(a.region.key, 'regulated');
  const b = calcMortgageLimit({
    price: 800_000_000, ltvPercent: 70, regulatedMetro: false,
    income: 60_000_000, rate: 4.5, stressAdd: 0.75, termYears: 30, dsrLimitPercent: 40,
  });
  assert.equal(b.region.key, 'provincialNonRegulated');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 회귀] 새 규제값이 이전보다 한도를 크게 만들지 않는다');
// ─────────────────────────────────────────────────────────────────────

// 이전(잘못된) 모델을 그대로 재현한 참조 구현.
//  규제지역: LTV 50%(생애최초 70%·다주택 0%) · 스트레스 1.5%p · 가격대별 한도 적용
//  비규제:   LTV 70%(생애최초 80%·다주택 60%) · 스트레스 0.75%p · 가격대별 한도 없음
function legacyLimit({ price, regulated, ownership, income, existingAnnualDebt = 0, rate, termYears, dsrLimitPercent, repayType = 'equal' }) {
  const ltvPercent = regulated
    ? (ownership === 'first' ? 70 : (ownership === 'multi' ? 0 : 50))
    : (ownership === 'first' ? 80 : (ownership === 'multi' ? 60 : 70));
  const stressAdd = regulated ? 1.5 : 0.75;
  const ltvLimit = price * (ltvPercent / 100);
  let priceCap = Infinity;
  if (regulated) {
    const eok = price / 1e8;
    priceCap = eok <= 15 ? 600000000 : eok <= 25 ? 400000000 : 200000000;
  }
  const availAnnual = Math.max(0, income * (dsrLimitPercent / 100) - existingAnnualDebt);
  const i = (rate + stressAdd) / 100 / 12;
  const n = termYears * 12;
  const m = i > 0 ? i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1) : 1 / n;
  const factor = repayType === 'principal' ? 12 / n + i * (12 - 66 / n) : m * 12;
  const dsrLimit = availAnnual / factor;
  return Math.max(0, Math.min(ltvLimit, priceCap, dsrLimit));
}

// 지역 3분류를 이전 2분류에 대응시킨다.
//  수도권 비규제 → 이전에는 '비규제'로 취급됐다(가격대별 한도도, 3.0%p 스트레스도 없었다).
const REGION_TO_LEGACY_REGULATED = {
  metroNonRegulated: false,
  regulated: true,
  provincialNonRegulated: false,
};

check('모든 지역×보유×가격 조합에서 새 한도 ≤ 이전 한도', () => {
  const prices = [300_000_000, 800_000_000, 1_200_000_000, 1_800_000_000, 2_600_000_000];
  const incomes = [40_000_000, 80_000_000, 200_000_000, 500_000_000];
  const regions = ['metroNonRegulated', 'regulated', 'provincialNonRegulated'];
  const ownerships = ['none', 'first', 'replace', 'keep1', 'multi'];
  const repayTypes = ['equal', 'principal'];
  let compared = 0;
  for (const price of prices) {
    for (const income of incomes) {
      for (const region of regions) {
        for (const ownership of ownerships) {
          for (const repayType of repayTypes) {
            const ltv = suggestLtvPercent(region, ownership);
            const stress = suggestStressAdd(region, 'variable');
            const now = calcMortgageLimit({
              price, region, ownership, ltvPercent: ltv.value, stressAdd: stress.value,
              income, existingAnnualDebt: 0, rate: 4.5, termYears: 30,
              dsrLimitPercent: 40, repayType,
            });
            // keep1은 이전 모델에 없던 구분이라 '다주택'과 같게 본다(가장 관대한 쪽으로 비교).
            const legacyOwnership = ownership === 'keep1' ? 'multi' : ownership;
            const before = legacyLimit({
              price, regulated: REGION_TO_LEGACY_REGULATED[region], ownership: legacyOwnership,
              income, rate: 4.5, termYears: 30, dsrLimitPercent: 40, repayType,
            });
            assert.ok(
              now.limit <= before + 1, // 1원 오차 허용(부동소수점)
              `과대 산출: ${region}/${ownership}/${repayType} 가격 ${price} 소득 ${income} — 신 ${Math.round(now.limit)} > 구 ${Math.round(before)}`,
            );
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared >= 500, `비교 케이스가 ${compared}개뿐입니다.`);
});

check('대표 시나리오 — 규제지역 10억 주택 무주택자 한도가 줄었다', () => {
  const args = {
    price: 1_000_000_000, income: 200_000_000, rate: 4.5,
    termYears: 30, dsrLimitPercent: 40, repayType: 'equal',
  };
  const now = calcMortgageLimit({ ...args, region: 'regulated', ownership: 'none', ltvPercent: 40, stressAdd: 3 });
  const before = legacyLimit({ ...args, regulated: true, ownership: 'none' });
  assert.ok(now.limit < before, `줄어들지 않았습니다: ${now.limit} vs ${before}`);
  // LTV 40% = 4억이 결정 요인이어야 한다(이전에는 50% = 5억).
  assert.equal(now.binding.key, 'ltv');
  assert.equal(Math.round(now.ltvLimit), 400_000_000);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출] 결과 항목 구분 · 경과규정');
// ─────────────────────────────────────────────────────────────────────

check('결과를 법정·확정 / 사용자 입력 / 추정으로 구분한다', () => {
  const r = calcMortgageLimit({
    price: 800_000_000, region: 'regulated', ownership: 'none', ltvPercent: 40,
    income: 80_000_000, rate: 4.5, stressAdd: 3, termYears: 30, dsrLimitPercent: 40,
  });
  const c = r.classification;
  assert.ok(c.statutory.length > 0 && c.userInput.length > 0);
  assert.ok(c.statutory.some((i) => i.key === 'ltv'), '기준값 그대로면 LTV는 법정 항목이어야 합니다.');
  // 직접 입력하면 추정 항목으로 옮겨간다.
  const custom = calcMortgageLimit({
    price: 800_000_000, region: 'regulated', ownership: 'none', ltvPercent: 55,
    income: 80_000_000, rate: 4.5, stressAdd: 3, termYears: 30, dsrLimitPercent: 40,
  });
  assert.ok(custom.classification.estimated.some((i) => i.key === 'ltv'));
});

check('경과규정·대환은 자동 판정하지 않고 사용자 선택을 그대로 표시한다', () => {
  const r = calcMortgageLimit({
    price: 800_000_000, region: 'regulated', ownership: 'none', ltvPercent: 40,
    income: 80_000_000, rate: 4.5, stressAdd: 3, termYears: 30, dsrLimitPercent: 40,
    grandfather: 'preContract',
  });
  assert.equal(r.grandfatherActive, true);
  assert.ok(r.grandfatherOption && r.grandfatherOption.label.includes('2025.10.15'));
  // 선택했다고 한도를 바꾸지는 않는다(은행이 증빙으로 판정하는 사항).
  const plain = calcMortgageLimit({
    price: 800_000_000, region: 'regulated', ownership: 'none', ltvPercent: 40,
    income: 80_000_000, rate: 4.5, stressAdd: 3, termYears: 30, dsrLimitPercent: 40,
  });
  assert.equal(r.limit, plain.limit);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출] 페이지·공통엔진 일관성');
// ─────────────────────────────────────────────────────────────────────

check('대출 한도 페이지에 3분류 지역·금리유형·경과규정 입력이 있다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/loan-limit.html', import.meta.url), 'utf8');
  for (const needle of [
    'value="metroNonRegulated"', 'value="regulated"', 'value="provincialNonRegulated"',
    'name="rateType"', 'name="grandfather"', 'value="keep1"',
    'data-out="mAppliedRule"', 'data-out="mRuleNotes"', 'data-out="mClassify"',
  ]) {
    assert.ok(html.includes(needle), `대출 한도 페이지에 ${needle}이(가) 없습니다.`);
  }
});

check('종합계산기가 자체 LTV·스트레스 분기를 두지 않고 공통 함수를 쓴다', () => {
  const start = appSource.indexOf('function renderMortgageLimit(');
  const end = appSource.indexOf('\n    function calcSale()', start);
  const block = appSource.slice(start, end);
  assert.match(block, /suggestLtvPercent\(/);
  assert.match(block, /suggestStressAdd\(/);
  assert.doesNotMatch(block, /ltv\.regulatedFirst|stress\.metro|nonRegulatedFirst/,
    '종합계산기에 자체 LTV·스트레스 분기가 남아 있습니다.');
});

check('rates.js에 구 키(ltv.regulated 50 / stress.metro 1.5)가 남아 있지 않다', () => {
  assert.equal(RATES.loan.ltv, undefined, 'loan.ltv 구 구조가 남아 있습니다.');
  assert.equal(RATES.loan.stress.metro, undefined, 'stress.metro 구 키가 남아 있습니다.');
  assert.ok(RATES.loan.ltvByRegion && RATES.loan.stress.byRegion);
});

check('대출 규정 블록에 근거·검토일·시행일 메타데이터가 있다', () => {
  for (const field of ['effectiveFrom', 'reviewedAt', 'jurisdiction', 'confidence', 'source']) {
    assert.ok(RATES.loan[field], `loan.${field}가 없습니다.`);
  }
  assert.equal(RATES.loan.effectiveFrom, '2025-10-16', '10·15 대책 시행일이 반영돼야 합니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출] 적용 대상 요건 — 어떤 대출에 붙는 규제인지');
// ─────────────────────────────────────────────────────────────────────

check('차주단위 DSR 적용 문턱(총 대출 1억원 초과)이 기준정보에 있다', () => {
  const app = RATES.dsr.applicability;
  assert.ok(app, 'dsr.applicability 블록이 없습니다.');
  assert.equal(app.totalDebtThreshold, 100_000_000);
  // 계산은 보수적으로 항상 적용한다 — 요건 미해당 시 실제 한도가 더 높은 쪽이라 안전하다.
  assert.equal(app.alwaysAppliedInCalculator, true);
  assert.ok(Array.from(app.excludedFromDsr).length >= 3, 'DSR 산정 제외 대출 목록이 없습니다.');
  for (const field of ['effectiveFrom', 'reviewedAt', 'jurisdiction', 'confidence', 'source']) {
    assert.ok(app[field], `dsr.applicability.${field}가 없습니다.`);
  }
});

check('전세대출·중도금대출이 DSR 산정 제외 목록에 있다', () => {
  const list = Array.from(RATES.dsr.applicability.excludedFromDsr).join(' ');
  assert.match(list, /전세자금대출/);
  assert.match(list, /중도금/);
});

check('스트레스 DSR 적용 대상·제외 범위가 명시돼 있다', () => {
  const scope = RATES.loan.stress.scope;
  assert.ok(scope, 'stress.scope 블록이 없습니다.');
  const applies = Array.from(scope.appliesTo).join(' ');
  assert.match(applies, /주택담보대출/);
  assert.match(applies, /신용대출/);
  // 신용대출 스트레스는 잔액 1억원 초과분에만 붙는다.
  assert.equal(scope.creditLoanStressThreshold, 100_000_000);
  const excluded = Array.from(scope.excluded).join(' ');
  assert.match(excluded, /전세자금대출/);
  assert.match(excluded, /정책대출/);
});

check('가격대별 한도·LTV 하향이 주택구입 목적에만 적용됨을 밝힌다', () => {
  const scope = RATES.loan.purposeScope;
  assert.ok(scope, 'loan.purposeScope 블록이 없습니다.');
  assert.match(scope.covered, /주택구입 목적/);
  const excluded = Array.from(scope.excluded).join(' ');
  for (const needle of ['생활안정자금', '이주비', '중도금', '전세자금대출', '정책대출']) {
    assert.ok(excluded.includes(needle), `${needle}가 적용 제외 목록에 없습니다.`);
  }
  assert.ok(scope.source, '근거가 없습니다.');
});

check('DSR 적용을 임의로 끄지 않는다 (보수적 유지)', () => {
  // 요건 미해당을 자동 판정해 DSR을 빼면 한도가 커진다 — 그 방향은 사용자 손해로 이어진다.
  // 계산기는 항상 세 한도의 최소값을 쓰고, 요건은 안내로만 밝힌다.
  const r = calcMortgageLimit({
    price: 300_000_000, region: 'provincialNonRegulated', ownership: 'none', ltvPercent: 70,
    income: 30_000_000, rate: 4.5, stressAdd: 0.75, termYears: 30, dsrLimitPercent: 40,
  });
  assert.equal(r.binding.key, 'dsr', '소액·저소득에서도 DSR이 계산에 살아 있어야 합니다.');
  assert.ok(r.limit < r.ltvLimit);
});

check('대출 한도 페이지가 적용 대상 요건을 화면에 밝힌다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/loan-limit.html', import.meta.url), 'utf8');
  for (const needle of [
    '어떤 대출에 적용되는 규제인가', '생활안정자금', '이주비대출', '중도금대출',
    '총 대출액이 1억원을 넘을 때', '잔액 1억원을 넘는 경우에만',
  ]) {
    assert.ok(html.includes(needle), `대출 한도 페이지에 「${needle}」 안내가 없습니다.`);
  }
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 P0-④] 판정 기준값은 매매가가 아니라 「시가」');
// ─────────────────────────────────────────────────────────────────────

check('시가 기준임이 기준정보에 명시돼 있다', () => {
  const v = RATES.loan.valuationBasis;
  assert.ok(v, 'loan.valuationBasis 블록이 없습니다.');
  assert.equal(v.isPurchasePrice, false);
  assert.match(Array.from(v.sources).join(' '), /KB/);
  assert.ok(v.fallbackNote, '매매가로 대체했을 때의 경고 문구가 없습니다.');
  assert.ok(v.source, '근거가 없습니다.');
});

check('실제 사례 — 매매가 15.65억, 신청일 시가 15억이면 6억 구간이다', () => {
  // 사용자 제보로 확인된 오류: 매매가로 판정하면 15~25억 구간(4억)에 잘못 걸려
  // 한도가 2억 깎였다. 판정은 대출 신청일 기준 시가로 해야 한다.
  const args = {
    region: 'regulated', ownership: 'none', ltvPercent: 40, income: 119_000_000,
    existingAnnualDebt: 0, rate: 3.83, stressAdd: 3, termYears: 30,
    dsrLimitPercent: 40, repayType: 'principal',
  };
  const byPurchasePrice = calcMortgageLimit({ ...args, price: 1_565_000_000 });
  const byMarketValue = calcMortgageLimit({ ...args, price: 1_500_000_000 });
  assert.equal(byPurchasePrice.priceCap, 400_000_000, '매매가 기준이면 4억 구간');
  assert.equal(byMarketValue.priceCap, 600_000_000, '시가 15억이면 6억 구간이어야 합니다.');
  assert.ok(byMarketValue.limit > byPurchasePrice.limit,
    '시가로 판정하면 한도가 더 커야 합니다.');
});

check('종합계산기가 매매가가 아니라 KB시세로 한도를 판정한다', () => {
  const start = appSource.indexOf('const mortgageBox = root.querySelector(\'[data-mortgage-limit-box]\')');
  const block = appSource.slice(start, start + 900);
  assert.match(block, /getN\('kbPrice'\)/, '종합계산기가 KB시세 입력을 읽지 않습니다.');
  assert.match(block, /kbPrice > 0 \? kbPrice : price/, '시가 우선 판정이 아닙니다.');
  const html = fs.readFileSync(new URL('../site/calculators/total-cost-dashboard.html', import.meta.url), 'utf8');
  assert.ok(html.includes('name="kbPrice"'), '종합계산기에 KB시세 입력이 없습니다.');
});

check('대출 한도 페이지가 매매가를 넣지 말라고 안내한다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/loan-limit.html', import.meta.url), 'utf8');
  assert.ok(html.includes('매매가를 넣지 마세요'), '매매가 오입력 경고가 없습니다.');
  assert.ok(html.includes('대출 신청일 기준 시가'), '판정 기준 안내가 없습니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 검증] 금융위 공표 예시와 대조');
// ─────────────────────────────────────────────────────────────────────
// 우리 계산을 우리 가정으로만 검증하면 틀린 가정을 계속 통과시킨다. 규제 당국이
// 숫자를 직접 공표한 사례가 있으면 그게 가장 강한 기준점이다.
//
//   금융위 「대출수요 관리 방안」(2025.10.15) 보도 예시
//   "연 소득 1억원 차주가 수도권에서 **변동금리**로 주담대를 받는 경우,
//    한도가 5억 8,700만원 → 5억 100만원 (약 14.7% 감소)"
//
// 앞 숫자가 스트레스 1.5%p, 뒤 숫자가 3.0%p 일 때의 한도다. 두 값을 동시에
// 재현하는 조합을 역산하면 원리금균등 30년 · 금리 4.00% 하나로 좁혀진다
// (2026-08-03 탐색). 그 전제에서 우리 엔진이 공표값과 일치하는지 고정한다.
//
// 이 테스트가 깨지면 둘 중 하나다 — 스트레스 가산값이 틀렸거나, DSR 원리금
// 산식이 틀렸다. 둘 다 한도를 통째로 어긋나게 하는 것들이다.
const FSC_EXAMPLE = {
  price: 5_000_000_000,      // 담보가 아니라 DSR 이 한도를 정하도록 크게 둔다
  ltvPercent: 100,
  region: 'regulated', ownership: 'none',
  income: 100_000_000, existingAnnualDebt: 0,
  rate: 4.0, termYears: 30, dsrLimitPercent: 40, repayType: 'equal',
};

check('금융위 예시 — 스트레스 3.0%p 에서 한도 5억 100만원', () => {
  const r = calcMortgageLimit({ ...FSC_EXAMPLE, stressAdd: 3.0 });
  const diff = Math.abs(r.dsrLimit - 501_000_000) / 501_000_000;
  assert.ok(diff < 0.005,
    `금융위 공표 5억 100만원과 어긋납니다: ${Math.round(r.dsrLimit).toLocaleString()}원`);
});

check('금융위 예시 — 종전 스트레스 1.5%p 에서 한도 5억 8,700만원', () => {
  const r = calcMortgageLimit({ ...FSC_EXAMPLE, stressAdd: 1.5 });
  const diff = Math.abs(r.dsrLimit - 587_000_000) / 587_000_000;
  assert.ok(diff < 0.005,
    `금융위 공표 5억 8,700만원과 어긋납니다: ${Math.round(r.dsrLimit).toLocaleString()}원`);
});

check('금융위 예시 — 감소폭이 공표치(약 14.7%)와 맞는다', () => {
  const after = calcMortgageLimit({ ...FSC_EXAMPLE, stressAdd: 3.0 }).dsrLimit;
  const before = calcMortgageLimit({ ...FSC_EXAMPLE, stressAdd: 1.5 }).dsrLimit;
  const drop = (before - after) / before * 100;
  assert.ok(Math.abs(drop - 14.7) < 0.5, `감소폭 ${drop.toFixed(1)}% (공표 14.7%)`);
});

check('상환방식이 DSR 한도를 바꾼다 — 원금균등이 원리금균등보다 낮다', () => {
  // 원금균등은 첫해 원금상환액이 커서 DSR 이 먼저 찬다. 같은 조건에서 원리금균등보다
  // 한도가 낮게 나오는 게 정상이며, 이 차이를 모르면 "계산기가 실제보다 적게 준다"로
  // 읽힌다(실사용자 문의, 2026-08-03). 방향이 뒤집히면 산식이 잘못된 것이다.
  const base = { ...FSC_EXAMPLE, stressAdd: 3.0 };
  const equal = calcMortgageLimit({ ...base, repayType: 'equal' }).dsrLimit;
  const principal = calcMortgageLimit({ ...base, repayType: 'principal' }).dsrLimit;
  assert.ok(principal < equal,
    `원금균등(${Math.round(principal).toLocaleString()})이 원리금균등(${Math.round(equal).toLocaleString()})보다 높습니다.`);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 P0-⑤] 스트레스 DSR이 결과에 영향을 줬는지 표시');
// ─────────────────────────────────────────────────────────────────────

check('가격대별 한도가 결정 요인이면 스트레스 영향은 0이다', () => {
  const r = calcMortgageLimit({
    price: 1_565_000_000, region: 'regulated', ownership: 'none', ltvPercent: 40,
    income: 119_000_000, existingAnnualDebt: 0, rate: 3.83, stressAdd: 3,
    termYears: 30, dsrLimitPercent: 40, repayType: 'principal',
  });
  assert.equal(r.binding.key, 'priceCap');
  assert.equal(r.stressAffectsLimit, false, '스트레스가 한도를 바꾸지 않았는데 영향 있다고 표시됩니다.');
  assert.equal(r.stressImpact, 0);
  assert.equal(r.limitWithoutStress, r.limit);
});

check('DSR이 결정 요인이면 스트레스가 깎은 금액을 알려준다', () => {
  const r = calcMortgageLimit({
    price: 1_500_000_000, region: 'regulated', ownership: 'none', ltvPercent: 40,
    income: 119_000_000, existingAnnualDebt: 0, rate: 3.83, stressAdd: 3,
    termYears: 30, dsrLimitPercent: 40, repayType: 'principal',
  });
  assert.equal(r.binding.key, 'dsr');
  assert.equal(r.stressAffectsLimit, true);
  assert.ok(r.stressImpact > 0);
  assert.ok(r.limitWithoutStress > r.limit);
});

check('순수 고정금리는 스트레스 가산이 0이라 한도가 줄지 않는다', () => {
  const args = {
    price: 1_500_000_000, region: 'regulated', ownership: 'none', ltvPercent: 40,
    income: 119_000_000, existingAnnualDebt: 0, rate: 3.83, termYears: 30,
    dsrLimitPercent: 40, repayType: 'principal',
  };
  const fixedStress = suggestStressAdd('regulated', 'fixed').value;
  assert.equal(fixedStress, 0);
  const fixed = calcMortgageLimit({ ...args, rateType: 'fixed', stressAdd: fixedStress });
  const variable = calcMortgageLimit({ ...args, rateType: 'variable', stressAdd: 3 });
  assert.equal(fixed.stressAffectsLimit, false);
  assert.ok(fixed.limit > variable.limit, '고정금리 한도가 변동금리보다 커야 합니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[대출 P0-⑥] DSR 산정 제외 대출 — 유가증권담보대출');
// ─────────────────────────────────────────────────────────────────────

check('유가증권(주식)담보대출이 DSR 산정 제외 목록에 있다', () => {
  const list = Array.from(RATES.dsr.applicability.excludedFromDsr).join(' ');
  assert.match(list, /유가증권/);
  assert.match(list, /주식/);
});

check('종합계산기가 주식·예적금 담보대출을 DSR에 산입하지 않는다', () => {
  const start = appSource.indexOf('function otherLoanSpec(type)');
  const end = appSource.indexOf('function updateOtherLoanRow(', start);
  const block = appSource.slice(start, end);
  // 과거엔 'stock'을 a/8 + 이자로 산입해 DSR을 부풀렸다.
  assert.doesNotMatch(block, /case 'stock': return \[function \(a\) \{ return a \/ 8; \}/,
    '주식담보대출이 여전히 DSR에 산입됩니다.');
  for (const key of ["case 'deposit'", "case 'stock'"]) {
    const i = block.indexOf(key);
    assert.ok(i >= 0, `${key}가 없습니다.`);
    const line = block.slice(i, block.indexOf('\n', i));
    assert.match(line, /return 0;/, `${key}의 원금 산입이 0이 아닙니다.`);
    assert.match(line, /false, true\]/, `${key}에 DSR 제외 플래그가 없습니다.`);
  }
  // 제외 플래그가 켜지면 이자도 산입하지 않아야 한다.
  const rowStart = appSource.indexOf('function updateOtherLoanRow(');
  const rowBlock = appSource.slice(rowStart, appSource.indexOf('function otherLoansTotal(', rowStart));
  assert.match(rowBlock, /dsrExempt \? 0 : amount \* rate/, '제외 대출의 이자가 여전히 산입됩니다.');
});

console.log(`\n대출 한도 회귀 테스트 ${passed}개 통과\n`);
