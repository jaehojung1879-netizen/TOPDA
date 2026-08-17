/*
 * Invariant / Property Test — 정답값을 몰라도 반드시 성립해야 하는 성질
 * ===========================================================================
 * 실행: node scripts/check_calc_invariants.mjs
 *
 * golden test 는 "이 입력의 답은 이 숫자"를 고정한다. 그러나 법령에서 단일 정답을
 * 뽑기 어려운 계산(대출 상환·한도 등)이나, 입력 공간이 넓어 대표값 몇 개로는
 * 못 덮는 계산이 있다. 그런 곳은 **불변조건**으로 막는다.
 *
 *  · 단조성:   금리 ↑ → 총이자가 줄면 안 된다
 *  · 연속성:   법령이 연속인 구간에서 1원 차이로 세액이 튀면 안 된다
 *  · 정합성:   같은 입력에 같은 답 (계산기 간 parity — check_calc_parity.mjs)
 *
 * ⚠ 법령 자체가 불연속인 자리(가격대별 한도, 중과 진입 등)는 **예외로 등록**하고
 *   그 근거를 함께 적는다. 등록되지 않은 불연속은 실패로 본다.
 */
import { loadCalcFunctions, makeRunner } from './lib/calc_engine.mjs';

const { fns, rates } = loadCalcFunctions([
  'calcAcquisitionTax', 'calcTransferTax', 'calcProgressiveTax', 'calcBrokerageFee',
  'calcRti', 'calcJeonseMonthly', 'legalConversionCapPct', 'calcSubscriptionScore',
  'calcStampDuty', 'loanRatesCfg', 'RATES_DSR', 'loanRegionConfig', 'suggestLtvPercent',
  'loanPriorRules', 'suggestStressAdd', 'dsrAnnualFactor', 'calcMortgageLimit',
]);

const R = makeRunner('[Invariant] 수학적·경제적 불변조건');

const monotone = (label, xs, f, dir = 'nondecreasing') => {
  let prev = null;
  for (const x of xs) {
    const y = f(x);
    if (!Number.isFinite(y)) throw new Error(`${label}: x=${JSON.stringify(x)} 에서 값이 유한하지 않습니다 (${y})`);
    if (prev != null) {
      const ok = dir === 'nondecreasing' ? y >= prev - 1e-6 : y <= prev + 1e-6;
      if (!ok) throw new Error(`${label}: x=${JSON.stringify(x)} 에서 단조성이 깨졌습니다 (${prev} → ${y})`);
    }
    prev = y;
  }
};

/* ─────────────────────────────────────────────────────────────────────────
 * 1. 대출 상환 — 원리금균등·원금균등
 * ───────────────────────────────────────────────────────────────────────── */

R.check('대출금액 ↑ → 연간 상환액이 줄지 않는다', () => {
  monotone('연간 원리금', [1e8, 2e8, 5e8, 1e9, 2e9],
    (P) => P * fns.dsrAnnualFactor(4, 360, 'equal'));
});

R.check('금리 ↑ → 원리금균등 총이자가 줄지 않는다', () => {
  const P = 5e8, n = 360;
  monotone('총이자', [0, 1, 2, 3, 4, 5, 7, 10],
    (r) => P * fns.dsrAnnualFactor(r, n, 'equal') * (n / 12) - P);
});

R.check('금리 ↑ → 원금균등 총이자가 줄지 않는다', () => {
  const P = 5e8, n = 360;
  monotone('총이자', [0, 1, 2, 3, 4, 5, 7, 10],
    (r) => P * fns.dsrAnnualFactor(r, n, 'principal') * (n / 12) - P);
});

R.check('상환기간 ↑ → 원리금균등 월 상환액이 늘지 않는다', () => {
  const P = 5e8;
  monotone('월 상환액', [120, 180, 240, 300, 360, 420, 480],
    (n) => P * fns.dsrAnnualFactor(4, n, 'equal') / 12, 'nonincreasing');
});

R.check('같은 조건에서 원금균등 총이자 ≤ 원리금균등 총이자', () => {
  for (const rate of [2, 4, 6, 8]) {
    for (const n of [120, 240, 360]) {
      const P = 5e8;
      const eq = P * fns.dsrAnnualFactor(rate, n, 'equal') * (n / 12) - P;
      const pr = P * fns.dsrAnnualFactor(rate, n, 'principal') * (n / 12) - P;
      if (pr > eq + 1) {
        throw new Error(`금리 ${rate}% · ${n}개월: 원금균등 총이자 ${Math.round(pr)} > 원리금균등 ${Math.round(eq)}`);
      }
    }
  }
});

R.check('금리 0%면 총이자도 0', () => {
  const P = 3e8, n = 240;
  for (const type of ['equal', 'principal']) {
    const total = P * fns.dsrAnnualFactor(0, n, type) * (n / 12);
    if (Math.abs(total - P) > 1) throw new Error(`${type}: 총상환 ${total} ≠ 원금 ${P}`);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 2. 대출 한도
 * ───────────────────────────────────────────────────────────────────────── */

const loanBase = {
  price: 1000000000, ltvPercent: 40, region: 'regulated',
  income: 150000000, dsrLimitPercent: 40, rate: 4, stressAdd: 3,
  termYears: 30, repayType: 'equal',
};

R.check('소득 ↑ → 한도가 줄지 않는다', () => {
  monotone('한도', [5e7, 1e8, 1.5e8, 2e8, 3e8, 5e8],
    (income) => fns.calcMortgageLimit({ ...loanBase, income }).limit);
});

R.check('기존 부채 ↑ → 한도가 늘지 않는다', () => {
  monotone('한도', [0, 1e7, 2e7, 3e7, 5e7],
    (existingAnnualDebt) => fns.calcMortgageLimit({ ...loanBase, existingAnnualDebt }).limit, 'nonincreasing');
});

R.check('스트레스 가산금리 ↑ → 한도가 늘지 않는다', () => {
  monotone('한도', [0, 0.75, 1.5, 3.0],
    (stressAdd) => fns.calcMortgageLimit({ ...loanBase, income: 3e8, stressAdd }).limit, 'nonincreasing');
});

R.check('LTV ↑ → 한도가 줄지 않는다', () => {
  monotone('한도', [20, 30, 40, 50, 60, 70],
    (ltvPercent) => fns.calcMortgageLimit({ ...loanBase, income: 5e8, ltvPercent }).limit);
});

R.check('한도는 LTV·가격대별·DSR 한도 중 어느 것도 넘지 않는다', () => {
  for (const income of [5e7, 1e8, 3e8, 1e9]) {
    for (const price of [5e8, 1.4e9, 2e9, 3e9]) {
      const r = fns.calcMortgageLimit({ ...loanBase, price, income });
      for (const key of ['ltvLimit', 'priceCap', 'dsrLimit']) {
        if (r[key] != null && Number.isFinite(r[key]) && r.limit > r[key] + 1) {
          throw new Error(`소득 ${income}·시가 ${price}: limit ${r.limit} > ${key} ${r[key]}`);
        }
      }
    }
  }
});

R.check('한도는 음수가 되지 않는다 (기존 부채가 DSR 여유를 다 써도)', () => {
  const r = fns.calcMortgageLimit({ ...loanBase, income: 5e7, existingAnnualDebt: 1e9 });
  if (r.limit < 0) throw new Error(`한도 ${r.limit} < 0`);
  if (r.dsrLimit < 0) throw new Error(`DSR 한도 ${r.dsrLimit} < 0`);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 3. 취득세
 * ───────────────────────────────────────────────────────────────────────── */

const acq = (o) => fns.calcAcquisitionTax({
  homes: 1, regulated: false, areaOver85: false, firstHome: false, ...o,
});

R.check('취득가액 ↑ → 취득세 총액이 줄지 않는다 (1주택 표준세율 구간 전체)', () => {
  const xs = [];
  for (let p = 1e8; p <= 2e9; p += 2.5e7) xs.push(p);
  monotone('취득세 총액', xs, (price) => acq({ price }).total);
});

R.check('6억·9억 경계에서 세액이 튀지 않는다 (법정 누진식은 연속)', () => {
  for (const edge of [600000000, 900000000]) {
    const before = acq({ price: edge - 1 }).total;
    const at = acq({ price: edge }).total;
    const after = acq({ price: edge + 1 }).total;
    // 1원 차이로 세액이 1만원 넘게 튀면 구간 설계나 반올림이 잘못된 것이다.
    if (Math.abs(at - before) > 10000 || Math.abs(after - at) > 10000) {
      throw new Error(`${edge}원 경계에서 불연속: ${before} → ${at} → ${after}`);
    }
  }
});

R.check('주택 수 ↑ → 같은 조건에서 취득세가 줄지 않는다 (조정대상지역)', () => {
  monotone('취득세', [1, 2, 3, 4, 5],
    (homes) => acq({ price: 800000000, homes, regulated: true }).total);
});

R.check('조정대상지역 다주택 취득세 ≥ 비조정 다주택 취득세', () => {
  for (const homes of [2, 3, 4]) {
    for (const price of [3e8, 6e8, 8e8, 1.5e9]) {
      const reg = acq({ price, homes, regulated: true }).total;
      const non = acq({ price, homes, regulated: false }).total;
      if (reg < non - 1) throw new Error(`${homes}주택 ${price}원: 조정 ${reg} < 비조정 ${non}`);
    }
  }
});

R.check('감면은 세액을 늘리지 않고, 세액을 음수로 만들지도 않는다', () => {
  for (const price of [1e8, 3e8, 5e8, 8e8, 1.2e9]) {
    const plain = acq({ price }).total;
    for (const flag of ['firstHome', 'childbirth']) {
      const r = acq({ price, [flag]: true });
      if (r.total > plain + 1) throw new Error(`${flag} 감면이 세액을 늘렸습니다: ${plain} → ${r.total}`);
      if (r.acquisition < 0 || r.total < 0) throw new Error(`${flag}: 세액이 음수 (${r.total})`);
    }
  }
});

R.check('전용 85㎡ 초과는 농특세만큼만 더 낸다 (본세·교육세는 동일)', () => {
  for (const price of [3e8, 7e8, 1.5e9]) {
    const small = acq({ price });
    const big = acq({ price, areaOver85: true });
    if (Math.abs(big.acquisition - small.acquisition) > 1) throw new Error('면적이 본세를 바꿨습니다.');
    if (Math.abs(big.localEduTax - small.localEduTax) > 1) throw new Error('면적이 지방교육세를 바꿨습니다.');
    if (big.ruralTax <= 0) throw new Error('85㎡ 초과인데 농특세가 0입니다.');
    if (small.ruralTax !== 0) throw new Error('85㎡ 이하인데 농특세가 붙었습니다.');
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 4. 양도소득세
 * ───────────────────────────────────────────────────────────────────────── */

const tt = (o) => fns.calcTransferTax({
  sellPrice: 1000000000, buyPrice: 500000000, cost: 0,
  holdYears: 5, liveYears: 0, homes: 2, onlyHome: false, regulated: false, ...o,
});

R.check('양도가액 ↑ → 양도세가 줄지 않는다 (다주택·비과세 없음)', () => {
  const xs = [];
  for (let p = 6e8; p <= 3e9; p += 5e7) xs.push(p);
  monotone('양도세', xs, (sellPrice) => tt({ sellPrice }).total);
});

R.check('필요경비 ↑ → 양도세가 늘지 않는다', () => {
  monotone('양도세', [0, 1e7, 3e7, 5e7, 1e8, 2e8],
    (cost) => tt({ cost }).total, 'nonincreasing');
});

R.check('취득가액 ↑ → 양도세가 늘지 않는다', () => {
  monotone('양도세', [1e8, 3e8, 5e8, 7e8, 9e8],
    (buyPrice) => tt({ buyPrice }).total, 'nonincreasing');
});

R.check('보유기간 ↑ → 장기보유특별공제율이 줄지 않는다', () => {
  monotone('장특공률', [0, 1, 2, 3, 5, 8, 10, 12, 15, 20],
    (holdYears) => tt({ holdYears }).ltDeductRate);
});

R.check('장기보유특별공제율은 표1 상한 30%, 표2 상한 80%를 넘지 않는다', () => {
  for (const holdYears of [3, 5, 10, 15, 20, 30]) {
    const t1 = tt({ holdYears }).ltDeductRate;
    if (t1 > 0.30 + 1e-9) throw new Error(`표1 공제율 ${t1} > 30%`);
    const t2 = fns.calcTransferTax({
      sellPrice: 2e9, buyPrice: 1e9, cost: 0, holdYears, liveYears: holdYears,
      homes: 1, onlyHome: true, regulated: false,
    }).ltDeductRate;
    if (t2 > 0.80 + 1e-9) throw new Error(`표2 공제율 ${t2} > 80%`);
  }
});

R.check('보유 1년·2년 경계에서 세율이 낮아지는 방향으로만 바뀐다', () => {
  const at = (holdYears) => tt({ holdYears, homes: 1 });
  const y0 = at(0), y1 = at(1), y2 = at(2);
  if (!(y0.total >= y1.total)) throw new Error(`1년 미만(${y0.total}) < 1~2년(${y1.total})`);
  if (!(y1.total >= y2.total)) throw new Error(`1~2년(${y1.total}) < 2년 이상(${y2.total})`);
});

R.check('12억 경계에서 1세대1주택 세액이 급등하지 않는다 (안분 과세는 연속)', () => {
  const one = (sellPrice) => fns.calcTransferTax({
    sellPrice, buyPrice: 700000000, cost: 0, holdYears: 5, liveYears: 5,
    homes: 1, onlyHome: true, regulated: false,
  }).total;
  const before = one(1200000000);
  const after = one(1200000001);
  if (after - before > 1000) throw new Error(`12억 경계에서 세액이 ${after - before}원 급등했습니다.`);
});

R.check('중과 대상은 장기보유특별공제가 배제된다', () => {
  const heavy = tt({ regulated: true, homes: 3, holdYears: 10 });
  if (heavy.ltDeductRate !== 0) throw new Error(`중과인데 장특공 ${heavy.ltDeductRate}`);
});

R.check('중과세율이 붙으면 세액이 일반세율보다 크다', () => {
  const plain = tt({ regulated: false, homes: 3, holdYears: 10 }).total;
  const heavy = tt({ regulated: true, homes: 3, holdYears: 10 }).total;
  if (heavy <= plain) throw new Error(`중과 ${heavy} ≤ 일반 ${plain}`);
});

R.check('세액이 양도차익을 넘지 않는다 (실효세율 100% 초과 방지)', () => {
  for (const homes of [1, 2, 3]) {
    for (const holdYears of [0, 1, 3, 10]) {
      for (const regulated of [true, false]) {
        const r = tt({ homes, holdYears, regulated });
        if (r.total > r.rawGain + 1) {
          throw new Error(`${homes}주택·${holdYears}년·조정 ${regulated}: 세액 ${Math.round(r.total)} > 양도차익 ${Math.round(r.rawGain)}`);
        }
      }
    }
  }
});

R.check('양도차익이 0 이하면 세액도 0', () => {
  for (const sellPrice of [3e8, 5e8]) {
    const r = tt({ sellPrice, buyPrice: 5e8, cost: 1e8, homes: 3, regulated: true });
    if (r.total !== 0) throw new Error(`차익 없는데 세액 ${r.total}`);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 5. 중개보수
 * ───────────────────────────────────────────────────────────────────────── */

R.check('거래금액 ↑ → 중개보수가 줄지 않는다', () => {
  for (const type of ['sale', 'jeonse']) {
    const xs = [];
    for (let a = 1e7; a <= 2e9; a += 1e7) xs.push(a);
    monotone(`중개보수(${type})`, xs, (price) => fns.calcBrokerageFee({ price, type, includeVat: false }).fee);
  }
});

R.check('중개보수는 법정 상한요율을 넘지 않는다', () => {
  for (const type of ['sale', 'jeonse', 'other', 'officetel-sale']) {
    for (let a = 1e7; a <= 2e9; a += 2.5e7) {
      const r = fns.calcBrokerageFee({ price: a, type, includeVat: false });
      if (r.fee > a * r.capRate + 1) throw new Error(`${type} ${a}: 보수 ${r.fee} > 상한요율 적용액 ${a * r.capRate}`);
    }
  }
});

R.check('협의 요율이 상한을 넘으면 상한으로 제한된다', () => {
  const r = fns.calcBrokerageFee({ price: 500000000, type: 'sale', negotiatedRate: 5, includeVat: false });
  if (!r.negotiatedExceeded) throw new Error('상한 초과를 표시하지 않았습니다.');
  if (Math.abs(r.rate - r.capRate) > 1e-12) throw new Error(`요율이 상한으로 제한되지 않았습니다 (${r.rate}).`);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 6. RTI · 전월세 전환
 * ───────────────────────────────────────────────────────────────────────── */

R.check('임대료 ↑ → RTI가 줄지 않는다', () => {
  monotone('RTI', [1e6, 2e6, 3e6, 5e6],
    (monthlyRent) => fns.calcRti({ monthlyRent, deposit: 1e8, loan: 5e8, annualRate: 4 }).ratio);
});

R.check('대출금리 ↑ → RTI가 늘지 않는다', () => {
  monotone('RTI', [2, 3, 4, 5, 6, 8],
    (annualRate) => fns.calcRti({ monthlyRent: 3e6, deposit: 1e8, loan: 5e8, annualRate }).ratio, 'nonincreasing');
});

R.check('전월세 전환은 가역이다 (전세→월세→전세가 원래 값으로 돌아온다)', () => {
  for (const rate of [3, 4.75, 6, 8]) {
    const deposit = 500000000, baseDeposit = 100000000;
    const a = fns.calcJeonseMonthly({ mode: 'toMonthly', deposit, baseDeposit, monthly: 0, rate });
    const b = fns.calcJeonseMonthly({ mode: 'toJeonse', deposit: baseDeposit, monthly: a.calcMonthly, baseDeposit: 0, rate });
    if (Math.abs(b.calcDeposit - deposit) > 1) throw new Error(`전환율 ${rate}%: ${deposit} → ${b.calcDeposit}`);
  }
});

R.check('법정 전환율 상한은 연 10%를 넘지 않는다', () => {
  const cap = fns.legalConversionCapPct();
  if (cap.cap > 10 + 1e-9) throw new Error(`상한 ${cap.cap}% > 10%`);
  if (Math.abs(cap.cap - Math.min(cap.hardCapPct, cap.baseRatePct + cap.addPct)) > 1e-9) {
    throw new Error('상한이 min(10%, 기준금리+2%p) 산식과 다릅니다.');
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 7. 청약가점
 * ───────────────────────────────────────────────────────────────────────── */

R.check('청약가점은 84점을 넘지 않고, 각 항목도 상한을 넘지 않는다', () => {
  for (const noHomeYears of [0, 1, 8, 15, 30]) {
    for (const dependents of [0, 3, 6, 10]) {
      for (const accountYears of [0, 0.5, 5, 15, 30]) {
        for (const spouseAccountYears of [0, 5, 20]) {
          const r = fns.calcSubscriptionScore({ noHomeYears, dependents, accountYears, spouseAccountYears });
          if (r.s1 > 32 || r.s2 > 35 || r.s3 > 17 || r.total > 84) {
            throw new Error(`상한 초과: ${JSON.stringify(r)} (입력 ${noHomeYears}/${dependents}/${accountYears}/${spouseAccountYears})`);
          }
        }
      }
    }
  }
});

R.check('무주택기간·부양가족·통장기간이 늘면 가점이 줄지 않는다', () => {
  monotone('무주택 가점', [0, 1, 5, 10, 15, 20],
    (y) => fns.calcSubscriptionScore({ noHomeYears: y, dependents: 2, accountYears: 5 }).s1);
  monotone('부양가족 가점', [0, 1, 2, 3, 4, 5, 6],
    (d) => fns.calcSubscriptionScore({ noHomeYears: 5, dependents: d, accountYears: 5 }).s2);
  monotone('통장 가점', [0, 0.5, 1, 3, 7, 15, 20],
    (a) => fns.calcSubscriptionScore({ noHomeYears: 5, dependents: 2, accountYears: a }).s3);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 8. 법령이 불연속인 자리 — 예외 등록
 * ───────────────────────────────────────────────────────────────────────── */

const DOCUMENTED_DISCONTINUITIES = [
  {
    what: '대출 가격대별 한도 (15억 / 25억 경계)',
    basis: '금융위 「대출수요 관리 방안」(2025.10.15 발표, 10.16 시행) — 구간별 정액 한도',
    check: () => {
      const at = (price) => fns.calcMortgageLimit({
        price, ltvPercent: 70, region: 'regulated', income: 1e9,
        dsrLimitPercent: 40, rate: 4, stressAdd: 3, termYears: 30, repayType: 'equal',
      }).priceCap;
      if (!(at(1500000000) === 600000000 && at(1500000001) === 400000000)) throw new Error('15억 경계가 규정과 다릅니다.');
      if (!(at(2500000000) === 400000000 && at(2500000001) === 200000000)) throw new Error('25억 경계가 규정과 다릅니다.');
    },
  },
  {
    what: '취득세 다주택 중과 진입 (조정대상지역 2주택째)',
    basis: '지방세법 제13조의2 제1항 — 표준세율(1~3%)에서 8%로 정률 전환',
    check: () => {
      const one = acq({ price: 800000000, homes: 1, regulated: true }).total;
      const two = acq({ price: 800000000, homes: 2, regulated: true }).total;
      if (!(two > one * 2)) throw new Error('중과 진입 불연속이 규정대로 나타나지 않습니다.');
    },
  },
  {
    what: '양도세 단기보유 세율 경계 (1년·2년)',
    basis: '소득세법 제104조 제1항 — 70% / 60% / 기본세율의 계단식 전환',
    check: () => {
      const at = (holdYears) => tt({ holdYears, homes: 1 }).total;
      if (!(at(0) > at(1) && at(1) > at(2))) throw new Error('단기세율 계단이 규정대로 나타나지 않습니다.');
    },
  },
  {
    what: '중개보수 구간 한도액 (5천만원·1억원 미만)',
    basis: '공인중개사법 시행규칙 [별표1] — 구간별 한도액',
    check: () => {
      // 4,500만원 × 0.6% = 27만원 > 한도 25만원 → 한도액이 실제로 걸리는 자리
      const r = fns.calcBrokerageFee({ price: 45000000, type: 'sale', includeVat: false });
      if (!r.capApplied) throw new Error('4,500만원 매매에서 한도액 25만원이 걸려야 합니다.');
      if (Math.abs(r.fee - 250000) > 1) throw new Error(`한도액 적용 후 ${r.fee}원 (기대 250,000원)`);
    },
  },
];

for (const d of DOCUMENTED_DISCONTINUITIES) {
  R.check(`법정 불연속 (예외 등록): ${d.what}`, () => {
    d.check();
    if (!d.basis) throw new Error('근거가 기록되지 않았습니다.');
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 9. rates.js 의 정합성
 * ───────────────────────────────────────────────────────────────────────── */

R.check('DSR 한도는 1금융권 ≤ 2금융권', () => {
  if (!(rates.dsr.tier1 <= rates.dsr.tier2)) throw new Error(`${rates.dsr.tier1} > ${rates.dsr.tier2}`);
});

R.check('가격대별 한도는 시가가 높을수록 작아진다', () => {
  monotone('가격대별 한도', [1e9, 1.5e9, 2e9, 2.5e9, 3e9],
    (v) => (rates.loan.metroPriceCaps.find((c) => v / 1e8 <= c.upToEok) || rates.loan.metroPriceCaps.slice(-1)[0]).cap,
    'nonincreasing');
});

R.check('스트레스 가산금리는 스트레스 금리 × 적용비율과 일치한다', () => {
  for (const [key, row] of Object.entries(rates.loan.stress.byRegion)) {
    const expected = row.stressRate * row.applyRatio;
    if (Math.abs(row.add - expected) > 1e-9) {
      throw new Error(`${key}: add ${row.add} ≠ ${row.stressRate} × ${row.applyRatio} = ${expected}`);
    }
  }
});

R.check('LTV 는 0~100% 범위 안에 있다', () => {
  for (const [region, table] of Object.entries(rates.loan.ltvByRegion)) {
    for (const [own, v] of Object.entries(table)) {
      if (!(v >= 0 && v <= 100)) throw new Error(`${region}.${own} = ${v}`);
    }
  }
});

R.finish();
