/* 국민주택채권 할인율 소스 **진단 전용** — 실제 브라우저로 조회를 실행해 본다.
 *
 * ■ 1차 진단(2026-08-04)으로 밝혀진 것
 *
 * KB 페이지(quics?page=C028010)를 브라우저로 렌더하니 표가 아니라 **조회 폼**이었다:
 *
 *   "… 기준년도/기준월 2023 2024 2025 2026 2027 년 01 02 … 12 월 [조회]"
 *
 * 즉 조회 버튼을 누르기 전에는 표가 존재하지 않는다. 정적 GET 이든 렌더든 표를
 * 찾을 수 없었던 게 당연했고, 지금까지 파서를 고치려던 방향은 처음부터 닿을 수
 * 없는 곳을 향하고 있었다.
 *
 * 같은 진단에서 페이지 소스에 JSON 엔드포인트가 드러났다:
 *
 *   /quics?page=C028010&QAction=556954&RType=json&USER_TYPE=02
 *   /quics?page=C028010&QAction=556956&RType=json&USER_TYPE=02
 *
 * 그리고 폼 IBS 의 파라미터는 한글 이름이다: 기준년월일 · 조회구분 · 요청페이지.
 *
 * ■ 이 스크립트가 하는 일
 *
 * 조회 버튼을 실제로 눌러, 그때 나가는 요청의 **URL·POST 본문·응답 본문**을 그대로
 * 찍는다. 그래야 추측 없이 수집기를 쓸 수 있다. 값을 저장하지 않는다.
 *
 * 우리은행은 GitHub 러너에서 정적·렌더 모두 타임아웃이라(2026-08-04) 뺐다.
 * 주택도시기금은 60초 안에 load 가 끝나지 않아 domcontentloaded 로만 짧게 본다.
 */
import { chromium } from 'playwright';

const KEYWORDS = ['할인율', '고객부담', '본인부담', '매도단가'];

const browser = await chromium.launch();

/* ── KB: 조회를 눌러 실제 요청을 잡는다 ─────────────────────────────────── */
{
  const url = 'https://okbfex.kbstar.com/quics?page=C028010';
  console.log(`\n${'='.repeat(78)}\n[KB 조회 실행] ${url}\n${'='.repeat(78)}`);
  const ctx = await browser.newContext({ locale: 'ko-KR' });
  const page = await ctx.newPage();

  // 은행 도메인으로 나가는 요청·응답만 본다(구글 애널리틱스가 로그를 덮어써서).
  const seen = [];
  page.on('request', (r) => {
    if (!r.url().includes('kbstar.com')) return;
    const t = r.resourceType();
    if (t === 'xhr' || t === 'fetch' || t === 'document') {
      seen.push({ method: r.method(), url: r.url(), post: r.postData() || '' });
    }
  });
  page.on('response', async (res) => {
    if (!res.url().includes('kbstar.com')) return;
    const t = res.request().resourceType();
    if (t !== 'xhr' && t !== 'fetch') return;
    let body = '';
    try { body = (await res.text()).slice(0, 3000); } catch { body = '(본문 읽기 실패)'; }
    console.log(`  ← 응답 ${res.status()} ${res.url()}\n     ${JSON.stringify(body)}`);
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    // 조회 폼의 구조를 먼저 남긴다 — 어떤 select·button 을 눌러야 하는지 기록.
    const form = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('select')).map((s) => ({
        name: s.name, id: s.id,
        options: Array.from(s.options).slice(0, 40).map((o) => o.value),
        value: s.value,
      }));
      const btns = Array.from(document.querySelectorAll('a,button,input[type=submit],input[type=button]'))
        .map((b) => ({ tag: b.tagName, text: (b.innerText || b.value || '').trim().slice(0, 20),
                       href: b.getAttribute('href') || '', onclick: (b.getAttribute('onclick') || '').slice(0, 200) }))
        .filter((b) => b.text.includes('조회') || /조회/.test(b.onclick));
      const forms = Array.from(document.forms).map((f) => ({
        name: f.name, action: f.getAttribute('action') || '(self)', method: f.method,
        fields: Array.from(f.elements).map((el) => `${el.name}=${el.value}`).slice(0, 30),
      }));
      return { sels, btns, forms };
    });
    console.log('  select:', JSON.stringify(form.sels));
    console.log('  조회 버튼 후보:', JSON.stringify(form.btns, null, 1));
    console.log('  form:', JSON.stringify(form.forms, null, 1));

    // 조회 클릭 — 이 시점에 나가는 요청이 우리가 찾는 엔드포인트다.
    const btn = page.locator('a:has-text("조회"), input[value="조회"], button:has-text("조회")').first();
    if (await btn.count()) {
      console.log('  → 조회 클릭');
      await btn.click({ timeout: 15000 }).catch((e) => console.log('  클릭 실패:', e.message.split('\n')[0]));
      await page.waitForTimeout(6000);
    } else {
      console.log('  ⚠ 조회 버튼을 못 찾음');
    }

    console.log('  은행 도메인 요청 목록:');
    for (const s of seen) console.log(`    · ${s.method} ${s.url}${s.post ? '\n        POST ← ' + s.post.slice(0, 500) : ''}`);

    // 조회 후 표가 생겼는지.
    const tables = await page.evaluate((kws) => Array.from(document.querySelectorAll('table')).map((t) => {
      const rows = Array.from(t.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th,td')).map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
      return { hit: kws.some((k) => rows.flat().join(' ').includes(k)), rows: rows.slice(0, 15) };
    }).filter((t) => t.hit), KEYWORDS);
    if (tables.length) {
      console.log('  조회 후 표:');
      for (const t of tables) for (const r of t.rows) console.log(`    ${JSON.stringify(r)}`);
    } else {
      console.log('  ⚠ 조회 후에도 키워드 표 없음');
    }
  } catch (e) {
    console.log(`  ✗ 실패: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
}

/* ── 주택도시기금: load 가 안 끝나 짧게만 확인 ───────────────────────────── */
{
  const url = 'https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070503.jsp';
  console.log(`\n${'='.repeat(78)}\n[주택도시기금] ${url}\n${'='.repeat(78)}`);
  const ctx = await browser.newContext({ locale: 'ko-KR' });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    const txt = await page.evaluate(() => document.body ? document.body.innerText.replace(/\s+/g, ' ') : '');
    console.log(`  본문 len=${txt.length}`);
    const i = txt.search(/할인율|고객부담/);
    console.log('  키워드 주변:', i >= 0 ? txt.slice(Math.max(0, i - 200), i + 900) : '(없음)');
  } catch (e) {
    console.log(`  ✗ 실패: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
}

await browser.close();
console.log('\n렌더 진단 종료 — 저장한 파일 없음.');
