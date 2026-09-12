// Run against the built site. No network requests except our local HTTP server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const site = resolve('site');
const output = resolve(process.env.EDITORIAL_SCREENSHOTS || 'artifacts/editorial');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(site, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  if (!file.startsWith(site + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' })[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path] of [
      ['home', '/'],
      ['hub', '/posts/index.html'],
      ['report', '/posts/weekly-market-2026-09-07.html']
    ]) {
      await page.goto(origin + path);
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${width}`);
      if (name === 'home') {
        const magazineHref = await page.locator('.cat-tile').nth(0).getAttribute('href');
        assert.equal(new URL(magazineHref, page.url()).pathname, '/posts/index.html');
        if (width === 360) {
          const magazine = await page.locator('.cat-tile').nth(0).boundingBox();
          const sale = await page.locator('.cat-tile').nth(1).boundingBox();
          assert.equal(magazine.y, sale.y, 'Magazine must sit immediately left of sale on mobile');
        }
      }
      if (name === 'report') {
        assert(await page.getByRole('heading', { name: /강남3구는 모두 내렸습니다/ }).isVisible());
        assert.equal(await page.locator('.market-kpi').count(), 4);
      }
    }
  }
  const total = await page.locator('#postGrid .card').count();
  assert(total > 0);
  await page.getByRole('button', { name: '주간 시장 리포트', exact: true }).click();
  assert.equal(await page.locator('#postGrid .card:visible').count(), await page.locator('#postGrid .card[data-series="market"]').count());
  assert.equal(await page.locator('#postGrid .card[data-series="market"]').count(), 1);
  assert(new URL(page.url()).searchParams.get('series') === 'market');
  await page.getByRole('button', { name: '실용 포스트', exact: true }).click();
  await page.locator('.post-chip[data-cat="매매"]').click();
  await page.getByRole('searchbox', { name: '글 검색', exact: true }).fill('1층');
  assert.equal(await page.locator('#postGrid .card:visible').count(), 1);
  await page.reload();
  assert.equal(await page.locator('#postGrid .card:visible').count(), 1, 'URL filters must survive reload');
  await page.getByRole('searchbox', { name: '글 검색', exact: true }).fill('존재하지않는키워드xyz');
  assert(await page.locator('#postEmpty').isVisible());
  await page.goto(origin + '/posts/index.html?cat=' + encodeURIComponent('전세·월세'));
  assert(await page.locator('#postGrid .card:visible').count() > 0, 'Legacy category deep links');
  assert.equal(await page.locator('.post-chip[data-cat="전세·월세"]').getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(origin);
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'true');
  await page.locator('[data-nav-toggle]').click();
  assert.equal(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'false');
  await page.locator('.cat-tile-editorial').click();
  assert(page.url().endsWith('/posts/index.html'));
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  await nojs.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const staticPage = await nojs.newPage();
  await staticPage.goto(origin + '/posts/index.html');
  assert.equal(await staticPage.locator('#postGrid .card:visible').count(), total);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: 4 widths, magazine left of sale, weekly report charts, filters, deep links, mobile menu, no-JS archive.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
