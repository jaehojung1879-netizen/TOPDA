#!/usr/bin/env node
// i18n 정합성·커버리지 점검. 의존성 없음(순수 Node). 로컬: `node scripts/i18n_check.mjs`
// 점검 항목:
//  1) 선언된 언어별 홈(index.html) 존재
//  2) content-priority/{lang}.yaml 존재 + lang 필드 일치
//  3) 국기 SVG(assets/flags/{code}.svg) 존재
//  4) app.js 언어 스위처(LANGS)에 모든 언어 포함
//  5) sitemap 에 각 언어 홈 포함
//  6) glossary.json 각 용어가 6개 언어 모두 보유(누락/pending 리포트)
//  7) 신규 한국어 콘텐츠(계산기/가이드) 대비 언어 커버리지 개요
// 게이트가 아닌 '알림' 성격: gap 이 있어도 종료코드 0, GITHUB_OUTPUT 에 has_gaps 기록.
import { readFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const LANGS = ['ko', 'en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];
const NEW_LANGS = ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];
const findings = [];
const ok = [];
const add = (sev, msg) => findings.push({ sev, msg });

// 1) 언어 홈
for (const l of NEW_LANGS) {
  const p = join(SITE, l, 'index.html');
  existsSync(p) ? ok.push(`home:${l}`) : add('error', `언어 홈 누락: /${l}/index.html`);
}
// 2) content-priority
for (const l of LANGS) {
  const p = join(SITE, 'i18n', 'content-priority', `${l}.yaml`);
  if (!existsSync(p)) { add('error', `content-priority 누락: ${l}.yaml`); continue; }
  const txt = readFileSync(p, 'utf8');
  if (!new RegExp(`^lang:\\s*${l}\\s*$`, 'm').test(txt)) add('warn', `content-priority ${l}.yaml 의 lang 필드 불일치`);
  else ok.push(`priority:${l}`);
}
// 3) 국기 SVG
for (const l of LANGS) {
  const p = join(SITE, 'assets', 'flags', `${l}.svg`);
  existsSync(p) ? ok.push(`flag:${l}`) : add('error', `국기 SVG 누락: flags/${l}.svg`);
}
// 4) app.js LANGS
const appjs = readFileSync(join(SITE, 'assets', 'app.js'), 'utf8');
for (const l of LANGS) {
  new RegExp(`code:\\s*'${l}'`).test(appjs) ? ok.push(`switcher:${l}`) : add('error', `app.js 언어 스위처에 ${l} 미포함`);
}
// 5) sitemap 언어 홈
const sitemap = existsSync(join(SITE, 'sitemap.xml')) ? readFileSync(join(SITE, 'sitemap.xml'), 'utf8') : '';
for (const l of NEW_LANGS) {
  const loc = l === 'ko' ? 'https://topda.kr/' : `https://topda.kr/${l}/index.html`;
  sitemap.includes(loc) ? ok.push(`sitemap:${l}`) : add('warn', `sitemap 에 ${l} 홈 누락 (gen_i18n_sitemap.mjs 실행 필요)`);
}
// 6) glossary.json
const glPath = join(SITE, 'i18n', 'glossary.json');
if (existsSync(glPath)) {
  const gl = JSON.parse(readFileSync(glPath, 'utf8'));
  const terms = gl.categories.flatMap((c) => c.terms);
  let missing = 0, pending = 0;
  for (const t of terms) {
    for (const l of LANGS) if (!t[l]) { missing++; add('warn', `glossary '${t.id}' 에 ${l} 누락`); }
    if (t.pending) pending++;
  }
  ok.push(`glossary:${terms.length}terms`);
  add('info', `glossary: ${terms.length}개 용어, 누락 ${missing}, 검수대기(pending) ${pending}`);
} else add('error', 'glossary.json 누락');

// 7) 한국어 콘텐츠 커버리지 개요(참고용)
const koCalc = existsSync(join(SITE, 'calculators')) ? readdirSync(join(SITE, 'calculators')).filter((f) => f.endsWith('.html')).length : 0;
for (const l of NEW_LANGS) {
  const dir = join(SITE, l, 'calculators');
  const n = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')).length : 0;
  add('info', `계산기 커버리지 ${l}: ${n}/${koCalc} (부재분은 영문 계산기로 폴백)`);
}

const errors = findings.filter((f) => f.sev === 'error');
const warns = findings.filter((f) => f.sev === 'warn');
const hasGaps = errors.length > 0 || warns.length > 0;

let md = `# i18n 점검 리포트 (${new Date().toISOString().slice(0, 10)})\n\n`;
md += `- ✅ 통과: ${ok.length}개 검사\n- ⛔ 오류: ${errors.length}\n- ⚠️ 경고: ${warns.length}\n\n`;
if (findings.length) {
  md += '| 등급 | 내용 |\n|---|---|\n';
  const icon = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
  for (const f of findings) md += `| ${icon[f.sev]} | ${f.msg} |\n`;
}
console.log(md);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `has_gaps=${hasGaps}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `error_count=${errors.length}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
// 알림 성격이므로 항상 0 종료(오류가 있어도 이슈 생성 단계가 처리)
process.exit(0);
