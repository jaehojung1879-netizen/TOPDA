/*
 * 계산 엔진 로더 — 검증 스크립트 공통 (Single Source of Truth for tests)
 * ---------------------------------------------------------------------------
 * 왜 이 파일이 있는가.
 *
 * 검증 스크립트마다 app.js 를 "문자열 슬라이스"로 잘라 vm 에 넣고 있었다
 * (`appSource.indexOf('function calcX(input)')` ~ 다음 마커까지). 그 방식은
 *   ① 함수 아래 주석 한 줄만 바뀌어도 끊기는 자리가 달라지고,
 *   ② 스크립트마다 잘라 오는 범위가 달라 "어떤 스크립트는 최신 코드, 어떤
 *      스크립트는 옛 코드"를 검증하는 사고가 난다.
 *
 * 여기서는 최상위(열 0) `function 이름(` 선언을 중괄호 짝으로 정확히 떼어내
 * **모든 검증 스크립트가 같은 방식으로 같은 코드**를 로드하게 한다.
 *
 * ⚠ 이 파일은 production 코드를 "그대로" 실행만 한다. 계산식을 이 파일에
 *   다시 적으면 안 된다 — 그러면 검증이 자기 자신을 검증하게 된다.
 *   법령 기준 기대값은 scripts/reference/ 의 독립 구현이 만든다.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const APP_URL = new URL('../../site/assets/app.js', import.meta.url);
const RATES_URL = new URL('../../site/assets/rates.js', import.meta.url);

export const appSource = fs.readFileSync(APP_URL, 'utf8');
export const ratesSource = fs.readFileSync(RATES_URL, 'utf8');

/** rates.js 를 그대로 평가해 TOPDA_RATES 를 얻는다. */
export function loadRates() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(ratesSource, ctx);
  const rates = ctx.window.TOPDA_RATES;
  if (!rates) throw new Error('rates.js 에서 window.TOPDA_RATES 를 찾지 못했습니다.');
  return rates;
}

/**
 * app.js 최상위 함수 선언 하나를 중괄호 짝으로 정확히 떼어낸다.
 * 문자열·주석 안의 중괄호에 속지 않도록 간단한 스캐너를 쓴다.
 */
function extractFunction(name) {
  const decl = new RegExp('^function\\s+' + name + '\\s*\\(', 'm');
  const m = decl.exec(appSource);
  if (!m) throw new Error(`app.js 에 최상위 function ${name}(...) 선언이 없습니다.`);
  const start = m.index;
  // ⚠ 매개변수가 구조분해(`function f({ a, b }) {`)면 첫 '{' 는 본문이 아니라 인자다.
  //   먼저 괄호 짝으로 인자 목록을 닫은 뒤에 본문 '{' 를 찾는다.
  let p = start + m[0].length - 1; // '(' 위치
  let parens = 0;
  for (; p < appSource.length; p += 1) {
    if (appSource[p] === '(') parens += 1;
    else if (appSource[p] === ')') { parens -= 1; if (parens === 0) break; }
  }
  const bodyStart = appSource.indexOf('{', p);
  if (bodyStart < 0) throw new Error(`${name} 의 본문 시작 중괄호를 찾지 못했습니다.`);

  let depth = 0;
  let i = bodyStart;
  let mode = 'code'; // code | line | block | sq | dq | tpl | regex
  while (i < appSource.length) {
    const c = appSource[i];
    const n = appSource[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") { mode = 'sq'; i += 1; continue; }
      if (c === '"') { mode = 'dq'; i += 1; continue; }
      if (c === '`') { mode = 'tpl'; i += 1; continue; }
      if (c === '/' && isRegexStart(appSource, i)) { mode = 'regex'; i += 1; continue; }
      if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) return appSource.slice(start, i + 1);
      }
      i += 1;
      continue;
    }
    if (mode === 'line') { if (c === '\n') mode = 'code'; i += 1; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = 'code'; i += 2; continue; } i += 1; continue; }
    if (mode === 'sq' || mode === 'dq' || mode === 'regex') {
      const close = mode === 'sq' ? "'" : mode === 'dq' ? '"' : '/';
      if (c === '\\') { i += 2; continue; }
      if (c === close) { mode = 'code'; i += 1; continue; }
      i += 1;
      continue;
    }
    if (mode === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { mode = 'code'; i += 1; continue; }
      // ${ ... } 안의 중괄호는 code 모드가 아니므로 세지 않는다. 이 코드베이스의
      // 대상 함수들은 템플릿 리터럴 안에서 함수를 닫지 않으므로 안전하다.
      i += 1;
      continue;
    }
  }
  throw new Error(`${name} 의 닫는 중괄호를 찾지 못했습니다.`);
}

// 나눗셈의 '/' 와 정규식 리터럴의 '/' 구분 — 직전 의미 있는 토큰으로 판별한다.
function isRegexStart(src, idx) {
  for (let j = idx - 1; j >= 0; j -= 1) {
    const ch = src[j];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') continue;
    return '(,=:[!&|?{};+-*%~^<>'.indexOf(ch) >= 0;
  }
  return true;
}

/**
 * 이름 목록을 받아 app.js 에서 떼어낸 함수들을 rates.js 와 같은 컨텍스트에서 평가한다.
 * 반환값은 { 이름: 함수 } 이며, 서로를 호출하는 함수들도 같은 스코프에 있으므로 그대로 동작한다.
 */
export function loadCalcFunctions(names, opts = {}) {
  const rates = opts.rates || loadRates();
  const ctx = vm.createContext({
    window: { TOPDA_RATES: rates },
    // app.js 의 일부 함수가 참조하는 브라우저 전역의 최소 스텁.
    document: undefined,
    console,
  });
  const chunks = names.map((n) => extractFunction(n));
  chunks.push(`globalThis.__calc = { ${names.join(', ')} };`);
  vm.runInContext(chunks.join('\n\n'), ctx);
  const out = ctx.__calc || vm.runInContext('__calc', ctx);
  return { fns: out, rates, context: ctx };
}

/**
 * 계산기 페이지(HTML) 안의 인라인 함수를 떼어내 평가한다.
 * @param {string[]} preludeRegexes 함수가 참조하는 페이지 상단 변수 선언을 함께 가져오기 위한
 *   정규식 문자열 목록. 매칭된 구문이 함수보다 먼저 평가된다.
 */
export function loadPageFunction(pageRelPath, name, extraNames = [], preludeRegexes = []) {
  const url = new URL('../../' + pageRelPath, import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  const all = [name, ...extraNames];
  const prelude = preludeRegexes.map((pattern) => {
    const m = new RegExp(pattern, 'm').exec(src);
    if (!m) throw new Error(`${pageRelPath} 에서 prelude 를 찾지 못했습니다: ${pattern}`);
    return m[0];
  });
  const chunks = all.map((fnName) => {
    const re = new RegExp('(^|\\n)(\\s*)function\\s+' + fnName + '\\s*\\(');
    const m = re.exec(src);
    if (!m) throw new Error(`${pageRelPath} 에 function ${fnName} 이 없습니다.`);
    const start = m.index + m[1].length;
    let depth = 0;
    let i = src.indexOf('{', start);
    const bodyStart = i;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (i >= src.length) throw new Error(`${pageRelPath} 의 ${fnName} 을 닫지 못했습니다.`);
    void bodyStart;
    return src.slice(start, i + 1);
  });
  const ctx = vm.createContext({ window: { TOPDA_RATES: loadRates() }, console });
  vm.runInContext(
    prelude.join('\n') + '\n' + chunks.join('\n\n') + `\nglobalThis.__page = { ${all.join(', ')} };`,
    ctx,
  );
  return ctx.__page || vm.runInContext('__page', ctx);
}

/** 테스트용 소형 assert 헬퍼 — 실패 메시지에 근거를 함께 남긴다. */
export function makeRunner(title) {
  let passed = 0;
  const failures = [];
  console.log('\n' + title);
  return {
    check(name, fn) {
      try {
        fn();
        passed += 1;
        console.log('  ✓ ' + name);
      } catch (err) {
        failures.push({ name, message: err.message });
        console.log('  ✗ ' + name + '\n      ' + err.message);
      }
    },
    finish() {
      if (failures.length) {
        console.error(`\n${failures.length}건 실패 / ${passed + failures.length}건 중`);
        process.exitCode = 1;
      } else {
        console.log(`\n${passed}건 통과`);
      }
      return { passed, failures };
    },
    get passed() { return passed; },
    get failures() { return failures; },
  };
}
