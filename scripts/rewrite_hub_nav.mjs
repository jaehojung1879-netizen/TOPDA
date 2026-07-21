#!/usr/bin/env node
// 언어판 페이지의 네비게이션 링크를 새로 생성한 로컬 허브(guides.html·market.html)로 교체한다.
// - depth-1({lang}/*.html):  ../guides.html→guides.html, ../market.html→market.html
// - depth-2({lang}/calculators/*.html): ../../guides.html→../guides.html, ../../market.html→../market.html
// 예외: en/guides.html 의 본문 "한국어 가이드 허브" 링크(../guides.html)는 의도된 것이므로 유지.
//   node scripts/rewrite_hub_nav.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];

let changed = 0;
const touched = [];
function apply(path, pairs) {
  let txt = readFileSync(path, 'utf8');
  const before = txt;
  for (const [from, to] of pairs) txt = txt.split(from).join(to);
  if (txt !== before) { writeFileSync(path, txt); changed++; touched.push(path.replace(SITE + '/', '')); }
}

for (const lang of LANGS) {
  const dir = join(SITE, lang);
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isFile() || !name.endsWith('.html')) continue;
    if (name === 'guides.html' || name === 'market.html') continue; // 생성물은 이미 로컬 링크
    const pairs = [['href="../market.html"', 'href="market.html"']];
    // en/guides.html 의 ../guides.html 은 의도된 한국어 허브 링크 → guides 스왑 제외
    if (!(lang === 'en' && name === 'guides.html')) pairs.push(['href="../guides.html"', 'href="guides.html"']);
    apply(p, pairs);
  }
  const cdir = join(dir, 'calculators');
  let entries = [];
  try { entries = readdirSync(cdir); } catch { entries = []; }
  for (const name of entries) {
    const p = join(cdir, name);
    if (!statSync(p).isFile() || !name.endsWith('.html')) continue;
    apply(p, [
      ['href="../../market.html"', 'href="../market.html"'],
      ['href="../../guides.html"', 'href="../guides.html"'],
    ]);
  }
}
console.log('rewrote nav in ' + changed + ' files:\n  ' + touched.join('\n  '));
