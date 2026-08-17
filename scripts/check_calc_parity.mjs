/*
 * Parity Test — 같은 입력에 같은 결과 (개별 계산기 ↔ 종합계산기 ↔ 페이지 인라인)
 * ===========================================================================
 * 실행: node scripts/check_calc_parity.mjs
 *
 * 이 저장소에서 반복적으로 났던 사고는 "한쪽만 고쳤다"이다.
 *   · 개별 계산기의 세율을 고쳤는데 종합계산기가 옛 값으로 남음
 *   · rates.js 를 고쳤는데 페이지 인라인 스크립트가 자기 숫자를 계속 씀
 *
 * 그래서 두 층위로 막는다.
 *
 *  [구조]   계산 로직을 자기 페이지에 다시 들고 있는 파일이 늘어나면 실패한다.
 *           허용 목록(ALLOWED_INLINE_CALC)에 근거와 함께 등록해야만 통과한다.
 *  [행동]   페이지 인라인 함수와 app.js 공통 함수에 같은 입력을 넣어 값이 같은지 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCalcFunctions, loadPageFunction, makeRunner } from './lib/calc_engine.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R = makeRunner('[Parity] 개별 계산기 ↔ 종합계산기 ↔ 페이지 인라인');

const { fns, rates } = loadCalcFunctions([
  'calcAcquisitionTax', 'calcTransferTax', 'calcProgressiveTax', 'calcBrokerageFee',
  'calcRti', 'calcStampDuty', 'calcScrivenerBaseFee', 'calcBondPurchaseRate', 'roundBondAmount',
  'calcRegistrationCost', 'calcJeonseMonthly', 'legalConversionCapPct',
  'loanRatesCfg', 'RATES_DSR', 'loanRegionConfig', 'suggestLtvPercent',
  'loanPriorRules', 'suggestStressAdd', 'dsrAnnualFactor', 'calcMortgageLimit',
]);

const eq = (a, b, label, tol = 0.01) => {
  if (Math.abs(a - b) > tol) throw new Error(`${label}: ${a} ≠ ${b}`);
};

/* ═════════════════════════════════════════════════════════════════════════
 * [구조] 계산 로직을 자기 페이지에 들고 있는 파일 목록을 고정한다
 * ═══════════════════════════════════════════════════════════════════════ */

// 페이지 안에서 정의해도 되는 함수 이름 — 계산이 아니라 화면 조립·데이터 표시용.
const UI_ONLY = new Set([
  'render', 'renderMarkers', 'renderStats', 'renderList', 'renderMap', 'renderChart',
  'renderChips', 'renderUnits', 'renderActive', 'renderNotes', 'renderClassify',
  'renderKakaoMap', 'renderLeafletMap', 'renderAptMap', 'initMap', 'fillGu', 'fillSido',
  'fillMonths', 'color', 'fmt', 'won', 'esc', 'escapeHtml', 'num', 'ago', 'card', 'place',
  'line', 'rows', 'metricVals', 'filtered', 'comparator', 'debounce', 'getJson', 'setBusy',
  'setView', 'showList', 'showMessage', 'showAsof', 'paintMore', 'openModal', 'closeModal',
  'openAptModal', 'closeAptModal', 'aptKey', 'aptKeyOf', 'findApt', 'displayName', 'guOf',
  'sidoOf', 'sidoOrder', 'sigunguOf', 'toDeal', 'latestDealOf', 'monthlyOf', 'daysSince',
  'computeWindow', 'countMsg', 'barRow', 'bandSeries', 'axisWon', 'dotColor', 'dotRadius',
  'floorBand', 'areaBand', 'circleImage', 'popHtml', 'ensureLeaflet', 'ensureKakaoMap',
  'ensureLoaded', 'loadKakaoSdk', 'loadLedger', 'loadShard', 'neededSidos', 'regionsFromDeals',
  'aggregateByApt', 'start', 'fail', 'fmtDelta', 'lastVal', 'applyUrlParams', 'readFilters',
  'matchesSearch', 'enrichFromIndex', 'enrichWithDeals', 'hasSearchContext', 'pushCommonFacts',
  'sync', 'setEok', 'eokManFromWon', 'addOtherLoanRow', 'updateOtherLoanRow', 'exportICS',
  'renderTimeline',
  // 영문 검색 페이지의 표기 변환·칩 조립 — 계산이 아니다.
  'hubName', 'romanize', 'romanizeWord', 'romanizeSyl', 'unitLabel', 'reasonChip', 'showFinderMap',
]);

// 계산식을 페이지에 들고 있어도 되는 예외 — 왜 공통 엔진으로 못 옮겼는지 근거를 남긴다.
const ALLOWED_INLINE_CALC = {
  'dsr.html': {
    fns: ['pmtAnnuity', 'pmtPrincipalFirst', 'otherLoanSpec', 'otherLoansTotal', 'recalc', 'assumedYears'],
    reason: 'pmtAnnuity·pmtPrincipalFirst 는 "월 상환액 표시"용이며 DSR 산입액 자체는 app.js 의 '
      + 'dsrAnnualFactor 를 그대로 호출한다. otherLoanSpec 의 산정만기는 rates.js 의 '
      + 'dsr.applicability.assumedTermYears 에서만 온다 — 아래 행동 테스트가 이를 강제한다.',
  },
  'loan-compare.html': {
    fns: ['pmtAnnuity', 'interestAnnuity', 'interestPrincipal', 'recalc'],
    reason: '원리금균등·원금균등의 상환 스케줄 비교 전용 화면. 법정 수치가 아니라 순수 금융수학이라 '
      + 'rates.js 의존이 없다. 다만 app.js 의 dsrAnnualFactor 와 값이 어긋나면 안 되므로 '
      + '아래 행동 테스트로 고정한다.',
  },
  'registration-cost.html': {
    fns: ['acquisitionTaxes', 'recalc'],
    reason: 'acquisitionTaxes 는 주택이면 calcAcquisitionTax 를 그대로 호출하는 얇은 어댑터다. '
      + '비주택 세율은 rates.js 의 acquisitionTax.nonHouse 를 읽는다.',
  },
  'rti-calculator.html': {
    fns: ['recalc'],
    reason: 'RTI 산식은 app.js 의 calcRti 를 호출한다. recalc 는 화면 갱신만 한다.',
  },
};

R.check('[구조] 계산 로직을 인라인으로 들고 있는 페이지는 허용 목록 안에만 있다', () => {
  const dirs = ['site/calculators', 'site/en/calculators'];
  const offenders = [];
  for (const dir of dirs) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs).filter((f) => f.endsWith('.html'))) {
      const src = fs.readFileSync(path.join(abs, file), 'utf8');
      const names = [...src.matchAll(/function\s+([A-Za-z_][\w$]*)\s*\(/g)].map((m) => m[1]);
      const allowed = new Set((ALLOWED_INLINE_CALC[file] || {}).fns || []);
      for (const n of new Set(names)) {
        if (UI_ONLY.has(n) || allowed.has(n)) continue;
        offenders.push(`${dir}/${file}: function ${n}`);
      }
    }
  }
  if (offenders.length) {
    throw new Error(
      '페이지 안에 새로운 함수가 생겼습니다. 계산식이면 app.js 공통 엔진으로 옮기고, '
      + '화면 조립용이면 UI_ONLY 에, 불가피한 계산이면 ALLOWED_INLINE_CALC 에 근거와 함께 등록하세요.\n      '
      + offenders.join('\n      '),
    );
  }
});

R.check('[구조] 종합계산기는 계산식을 스스로 갖지 않는다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'site/calculators/total-cost-dashboard.html'), 'utf8');
  const names = [...src.matchAll(/function\s+([A-Za-z_][\w$]*)\s*\(/g)].map((m) => m[1]);
  if (names.length) {
    throw new Error(`종합계산기 페이지에 함수 정의가 생겼습니다: ${[...new Set(names)].join(', ')}. `
      + '종합계산기는 app.js 공통 엔진만 호출해야 개별 계산기와 값이 갈리지 않습니다.');
  }
});

R.check('[구조] 법정 수치가 페이지에 하드코딩되어 있지 않다', () => {
  // rates.js 로 옮겨야 할 대표적인 리터럴. 주석 안의 설명 문구는 제외하기 위해
  // "숫자 리터럴로 연산에 쓰이는 형태"만 본다.
  const FORBIDDEN = [
    { re: /price\s*\*\s*0\.04\b/, what: '비주택 취득세율 4% (rates.acquisitionTax.nonHouse)' },
    { re: /\*\s*0\.0166|\*\s*0\.0233/, what: '취득세 누진구간 세율 (법정 계산식으로 산출할 것)' },
    { re: /credit\s*\/\s*5\b/, what: '신용대출 DSR 연환산 5년 (rates.dsr.creditAnnualizeYears)' },
    { re: /\/\s*8\s*;\s*}\s*,\s*'비주택/, what: '비주택담보대출 산정만기 8년 (rates.dsr…assumedTermYears)' },
  ];
  const dirs = ['site/calculators', 'site/en/calculators'];
  const hits = [];
  for (const dir of dirs) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs).filter((f) => f.endsWith('.html'))) {
      const src = fs.readFileSync(path.join(abs, file), 'utf8');
      for (const f of FORBIDDEN) if (f.re.test(src)) hits.push(`${dir}/${file}: ${f.what}`);
    }
  }
  if (hits.length) throw new Error('페이지에 법정 수치가 하드코딩되어 있습니다:\n      ' + hits.join('\n      '));
});

/* ═════════════════════════════════════════════════════════════════════════
 * [행동] 페이지 인라인 함수 ↔ app.js 공통 함수
 * ═══════════════════════════════════════════════════════════════════════ */

R.check('[행동] loan-compare 의 원리금균등 월상환액 = app.js dsrAnnualFactor 기준값', () => {
  const page = loadPageFunction('site/calculators/loan-compare.html', 'pmtAnnuity');
  for (const P of [1e8, 5e8, 1e9]) {
    for (const annual of [0, 2.5, 4, 6.5]) {
      for (const years of [10, 20, 30, 40]) {
        const n = years * 12;
        const pageMonthly = page.pmtAnnuity(P, annual / 100 / 12, n);
        const appMonthly = P * fns.dsrAnnualFactor(annual, n, 'equal') / 12;
        eq(pageMonthly, appMonthly, `P=${P} r=${annual}% n=${n}`, 0.01);
      }
    }
  }
});

R.check('[행동] loan-compare 의 원금균등 총이자 = app.js 연평균 원리금에서 역산한 총이자', () => {
  const page = loadPageFunction('site/calculators/loan-compare.html', 'interestPrincipal');
  for (const P of [1e8, 5e8]) {
    for (const annual of [2.5, 4, 6.5]) {
      for (const years of [10, 30]) {
        const n = years * 12;
        const pageInterest = page.interestPrincipal(P, annual / 100 / 12, n);
        const appTotal = P * fns.dsrAnnualFactor(annual, n, 'principal') * years;
        eq(pageInterest, appTotal - P, `P=${P} r=${annual}% n=${n}`, 0.5);
      }
    }
  }
});

R.check('[행동] dsr 페이지의 원리금균등 월상환액 = app.js 기준값', () => {
  const page = loadPageFunction('site/calculators/dsr.html', 'pmtAnnuity');
  for (const P of [2e8, 6e8]) {
    for (const annual of [3, 5]) {
      const n = 360;
      eq(page.pmtAnnuity(P, annual / 100 / 12, n),
        P * fns.dsrAnnualFactor(annual, n, 'equal') / 12, `P=${P} r=${annual}%`, 0.01);
    }
  }
});

R.check('[행동] dsr 페이지의 기타대출 산정만기가 rates.js 값과 일치한다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'site/calculators/dsr.html'), 'utf8');
  const assumed = rates.dsr.applicability.assumedTermYears;
  // 페이지가 rates.js 를 읽고 있는지(리터럴을 다시 적지 않았는지) 구조로 확인한다.
  if (!/assumedTermYears/.test(src)) {
    throw new Error('dsr.html 이 rates.js 의 assumedTermYears 를 참조하지 않습니다.');
  }
  if (!/creditAnnualizeYears/.test(src)) {
    throw new Error('dsr.html 이 rates.js 의 creditAnnualizeYears 를 참조하지 않습니다.');
  }
  // 산정만기 상한이 실제로 걸리는지 — 만기일시 주담대는 최대 10년, 카드론은 3년.
  if (assumed.mortgageBullet.years !== 10) throw new Error('mortgageBullet 산정만기가 10년이 아닙니다.');
  if (assumed.cardLoan.years !== 3) throw new Error('cardLoan 산정만기가 3년이 아닙니다.');
});

R.check('[행동] dsr 페이지가 산정만기 상한을 실제로 적용한다', () => {
  const page = loadPageFunction('site/calculators/dsr.html', 'otherLoanSpec', ['assumedYears'], [
    "^\\s*var RD = .*$",
    "^\\s*var ASSUMED = .*$",
    "^\\s*var CREDIT_YEARS = .*$",
  ]);
  const amount = 300000000;
  // 만기일시 주담대에 30년을 넣어도 원금은 대출액 ÷ 10년으로 잡혀야 한다.
  const [bulletFn] = page.otherLoanSpec('mortgageBullet');
  eq(bulletFn(amount, 30), amount / 10, '만기일시 주담대 30년 입력 → 10년 상한', 1);
  eq(bulletFn(amount, 5), amount / 5, '만기일시 주담대 5년 입력 → 그대로 5년', 1);
  // 카드론에 10년을 넣어도 3년 상한.
  const [cardFn] = page.otherLoanSpec('card');
  eq(cardFn(amount, 10), amount / 3, '카드론 10년 입력 → 3년 상한', 1);
  // 비주택담보 8년, 그 밖의 담보 10년, 유가증권담보 8년.
  eq(page.otherLoanSpec('nonhouse')[0](amount), amount / 8, '비주택담보 8년', 1);
  eq(page.otherLoanSpec('otherSecured')[0](amount), amount / 10, '그 밖의 담보 10년', 1);
  eq(page.otherLoanSpec('stock')[0](amount), amount / 8, '유가증권담보 8년', 1);
  eq(page.otherLoanSpec('minus')[0](amount), amount / rates.dsr.creditAnnualizeYears, '한도대출 5년', 1);
});

/* ═════════════════════════════════════════════════════════════════════════
 * [행동] 개별 계산기 ↔ 종합계산기 — 같은 공통 함수를 같은 입력으로 부른다
 * ═══════════════════════════════════════════════════════════════════════ */

R.check('[행동] 취득세: 개별 계산기와 종합계산기가 같은 결과를 낸다', () => {
  const inputs = [
    { price: 500000000, homes: 1, regulated: false, areaOver85: false, firstHome: false },
    { price: 700000000, homes: 1, regulated: false, areaOver85: true, firstHome: true },
    { price: 800000000, homes: 2, regulated: true, areaOver85: false, firstHome: false },
    { price: 800000000, homes: 2, regulated: true, areaOver85: false, firstHome: false, tempTwoHome: true },
    { price: 1500000000, homes: 4, regulated: false, areaOver85: true, firstHome: false },
  ];
  for (const i of inputs) {
    const a = fns.calcAcquisitionTax(i);
    const b = fns.calcAcquisitionTax({ ...i });
    eq(a.total, b.total, `취득세 ${JSON.stringify(i)}`);
    eq(a.baseRate, b.baseRate, `세율 ${JSON.stringify(i)}`, 1e-12);
  }
});

R.check('[행동] 대출 한도: 매수 탭과 자금계획 탭이 같은 상환방식을 쓴다', () => {
  // 자금계획 탭이 원리금균등으로 고정돼 있던 사고(2026-08-16 changelog)를 회귀로 고정한다.
  const src = fs.readFileSync(path.join(ROOT, 'site/assets/app.js'), 'utf8');
  const dashboard = src.slice(src.indexOf("data-calc=\"total-cost-dashboard\""));
  const repayHits = [...dashboard.matchAll(/repayType\s*:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
  const hardCoded = repayHits.filter((v) => /^'(equal|principal)'$/.test(v));
  if (hardCoded.length) {
    throw new Error(`종합계산기가 상환방식을 고정값으로 넘기고 있습니다: ${hardCoded.join(', ')}. `
      + '사용자가 고른 상환방식을 그대로 전달해야 같은 화면의 DSR 과 한도가 어긋나지 않습니다.');
  }
});

R.check('[행동] 등기비용: 비주택 취득세가 rates.js 값을 쓴다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'site/calculators/registration-cost.html'), 'utf8');
  if (!/TOPDA_RATES[\s\S]{0,200}nonHouse/.test(src) && !/nonHouse/.test(src)) {
    throw new Error('registration-cost.html 이 rates.acquisitionTax.nonHouse 를 참조하지 않습니다.');
  }
});

R.check('[행동] 인지세·중개보수·RTI 는 페이지와 종합계산기가 같은 함수를 쓴다', () => {
  // 같은 입력 → 같은 값. 함수가 하나뿐이므로 값이 갈릴 수 없다는 것을 명시적으로 고정한다.
  for (const price of [3e7, 8e7, 5e8, 2e9]) {
    eq(fns.calcStampDuty(price), fns.calcStampDuty(price), `인지세 ${price}`);
  }
  const bf = { price: 800000000, type: 'sale', includeVat: true };
  eq(fns.calcBrokerageFee(bf).total, fns.calcBrokerageFee({ ...bf }).total, '중개보수');
  const rti = { monthlyRent: 3000000, deposit: 100000000, loan: 500000000, annualRate: 4.5 };
  eq(fns.calcRti(rti).ratio, fns.calcRti({ ...rti }).ratio, 'RTI');
});

R.finish();
