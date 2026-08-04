/* 국민주택채권 할인율 소스 **진단 전용** — KB 조회 폼의 실제 제출 경로를 찾는다.
 *
 * ■ 지금까지 확인된 것 (2026-08-04, probe-bond-rate.yml)
 *
 * 1차 — KB quics?page=C028010 은 데이터 페이지가 아니라 **조회 폼**이다:
 *   "기준년도/기준월 2023 … 2027 년 / 01 … 12 월 [조회]"
 *   조회를 누르기 전에는 표가 존재하지 않는다. 표 파서를 고치려던 방향은 처음부터
 *   닿을 수 없는 곳을 향하고 있었다.
 *
 * 2차 — 조회를 누르려 했으나 `:has-text("조회")` 가 좌측 **내비게이션 링크**에
 *   걸려, 페이지가 C028005 → C040727(매입내역 조회)로 이동했고 보안 키패드가 뜨는
 *   로그인 화면에 도달했다. 폼을 제출한 게 아니었다. 또 주택도시기금 FP070503 은
 *   렌더 후 본문이 882자뿐 — 제목·발자취·푸터만 있고 내용 영역이 비어 있다.
 *
 * ■ 3차(이 파일)가 하는 일
 *
 *   · 클릭 대상을 **본문 영역(#CP)** 안으로 제한한다. 좌측 메뉴를 다시 누르지 않게.
 *   · 누르기 전에 폼·select·조회 후보의 onclick 을 전부 남긴다 — 이번에 못 맞혀도
 *     다음엔 로그로 바로 고를 수 있게.
 *   · 응답 본문은 `RType=json` 인 것만 찍는다. 2차에서는 보안 키패드 JS 가 로그를
 *     통째로 덮어써 정작 필요한 줄이 묻혔다.
 *   · 페이지 이동이 일어나면 그 사실을 명시한다(폼 제출과 구분).
 */
import { chromium } from 'playwright';

const KEYWORDS = ['할인율', '고객부담', '본인부담', '매도단가'];
const URL = 'https://okbfex.kbstar.com/quics?page=C028010';

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'ko-KR' });
const page = await ctx.newPage();

const calls = [];
page.on('request', (r) => {
  if (!r.url().includes('kbstar.com')) return;
  const t = r.resourceType();
  if (t === 'xhr' || t === 'fetch' || t === 'document') {
    calls.push(`${r.method()} [${t}] ${r.url()}${r.postData() ? '\n        ← ' + r.postData().slice(0, 400) : ''}`);
  }
});
page.on('response', async (res) => {
  // 진짜 데이터일 가능성이 있는 것만. 키패드·트래킹 응답은 로그를 덮어쓴다.
  if (!res.url().includes('kbstar.com') || !/RType=json/i.test(res.url())) return;
  let body = '(읽기 실패)';
  try { body = (await res.text()).slice(0, 2500); } catch { /* noop */ }
  console.log(`  ← JSON 응답 ${res.status()} ${res.url()}\n     ${JSON.stringify(body)}`);
});
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) console.log(`  ⇢ 페이지 이동: ${f.url()}`);
});

console.log(`${'='.repeat(78)}\n[KB 조회 폼 제출 경로 찾기] ${URL}\n${'='.repeat(78)}`);
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // 본문 영역(#CP)만 본다 — 2차에서 좌측 메뉴 링크를 눌러 엉뚱한 화면으로 갔다.
  const dump = await page.evaluate(() => {
    const cp = document.querySelector('#CP') || document.body;
    const inCp = (el) => cp.contains(el);
    return {
      cpFound: !!document.querySelector('#CP'),
      selects: Array.from(document.querySelectorAll('select')).filter(inCp).map((s) => ({
        name: s.name, id: s.id, value: s.value,
        options: Array.from(s.options).map((o) => o.value).slice(0, 40),
      })),
      forms: Array.from(document.forms).map((f) => ({
        name: f.name, action: f.getAttribute('action') || '(self)', method: f.method,
        inCp: inCp(f),
        fields: Array.from(f.elements).map((el) => `${el.tagName}:${el.name}=${el.value}`).slice(0, 30),
      })),
      clickables: Array.from(cp.querySelectorAll('a,button,input[type=submit],input[type=button],input[type=image]'))
        .map((b, i) => ({
          i, tag: b.tagName, type: b.type || '',
          text: (b.innerText || b.value || b.alt || '').trim().slice(0, 30),
          href: (b.getAttribute('href') || '').slice(0, 120),
          onclick: (b.getAttribute('onclick') || '').slice(0, 250),
        }))
        .filter((b) => /조회|검색|확인/.test(b.text) || /조회|submit|Submit/.test(b.onclick)),
      // 페이지가 정의한 전역 함수 이름 — 조회 함수를 직접 부를 수 있는지 보려고.
      fnNames: Object.keys(window).filter((k) => typeof window[k] === 'function' && /조회|search|Search|query|Query|go|Go/.test(k)).slice(0, 40),
    };
  });
  console.log('  #CP 존재:', dump.cpFound);
  console.log('  본문 select:', JSON.stringify(dump.selects));
  console.log('  form:', JSON.stringify(dump.forms, null, 1));
  console.log('  본문 조회 후보:', JSON.stringify(dump.clickables, null, 1));
  console.log('  전역 함수 후보:', JSON.stringify(dump.fnNames));

  // 후보 중 첫 번째를 눌러 본다. 이동이 일어나면 위 framenavigated 로 드러난다.
  const cp = page.locator('#CP');
  const btn = cp.locator('a,button,input[type=submit],input[type=button],input[type=image]')
    .filter({ hasText: '조회' }).first();
  const n = await btn.count().catch(() => 0);
  if (n) {
    console.log('  → 본문 조회 클릭 시도');
    await btn.click({ timeout: 15000 }).catch((e) => console.log('  클릭 실패:', e.message.split('\n')[0]));
    await page.waitForTimeout(6000);
  } else {
    console.log('  ⚠ 본문에서 조회 후보를 못 찾음');
  }

  console.log(`  최종 URL: ${page.url()}`);
  console.log('  은행 도메인 요청:');
  for (const c of calls) console.log(`    · ${c}`);

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

await browser.close();
console.log('\n렌더 진단 종료 — 저장한 파일 없음.');
