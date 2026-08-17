/*
 * Rule Versioning Guard — 시행 전 규정이 현행 계산에 섞이지 않게 막는다
 * ===========================================================================
 * 실행: node scripts/check_rule_versioning.mjs
 *
 * 가장 조용하고 가장 위험한 오류는 "정부 발표 개편안"이 현행 계산에 들어가는 것이다.
 * 세율 숫자만 보면 최신처럼 보이지만, 오늘 계약하는 사람에게는 틀린 값이다.
 *
 * 여기서 막는 것:
 *   ① 모든 규정 블록이 status + effectiveFrom + source 를 갖는가
 *   ② status 가 시행일과 모순되지 않는가 (CURRENT 인데 시행일이 미래 등)
 *   ③ PROPOSED 규정이 계산기에서 참조되고 있지 않은가
 *   ④ 계산 기준일을 과거로 돌려도 미래 규정이 적용되지 않는가
 *   ⑤ 검증일(reviewedAt)이 미래로 적혀 있지 않은가
 */
import { loadRates, loadCalcFunctions, makeRunner } from './lib/calc_engine.mjs';

const rates = loadRates();
const R = makeRunner('[Versioning] 규정 시점(status) 정합성');

const TODAY = new Date().toISOString().slice(0, 10);
const S = rates.RULE_STATUS;

/** rates 트리를 훑어 status 를 가진 블록을 모두 모은다. */
function collectRuleBlocks(node, path = 'TOPDA_RATES', acc = []) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return acc;
  if (typeof node.status === 'string') acc.push({ path, block: node });
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) collectRuleBlocks(v, `${path}.${k}`, acc);
  }
  return acc;
}

const blocks = collectRuleBlocks(rates);

R.check(`규정 블록이 하나 이상 있다 (발견 ${blocks.length}개)`, () => {
  if (blocks.length < 10) throw new Error(`status 를 가진 블록이 ${blocks.length}개뿐입니다.`);
});

R.check('모든 규정 블록의 status 가 허용 어휘 안에 있다', () => {
  const allowed = new Set(Object.values(S));
  for (const { path, block } of blocks) {
    if (!allowed.has(block.status)) throw new Error(`${path}.status = ${block.status}`);
  }
});

R.check('모든 규정 블록에 effectiveFrom 과 source 가 있다', () => {
  const missing = [];
  for (const { path, block } of blocks) {
    if (!block.effectiveFrom) missing.push(`${path}.effectiveFrom`);
    if (!block.source) missing.push(`${path}.source`);
  }
  if (missing.length) throw new Error('근거·시행일이 없는 블록:\n      ' + missing.join('\n      '));
});

R.check('status 가 시행일·종료일과 모순되지 않는다', () => {
  const bad = [];
  for (const { path, block } of blocks) {
    const from = block.effectiveFrom && String(block.effectiveFrom).length >= 10
      ? String(block.effectiveFrom).slice(0, 10) : null;
    const to = (block.effectiveTo || block.validUntil) && String(block.effectiveTo || block.validUntil).length >= 10
      ? String(block.effectiveTo || block.validUntil).slice(0, 10) : null;
    if (block.status === S.CURRENT) {
      if (from && from > TODAY) bad.push(`${path}: CURRENT 인데 시행일이 미래(${from})`);
      if (to && to < TODAY) bad.push(`${path}: CURRENT 인데 종료일이 지남(${to})`);
    }
    if (block.status === S.ENACTED_FUTURE && from && from <= TODAY) {
      bad.push(`${path}: ENACTED_FUTURE 인데 시행일이 이미 지남(${from}) → CURRENT 로 바꾸세요`);
    }
    if (block.status === S.EXPIRED && (!to || to >= TODAY)) {
      bad.push(`${path}: EXPIRED 인데 종료일이 없거나 아직 지나지 않음(${to})`);
    }
  }
  if (bad.length) throw new Error(bad.join('\n      '));
});

R.check('검증일(reviewedAt)이 미래로 적혀 있지 않다', () => {
  const bad = [];
  for (const { path, block } of blocks) {
    if (block.reviewedAt && String(block.reviewedAt).slice(0, 10) > TODAY) {
      bad.push(`${path}.reviewedAt = ${block.reviewedAt} (오늘 ${TODAY})`);
    }
  }
  if (bad.length) throw new Error(bad.join('\n      '));
});

R.check('lastReviewed 는 실제 블록 검증일을 넘지 않는다', () => {
  // "형식적으로 오늘 날짜로 바꾸기"를 막는다. 어떤 블록도 그 날 검증되지 않았는데
  // 사이트 전체 검토일만 미래로 가 있으면 사용자에게 거짓 신호가 된다.
  const dates = blocks.map((b) => b.block.reviewedAt).filter(Boolean).map((d) => String(d).slice(0, 10));
  const newest = dates.sort().slice(-1)[0];
  if (rates.lastReviewed > newest) {
    throw new Error(`lastReviewed ${rates.lastReviewed} > 가장 최근 블록 검증일 ${newest}`);
  }
});

R.check('PROPOSED 규정은 어디에도 없거나, 있어도 upcoming 안에만 있다', () => {
  const proposed = blocks.filter((b) => b.block.status === S.PROPOSED);
  const outside = proposed.filter((b) => !b.path.startsWith('TOPDA_RATES.upcoming'));
  if (outside.length) {
    throw new Error(
      'PROPOSED(개편안·입법예고) 규정이 계산 데이터 안에 있습니다. upcoming 배열로 옮기세요:\n      '
      + outside.map((b) => b.path).join('\n      '),
    );
  }
});

R.check('upcoming 항목은 모두 PROPOSED 또는 ENACTED_FUTURE 이고 근거가 있다', () => {
  for (const item of rates.upcoming || []) {
    if (![S.PROPOSED, S.ENACTED_FUTURE].includes(item.status)) {
      throw new Error(`upcoming 항목의 status 가 ${item.status} 입니다: ${item.title || JSON.stringify(item)}`);
    }
    if (!item.source) throw new Error(`upcoming 항목에 근거가 없습니다: ${item.title}`);
  }
});

R.check('isRuleApplicable 이 시점 판정을 제대로 한다', () => {
  const f = rates.isRuleApplicable;
  if (!f({ status: S.CURRENT, effectiveFrom: '2020-01-01' }, '2026-08-17')) throw new Error('현행 규정이 미적용으로 판정됨');
  if (f({ status: S.PROPOSED, effectiveFrom: '2020-01-01' }, '2026-08-17')) throw new Error('PROPOSED 가 적용으로 판정됨');
  if (f({ status: S.ENACTED_FUTURE, effectiveFrom: '2027-01-01' }, '2026-08-17')) throw new Error('시행 전 규정이 적용으로 판정됨');
  if (!f({ status: S.ENACTED_FUTURE, effectiveFrom: '2027-01-01' }, '2027-01-01')) throw new Error('시행일 당일에 미적용으로 판정됨');
  if (f({ status: S.EXPIRED, effectiveFrom: '2015-01-01', effectiveTo: '2020-12-31' }, '2026-08-17')) throw new Error('실효 규정이 적용으로 판정됨');
  if (!f({ status: S.EXPIRED, effectiveFrom: '2015-01-01', effectiveTo: '2020-12-31' }, '2018-06-01')) throw new Error('과거 시점 계산에 과거 규정이 미적용으로 판정됨');
});

/* ─────────────────────────────────────────────────────────────────────────
 * Historical Rule Preservation — 과거 규칙을 보존하는 구조인지
 * ───────────────────────────────────────────────────────────────────────── */

R.check('과거 규칙이 삭제가 아니라 시점 표시로 보존되는 구조다', () => {
  // 경과규정(10·15 이전 종전 규정)이 남아 있고, 그 값이 현행 값과 다른지 본다.
  const prior = rates.loan.grandfather.priorRules;
  if (!prior) throw new Error('종전 규정(priorRules) 블록이 사라졌습니다.');
  if (prior.priceCapSingle !== 600000000) throw new Error('종전 단일 가격한도 6억원이 바뀌었습니다.');
  if (prior.stressRate !== 1.5) throw new Error('종전 스트레스 금리 1.5%가 바뀌었습니다.');
  const current = rates.loan.stress.byRegion.regulated.stressRate;
  if (current === prior.stressRate) {
    throw new Error('현행과 종전 스트레스 금리가 같습니다 — 한쪽이 덮어쓰인 것 아닌지 확인하세요.');
  }
});

R.check('경과규정이 실제로 계산에 반영된다 (표시만 하고 끝나지 않는다)', () => {
  const { fns } = loadCalcFunctions([
    'loanRatesCfg', 'RATES_DSR', 'loanRegionConfig', 'suggestLtvPercent',
    'loanPriorRules', 'suggestStressAdd', 'dsrAnnualFactor', 'calcMortgageLimit',
  ], { rates });
  const base = {
    price: 2000000000, ltvPercent: 40, region: 'regulated',
    income: 500000000, dsrLimitPercent: 40, rate: 4, termYears: 30, repayType: 'equal',
  };
  const now = fns.calcMortgageLimit({ ...base, grandfather: 'new', stressAdd: 3.0 });
  const prior = fns.calcMortgageLimit({ ...base, grandfather: 'preContract', stressAdd: 3.0 });
  // 20억 주택: 현행은 4억 구간, 종전은 시가 무관 6억.
  if (now.priceCap !== 400000000) throw new Error(`현행 가격대별 한도 ${now.priceCap} ≠ 4억`);
  if (prior.priceCap !== 600000000) throw new Error(`종전 가격대별 한도 ${prior.priceCap} ≠ 6억`);
  if (!(prior.limit > now.limit)) throw new Error('경과규정 대상인데 한도가 더 크지 않습니다.');
});

R.check('golden case 의 근거 시행일이 계산 기준일보다 미래가 아니다', async () => {
  // check_golden_cases.mjs 가 케이스별로도 확인하지만, 여기서 파일 단위로 한 번 더 훑는다.
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../tests/golden', import.meta.url));
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
    for (const c of doc.cases) {
      if (c.source.effective_from > c.effective_date) {
        bad.push(`${f}:${c.case_id} — 시행 전 근거(${c.source.effective_from})`);
      }
    }
  }
  if (bad.length) throw new Error(bad.join('\n      '));
});

R.finish();
