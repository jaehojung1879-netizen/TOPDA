#!/usr/bin/env node
// 외부 링크(은행·기관 등) 데드링크 점검. 순수 Node(전역 fetch). 비차단(리포트 성격).
// 대상: site/**/*.html 및 assets/foreigner-loan-eligibility.json 내 http(s) 외부 링크.
// 네트워크 차단 시 결과가 부정확할 수 있으므로 '알림 수준'으로만 사용.
import { readFileSync, existsSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!['assets', '.git'].includes(name)) walk(p, out); }
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const urls = new Set();
const collect = (txt) => {
  const re = /https?:\/\/[^\s"'<>)]+/g;
  let m;
  while ((m = re.exec(txt))) {
    let u = m[0].replace(/[.,]$/, '');
    // 자사·CDN·집계 링크는 제외(외부 기관 링크만 점검)
    if (/topda\.kr|jsdelivr|googleapis|google\.com\/rss|gstatic|schema\.org|w3\.org/.test(u)) continue;
    urls.add(u);
  }
};
for (const f of walk(SITE)) collect(readFileSync(f, 'utf8'));
const elig = join(SITE, 'assets', 'foreigner-loan-eligibility.json');
if (existsSync(elig)) collect(readFileSync(elig, 'utf8'));

const dead = [];
for (const u of urls) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 15000);
    let res = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'topda-link-check/1.0' } });
    if (res.status === 405 || res.status === 403) res = await fetch(u, { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'topda-link-check/1.0' } });
    clearTimeout(to);
    if (res.status >= 400 && res.status !== 403) dead.push(`${res.status} ${u}`);
  } catch { dead.push(`ERR ${u}`); }
}

let md = `## 외부 링크 점검 (${new Date().toISOString().slice(0, 10)})\n\n점검 ${urls.size}개.\n`;
if (dead.length) { md += `\n**의심 링크 ${dead.length}개:**\n\n` + dead.map((d) => `- ${d}`).join('\n') + '\n'; }
else md += '\n데드링크 없음(또는 네트워크 제한).\n';
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dead=${dead.length}\n`);
process.exit(0);
