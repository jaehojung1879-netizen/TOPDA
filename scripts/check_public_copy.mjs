import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const calculatorsDir = resolve(root, 'site/calculators');

for (const filename of readdirSync(calculatorsDir).filter((name) => name.endsWith('.html'))) {
  const html = read(`site/calculators/${filename}`);
  assert.doesNotMatch(html, /계산 방식 변경 이력/, `${filename}: 개발용 변경 이력이 공개 화면에 노출됨`);
  assert.doesNotMatch(html, /실사용자 제보로 확인된 계산 오류/, `${filename}: 내부 이슈 설명이 공개 화면에 노출됨`);
  assert.doesNotMatch(html, />\s*P0\s*</, `${filename}: 내부 우선순위가 공개 화면에 노출됨`);
}

const hub = read('site/calculators/index.html');
assert.doesNotMatch(hub, /공식 자료 기반 인터랙티브 도구/);

const dashboard = read('site/calculators/total-cost-dashboard.html');
assert.doesNotMatch(dashboard, /부동산 종합 계산 대시보드/);
assert.match(dashboard, /부동산 종합 계산기/);

const finder = read('site/calculators/search.html');
assert.doesNotMatch(finder, />상승기대</);
assert.doesNotMatch(finder, />추천 받기</);
assert.match(finder, />단지 찾기</);

const commercialRent = read('site/calculators/commercial-rent.html');
assert.doesNotMatch(commercialRent, /RONE_COMM_TABLES/);

console.log('방문자용 계산기 문구 검사 통과');
