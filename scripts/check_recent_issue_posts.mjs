#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const posts = [
  { slug: 'recent-sale-issues-2026.html', category: 'sale.html' },
  { slug: 'recent-jeonse-issues-2026.html', category: 'lease.html' },
  { slug: 'recent-loan-issues-2026.html', category: 'loan.html' }
];
const saleVisuals = [
  '../assets/images/posts/2026-h1-sale-cumulative.svg',
  '../assets/images/posts/2026-h1-sale-monthly-heatmap.svg',
  '../assets/images/posts/2026-jan-may-sale-transactions.svg'
];
const errors = [];

for (const { slug, category } of posts) {
  const file = join(site, 'posts', slug);
  if (!existsSync(file)) {
    errors.push(`누락된 포스트: ${slug}`);
    continue;
  }

  const html = readFileSync(file, 'utf8');
  const required = [
    '<meta name="description"',
    '<link rel="canonical"',
    '"@type": "Article"',
    '"datePublished": "2026-07-25"',
    '자료 기준 2026.07.25',
    '이슈 정리',
    '공식 자료',
    '<nav class="g-toc"',
    '<h2'
  ];
  for (const marker of required) {
    if (!html.includes(marker)) errors.push(`${slug}: 필수 콘텐츠 누락 (${marker})`);
  }
  if (slug === 'recent-sale-issues-2026.html') {
    const saleMarkers = [
      '서울은 4.52%',
      '1~5월 누계 327,455건',
      '6월 주택 매매거래량은 2026년 7월 25일 현재 공식 공표 전',
      '<figure class="data-figure">'
    ];
    for (const marker of saleMarkers) {
      if (!html.includes(marker)) errors.push(`${slug}: 상반기 리뷰 필수 내용 누락 (${marker})`);
    }
    const figureCount = (html.match(/<figure class="data-figure">/g) || []).length;
    if (figureCount !== saleVisuals.length) {
      errors.push(`${slug}: 데이터 시각화 수 불일치 (${figureCount}/${saleVisuals.length})`);
    }
    for (const visual of saleVisuals) {
      if (!html.includes(`src="${visual}"`)) errors.push(`${slug}: 시각화 연결 누락 (${visual})`);
      if (!existsSync(resolve(dirname(file), visual))) errors.push(`${slug}: 시각화 파일 누락 (${visual})`);
    }
  } else if (/<div class="g-hero-media"|<figure class="data-figure"|<img\b/i.test(html)) {
    errors.push(`${slug}: 요청하지 않은 본문 이미지가 포함됨`);
  }
  if (/빅 이슈|이슈\s+[1-9]|뷰 포인트/.test(html)) {
    errors.push(`${slug}: 과장되거나 지시를 그대로 옮긴 표현이 포함됨`);
  }

  const hrefPattern = /href="([^"]+)"/g;
  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/.test(href)) continue;
    const target = resolve(dirname(file), href.split(/[?#]/)[0]);
    if (!existsSync(target)) errors.push(`${slug}: 존재하지 않는 내부 링크 ${href}`);
  }

  const categoryHtml = readFileSync(join(site, 'categories', category), 'utf8');
  if (!categoryHtml.includes(`../posts/${slug}`)) {
    errors.push(`${category}: ${slug} 링크 누락`);
  }
}

const expectedSurfaces = [
  join(site, 'posts', 'index.html'),
  join(site, 'guides.html'),
  join(site, 'feed.xml'),
  join(site, 'sitemap.xml'),
  join(root, 'sitemap.xml')
];
for (const surface of expectedSurfaces) {
  const text = readFileSync(surface, 'utf8');
  for (const { slug } of posts) {
    if (!text.includes(slug)) errors.push(`${surface}: ${slug} 링크 누락`);
  }
}

const searchIndex = JSON.parse(readFileSync(join(site, 'assets', 'search-index.json'), 'utf8'));
if (searchIndex.count !== searchIndex.items.length) {
  errors.push(`검색 인덱스 count 불일치: ${searchIndex.count} / ${searchIndex.items.length}`);
}
for (const { slug } of posts) {
  if (!searchIndex.items.some((item) => item.url === `posts/${slug}`)) {
    errors.push(`검색 인덱스 누락: ${slug}`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log('최근 이슈 포스트 3개: 콘텐츠·매매 시각화·내부 링크·노출 경로 검증 통과');
