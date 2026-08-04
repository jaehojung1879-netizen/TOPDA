/*
 * 등기·법무사 비용 + 국민주택채권 데이터 상태 회귀 테스트
 * -----------------------------------------------------------------------
 * 막으려는 것:
 *  ① 법무사 "기본보수"에 대행수수료·실비를 섞어 실제 청구액처럼 보여주는 것
 *  ② 10억 초과 금액에 0.05%를 끝까지 적용해 20억·200억 구간을 빠뜨리는 것
 *  ③ 등기신청 수수료를 15,000원 한 값으로 고정하는 것
 *  ④ 시가표준액 추정(매매가×70%)을 법정값처럼 조용히 쓰는 것
 *  ⑤ seed·수집실패 상태의 채권 할인율을 '실시간 조회값'으로 표시하는 것
 *  ⑥ 등기 계산기와 종합계산기가 서로 다른 산식을 갖는 것
 *
 * 실행: node scripts/check_registration_cost.mjs
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

const context = vm.createContext({ window: { TOPDA_RATES: RATES }, Date });
vm.runInContext(
  [
    functionBlock('// 인지세 (인지세법 제3조) — 계약금액 구간별 정액', '\n// ===== Transfer Tax'),
    'globalThis.cores = { calcStampDuty, calcBondPurchaseRate, calcScrivenerBaseFee,'
      + ' calcRegistrationCost, applyBondDiscountRate };',
  ].join('\n'),
  context,
);
const {
  calcStampDuty, calcBondPurchaseRate, calcScrivenerBaseFee,
  calcRegistrationCost, applyBondDiscountRate,
} = context.cores;

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log('  ✓ ' + name); };
const won = (n) => Math.round(n).toLocaleString('ko-KR');

// ─────────────────────────────────────────────────────────────────────
console.log('\n[등기 P0-①] 법무사 기본보수 구간 — 20억·200억 초과 추가');
// ─────────────────────────────────────────────────────────────────────

check('검증된 구간(10억 이하)의 누적 기초금액이 협회 보수표와 일치한다', () => {
  // 상속등기 실무 자료로 확인된 값: 1억 26만 / 3억 44만 / 5억 60만
  assert.equal(calcScrivenerBaseFee(50_000_000).fee, 210_000);
  assert.equal(calcScrivenerBaseFee(100_000_000).fee, 260_000);
  assert.equal(calcScrivenerBaseFee(300_000_000).fee, 440_000);
  assert.equal(calcScrivenerBaseFee(500_000_000).fee, 600_000);
  assert.equal(calcScrivenerBaseFee(1_000_000_000).fee, 950_000);
});

check('20억 초과·200억 초과 구간이 존재한다', () => {
  const bounds = Array.from(RATES.registration.scrivenerBaseFee.brackets).map((b) => b.upTo);
  assert.ok(bounds.includes(2_000_000_000), '20억 구간이 없습니다.');
  assert.ok(bounds.includes(20_000_000_000), '200억 구간이 없습니다.');
});

check('10억 초과 금액에 0.05%를 끝까지 적용하지 않는다', () => {
  // 구 산식: 950,000 + (가액 − 10억) × 0.05%
  const legacy = (price) => Math.round((950_000 + (price - 1_000_000_000) * 0.0005) / 1000) * 1000;
  // 20억까지는 0.05%가 맞으므로 같아야 하고,
  assert.equal(calcScrivenerBaseFee(2_000_000_000).fee, legacy(2_000_000_000));
  // 20억을 넘으면 요율이 낮아져 구 산식보다 작아야 한다.
  for (const price of [3_000_000_000, 10_000_000_000, 50_000_000_000]) {
    assert.ok(
      calcScrivenerBaseFee(price).fee < legacy(price),
      `${won(price)}원에서 구 산식(${won(legacy(price))})보다 작아야 합니다: ${won(calcScrivenerBaseFee(price).fee)}`,
    );
  }
});

check('20억 초과 구간은 미검증(needs-verification)으로 표시된다', () => {
  assert.equal(calcScrivenerBaseFee(1_500_000_000).unverified, false);
  const over = calcScrivenerBaseFee(5_000_000_000);
  assert.equal(over.unverified, true);
  assert.ok(over.unverifiedNote, '미검증 구간에는 안내 문구가 있어야 합니다.');
});

check('부동산이 여러 개면 초과 1개마다 2만원이 가산된다', () => {
  const one = calcScrivenerBaseFee(300_000_000, { propertyCount: 1 }).fee;
  const three = calcScrivenerBaseFee(300_000_000, { propertyCount: 3 }).fee;
  assert.equal(three - one, 40_000);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[등기 P0-②] 기본보수 / 대행료 / 실비 / 부가세 분리');
// ─────────────────────────────────────────────────────────────────────

const base = {
  price: 800_000_000, stdValue: 500_000_000, asset: 'house', region: 'metro',
  discountPct: 15, filingMethod: 'visit',
};

check('대행료는 위임한 업무만 더해진다', () => {
  const none = calcRegistrationCost({ ...base, agencyTasks: [] });
  assert.equal(none.agencyFeeMin, 0);
  const both = calcRegistrationCost({ ...base, agencyTasks: ['acqTaxFiling', 'bondAgency'] });
  assert.equal(both.agencyFeeMin, 90_000); // 50,000 + 40,000
  assert.equal(both.agencyFeeItems.length, 2);
});

check('기본보수와 대행료가 하나의 값으로 합쳐지지 않는다', () => {
  const r = calcRegistrationCost({ ...base, agencyTasks: ['acqTaxFiling', 'bondAgency'] });
  assert.equal(r.scrivenerBase, calcScrivenerBaseFee(800_000_000).fee);
  assert.ok(r.agencyFeeMin > 0);
  assert.notEqual(r.scrivenerBase, r.scrivenerSubtotalMin, '기본보수와 총 법무사비용이 같으면 분리가 안 된 것입니다.');
});

check('부가세는 법무사 보수 합계에만 붙고 세금·실비에는 붙지 않는다', () => {
  const r = calcRegistrationCost({ ...base, agencyTasks: ['acqTaxFiling'], fieldwork: 'under4h', extraExpense: 30_000 });
  const expectedSubtotal = r.scrivenerBase + 50_000 + 80_000 + 30_000;
  assert.equal(r.scrivenerSubtotalMin, expectedSubtotal);
  assert.equal(r.vatMin, Math.round(expectedSubtotal * 0.10));
  // 인지세·등기수수료·채권부담은 부가세 대상이 아니므로 총액 = 고정분 + 보수분 + 부가세
  assert.equal(r.totalMin, r.stamp + r.filingFee + r.bondSelfPay + expectedSubtotal + r.vatMin);
});

check('정액이 확인되지 않은 대행료는 단일값이 아니라 범위로 나온다', () => {
  const r = calcRegistrationCost({ ...base, agencyTasks: ['tradeReport'] });
  const item = r.agencyFeeItems.find((a) => a.key === 'tradeReport');
  assert.equal(item.isRange, true);
  assert.ok(item.max > item.min);
  assert.equal(r.isRange, true, '범위 항목이 있으면 총액도 범위여야 합니다.');
  assert.ok(r.totalMax > r.totalMin);
});

check('셀프 등기는 기본보수·대행료·실비·부가세가 모두 0이다', () => {
  const r = calcRegistrationCost({ ...base, self: true, agencyTasks: ['acqTaxFiling'], fieldwork: 'over4h', extraExpense: 50_000 });
  assert.equal(r.scrivenerBase, 0);
  assert.equal(r.agencyFeeMin, 0);
  assert.equal(r.fieldworkFee, 0);
  assert.equal(r.vatMin, 0);
  // 세금·수수료는 그대로 발생한다.
  assert.ok(r.stamp > 0 && r.filingFee > 0);
});

check('실제 견적을 입력하면 보수표 상한 대신 그 값을 쓴다', () => {
  const r = calcRegistrationCost({ ...base, agencyTasks: [], scrivenerQuote: 400_000 });
  assert.equal(r.scrivenerBase, 400_000);
  assert.equal(r.scrivenerBaseIsQuote, true);
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[등기 P0-③] 등기신청 수수료 — 신청 방식별');
// ─────────────────────────────────────────────────────────────────────

check('신청 방식별 금액이 기준정보에 남아 있고 방문이 가장 보수적이다', () => {
  // 화면에서는 고르게 하지 않지만, 엔진·기준정보에는 방식별 금액을 유지한다
  // (나중에 다시 노출하거나 다른 계산기가 쓸 수 있어야 하므로).
  const visit = calcRegistrationCost({ ...base, filingMethod: 'visit' }).filingFee;
  const eform = calcRegistrationCost({ ...base, filingMethod: 'eform' }).filingFee;
  assert.equal(visit, 18_000);   // 2025.8.1 인상 (수수료규칙 제5조의2)
  assert.equal(eform, 15_000);
  assert.ok(visit > eform, '기본값(방문)이 가장 비싼 쪽이어야 보수적입니다.');
});

check('금액을 확인하지 못한 전자신청은 선택지에 넣지 않는다', () => {
  // 확인 안 된 값(12,000원 추정)을 띄워봐야 e-Form과 3,000원 차이라 총액에 거의 영향이
  // 없는데, "확인 못 한 값"을 화면에 남기는 비용만 든다. 보수적으로 뺀다.
  const keys = Array.from(RATES.registration.filingFee.methods).map((m) => m.key).join(',');
  assert.equal(keys, 'visit,eform');
  assert.ok(RATES.registration.filingFee.omittedNote, '제외 사유 안내가 없습니다.');
  // 알 수 없는 방식을 넘기면 가장 보수적인(가장 비싼) 기본값으로 떨어져야 한다.
  const unknown = calcRegistrationCost({ ...base, filingMethod: 'online' });
  assert.equal(unknown.filingFee, 18_000);
  assert.equal(unknown.filingMethod.key, 'visit');
});

check('부동산 개수만큼 곱해진다', () => {
  const r = calcRegistrationCost({ ...base, filingMethod: 'visit', propertyCount: 3 });
  assert.equal(r.filingFee, 54_000);
});

check('남은 두 방식은 모두 검증된 값이라 경고가 붙지 않는다', () => {
  for (const m of ['visit', 'eform']) {
    const r = calcRegistrationCost({ ...base, filingMethod: m });
    assert.ok(!r.notes.some((n) => n.key === 'filingFee'), `${m}에 불필요한 경고가 있습니다.`);
  }
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[등기 P0-④] 시가표준액 추정 경고');
// ─────────────────────────────────────────────────────────────────────

check('시가표준액 미입력 시 매매가 × 70%를 쓰고 추정임을 표시한다', () => {
  const r = calcRegistrationCost({ ...base, stdValue: 0 });
  assert.equal(r.stdValueEstimated, true);
  assert.equal(r.stdValue, Math.round(800_000_000 * 0.7));
  const note = r.notes.find((n) => n.key === 'stdEstimate');
  assert.ok(note && note.kind === 'warn', '추정 시가표준액 경고가 없습니다.');
  assert.ok(/법령|법정/.test(note.text), '법정값이 아님을 밝혀야 합니다.');
  assert.ok(/추정/.test(note.text), '추정임을 밝혀야 합니다.');
});

check('시가표준액을 입력하면 추정 경고가 사라진다', () => {
  const r = calcRegistrationCost({ ...base, stdValue: 500_000_000 });
  assert.equal(r.stdValueEstimated, false);
  assert.ok(!r.notes.some((n) => n.key === 'stdEstimate'));
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[채권 P0-⑤] 예시값과 실시간 값을 구분한다');
// ─────────────────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

check('seed 데이터는 실시간 값으로 표시하지 않는다', () => {
  const r = applyBondDiscountRate({ seed: true, customer_burden_rate_pct: 15, as_of: '2026-07-17' });
  assert.equal(r.state, 'example');
  assert.equal(r.shouldFill, false, 'seed 값을 입력란에 채워 넣으면 안 됩니다.');
  assert.ok(/실시간 조회 실패/.test(r.message));
  assert.ok(/예시값/.test(r.message));
});

check('수집 실패(파일 없음·파싱 실패)도 예시값으로 처리한다', () => {
  for (const bad of [null, undefined, {}, { customer_burden_rate_pct: 0 }]) {
    const r = applyBondDiscountRate(bad);
    assert.equal(r.state, 'example', JSON.stringify(bad));
    assert.equal(r.shouldFill, false);
  }
});

check('정상 수집값은 실시간으로 표시하고 기준일·수집일을 노출한다', () => {
  const r = applyBondDiscountRate({
    seed: false, customer_burden_rate_pct: 12.34, as_of: today, collected_at: today,
  });
  assert.equal(r.state, 'fresh');
  assert.equal(r.shouldFill, true);
  assert.equal(r.rate, 12.34);
  assert.ok(r.message.includes(today), '적용 기준일이 노출돼야 합니다.');
  assert.ok(/마지막 정상 수집/.test(r.message), '마지막 정상 수집일이 노출돼야 합니다.');
});

check('오래된 값은 직접 입력을 안내한다', () => {
  const old = daysAgo(30);
  const r = applyBondDiscountRate({
    seed: false, customer_burden_rate_pct: 12.34, as_of: old, collected_at: old,
  });
  assert.equal(r.state, 'stale');
  assert.ok(/직접 입력/.test(r.message));
  assert.ok(r.message.includes(old), '마지막 정상 수집일이 노출돼야 합니다.');
  assert.ok(r.ageDays >= 29);
});

check('collected_at이 없으면 오래된 값으로 본다', () => {
  const r = applyBondDiscountRate({ seed: false, customer_burden_rate_pct: 12.34, as_of: today });
  assert.equal(r.state, 'stale');
});

check('rates.js가 할인율을 법정 요율이 아닌 예시값으로 정의한다', () => {
  const b = RATES.bond;
  assert.equal(b.discountDefault, undefined, 'discountDefault(기본값처럼 보이는 이름)가 남아 있습니다.');
  assert.ok(b.exampleDiscountPct != null, 'exampleDiscountPct가 없습니다.');
  assert.equal(b.isExample, true);
  assert.equal(b.confidence, 'market-rate');
});

check('bond_rate.json이 seed 상태를 명시하고 collected_at 필드를 갖는다', () => {
  const j = JSON.parse(fs.readFileSync(new URL('../site/assets/bond_rate.json', import.meta.url), 'utf8'));
  assert.ok('seed' in j, 'seed 필드가 없습니다.');
  assert.ok('collected_at' in j, 'collected_at 필드가 없습니다.');
  // 수집기가 성공 시 collected_at을 기록하도록 돼 있어야 한다.
  const collector = fs.readFileSync(new URL('../_meta/collect_bond_rate.py', import.meta.url), 'utf8');
  assert.match(collector, /"collected_at"/, '수집기가 collected_at을 기록하지 않습니다.');
  assert.match(collector, /"seed": False/, '수집기가 성공 시 seed=False를 기록하지 않습니다.');
});

// ─────────────────────────────────────────────────────────────────────
console.log('\n[등기 P0-⑥] 중복 산식 금지 · 페이지 parity');
// ─────────────────────────────────────────────────────────────────────

check('등기 계산기 페이지에 자체 인지세·채권·법무사 산식이 없다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/registration-cost.html', import.meta.url), 'utf8');
  for (const banned of [
    'function stampDuty', 'function bondRate', 'function scrivenerFee', 'roundBond',
  ]) {
    assert.ok(!html.includes(banned), `등기 페이지에 자체 산식 ${banned}이(가) 남아 있습니다.`);
  }
  assert.ok(html.includes('calcRegistrationCost('), '공통 엔진을 호출하지 않습니다.');
});

check('종합계산기도 자체 산식 없이 공통 엔진을 호출한다', () => {
  const start = appSource.indexOf('function registrationCost(price, std, discount, self, asset, region)');
  assert.ok(start > 0, '종합계산기 registrationCost가 없습니다.');
  const end = appSource.indexOf('\n    function inheritGiftTax(', start);
  const block = appSource.slice(start, end);
  assert.match(block, /calcRegistrationCost\(/);
  assert.doesNotMatch(block, /210000|0\.0009|350000/, '종합계산기에 자체 보수·인지세 산식이 남아 있습니다.');
});

check('등기 계산기와 종합계산기가 같은 입력에 같은 값을 낸다', () => {
  // 종합계산기는 등기 계산기의 기본 선택(취득세 신고 + 채권 매입 대행)과 같은 조건으로 계산한다.
  const page = calcRegistrationCost({
    price: 800_000_000, stdValue: 500_000_000, asset: 'house', region: 'metro',
    discountPct: 15, self: false, filingMethod: 'visit',
    agencyTasks: ['acqTaxFiling', 'bondAgency'], fieldwork: 'none', extraExpense: 0,
  });
  const dashboard = calcRegistrationCost({
    price: 800_000_000, stdValue: 500_000_000, asset: 'house', region: 'metro',
    discountPct: 0.15 * 100, self: false, filingMethod: 'visit',
    agencyTasks: ['acqTaxFiling', 'bondAgency'],
  });
  assert.equal(page.totalMin, dashboard.totalMin);
  assert.equal(page.scrivenerBase, dashboard.scrivenerBase);
  assert.equal(page.bondSelfPay, dashboard.bondSelfPay);
  assert.equal(page.stamp, dashboard.stamp);
});

check('인지세·채권 매입률은 종전 값 그대로다 (회귀)', () => {
  assert.equal(calcStampDuty(5_000_000), 0);
  assert.equal(calcStampDuty(800_000_000), 150_000);
  assert.equal(calcStampDuty(1_500_000_000), 350_000);
  assert.equal(calcBondPurchaseRate(500_000_000, 'house', 'metro'), 0.026);
  assert.equal(calcBondPurchaseRate(500_000_000, 'house', 'other'), 0.024);
  assert.equal(calcBondPurchaseRate(10_000_000, 'house', 'metro'), 0);
});

check('등기 페이지에 방식별 수수료·위임 업무·추정 경고 UI가 있다', () => {
  const html = fs.readFileSync(new URL('../site/calculators/registration-cost.html', import.meta.url), 'utf8');
  for (const needle of [
    'name="agencyTask"', 'name="fieldwork"',
    'name="scrivenerQuote"', 'name="extraExpense"',
    'id="rc-scrivener-total"', 'id="rc-notes"', 'id="rc-classify"',
    '법무사 기본보수 상한', 'value="4"',
  ]) {
    assert.ok(html.includes(needle), `등기 페이지에 ${needle}이(가) 없습니다.`);
  }
  assert.ok(!html.includes('법무사 보수 (추정)'), '“법무사 보수 추정” 표기가 남아 있습니다.');
  // 등기신청 수수료는 방식별 차이가 3,000원 안팎이라 선택지를 두지 않는다 —
  // 고르게 해봐야 총액이 거의 안 바뀌는데 화면만 복잡해진다. 방문(18,000원) 고정.
  assert.ok(!html.includes('name="filingMethod"'), '등기신청 방식 선택지가 남아 있습니다.');
  assert.ok(!html.includes('value="online"'), '확인 못 한 전자신청 선택지가 남아 있습니다.');
  const dash = fs.readFileSync(new URL('../site/calculators/total-cost-dashboard.html', import.meta.url), 'utf8');
  assert.ok(!dash.includes('name="regFilingMethod"'), '종합계산기에 등기신청 방식 선택지가 남아 있습니다.');
});

check('취득세를 쓰는 페이지의 주택 수가 4주택 이상까지 분리돼 있다', () => {
  for (const p of [
    '../site/calculators/registration-cost.html',
    '../site/calculators/acquisition-tax.html',
    '../site/calculators/auction-bid.html',
    '../site/calculators/total-cost-dashboard.html',
    '../site/en/calculators/acquisition-tax.html',
    '../site/en/calculators/auction-bid.html',
    '../site/en/calculators/total-cost-dashboard.html',
  ]) {
    const html = fs.readFileSync(new URL(p, import.meta.url), 'utf8');
    assert.ok(html.includes('name="homes" value="4"'), `${p}에 4주택 이상 선택지가 없습니다.`);
  }
});

console.log(`\n등기·법무사·채권 회귀 테스트 ${passed}개 통과\n`);
