#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const searchIndexPath = join(root, 'site', 'assets', 'search-index.json');
const data = JSON.parse(readFileSync(searchIndexPath, 'utf8'));

const recentPosts = [
  {
    title: '2026년 상반기 매매 이슈 정리 — 가격 흐름·규제지역·양도세',
    desc: '2026년 1~6월 주택가격 변화와 권역별 격차를 차트로 비교하고, 1~5월 거래량·하반기 전망·규제·양도세를 함께 정리한 가이드.',
    url: 'posts/recent-sale-issues-2026.html',
    type: '가이드',
    cat: '매매'
  },
  {
    title: '2026년 상반기 전세 이슈 정리 — 전셋값·보증·전세사기 지원',
    desc: '2026년 4~7월 전세·월세 가격, 전세사기 피해자 지원, HUG 반환보증과 임대사업자 보증 심사 변화.',
    url: 'posts/recent-jeonse-issues-2026.html',
    type: '가이드',
    cat: '전세·월세'
  },
  {
    title: '2026년 상반기 대출 이슈 정리 — LTV·가계부채·기준금리',
    desc: '2026년 4~7월 가계대출 총량 관리, 규제지역 LTV 40%, 다주택자 만기연장 제한, 기준금리 2.75%의 영향.',
    url: 'posts/recent-loan-issues-2026.html',
    type: '가이드',
    cat: '대출·금융'
  }
];

const recentUrls = new Set(recentPosts.map((post) => post.url));
data.items = data.items.filter((item) => !recentUrls.has(item.url));

const allPosts = data.items.find((item) => item.url === 'posts/index.html');
if (!allPosts) throw new Error('search-index.json에서 전체 글 항목을 찾지 못했습니다.');
allPosts.desc = '부동산 거래 가이드 글 34편';

const insertAt = data.items.indexOf(allPosts) + 1;
data.items.splice(insertAt, 0, ...recentPosts);
data.count = data.items.length;

writeFileSync(searchIndexPath, JSON.stringify(data), 'utf8');
console.log(`search-index.json: ${recentPosts.length}개 최신 이슈 포스트 등록, 전체 ${data.count}개`);
