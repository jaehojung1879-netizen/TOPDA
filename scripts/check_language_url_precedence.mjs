import assert from 'node:assert/strict';
import fs from 'node:fs';

const appUrl = new URL('../site/assets/app.js', import.meta.url);
const app = fs.readFileSync(appUrl, 'utf8');

assert.match(
  app,
  /const current = pathInfo\(location\.pathname\);\s*const navigationLang = current\.lang;/,
  '현재 URL 언어가 내부 탐색 언어의 기준이어야 합니다.',
);
assert.doesNotMatch(
  app,
  /location\.replace\(langHref\(preferredLang/,
  '저장 언어로 현재 URL을 강제 교체하면 안 됩니다.',
);
assert.match(
  app,
  /localStorage\.setItem\(STORAGE_KEY, l\.code\)/,
  '언어 메뉴에서 사용자가 선택한 값은 계속 저장해야 합니다.',
);

for (const page of [
  new URL('../site/calculators/acquisition-tax.html', import.meta.url),
  new URL('../site/vi/calculators/acquisition-tax.html', import.meta.url),
]) {
  const html = fs.readFileSync(page, 'utf8');
  assert.match(
    html,
    /assets\/app\.js\?v=20260725-2/,
    `${page.pathname}가 언어 라우팅 핫픽스 자산을 즉시 불러와야 합니다.`,
  );
}

console.log('명시적 URL 언어 우선 및 언어 메뉴 저장 회귀 검사 통과');
