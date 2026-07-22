#!/usr/bin/env node
// site/sitemap.xml 에 다국어 홈(+주요 페이지) 항목을 멱등적으로 보강한다.
// 기존 항목/포맷은 건드리지 않고, 없는 loc 만 </urlset> 앞에 추가한다.
// i18n-maintenance 워크플로가 매월 실행하며, 로컬에서도 `node scripts/gen_i18n_sitemap.mjs` 로 실행 가능.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP = join(ROOT, 'site', 'sitemap.xml');
const BASE = 'https://topda.kr';
const today = new Date().toISOString().slice(0, 10);

// 언어판에서 사이트맵에 반드시 있어야 할 페이지(현재는 각 언어 홈).
// 새 번역 페이지를 추가하면 이 목록에 넣으면 된다.
const REQUIRED = [
  { path: '/zh-Hans/index.html', priority: '0.8' },
  { path: '/zh-Hant/index.html', priority: '0.8' },
  { path: '/vi/index.html', priority: '0.8' },
  { path: '/th/index.html', priority: '0.8' },
];
// 번역 계산기 페이지(언어별 index + 해당 언어 생성 대상)
const CALC_LANGS = {
  'jeonse-monthly': ['zh-Hans', 'zh-Hant', 'vi', 'th'],
  'brokerage-fee': ['zh-Hans', 'zh-Hant', 'vi', 'th'],
  'acquisition-tax': ['zh-Hans', 'zh-Hant', 'vi', 'th'],
  'transfer-tax': ['en', 'zh-Hans', 'zh-Hant'],
  'balance-settlement': ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'],
};
for (const l of ['zh-Hans', 'zh-Hant', 'vi', 'th']) {
  REQUIRED.push({ path: `/${l}/calculators/index.html`, priority: '0.7' });
  REQUIRED.push({ path: `/${l}/glossary.html`, priority: '0.7' });
}
for (const l of ['vi', 'th']) REQUIRED.push({ path: `/${l}/jeonse.html`, priority: '0.8' });
// 언어별 허브 페이지(가이드·시세정보)
for (const l of ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th']) REQUIRED.push({ path: `/${l}/guides.html`, priority: '0.8' });
for (const l of ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th']) REQUIRED.push({ path: `/${l}/market.html`, priority: '0.7' });
for (const l of ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th']) REQUIRED.push({ path: `/${l}/calculators/search.html`, priority: '0.7' });
for (const l of ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th']) REQUIRED.push({ path: `/${l}/interior/index.html`, priority: '0.7' });
for (const l of ['zh-Hans', 'zh-Hant', 'vi', 'th']) REQUIRED.push({ path: `/${l}/foreigner-loan.html`, priority: '0.8' });
for (const l of ['zh-Hans', 'zh-Hant']) REQUIRED.push({ path: `/${l}/foreigner-tax.html`, priority: '0.8' });
for (const [calc, langs] of Object.entries(CALC_LANGS)) {
  for (const l of langs) REQUIRED.push({ path: `/${l}/calculators/${calc}.html`, priority: '0.7' });
}

if (!existsSync(SITEMAP)) {
  console.error('sitemap not found:', SITEMAP);
  process.exit(1);
}
let xml = readFileSync(SITEMAP, 'utf8');
const added = [];
for (const { path, priority } of REQUIRED) {
  const loc = BASE + path;
  if (xml.includes('<loc>' + loc + '</loc>')) continue;
  const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>\n`;
  xml = xml.replace('</urlset>', entry + '</urlset>');
  added.push(loc);
}
if (added.length) {
  writeFileSync(SITEMAP, xml);
  console.log('sitemap: added', added.length, 'entries:\n  ' + added.join('\n  '));
} else {
  console.log('sitemap: no changes (all required i18n entries present)');
}
