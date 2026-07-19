#!/usr/bin/env node
// 외국인 대출·부동산 정책 페이지 변경 감지(알림 수준). 순수 Node(전역 fetch, Node 18+).
// 각 대상 페이지를 받아 텍스트를 정규화·해시하여 이전 스냅샷과 비교한다.
// 변경 감지 시 콘솔/GITHUB_OUTPUT 로 알리고 스냅샷을 갱신한다(자동 덮어쓰기 금지 — 콘텐츠는 사람이 반영).
// 네트워크 차단·오류에 관대: 실패한 대상은 'unreachable' 로 기록하고 계속 진행.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAP_DIR = join(ROOT, '_meta', 'policy-snapshots');
const SNAP = join(SNAP_DIR, 'snapshots.json');

// 감지 대상. label 은 이슈 본문/리포트에 사용.
const TARGETS = [
  { id: 'sgi', label: 'SGI 서울보증 (외국인 전세 관련)', url: 'https://www.sgic.co.kr/' },
  { id: 'hug', label: 'HUG 주택도시보증공사', url: 'https://www.khug.or.kr/' },
  { id: 'hf', label: 'HF 한국주택금융공사', url: 'https://www.hf.go.kr/' },
  { id: 'molit', label: '국토교통부 (외국인 부동산 정책)', url: 'https://www.molit.go.kr/' },
  { id: 'kb', label: 'KB국민은행 (외국인 전세대출)', url: 'https://obank.kbstar.com/' },
];

function normalize(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function hash(s) { return createHash('sha256').update(s).digest('hex').slice(0, 16); }

if (!existsSync(SNAP_DIR)) mkdirSync(SNAP_DIR, { recursive: true });
let prev = {};
if (existsSync(SNAP)) { try { prev = JSON.parse(readFileSync(SNAP, 'utf8')); } catch {} }

const now = new Date().toISOString();
const next = {};
const changed = [];
const unreachable = [];

for (const t of TARGETS) {
  let h = null, status = 'ok';
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(t.url, { signal: ctrl.signal, headers: { 'user-agent': 'topda-policy-watch/1.0' } });
    clearTimeout(to);
    if (!res.ok) { status = 'http-' + res.status; }
    else { h = hash(normalize(await res.text())); }
  } catch (e) { status = 'unreachable'; }

  const before = prev[t.id];
  if (status !== 'ok' || !h) {
    unreachable.push(t.label + ' (' + status + ')');
    next[t.id] = before || { hash: null, lastChecked: now, label: t.label, url: t.url };
    next[t.id].lastChecked = now;
    next[t.id].lastStatus = status;
    continue;
  }
  if (before && before.hash && before.hash !== h) changed.push(t);
  next[t.id] = { hash: h, lastChecked: now, label: t.label, url: t.url, lastStatus: 'ok' };
}

writeFileSync(SNAP, JSON.stringify(next, null, 2) + '\n');

let md = `## 외국인 정책 페이지 변경 감지 (${now.slice(0, 10)})\n\n`;
if (changed.length) {
  md += '**변경 감지** — 아래 페이지에서 콘텐츠 변화가 감지되었습니다. 공식 내용을 확인 후 수동 반영하세요(자동 덮어쓰기 안 함):\n\n';
  for (const t of changed) md += `- [${t.label}](${t.url})\n`;
} else md += '변경 없음.\n';
if (unreachable.length) md += `\n_확인 불가(네트워크/차단): ${unreachable.join(', ')}_\n`;
console.log(md);

if (process.env.GITHUB_OUTPUT) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed.length}\n`);
  const body = md.replace(/\n/g, '%0A');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `body=${body}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
process.exit(0);
