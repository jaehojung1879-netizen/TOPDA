#!/usr/bin/env node
// site/sitemap-all.xml 에 다국어 홈(+주요 페이지) 항목을 멱등적으로 보강한다.
// 기존 항목/포맷은 건드리지 않고, 없는 loc 만 </urlset> 앞에 추가한다.
// i18n-maintenance 워크플로가 매월 실행하며, 로컬에서도 `node scripts/gen_i18n_sitemap.mjs` 로 실행 가능.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 공개 sitemap.xml은 sitemap index다. 평면 목록은 sitemap-all.xml 이고,
// _meta/build_sitemaps.py 가 이걸 분류별로 쪼개 index를 만든다.
const SITEMAP = join(ROOT, 'site', 'sitemap-all.xml');
const BASE = 'https://topda.kr';
const today = new Date().toISOString().slice(0, 10);

// 실을 대상 = 언어판에서 **색인이 허용된 실제 파일** 전부.
//
// 예전에는 이 목록을 손으로 유지했다. 그러면 새로 만든 번역 페이지가 조용히 빠진다 —
// 실제로 2026-08-08 감사에서 /en/interior/*(7) · /en/posts/interior-*(4) ·
// /en/calculators/interior-estimate.html · /en/checklists/interior-contract.html 등
// 14개가 **색인은 허용해 놓고 sitemap 어디에도 없는** 상태였다. 본문 7,000~9,900자로
// 사이트에서 품질이 높은 축에 드는 페이지들이다.
//
// 목록을 늘려 막는 대신 디스크를 읽는다. 색인 허용 여부의 단일 판단 기준은 robots 메타이며,
// 그 메타는 _meta/apply_index_policy.py 의 언어·품질 게이트가 결정한다. 여기서 그 판단을
// 다시 하지 않는다 — 두 곳에서 판단하면 어긋난다.
//   · noindex 인 페이지는 싣지 않는다(zh-Hans·zh-Hant·vi·th 는 현재 전부 noindex).
//   · 그래도 이 스크립트는 '추가만' 한다. 기존 항목은 지우지 않는다(멱등).
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];
const NOINDEX_RE = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i;

// priority 는 약한 신호라 정교하게 나눌 이유가 없다. 언어 홈과 최상위 허브만 0.8.
function priorityOf(path) {
  const rest = path.split('/').slice(2);           // ['calculators','search.html'] 등
  return rest.length === 1 ? '0.8' : '0.7';
}

function collectIndexable() {
  const out = [];
  for (const lang of LANGS) {
    const base = join(ROOT, 'site', lang);
    if (!existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) { stack.push(full); continue; }
        if (!ent.name.endsWith('.html')) continue;
        const head = readFileSync(full, 'utf8').split('</head>')[0];
        if (NOINDEX_RE.test(head)) continue;
        const path = '/' + relative(join(ROOT, 'site'), full).split(sep).join('/');
        out.push({ path, priority: priorityOf(path) });
      }
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

const REQUIRED = collectIndexable();

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
