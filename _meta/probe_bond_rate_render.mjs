/* 국민주택채권 할인율 소스 **진단 전용** — 실제 브라우저로 렌더링해 본다.
 *
 * probe_bond_rate.py 는 "정적 GET 으로 표가 오는가"를 본다. 이 스크립트는 그 반대편
 * 가설을 확인한다: 표가 JS 로 채워진다면 브라우저로 열면 보여야 한다. 어느 쪽이
 * 맞는지에 따라 수집기를 고치는 방향이 완전히 갈린다.
 *   · 정적 GET 으로 온다  → 파서만 고치면 된다(지금 코드 유지)
 *   · JS 로만 채워진다     → 파서를 고쳐도 영원히 실패한다. 요청 URL 을 찾아
 *                            직접 호출하거나, 수집을 브라우저 기반으로 바꿔야 한다
 *
 * 값을 저장하지 않는다. 렌더 후 표 텍스트와, 페이지가 실제로 보낸 XHR/fetch 요청
 * 목록(=진짜 데이터 엔드포인트 후보)을 로그로 남긴다.
 */
import { chromium } from 'playwright';

const TARGETS = [
  ['주택도시기금 FP070503', 'https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070503.jsp'],
  ['KB 매도단가/할인율조회', 'https://okbfex.kbstar.com/quics?page=C028010'],
  ['우리은행 1종채권', 'https://svc.wooribank.com/svc/Dream?withyou=HBNHB0036'],
];

const KEYWORDS = ['할인율', '고객부담', '본인부담', '매도단가'];

const browser = await chromium.launch();

for (const [label, url] of TARGETS) {
  console.log(`\n${'='.repeat(78)}\n[render] ${label}\n  ${url}\n${'='.repeat(78)}`);
  const ctx = await browser.newContext({ locale: 'ko-KR' });
  const page = await ctx.newPage();

  // 페이지가 스스로 부르는 요청 = 우리가 직접 호출하고 싶은 엔드포인트.
  const calls = [];
  page.on('request', (r) => {
    const t = r.resourceType();
    if (t === 'xhr' || t === 'fetch' || t === 'document') {
      calls.push(`${r.method()} [${t}] ${r.url()}${r.postData() ? ' ← ' + r.postData().slice(0, 300) : ''}`);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    console.log(`  ✗ goto 실패: ${e.message.split('\n')[0]}`);
    await ctx.close();
    continue;
  }
  // 값이 늦게 꽂히는 경우가 있어 조금 더 기다린다.
  await page.waitForTimeout(4000);

  console.log('  요청 목록:');
  for (const c of calls) console.log(`    · ${c}`);

  // 키워드를 담은 표만 골라 텍스트로 뽑는다 — 페이지 전체를 뱉으면 메뉴에 묻힌다.
  const tables = await page.evaluate((kws) => {
    return Array.from(document.querySelectorAll('table')).map((t, i) => {
      const rows = Array.from(t.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.querySelectorAll('th,td')).map((c) => c.innerText.replace(/\s+/g, ' ').trim()));
      const flat = rows.flat().join(' ');
      return { i, hit: kws.some((k) => flat.includes(k)), rows: rows.slice(0, 12) };
    }).filter((t) => t.hit);
  }, KEYWORDS);

  if (!tables.length) {
    console.log('  ⚠ 키워드를 담은 <table> 없음. 프레임을 확인한다:');
    for (const f of page.frames()) {
      const txt = (await f.evaluate(() => document.body ? document.body.innerText : '').catch(() => '')) || '';
      const hit = KEYWORDS.find((k) => txt.includes(k));
      console.log(`    · frame ${f.url().slice(0, 120)} — ${hit ? `키워드 '${hit}' 있음` : '없음'} (len=${txt.length})`);
      if (hit) console.log(`      ${txt.replace(/\s+/g, ' ').slice(0, 1200)}`);
    }
  } else {
    for (const t of tables) {
      console.log(`  <table #${t.i}>`);
      for (const r of t.rows) console.log(`    ${JSON.stringify(r)}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log('\n렌더 진단 종료 — 저장한 파일 없음.');
