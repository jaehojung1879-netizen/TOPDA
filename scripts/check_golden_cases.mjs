/*
 * Golden Test — 법령 근거 기대값 vs TOPDA production 계산 결과
 * ===========================================================================
 * 실행: node scripts/check_golden_cases.mjs
 *
 * 이 스크립트는 각 케이스를 **두 번** 검증한다.
 *
 *   ① 독립 Reference Formula(scripts/reference/*.mjs) 결과 === golden JSON 의 expected
 *      → JSON 에 손으로 적은 값과 조문 구현이 서로를 검증한다. 한쪽만 틀리면 잡힌다.
 *   ② TOPDA production 함수 결과 === golden JSON 의 expected
 *      → 실제 배포되는 계산기가 법령 기대값과 일치하는지.
 *
 * ⚠ expected 값을 production 함수로 만들면 안 된다(circular test). 그래서 ①이 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCalcFunctions, makeRunner } from './lib/calc_engine.mjs';
import * as acqRef from './reference/acquisition_tax_reference.mjs';
import * as ttRef from './reference/transfer_tax_reference.mjs';
import * as loanRef from './reference/loan_reference.mjs';
import * as miscRef from './reference/misc_reference.mjs';

const GOLDEN_DIR = fileURLToPath(new URL('../tests/golden', import.meta.url));

const { fns } = loadCalcFunctions([
  'calcAcquisitionTax', 'calcTransferTax', 'calcProgressiveTax', 'calcBrokerageFee',
  'calcRti', 'calcJeonseMonthly', 'legalConversionCapPct', 'calcSubscriptionScore',
  'calcStampDuty', 'loanRatesCfg', 'RATES_DSR', 'loanRegionConfig', 'suggestLtvPercent',
  'loanPriorRules', 'suggestStressAdd', 'dsrAnnualFactor', 'calcMortgageLimit',
]);

const runner = makeRunner('[Golden] 법령 근거 기대값 대조');

function near(actual, expected, tol, label) {
  if (actual == null || Number.isNaN(actual)) throw new Error(`${label}: 값이 없습니다 (기대 ${expected})`);
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: ${actual} ≠ ${expected} (허용오차 ${tol})`);
  }
}

/* ── 계산기별 어댑터 ────────────────────────────────────────────────────────
 * production(actual) 과 reference(expected 재계산) 를 각각 어떻게 부르는지만 정의한다.
 * expected 키 이름은 golden JSON 이 정한다.
 */
const ADAPTERS = {
  'acquisition-tax': {
    production: (inputs) => fns.calcAcquisitionTax(inputs),
    reference: (inputs) => {
      const t = inputs.acqType || 'purchase';
      if (t === 'inherit') {
        const r = acqRef.referenceNonPaidTotal({
          kind: inputs.inheritNoHome ? 'inheritNoHome' : 'inherit',
          taxBase: inputs.price, areaOver85: inputs.areaOver85,
        });
        return { baseRate: r.rate, ...r };
      }
      if (t === 'original') {
        const r = acqRef.referenceNonPaidTotal({ kind: 'original', taxBase: inputs.price, areaOver85: inputs.areaOver85 });
        return { baseRate: r.rate, ...r };
      }
      if (t === 'gift') {
        const market = inputs.giftMarketValue != null ? inputs.giftMarketValue : inputs.price;
        const judge = inputs.giftStdValue != null ? inputs.giftStdValue : market;
        const heavy = Boolean(inputs.regulated && inputs.giftDonorMultiHome && judge >= 300000000);
        const r = acqRef.referenceNonPaidTotal({
          kind: heavy ? 'giftHeavy' : 'gift', taxBase: market, areaOver85: inputs.areaOver85,
        });
        return { baseRate: r.rate, ...r };
      }
      const r = acqRef.referenceAcquisitionTotal(inputs);
      // 감면 (지방세특례제한법 제36조의3·제36조의5)
      const heavy = acqRef.isHeavyRate(r.rate) && inputs.homes >= 2;
      const cap = acqRef.reliefCap({
        price: inputs.price,
        eligible: inputs.homes === 1 && !heavy,
        firstHome: inputs.firstHome,
        firstHomeSmallHouse: inputs.firstHomeSmallHouse,
        childbirth: inputs.childbirth,
      });
      const firstHomeDeduct = Math.min(cap, r.acquisition);
      const appliedReliefKey = cap === 0 ? null
        : (inputs.childbirth && 5000000 >= (inputs.firstHome ? (inputs.firstHomeSmallHouse ? 3000000 : 2000000) : 0)
          ? 'childbirth' : 'firstHome');
      return {
        baseRate: r.rate,
        acquisition: r.acquisition - firstHomeDeduct,
        ruralTax: r.ruralTax,
        localEduTax: r.localEduTax,
        total: r.acquisition - firstHomeDeduct + r.ruralTax + r.localEduTax,
        firstHomeDeduct,
        appliedReliefKey,
      };
    },
  },

  'transfer-tax': {
    production: (inputs) => fns.calcTransferTax(inputs),
    reference: (inputs) => ttRef.referenceTransferTax(inputs),
  },

  'brokerage-fee': {
    production: (inputs) => {
      const r = fns.calcBrokerageFee(inputs);
      return { amount: r.amount, rate: r.rate, fee: r.fee, total: r.total, bothParties: r.bothParties };
    },
    reference: (inputs) => {
      const amount = (inputs.type === 'monthly' || inputs.type === 'officetel-monthly')
        ? miscRef.monthlyRentTransactionAmount(inputs.deposit || 0, inputs.monthlyRent || 0)
        : inputs.price;
      const kind = inputs.type === 'sale' ? 'sale'
        : inputs.type === 'officetel-sale' ? 'officetel-sale'
          : inputs.type === 'officetel-jeonse' || inputs.type === 'officetel-monthly' ? 'officetel-lease'
            : inputs.type === 'other' ? 'other' : 'lease';
      const r = miscRef.referenceBrokerageFee({ amount, type: kind });
      const vat = inputs.includeVat === false ? 0 : r.fee * 0.10;
      return { amount, rate: r.rate, fee: r.fee, total: r.fee + vat, bothParties: (r.fee + vat) * 2 };
    },
  },

  'jeonse-monthly': {
    production: (inputs) => {
      const r = fns.calcJeonseMonthly(inputs);
      const cap = fns.legalConversionCapPct();
      return { ...r, legalCapPct: cap.cap };
    },
    reference: (inputs) => {
      const cap = miscRef.referenceConversionCapPct(inputs.bokBaseRatePct);
      if (inputs.mode === 'toMonthly') {
        const convertible = Math.max(0, inputs.deposit - inputs.baseDeposit);
        return {
          convertibleDeposit: convertible,
          calcMonthly: miscRef.referenceDepositToMonthly(convertible, inputs.rate),
          legalCapPct: cap,
        };
      }
      const convertible = inputs.monthly / (inputs.rate / 100 / 12);
      return { convertibleDeposit: convertible, calcDeposit: inputs.deposit + convertible, legalCapPct: cap };
    },
  },

  'stamp-duty': {
    production: (inputs) => ({ stampDuty: fns.calcStampDuty(inputs.price) }),
    reference: (inputs) => ({ stampDuty: miscRef.referenceStampDuty(inputs.price) }),
  },

  'housing-subscription': {
    production: (inputs) => {
      const r = fns.calcSubscriptionScore(inputs);
      return { noHome: r.s1, dependents: r.s2, account: r.s3, total: r.total };
    },
    reference: (inputs) => miscRef.referenceSubscriptionScore(inputs),
  },

  'loan-limit': {
    production: (inputs) => {
      const r = fns.calcMortgageLimit(inputs);
      return { ltvLimit: r.ltvLimit, priceCap: r.priceCap, dsrLimit: r.dsrLimit, limit: r.limit };
    },
    reference: (inputs) => loanRef.referenceMortgageLimit({
      price: inputs.price,
      ltvPercent: inputs.ltvPercent,
      priceCap: inputs.expectedPriceCap != null ? inputs.expectedPriceCap
        : (inputs.region === 'provincialNonRegulated' ? Infinity : loanRef.metroPriceCap(inputs.price)),
      income: inputs.income,
      existingAnnualDebt: inputs.existingAnnualDebt || 0,
      dsrLimitPercent: inputs.dsrLimitPercent,
      rate: inputs.rate,
      stressAdd: inputs.stressAdd || 0,
      termYears: inputs.termYears,
      repayType: inputs.repayType || 'equal',
    }),
  },
};

const files = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json')).sort();
let caseCount = 0;

for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf8'));
  const adapter = ADAPTERS[doc.calculator];
  if (!adapter) throw new Error(`${file}: '${doc.calculator}' 어댑터가 없습니다.`);

  console.log(`\n── ${doc.calculator} (${doc.cases.length}건) ──`);
  for (const c of doc.cases) {
    caseCount += 1;

    // 메타데이터 필수 항목 — 근거 없는 기대값이 들어오는 것을 막는다.
    runner.check(`${c.case_id} · 메타데이터`, () => {
      for (const key of ['case_id', 'effective_date', 'inputs', 'expected', 'source', 'verification_method', 'confidence', 'verified_at']) {
        if (c[key] == null) throw new Error(`${key} 가 없습니다.`);
      }
      for (const key of ['type', 'title', 'article', 'effective_from']) {
        if (c.source[key] === undefined) throw new Error(`source.${key} 가 없습니다.`);
      }
      const allowed = ['LAW', 'DECREE', 'RULE', 'REGULATION', 'NOTICE', 'OFFICIAL_FAQ', 'OFFICIAL_CALCULATOR', 'ORDINANCE'];
      if (!allowed.includes(c.source.type)) throw new Error(`source.type 이 허용 목록 밖입니다: ${c.source.type}`);
      // 시행 전 규정이 golden expected 로 들어오면 안 된다.
      if (c.source.effective_from > c.effective_date) {
        throw new Error(`아직 시행되지 않은 근거입니다 (effective_from ${c.source.effective_from} > 계산기준일 ${c.effective_date}).`);
      }
      if (c.source.effective_to && c.source.effective_to < c.effective_date) {
        throw new Error(`이미 실효된 근거입니다 (effective_to ${c.source.effective_to}).`);
      }
    });

    const tol = c.tolerance != null ? c.tolerance : 0.5;

    // ① 독립 구현 vs JSON expected
    runner.check(`${c.case_id} · reference formula`, () => {
      const ref = adapter.reference(c.inputs);
      for (const [key, want] of Object.entries(c.expected)) {
        if (ref[key] === undefined) continue; // reference 가 다루지 않는 필드는 production 만 검증
        if (typeof want === 'number') near(ref[key], want, key === 'baseRate' || key.endsWith('Rate') ? 1e-9 : tol, `reference.${key}`);
        else if (ref[key] !== want) throw new Error(`reference.${key}: ${ref[key]} ≠ ${want}`);
      }
    });

    // ② production vs JSON expected
    runner.check(`${c.case_id} · production (${c.boundary || ''})`, () => {
      const got = adapter.production(c.inputs);
      if (!got) throw new Error('production 함수가 결과를 돌려주지 않았습니다.');
      for (const [key, want] of Object.entries(c.expected)) {
        if (typeof want === 'number') near(got[key], want, key === 'baseRate' || key.endsWith('Rate') ? 1e-9 : tol, `production.${key}`);
        else if (got[key] !== want) throw new Error(`production.${key}: ${got[key]} ≠ ${want}`);
      }
    });
  }
}

console.log(`\ngolden case ${caseCount}건 (파일 ${files.length}개)`);
runner.finish();
