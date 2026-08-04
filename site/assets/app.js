// ===== Common =====
(function () {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (toggle && menu) {
    toggle.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // ===== Language switcher (globe + dropdown / mobile bottom-sheet) =====
  // 지원 언어. 각 항목은 자국어 표기 언어명과 SVG 국기(/assets/flags/*.svg)를 쓴다.
  // 국기는 이모지가 아닌 SVG로 관리해 일부 OS/브라우저의 이모지 국기 미렌더링을 회피한다.
  const LANGS = [
    { code: 'ko',      name: '한국어' },
    { code: 'en',      name: 'English' },
    { code: 'zh-Hans', name: '简体中文' },
    { code: 'zh-Hant', name: '繁體中文' },
    { code: 'vi',      name: 'Tiếng Việt' },
    { code: 'th',      name: 'ภาษาไทย' },
  ];
  // 언어별 존재하는 페이지 맵(basePath 기준). 없는 언어/페이지는 해당 언어 홈으로 폴백해
  // 죽은 링크(404)를 방지한다. 신규 페이지 추가 시 이 맵만 갱신하면 된다.
  // (i18n-maintenance 워크플로가 이 맵과 실제 파일의 정합성을 점검한다.)
  const PAGES = {
    ko: { all: true, exclude: ['foreigner-loan.html', 'foreigner-tax.html', 'jeonse.html', 'glossary.html'] },
    en: { list: ['index.html', '404.html', 'guides.html', 'market.html', 'interior/index.html', 'interior/cost.html', 'interior/flooring.html', 'interior/wallpaper.html', 'interior/tile.html', 'interior/bathroom.html', 'interior/kitchen.html', 'interior/windows.html', 'posts/interior-company.html', 'posts/interior-quote.html', 'posts/interior-contract.html', 'posts/interior-defect.html', 'posts/property-tour.html', 'posts/registry-reading.html', 'posts/sale-contract-tips.html', 'posts/balance-day-settlement.html', 'posts/tax-roadmap.html', 'posts/moving-company.html', 'posts/moving-quote.html', 'posts/moving-types.html', 'posts/moving-day-tips.html', 'posts/storage-moving.html', 'posts/move-in-admin.html', 'checklists/interior-contract.html', 'jeonse.html', 'foreigner-loan.html', 'foreigner-tax.html', 'glossary.html', 'auction.html', 'sale.html', 'moving.html', 'about.html', 'feedback.html', 'calculators/index.html', 'calculators/search.html', 'calculators/interior-estimate.html', 'calculators/acquisition-tax.html', 'calculators/brokerage-fee.html', 'calculators/jeonse-monthly.html', 'calculators/auction-bid.html', 'calculators/transfer-tax.html', 'calculators/balance-settlement.html', 'calculators/total-cost-dashboard.html'] },
    'zh-Hans': { list: ['index.html', 'guides.html', 'market.html', 'interior/index.html', 'calculators/search.html', 'glossary.html', 'foreigner-loan.html', 'foreigner-tax.html', 'calculators/index.html', 'calculators/jeonse-monthly.html', 'calculators/brokerage-fee.html', 'calculators/acquisition-tax.html', 'calculators/transfer-tax.html', 'calculators/balance-settlement.html'] },
    'zh-Hant': { list: ['index.html', 'guides.html', 'market.html', 'interior/index.html', 'calculators/search.html', 'glossary.html', 'foreigner-loan.html', 'foreigner-tax.html', 'calculators/index.html', 'calculators/jeonse-monthly.html', 'calculators/brokerage-fee.html', 'calculators/acquisition-tax.html', 'calculators/transfer-tax.html', 'calculators/balance-settlement.html'] },
    vi: { list: ['index.html', 'guides.html', 'market.html', 'interior/index.html', 'glossary.html', 'jeonse.html', 'foreigner-loan.html', 'calculators/index.html', 'calculators/jeonse-monthly.html', 'calculators/brokerage-fee.html', 'calculators/acquisition-tax.html', 'calculators/balance-settlement.html'] },
    th: { list: ['index.html', 'guides.html', 'market.html', 'interior/index.html', 'glossary.html', 'jeonse.html', 'foreigner-loan.html', 'calculators/index.html', 'calculators/jeonse-monthly.html', 'calculators/brokerage-fee.html', 'calculators/acquisition-tax.html', 'calculators/balance-settlement.html'] },
  };
  const LANG_PREFIX = ['en', 'zh-Hans', 'zh-Hant', 'vi', 'th'];

  function pageExists(lang, base) {
    const m = PAGES[lang];
    if (!m) return false;
    if (base === '' || base === 'index.html') return true;
    if (m.all) return !(m.exclude || []).includes(base);
    return (m.list || []).includes(base);
  }
  function langHref(lang, base) {
    let b = pageExists(lang, base) ? base : 'index.html';
    if (b === '') b = 'index.html';
    return lang === 'ko' ? '/' + b : '/' + lang + '/' + b;
  }

  const STORAGE_KEY = 'topda-language';
  function pathInfo(pathname) {
    const segs = pathname.replace(/^\/+/, '').split('/');
    const lang = LANG_PREFIX.includes(segs[0]) ? segs.shift() : 'ko';
    return { lang, base: segs.join('/') || 'index.html' };
  }
  // The URL is the source of truth on page load. A stored preference must not
  // override an explicit URL opened from the address bar, a bookmark or search
  // result (for example /calculators/... must stay Korean even if "vi" was
  // selected in an earlier session). Internal links are normalized below, so
  // an English/Vietnamese/etc. journey still retains its current URL language.
  const current = pathInfo(location.pathname);
  const navigationLang = current.lang;

  try {
    const header = document.querySelector('.site-header .row');
    if (header) {
      // 현재 언어와 base 경로(언어 접두사 제거)를 URL에서 계산 (브라우저 저장 미사용)
      const segs = location.pathname.replace(/^\/+/, '').split('/');
      let curLang = 'ko';
      let base;
      if (LANG_PREFIX.indexOf(segs[0]) !== -1) { curLang = segs[0]; base = segs.slice(1).join('/'); }
      else { base = segs.join('/'); }
      if (base === '') base = 'index.html';

      // 기존 KR/EN 텍스트 토글이 있으면 제거하고 새 스위처로 교체
      header.querySelectorAll('.lang-switch').forEach((el) => el.remove());

      const wrap = document.createElement('div');
      wrap.className = 'lang-switch2';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lang-globe';
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Language · 언어 선택');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z"/></svg>';

      const backdrop = document.createElement('div');
      backdrop.className = 'lang-backdrop';
      backdrop.hidden = true;

      const menu = document.createElement('div');
      menu.className = 'lang-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Select language');
      menu.hidden = true;
      const head = document.createElement('div');
      head.className = 'lang-menu-head';
      head.textContent = 'Language · 언어';
      menu.appendChild(head);

      LANGS.forEach((l) => {
        const a = document.createElement('a');
        a.className = 'lang-item';
        a.setAttribute('role', 'menuitem');
        a.setAttribute('lang', l.code);
        a.setAttribute('hreflang', l.code);
        a.href = langHref(l.code, base);
        a.addEventListener('click', () => {
          try { localStorage.setItem(STORAGE_KEY, l.code); } catch (e) {}
        });
        if (l.code === curLang) { a.classList.add('is-current'); a.setAttribute('aria-current', 'true'); }
        a.innerHTML =
          '<img class="lang-flag" src="/assets/flags/' + l.code + '.svg" alt="" width="20" height="15" loading="lazy" />' +
          '<span class="lang-name">' + l.name + '</span>' +
          '<span class="lang-check" aria-hidden="true">' + (l.code === curLang ? '✓' : '') + '</span>';
        menu.appendChild(a);
      });

      const items = () => Array.from(menu.querySelectorAll('.lang-item'));
      // 데스크톱 드롭다운 위치는 버튼 기준으로 JS가 계산해 인라인으로 지정한다.
      // .site-header 가 backdrop-filter를 쓰는데, 이는 position:fixed 자손의
      // containing block을 header로 바꿔버려(뷰포트 기준이 아니게 됨) 메뉴를
      // header 안에 두면 모바일 바텀시트가 화면 밖으로 밀려 안 보이는 문제가
      // 있었다. 그래서 menu는 header가 아니라 body의 직계 자식으로 둔다.
      const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
      const positionMenu = () => {
        if (isMobile()) {
          menu.style.top = ''; menu.style.right = ''; menu.style.bottom = ''; menu.style.left = '';
          return;
        }
        const r = btn.getBoundingClientRect();
        menu.style.top = Math.round(r.bottom + 8) + 'px';
        menu.style.right = Math.round(window.innerWidth - r.right) + 'px';
        menu.style.left = 'auto'; menu.style.bottom = 'auto';
      };
      const open = () => {
        menu.hidden = false; backdrop.hidden = false;
        positionMenu();
        btn.setAttribute('aria-expanded', 'true');
        document.body.classList.add('lang-open');
        const cur = menu.querySelector('.lang-item.is-current') || items()[0];
        if (cur) cur.focus();
      };
      const close = () => {
        menu.hidden = true; backdrop.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('lang-open');
      };
      const toggle = () => (menu.hidden ? open() : close());

      btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
      backdrop.addEventListener('click', close);
      document.addEventListener('click', (e) => { if (!wrap.contains(e.target) && !menu.contains(e.target)) close(); });
      window.addEventListener('resize', () => { if (!menu.hidden) positionMenu(); });
      document.addEventListener('keydown', (e) => {
        if (menu.hidden) return;
        const list = items();
        const idx = list.indexOf(document.activeElement);
        if (e.key === 'Escape') { close(); btn.focus(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); (list[idx + 1] || list[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (list[idx - 1] || list[list.length - 1]).focus(); }
        else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      });

      wrap.appendChild(btn);
      const navToggle = header.querySelector('.nav-toggle');
      if (navToggle) header.insertBefore(wrap, navToggle);
      else header.appendChild(wrap);
      document.body.appendChild(backdrop);
      document.body.appendChild(menu);
    }
  } catch (e) {}

  // Normalize ordinary same-origin document links. Protocol links, downloads,
  // fragments and explicit language-switcher links are deliberately untouched.
  if (navigationLang) document.querySelectorAll('a[href]').forEach((a) => {
    const raw = a.getAttribute('href');
    if (!raw || raw[0] === '#' || a.hasAttribute('download') || /^(?:mailto:|tel:|javascript:|data:)/i.test(raw) || a.classList.contains('lang-item')) return;
    let url;
    try { url = new URL(raw, location.href); } catch (e) { return; }
    if (url.origin !== location.origin) return;
    const target = pathInfo(url.pathname);
    if (!pageExists(navigationLang, target.base)) {
      // Never disguise a missing translation by opening its Korean counterpart.
      // English visitors get an explicit English missing-translation page.
      if (navigationLang === 'en' && target.lang === 'ko') {
        a.href = '/en/404.html?missing=' + encodeURIComponent(target.base);
      }
      return;
    }
    a.href = langHref(navigationLang, target.base) + url.search + url.hash;
  });

  // Mark active nav link
  const path = location.pathname.replace(/\/$/, '');
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href) return;
    if (path.endsWith(href.replace(/^(\.\.?\/)*/, '/')) || (href === 'index.html' && (path === '' || path.endsWith('/index.html')))) {
      a.classList.add('active');
    }
  });
})();

// ===== Foreigner loan advisory (대출 계산기 안내 배지) =====
// 외국인은 대출·보증 이용에 제약이 크다. 대출 관련 계산기 상단에 안내 배너를 주입한다.
// 계산 로직은 건드리지 않으며(제약 준수), 안내/링크만 추가한다.
(function () {
  const LOAN_PAGES = ['loan-limit', 'dsr', 'loan-compare', 'rti-calculator'];
  const path = location.pathname;
  if (!LOAN_PAGES.some((p) => path.indexOf('/calculators/' + p) !== -1)) return;
  const main = document.querySelector('main');
  if (!main || main.querySelector('.foreigner-loan-advisory')) return;
  const en = document.documentElement.lang !== 'ko';
  // foreigner-loan 안내 페이지 상대경로 계산
  const loanHref = path.indexOf('/en/') !== -1 ? '../foreigner-loan.html' : '/en/foreigner-loan.html';
  const box = document.createElement('div');
  box.className = 'callout callout-warn foreigner-loan-advisory';
  box.setAttribute('role', 'note');
  box.innerHTML =
    '<div class="icon">!</div><div class="body">' +
    (en
      ? '<strong>Foreigners: loan access is restricted</strong> Eligibility for mortgages, Jeonse loans, and guarantees depends on visa type, residence registration, and income proof. Policy loans and housing-subscription are generally restricted. This tool computes the same figures regardless of nationality — confirm what you can actually use in the <a href="' + loanHref + '">foreigner loan guide</a>.'
      : '<strong>외국인 안내</strong> 외국인은 주택담보·전세자금 대출과 보증 상품 이용에 제약이 있습니다. 비자·거소증·소득증빙에 따라 취급 여부가 달라지며, 정책대출·청약은 일반적으로 제한됩니다. 계산 결과는 국적과 무관하게 동일하니, 실제 이용 가능 여부는 <a href="' + loanHref + '">외국인 대출 안내</a>에서 확인하세요.') +
    '</div>';
  const firstSection = main.querySelector('.article-header, section, .container, .container-narrow');
  if (firstSection && firstSection.parentElement === main) main.insertBefore(box, firstSection.nextSibling);
  else main.insertBefore(box, main.firstChild);
})();

// ===== Formatting =====
// 한국어(ko) 외의 모든 언어판(en/zh-Hans/zh-Hant/vi/th)은 통화·동적 문구를
// 국제 표기(KRW·영문)로 렌더링한다. (한국어 원본은 '원'·국문 그대로 유지)
const isEn = document.documentElement.lang !== 'ko';
const fmt = {
  won: (n) => {
    if (n === null || n === undefined || isNaN(n)) return isEn ? 'KRW 0' : '0원';
    const num = Math.round(n).toLocaleString('ko-KR');
    return isEn ? ('KRW ' + num) : (num + '원');
  },
  number: (n) => {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.round(n).toLocaleString('ko-KR');
  },
  parseWon: (s) => {
    if (typeof s !== 'string') s = String(s ?? '');
    const cleaned = s.replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  },
};

// 단위 변환: 큰 금액을 '억/만 원'으로 사람이 읽기 쉽게
fmt.eokMan = (n) => {
  if (!n || n < 10000) return '';
  const eok = Math.floor(n / 100000000);
  const man = Math.floor((n % 100000000) / 10000);
  if (isEn) {
    // 영문 페이지: 백만/십억 단위로 표시
    const million = n / 1000000;
    if (n >= 1000000000) return '≈ KRW ' + (n / 1000000000).toFixed(2) + ' billion';
    if (n >= 1000000) return '≈ KRW ' + million.toFixed(1) + ' million';
    return '';
  }
  const parts = [];
  if (eok) parts.push(eok.toLocaleString('ko-KR') + '억');
  if (man) parts.push(man.toLocaleString('ko-KR') + '만');
  return parts.length ? '약 ' + parts.join(' ') + ' 원' : '';
};

function updateEokHint(input) {
  const n = fmt.parseWon(input.value);
  const text = fmt.eokMan(n);
  let host = input.closest('.field') || input.parentElement;
  if (!host) return;
  let hint = host.querySelector(':scope > .eok-hint');
  if (!hint) {
    hint = document.createElement('span');
    hint.className = 'eok-hint';
    // 가능하면 .input-suffix 바로 다음에, 아니면 host 끝에 삽입
    const after = host.querySelector('.input-suffix') || input;
    if (after && after.parentElement === host) {
      after.insertAdjacentElement('afterend', hint);
    } else {
      host.appendChild(hint);
    }
  }
  hint.textContent = text;
  hint.style.display = text ? '' : 'none';
}

// Live-format any input with data-format="won"
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.dataset.format !== 'won') return;
  const raw = t.value.replace(/[^0-9]/g, '');
  t.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
  try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) {}
  updateEokHint(t);
});

// 페이지 로드 시 기존값에도 적용
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[data-format="won"]').forEach(updateEokHint);
});

// ===== Checklist persistence =====
(function () {
  const lists = document.querySelectorAll('[data-checklist]');
  if (!lists.length) return;
  lists.forEach((list) => {
    const key = 'cl:' + (list.dataset.checklist || location.pathname);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    const items = list.querySelectorAll('input[type="checkbox"]');
    items.forEach((cb) => {
      const id = cb.dataset.id || cb.id;
      if (!id) return;
      if (saved[id]) {
        cb.checked = true;
        cb.closest('.check-item')?.classList.add('done');
      }
      cb.addEventListener('change', () => {
        cb.closest('.check-item')?.classList.toggle('done', cb.checked);
        saved[id] = cb.checked;
        localStorage.setItem(key, JSON.stringify(saved));
        updateProgress(list);
      });
    });
    updateProgress(list);
  });

  function updateProgress(list) {
    list.querySelectorAll('.checklist-group').forEach((g) => {
      const items = g.querySelectorAll('input[type="checkbox"]');
      const done = g.querySelectorAll('input[type="checkbox"]:checked').length;
      const out = g.querySelector('[data-progress]');
      if (out) out.textContent = `${done}/${items.length}`;
    });
  }
})();

// ===== Acquisition Tax Calculator =====
// 모델 (주거용 취득 기준, 지방세법 제11·제15조 / 지방세법 시행령 / 농어촌특별세법 / 지방세특례제한법):
// 1) 본세(취득세)
//    - 1주택: 6억 이하 1.0%, 6~9억 누진(가격×2/3-3)%, 9억 초과 3.0%
//    - 2주택: 조정대상 8.0% / 비조정은 1주택과 동일
//    - 3주택: 조정 12.0% / 비조정 8.0%
//    - 4주택+: 12.0%
// 2) 농어촌특별세 (면적 영향)
//    - 전용 85㎡ 이하: 면제(국민주택규모)
//    - 전용 85㎡ 초과 + 표준세율(1~3%): 매매가의 0.2%
//    - 전용 85㎡ 초과 + 중과세율 8%: 0.6%
//    - 전용 85㎡ 초과 + 중과세율 12%: 1.0%
// 3) 지방교육세
//    - 표준세율 적용: 본 취득세 × 10% (= 표준세율의 1/10)
//    - 중과세율 8%·12% 적용: 매매가의 0.4% 고정
//
// ⚠ 취득 원인 구분 (2026-07-30 정정)
//    'purchase'  유상거래(기존 주택 매매)          → 1~3% 또는 중과
//    'presale'   시행사·건설사로부터 분양받은 신축주택 → 유상거래와 같은 1~3% 또는 중과
//    'original'  건축주가 직접 신축·증축(원시취득)   → 2.8%
//    'redevelop' 재개발·재건축 조합원 취득          → 종전지분/추가분담금 과세표준 분리 필요(개략 추정)
//    분양 아파트를 'original'로 처리하면 세액이 크게 달라지므로 반드시 구분한다.
//
// ⚠ 감면 (지방세특례제한법)
//    생애최초(제36조의3): 12억 이하 · 한도 200만원. 소형 비아파트·인구감소지역은 300만원.
//    출산·양육(제36조의5): 12억 이하 1가구 1주택 · 한도 500만원 (2028년 말까지).
//    → 두 감면은 단순 합산하지 않고 납세자에게 유리한 하나를 적용한다.
//    지방 준공 후 미분양(한시): 법정 25% + 조례 추가 0~25% = 최종 25~50%.
//    → 전국 일률 50%가 아니다. 조례 미확인 시 25%만 적용하고 결과에 그 사실을 밝힌다.
function calcAcquisitionTax(input) {
  const {
    price, homes, regulated, areaOver85, firstHome,
    acqType = 'purchase', tempTwoHome = false,
    inheritNoHome = false, giftHeavy,
    giftDonorMultiHome = false,
    unsold2026 = false, // 지방 준공 후 미분양 한시감면(85㎡↓·6억↓, 중과제외 + 25~50% 감면)
    unsold2026LocalExtra = null, // 지자체 조례 추가 감면율(0~0.25). null = 조례 미확인 → 법정 25%만
    // 생애최초 감면 한도 상향(300만원) 판정용 사실
    firstHomeSmallHouse = false, // 소형 비아파트(도시형생활주택·다가구 등) 또는 인구감소지역 주택
    // 출산·양육 감면 (지방세특례제한법 제36조의5)
    childbirth = false,
    // ── 증여(무상취득) 전용 입력 ──
    //  ⚠ 하나의 price로 세액과 12% 중과 여부를 함께 판단하면 안 된다. 둘은 다른 값이다.
    //    giftMarketValue  시가인정액 = 증여 취득세 **과세표준** (지방세법 제10조의2)
    //    giftStdValue     시가표준액 = 조정대상지역 3억원 이상 **중과 판정 기준** (제13조의2 ②)
    //    시가인정액이 3억을 넘고 시가표준액은 3억 미만인 경우가 흔해, 하나로 겸하면 중과가 잘못 걸린다.
    giftMarketValue = null,
    giftStdValue = null,
    // 부담부증여 채무액 — 증여 취득세 과세표준에서 제외(그 부분은 유상취득으로 별도 과세)
    giftAssumedDebt = 0,
  } = input;
  if (!price || price <= 0) return null;

  // 증여는 시가인정액이 과세표준. 미입력이면 price를 시가인정액으로 본다(기존 호출부 호환).
  const isGift = acqType === 'gift';
  const giftMarket = isGift
    ? (giftMarketValue != null && giftMarketValue !== '' && Number(giftMarketValue) > 0
      ? Number(giftMarketValue) : price)
    : 0;
  const assumedDebt = isGift ? Math.max(0, Math.min(Number(giftAssumedDebt) || 0, giftMarket)) : 0;
  // 무상취득 부분(= 시가인정액 − 승계채무액)이 실제 증여 취득세 과세표준이다.
  const giftFreeBase = isGift ? Math.max(0, giftMarket - assumedDebt) : 0;

  // 과세표준: 증여는 무상취득 부분, 그 외는 취득가액
  const taxBase = isGift ? giftFreeBase : price;

  const eok = price / 100000000;
  // 유상취득 6~9억 누진식: 세율 = (취득가액×2/3억 − 3) / 100
  const progRate = eok <= 6 ? 0.01 : eok <= 9 ? ((eok * 2 / 3) - 3) / 100 : 0.03;

  // 감면 적용/미적용 이유를 사용자에게 그대로 보여주기 위한 메모
  const notes = [];

  // 분양받은 신축주택은 유상거래와 동일한 세율 체계를 쓴다(원시취득 2.8% 아님).
  const isPaidTransfer = acqType === 'purchase' || acqType === 'presale';

  const R = (window.TOPDA_RATES && window.TOPDA_RATES.acquisitionTax) || {};
  const relief = R.unsold2026Relief || {};
  const reliefPriceMax = relief.priceMax || 600000000;
  const statutoryRatio = relief.statutoryRatio != null ? relief.statutoryRatio : 0.25;
  const localMaxExtra = relief.localMaxExtraRatio != null ? relief.localMaxExtraRatio : 0.25;
  const maxTotalRatio = relief.maxTotalRatio || 0.50;

  // 미분양 한시감면 적용 가능 여부 (유상취득 + 85㎡↓ + 6억↓)
  const unsoldEligible = unsold2026 && isPaidTransfer && !areaOver85 && price <= reliefPriceMax;
  // 조례 확인 여부: null이면 미확인 → 법정 25%만 반영하고 "최대 25%p 추가 가능" 안내
  const localExtraKnown = unsold2026LocalExtra != null && unsold2026LocalExtra !== '';
  const localExtraRatio = localExtraKnown
    ? Math.max(0, Math.min(localMaxExtra, Number(unsold2026LocalExtra) || 0))
    : 0;
  const unsoldRatio = unsoldEligible
    ? Math.min(maxTotalRatio, statutoryRatio + localExtraRatio)
    : 0;

  let baseRate, isHeavy = false, scenario = '', scenarioKey = '';

  if (acqType === 'inherit') {
    // 상속 취득: 무주택 세대의 1가구 1주택 상속 0.8% 특례, 그 외 2.8%
    baseRate = inheritNoHome ? 0.008 : 0.028;
    scenario = inheritNoHome ? '상속 · 무주택 1가구1주택 특례(0.8%)' : '상속 취득(2.8%)';
    scenarioKey = inheritNoHome ? 'inherit-nohome' : 'inherit-other';
  } else if (acqType === 'gift') {
    // 무상취득(증여): 표준 3.5%. 조정대상지역 + **시가표준액** 3억 이상 다주택자 증여 → 12% 중과
    //  ⚠ 중과 판정은 반드시 시가표준액으로 한다. 세액은 시가인정액(− 승계채무)으로 계산한다.
    const gCfg = R.giftAcquisition || {};
    const heavyThreshold = gCfg.heavyStdValueThreshold || 300000000;
    const stdKnown = giftStdValue != null && giftStdValue !== '' && Number(giftStdValue) > 0;
    const heavyJudgeBase = stdKnown ? Number(giftStdValue) : giftMarket;
    // 기존 호출부가 giftHeavy를 명시하면 그 값을 존중하고, 새 UI에서는 객관 조건으로 자동 판정한다.
    const giftHeavyApplied = giftHeavy == null
      ? regulated && giftDonorMultiHome && heavyJudgeBase >= heavyThreshold
      : Boolean(giftHeavy);
    if (giftHeavyApplied) { baseRate = gCfg.heavyRate || 0.12; isHeavy = true; scenario = '증여 · 조정대상 시가표준액 3억↑ 중과(12%)'; scenarioKey = 'gift-heavy'; }
    else { baseRate = gCfg.standardRate || 0.035; scenario = '증여 취득(3.5%)'; scenarioKey = 'gift-standard'; }
    notes.push({ kind: 'info', text: '세액은 「시가인정액」(매매사례가·감정가·경매가 등)을 과세표준으로, 12% 중과 여부는 「시가표준액」(공시가격)으로 판단합니다 — 서로 다른 값입니다.', en: 'The tax is computed on the “recognised market value” (comparable sales, appraisal, auction price), while the 12% heavy rate is tested against the “standard market value” (officially assessed price) — two different figures.' });
    if (!stdKnown) {
      notes.push({ kind: 'warn', text: '시가표준액을 입력하지 않아 중과 판정에 시가인정액을 대신 사용했습니다. 시가인정액이 3억을 넘어도 시가표준액이 3억 미만이면 중과 대상이 아닙니다 — 공시가격을 확인해 입력하세요.', en: 'No standard market value was entered, so the recognised market value was used to test the heavy rate. A property can exceed KRW 300M in market value while its standard value stays below the threshold — enter the officially assessed price.' });
    }
    if (giftHeavyApplied) {
      notes.push({ kind: 'info', text: '1세대 1주택자가 소유한 주택을 배우자·직계존비속에게 증여하는 경우 등은 중과에서 제외됩니다. 증여자의 주택 수 요건을 확인하세요.', en: 'Gifts of a sole home from a one-home household to a spouse or lineal relative are excluded from the heavy rate — check the donor’s home count.' });
    }
    if (assumedDebt > 0) {
      notes.push({ kind: 'warn', text: '부담부증여 — 승계 채무 ' + Math.round(assumedDebt).toLocaleString('ko-KR') + '원은 증여가 아니라 유상취득입니다. 위 세액은 무상취득 부분(시가인정액 − 채무 = ' + Math.round(giftFreeBase).toLocaleString('ko-KR') + '원)만 계산한 것이고, 채무 부분의 유상취득 취득세는 아래에 따로 표시했습니다. 증여자에게는 그 부분에 대한 양도소득세가 별도로 발생합니다.', en: 'Burdened gift — the KRW ' + Math.round(assumedDebt).toLocaleString('en-US') + ' of debt assumed is a paid transfer, not a gift. The figure above covers only the gift portion (market value − debt = KRW ' + Math.round(giftFreeBase).toLocaleString('en-US') + '); the paid-transfer tax on the debt portion is shown separately below. The donor also owes capital gains tax on that portion.' });
    }
  } else if (acqType === 'original') {
    // 원시취득: 건축주가 직접 신축·증축한 건축물 (분양받은 신축주택은 여기 해당하지 않음)
    baseRate = 0.028;
    scenario = '원시취득 · 직접 신축·증축(2.8%)';
    scenarioKey = 'original';
    notes.push({ kind: 'info', text: '건축주가 직접 신축·증축해 소유권을 원시취득한 경우입니다. 시행사·건설사로부터 분양받은 신축주택은 「분양받은 신축주택」을 선택하세요 — 유상거래 세율(1~3% 또는 중과)이 적용됩니다.', en: 'This is original acquisition — the owner built or extended the structure themselves. For a newly built home bought from a developer, choose “Newly built home bought from developer”: the paid-transfer rate (1–3% or the heavy rate) applies instead.' });
  } else if (acqType === 'redevelop') {
    // 재개발·재건축 조합원: 종전 부동산 지분 승계분과 추가분담금(원시취득)의 과세표준이 분리된다.
    // 정밀 판정에는 관리처분계획상 종전자산 평가액·권리가액·분담금이 필요하므로 개략 추정만 제공한다.
    baseRate = 0.028;
    scenario = '재개발·재건축 조합원 취득(개략 추정 2.8%)';
    scenarioKey = 'redevelop';
    notes.push({ kind: 'warn', text: '조합원 취득은 종전 토지·건물 지분과 추가분담금의 과세표준을 나누어 판정해야 합니다. 이 결과는 원시취득 세율을 적용한 개략 추정치이며, 관리처분계획상 권리가액·분담금 기준으로 관할 지자체·세무사 확인이 필요합니다.', en: 'A redevelopment member’s acquisition splits into the prior land/building share and the additional contribution, each with its own tax base. This is a rough estimate at the original-acquisition rate — confirm with the local authority using the entitlement value and contribution in the management disposal plan.' });
  } else {
    // 유상취득(기존 주택 매매 또는 분양받은 신축주택).
    // 일시적 2주택은 종전주택 처분 조건 충족 시 1주택 세율 적용.
    // 미분양 한시감면 적용 시 다주택 중과 제외 → 표준세율로.
    const effHomes = (homes === 2 && tempTwoHome) ? 1 :
      (unsoldEligible && relief.excludeHeavySurcharge ? Math.min(homes, 1) : homes);
    if (effHomes === 1) {
      baseRate = progRate;
      if (homes === 2 && tempTwoHome) { scenario = '일시적 2주택 → 1주택 세율 적용'; scenarioKey = 'temp-two-home'; }
      else if (unsoldEligible && homes >= 2) { scenario = '미분양 한시 감면 — 다주택 중과 제외, 표준세율'; scenarioKey = 'unsold-relief'; }
      else { scenario = acqType === 'presale' ? '분양받은 신축주택 · 1주택 표준세율(유상거래)' : '1주택 표준세율'; scenarioKey = 'h1-standard'; }
    } else if (effHomes === 2) {
      if (regulated) { baseRate = 0.08; isHeavy = true; scenario = '조정대상지역 2주택 중과(8%)'; scenarioKey = 'h2-regulated'; }
      else { baseRate = progRate; scenario = '비조정 2주택 표준세율'; scenarioKey = 'h2-nonregulated'; }
    } else if (effHomes === 3) {
      baseRate = regulated ? 0.12 : 0.08; isHeavy = true;
      scenario = regulated ? '조정대상지역 3주택 중과(12%)' : '비조정 3주택 중과(8%)';
      scenarioKey = regulated ? 'h3-regulated' : 'h3-nonregulated';
    } else {
      baseRate = 0.12; isHeavy = true; scenario = '4주택 이상 중과(12%)'; scenarioKey = 'h4plus';
    }
  }
  baseRate = Math.max(baseRate, 0.008);

  // 과세표준 × 세율. 증여는 taxBase가 (시가인정액 − 승계채무액)이다.
  let acquisition = taxBase * baseRate;

  // ── 생애최초 / 출산·양육 감면 ──
  //  두 감면은 단순 합산하지 않는다. 각각의 한도를 계산해 납세자에게 유리한 쪽 하나만 적용한다.
  const fhR = R.firstHomeRelief || {};
  const cbR = R.childbirthRelief || {};
  const fhPriceMax = fhR.priceMax || 1200000000;
  const cbPriceMax = cbR.priceMax || 1200000000;
  const effHomesForRelief = (homes === 2 && tempTwoHome) ? 1 : homes;
  const reliefBaseOk = isPaidTransfer && effHomesForRelief === 1 && !isHeavy;

  // 생애최초: 12억 이하. 소형 비아파트·인구감소지역 주택은 한도 300만원.
  let firstHomeCap = 0;
  if (reliefBaseOk && firstHome && price <= fhPriceMax) {
    firstHomeCap = firstHomeSmallHouse
      ? (fhR.smallHouseDeductMax || 3000000)
      : (fhR.deductMax || 2000000);
  } else if (firstHome) {
    if (!isPaidTransfer) notes.push({ kind: 'skip', text: '생애최초 감면 미적용 — 유상거래(매매·분양) 취득이 아닙니다.', en: 'First-home relief not applied — this is not a paid transfer (purchase or developer sale).' });
    else if (effHomesForRelief !== 1) notes.push({ kind: 'skip', text: '생애최초 감면 미적용 — 취득 후 1주택이어야 합니다.', en: 'First-home relief not applied — the household must hold exactly one home after the acquisition.' });
    else if (isHeavy) notes.push({ kind: 'skip', text: '생애최초 감면 미적용 — 중과세율 적용 대상입니다.', en: 'First-home relief not applied — the heavy rate applies to this acquisition.' });
    else notes.push({ kind: 'skip', text: '생애최초 감면 미적용 — 취득가액이 12억원을 초과합니다.', en: 'First-home relief not applied — the acquisition price exceeds KRW 1.2B.' });
  }

  // 출산·양육 감면: 12억 이하 1가구 1주택, 한도 500만원 (2028년 말까지)
  let childbirthCap = 0;
  if (reliefBaseOk && childbirth && price <= cbPriceMax) {
    childbirthCap = cbR.deductMax || 5000000;
  } else if (childbirth) {
    notes.push({ kind: 'skip', text: '출산·양육 감면 미적용 — 12억원 이하 1가구 1주택 유상취득(중과 제외) 요건을 충족해야 합니다.', en: 'Childbirth relief not applied — it requires a one-home household paying KRW 1.2B or less in a paid transfer, outside the heavy rate.' });
  }

  let firstHomeDeduct = 0;      // 실제 적용된 감면액(생애최초 또는 출산·양육 중 유리한 쪽)
  let appliedReliefKey = null;  // 'firstHome' | 'childbirth'
  const bestCap = Math.max(firstHomeCap, childbirthCap);
  if (bestCap > 0) {
    appliedReliefKey = childbirthCap >= firstHomeCap ? 'childbirth' : 'firstHome';
    firstHomeDeduct = Math.min(bestCap, acquisition);
    acquisition = acquisition - firstHomeDeduct;
    if (firstHomeCap > 0 && childbirthCap > 0) {
      notes.push({ kind: 'info',
        text: '생애최초(' + (firstHomeCap / 10000).toLocaleString('ko-KR') + '만원 한도)와 출산·양육(' + (childbirthCap / 10000).toLocaleString('ko-KR') + '만원 한도)은 중복 적용되지 않습니다. 유리한 ' + (appliedReliefKey === 'childbirth' ? '출산·양육' : '생애최초') + ' 감면을 적용했습니다.',
        en: 'First-home relief (cap KRW ' + firstHomeCap.toLocaleString('en-US') + ') and childbirth relief (cap KRW ' + childbirthCap.toLocaleString('en-US') + ') cannot be combined. The more favourable ' + (appliedReliefKey === 'childbirth' ? 'childbirth' : 'first-home') + ' relief was applied.' });
    }
    if (appliedReliefKey === 'firstHome' && firstHomeSmallHouse) {
      notes.push({ kind: 'info', text: '소형 비아파트·인구감소지역 주택에 해당해 생애최초 감면 한도를 300만원으로 적용했습니다. 실제 요건(주택 유형·전용면적·소재지)은 관할 지자체 확인이 필요합니다.', en: 'The first-home relief cap was raised to KRW 3M for small non-apartment or population-decline-area housing. Confirm the housing type, floor area, and location with the local authority.' });
    }
  }

  // ── 지방 준공 후 미분양 주택 한시 감면 ──
  //  법정 25% + 조례 추가 0~25%. 전국 일률 50%가 아니다.
  let unsoldDeduct = 0;
  if (unsoldEligible) {
    unsoldDeduct = acquisition * unsoldRatio;
    acquisition = acquisition - unsoldDeduct;
    scenario += ' · 미분양 한시 ' + Math.round(unsoldRatio * 100) + '% 감면';
    if (!localExtraKnown) {
      notes.push({ kind: 'warn',
        text: '지방자치단체 조례에 따라 최대 ' + Math.round(localMaxExtra * 100) + '%가 추가 감면될 수 있습니다. 현재 결과에는 법정 감면 ' + Math.round(statutoryRatio * 100) + '%만 반영했습니다 — 취득 예정 시·군·구 조례를 확인하세요.',
        en: 'A local ordinance may grant up to a further ' + Math.round(localMaxExtra * 100) + '%. This result reflects only the statutory ' + Math.round(statutoryRatio * 100) + '% — check the ordinance of the city/county/district where you are buying.' });
    } else {
      notes.push({ kind: 'info',
        text: '법정 감면 ' + Math.round(statutoryRatio * 100) + '% + 조례 추가 감면 ' + Math.round(localExtraRatio * 100) + '% = 총 ' + Math.round(unsoldRatio * 100) + '%를 적용했습니다.',
        en: 'Statutory ' + Math.round(statutoryRatio * 100) + '% + ordinance ' + Math.round(localExtraRatio * 100) + '% = ' + Math.round(unsoldRatio * 100) + '% total relief applied.' });
    }
    notes.push({ kind: 'info', text: '이 감면은 사업주체로부터 최초로 유상취득하는 수도권 밖 준공 후 미분양 주택(실제 입주 사실 없음·전용 85㎡ 이하·취득가 6억 이하·개인 취득)에만 적용됩니다. 법인·단체 취득은 대상이 아닙니다.', en: 'This relief applies only to a first paid acquisition from the developer of a completed-but-unsold home outside the capital region, never actually occupied, 85 m² or less, priced at KRW 600M or less, acquired by an individual. Corporations and other entities are not eligible.' });
  } else if (unsold2026) {
    if (!isPaidTransfer) notes.push({ kind: 'skip', text: '미분양 감면 미적용 — 유상거래(매매·분양) 취득이 아닙니다.', en: 'Unsold-unit relief not applied — this is not a paid transfer.' });
    else if (areaOver85) notes.push({ kind: 'skip', text: '미분양 감면 미적용 — 전용 85㎡를 초과합니다.', en: 'Unsold-unit relief not applied — the floor area exceeds 85 m².' });
    else notes.push({ kind: 'skip', text: '미분양 감면 미적용 — 취득가액이 6억원을 초과합니다.', en: 'Unsold-unit relief not applied — the acquisition price exceeds KRW 600M.' });
  }

  // 농어촌특별세: 전용 85㎡ 초과만 과세 (85㎡ 이하 면제)
  let ruralTax = 0;
  if (areaOver85) {
    if (isHeavy && baseRate >= 0.12) ruralTax = taxBase * 0.010;
    else if (isHeavy && baseRate >= 0.08) ruralTax = taxBase * 0.006;
    else ruralTax = taxBase * 0.002;
  }

  // 지방교육세 (지방세법 제151조)
  let localEduTax;
  if (isHeavy) {
    localEduTax = taxBase * 0.004; // 중과(8·12%)는 0.4% 고정
  } else if (isPaidTransfer) {
    localEduTax = (taxBase * baseRate) * 0.10; // 주택 유상거래(매매·분양): 표준세율의 1/10
  } else {
    // 상속·증여·원시취득: (표준세율 − 2%) × 20%  예) 2.8%→0.16%, 3.5%→0.3%
    localEduTax = taxBase * Math.max(0, (baseRate - 0.02)) * 0.20;
  }

  const total = acquisition + ruralTax + localEduTax;

  // ── 부담부증여의 유상취득 부분 ──
  //  승계 채무액은 유상거래 취득세율(1~3% 또는 중과)로 따로 과세된다. 무상취득 부분과
  //  섞으면 둘 다 틀리므로, 같은 공통 엔진을 유상취득 조건으로 다시 호출해 별도로 낸다.
  let burdenedPaidPart = null;
  if (isGift && assumedDebt > 0) {
    burdenedPaidPart = calcAcquisitionTax({
      price: assumedDebt, homes, regulated, areaOver85,
      firstHome: false, acqType: 'purchase', tempTwoHome,
    });
  }

  return {
    baseRate, isHeavy, scenario, scenarioKey, acqType, isPaidTransfer,
    taxBase,
    // 증여 상세 — 화면이 "무엇을 과세표준으로, 무엇으로 중과를 판정했는지" 그대로 보여준다.
    giftMarketValue: isGift ? giftMarket : null,
    giftStdValue: isGift && giftStdValue ? Number(giftStdValue) : null,
    giftAssumedDebt: assumedDebt,
    giftFreeBase: isGift ? giftFreeBase : null,
    burdenedPaidPart,
    // 무상취득 + 유상취득 합계 (부담부증여일 때만 의미가 있다)
    combinedTotal: total + (burdenedPaidPart ? burdenedPaidPart.total : 0),
    acquisition, firstHomeDeduct, unsoldDeduct, unsoldEligible,
    // 감면 상세 — 어떤 감면이 왜 적용/미적용됐는지 UI가 그대로 보여준다.
    appliedReliefKey, firstHomeCap, childbirthCap,
    unsoldRatio, unsoldStatutoryRatio: statutoryRatio,
    unsoldLocalExtraRatio: localExtraRatio, unsoldLocalExtraKnown: localExtraKnown,
    unsoldLocalMaxExtraRatio: localMaxExtra,
    giftHeavyApplied: acqType === 'gift' && isHeavy,
    ruralTax, localEduTax,
    total,
    notes,
  };
}

// scenarioKey → 6개 언어 표시 문구 (한국어 UI는 항상 r.scenario 그대로 사용, 이 표는 비-한국어 페이지 전용)
const SCENARIO_I18N = {
  'inherit-nohome':   { en: 'Inheritance · no-home household special rate (0.8%)', 'zh-Hans': '继承·无房家庭特例（0.8%）', 'zh-Hant': '繼承·無房家庭特例（0.8%）', vi: 'Thừa kế · ưu đãi hộ không nhà (0,8%)', th: 'มรดก · อัตราพิเศษครัวเรือนไม่มีบ้าน (0.8%)' },
  'inherit-other':    { en: 'Inheritance (2.8%)', 'zh-Hans': '继承取得（2.8%）', 'zh-Hant': '繼承取得（2.8%）', vi: 'Thừa kế (2,8%)', th: 'มรดก (2.8%)' },
  'gift-heavy':       { en: 'Gift · regulated area ≥300M heavy rate (12%)', 'zh-Hans': '赠与·调整地区3亿以上重课（12%）', 'zh-Hant': '贈與·調整地區3億以上重課（12%）', vi: 'Tặng cho · khu điều tiết ≥3 trăm triệu, thuế nặng (12%)', th: 'ให้เปล่า · เขตควบคุม ≥300 ล้าน อัตราสูง (12%)' },
  'gift-standard':    { en: 'Gift (3.5%)', 'zh-Hans': '赠与取得（3.5%）', 'zh-Hant': '贈與取得（3.5%）', vi: 'Tặng cho (3,5%)', th: 'ให้เปล่า (3.5%)' },
  original:           { en: 'Original acquisition · self-built structure (2.8%)', 'zh-Hans': '原始取得·自建（2.8%）', 'zh-Hant': '原始取得·自建（2.8%）', vi: 'Nguyên thủy · tự xây (2,8%)', th: 'ได้มาแรกเริ่ม · สร้างเอง (2.8%)' },
  redevelop:          { en: 'Redevelopment/reconstruction member acquisition (rough estimate, 2.8%)', 'zh-Hans': '重建·再开发组合员取得（概算2.8%）', 'zh-Hant': '重建·再開發組合員取得（概算2.8%）', vi: 'Thành viên tái phát triển (ước tính 2,8%)', th: 'สมาชิกโครงการพัฒนาใหม่ (ประมาณ 2.8%)' },
  'temp-two-home':    { en: 'Temporary 2-home → taxed as 1 home', 'zh-Hans': '一时性2套→按1套税率', 'zh-Hant': '一時性2戶→按1戶稅率', vi: 'Tạm thời 2 căn → áp thuế 1 căn', th: 'ชั่วคราว 2 หลัง → คิดภาษีเหมือน 1 หลัง' },
  'unsold-relief':    { en: '2026 unsold-unit relief — multi-home surcharge excluded, standard rate', 'zh-Hans': '2026滞销房减免—排除多套重课，标准税率', 'zh-Hant': '2026滯銷房減免—排除多戶重課，標準稅率', vi: 'Ưu đãi 2026 nhà tồn kho — miễn phụ thu đa nhà, thuế chuẩn', th: 'ลดหย่อนบ้านค้างขาย 2026 — ยกเว้นภาษีหลายหลัง อัตรามาตรฐาน' },
  'h1-standard':      { en: '1-home standard rate', 'zh-Hans': '1套标准税率', 'zh-Hant': '1戶標準稅率', vi: '1 căn, thuế suất chuẩn', th: 'อัตรามาตรฐาน 1 หลัง' },
  'h2-regulated':     { en: 'Regulated area · 2-home heavy rate (8%)', 'zh-Hans': '调整地区·2套重课（8%）', 'zh-Hant': '調整地區·2戶重課（8%）', vi: 'Khu điều tiết · 2 căn thuế nặng (8%)', th: 'เขตควบคุม · 2 หลัง อัตราสูง (8%)' },
  'h2-nonregulated':  { en: 'Non-regulated · 2-home standard rate', 'zh-Hans': '非调整地区·2套标准税率', 'zh-Hant': '非調整地區·2戶標準稅率', vi: 'Khu không điều tiết · 2 căn thuế chuẩn', th: 'นอกเขตควบคุม · 2 หลัง อัตรามาตรฐาน' },
  'h3-regulated':     { en: 'Regulated area · 3-home heavy rate (12%)', 'zh-Hans': '调整地区·3套重课（12%）', 'zh-Hant': '調整地區·3戶重課（12%）', vi: 'Khu điều tiết · 3 căn thuế nặng (12%)', th: 'เขตควบคุม · 3 หลัง อัตราสูง (12%)' },
  'h3-nonregulated':  { en: 'Non-regulated · 3-home heavy rate (8%)', 'zh-Hans': '非调整地区·3套重课（8%）', 'zh-Hant': '非調整地區·3戶重課（8%）', vi: 'Khu không điều tiết · 3 căn thuế nặng (8%)', th: 'นอกเขตควบคุม · 3 หลัง อัตราสูง (8%)' },
  h4plus:             { en: '4+ homes heavy rate (12%)', 'zh-Hans': '4套以上重课（12%）', 'zh-Hant': '4戶以上重課（12%）', vi: '4+ căn thuế nặng (12%)', th: '4+ หลัง อัตราสูง (12%)' },
};
// 감면율은 법정 25% + 조례 0~25%로 달라지므로 문구에 실제 적용률을 끼워 넣는다.
const UNSOLD_SUFFIX = { en: ' · unsold-unit relief {p}%', 'zh-Hans': ' · 滞销房减免{p}%', 'zh-Hant': ' · 滯銷房減免{p}%', vi: ' · Ưu đãi nhà tồn kho {p}%', th: ' · ลดหย่อนบ้านค้างขาย {p}%' };
function scenarioText(r, lang) {
  if (lang === 'ko' || !lang) return r.scenario;
  const t = (SCENARIO_I18N[r.scenarioKey] && SCENARIO_I18N[r.scenarioKey][lang]) || (SCENARIO_I18N[r.scenarioKey] && SCENARIO_I18N[r.scenarioKey].en) || r.scenario;
  if (!r.unsoldDeduct) return t;
  const pct = Math.round((r.unsoldRatio || 0) * 100);
  return t + (UNSOLD_SUFFIX[lang] || UNSOLD_SUFFIX.en).replace('{p}', pct);
}

// ===== 양도소득세 계산기 — 비-한국어 라벨 조립 (계산 로직은 calcTransferTax 그대로, 표시만 언어별) =====
const TT_I18N = {
  shortTerm: { en: 'short-term heavy rate', 'zh-Hans': '短期持有重课', 'zh-Hant': '短期持有重課', vi: 'nắm giữ ngắn hạn, thuế nặng', th: 'ถือครองระยะสั้น อัตราสูง' },
  progressive: { en: 'progressive', 'zh-Hans': '累进', 'zh-Hant': '累進', vi: 'lũy tiến', th: 'อัตราก้าวหน้า' },
  surcharge: { en: 'multi-home surcharge', 'zh-Hans': '多套房加重', 'zh-Hant': '多屋加重', vi: 'phụ thu đa nhà', th: 'ภาษีเพิ่มหลายหลัง' },
  waiverActive: { en: 'multi-home surcharge waived until', 'zh-Hans': '多套房加重豁免至', 'zh-Hant': '多屋加重豁免至', vi: 'miễn phụ thu đa nhà đến', th: 'ยกเว้นภาษีเพิ่มหลายหลังถึง' },
  effRate: { en: 'Effective rate', 'zh-Hans': '实际税率', 'zh-Hant': '實際稅率', vi: 'Thuế suất thực tế', th: 'อัตราภาษีที่แท้จริง' },
  ofSalePrice: { en: 'of sale price', 'zh-Hans': '（占售价）', 'zh-Hant': '（占售價）', vi: '(so với giá bán)', th: '(ของราคาขาย)' },
  exemptTitle: { en: '1-home exemption', 'zh-Hans': '1套自住免税', 'zh-Hant': '1戶自住免稅', vi: 'Miễn thuế 1 nhà', th: 'ยกเว้นภาษี 1 หลัง' },
  exemptBody: { en: 'Sale price ≤ KRW 1.2B and held ≥ 2 years — no tax due.', 'zh-Hans': '售价≤12亿韩元且持有≥2年——无需纳税。', 'zh-Hant': '售價≤12億韓元且持有≥2年——無需納稅。', vi: 'Giá bán ≤ 1,2 tỷ KRW và nắm giữ ≥ 2 năm — không phải nộp thuế.', th: 'ราคาขาย ≤ 1.2 พันล้านวอน และถือครอง ≥ 2 ปี — ไม่ต้องเสียภาษี' },
  waiverTitle: { en: 'Multi-home surcharge temporarily waived', 'zh-Hans': '多套房加重暂时豁免', 'zh-Hant': '多屋加重暫時豁免', vi: 'Tạm miễn phụ thu đa nhà', th: 'ยกเว้นภาษีเพิ่มหลายหลังชั่วคราว' },
  waiverBody: { en: 'Sale date is before {d} and held ≥ 2 years, so the 20-30%p surcharge was automatically excluded.', 'zh-Hans': '出售日期在{d}之前且持有≥2年，已自动排除20-30%的加重税率。', 'zh-Hant': '出售日期在{d}之前且持有≥2年，已自動排除20-30%的加重稅率。', vi: 'Ngày bán trước {d} và nắm giữ ≥ 2 năm nên đã tự động loại trừ mức phụ thu 20-30%.', th: 'วันที่ขายก่อน {d} และถือครอง ≥ 2 ปี จึงยกเว้นภาษีเพิ่ม 20-30% โดยอัตโนมัติ' },
  highValueTitle: { en: 'High-value home — partial taxation', 'zh-Hans': '高价住宅——部分课税', 'zh-Hant': '高價住宅——部分課稅', vi: 'Nhà giá trị cao — đánh thuế một phần', th: 'บ้านมูลค่าสูง — เก็บภาษีบางส่วน' },
  highValueBody: { en: '1-home household but sale price exceeds KRW 1.2B — only {p}% of the gain is taxable.', 'zh-Hans': '1套自住但售价超过12亿韩元——仅{p}%的收益需课税。', 'zh-Hant': '1戶自住但售價超過12億韓元——僅{p}%的收益需課稅。', vi: 'Hộ 1 nhà nhưng giá bán vượt 1,2 tỷ KRW — chỉ {p}% lợi nhuận bị đánh thuế.', th: 'ครัวเรือน 1 หลังแต่ราคาขายเกิน 1.2 พันล้านวอน — เก็บภาษีเพียง {p}% ของกำไร' },
  heavyTitle: { en: 'Multi-home heavy taxation', 'zh-Hans': '多套房重课', 'zh-Hant': '多屋重課', vi: 'Đánh thuế nặng đa nhà', th: 'ภาษีเพิ่มหลายหลัง' },
  heavyBody: { en: '{n}-home sale in a regulated area — {p}%p is added to the base rate and the long-term holding deduction is excluded (Income Tax Act §95(2)).', 'zh-Hans': '调整地区{n}套房转让——基本税率加征{p}%，且不适用长期持有特别扣除（所得税法第95条第2款）。', 'zh-Hant': '調整地區{n}戶轉讓——基本稅率加徵{p}%，且不適用長期持有特別扣除（所得稅法第95條第2款）。', vi: 'Bán {n} nhà trong khu điều tiết — cộng thêm {p}%p vào thuế suất cơ bản và loại trừ khấu trừ nắm giữ dài hạn (Luật thuế TNCN §95(2)).', th: 'ขาย {n} หลังในเขตควบคุม — บวก {p}%p จากอัตราพื้นฐานและไม่ได้รับลดหย่อนการถือครองระยะยาว (ม.95(2))' },
};
function rateLabelText(r, lang) {
  if (lang === 'ko' || !lang) return r.appliedRateLabel;
  const L = (k) => (TT_I18N[k] && (TT_I18N[k][lang] || TT_I18N[k].en)) || '';
  if (r.isShortTerm) return r.shortTermRatePct + '% (' + L('shortTerm') + ')';
  let s = r.marginalRatePct + '% (' + L('progressive') + ')';
  if (r.surchargeRatePct > 0) s += ' + ' + r.surchargeRatePct + '%p ' + L('surcharge');
  else if (r.surchargeWaived) s += ' (' + L('waiverActive') + ' ' + r.waiverUntil + ')';
  return s;
}
function effectiveRateText(r, lang) {
  if (lang === 'ko' || !lang) return '실효세율 ' + r.effective.toFixed(2) + '% (양도가액 대비)';
  const L = (k) => (TT_I18N[k] && (TT_I18N[k][lang] || TT_I18N[k].en)) || '';
  return L('effRate') + ' ' + r.effective.toFixed(2) + '% (' + L('ofSalePrice') + ')';
}
function exemptBoxHtml(r, lang, regulated, homes) {
  const L = (k) => (TT_I18N[k] && (TT_I18N[k][lang] || TT_I18N[k].en)) || '';
  if (lang === 'ko' || !lang) {
    if (r.exempted) return '<strong>1세대 1주택 비과세 대상</strong>양도가액 12억원 이하 + 보유 2년 이상 요건을 충족합니다. 별도 세부담이 없습니다.';
    if (r.surchargeWaived && regulated && homes >= 2) {
      if (r.graceApplied) return '<strong>다주택 중과 유예 — 경과규정 적용</strong>양도일이 ' + r.waiverUntil + ' 이후지만 경과규정(' + r.graceReason + ')을 충족해 중과세율(20~30%p)이 빠졌습니다. 계약서·계약금 입금내역 등 증빙을 보관하세요.';
      return '<strong>다주택 중과 한시 유예 적용</strong>양도일이 ' + r.waiverUntil + ' 이전이고 보유 2년 이상이라 중과세율(20~30%p)이 자동으로 빠졌습니다.';
    }
    if (r.surchargeRatePct > 0) return '<strong>다주택 중과 적용</strong>조정대상지역 ' + homes + '주택 양도로 기본세율에 ' + r.surchargeRatePct + '%p가 가산되고, 장기보유특별공제는 배제됩니다 (소득세법 제95조 제2항).';
    if (r.taxableGainRatio < 1 && r.taxableGainRatio > 0) return '<strong>고가주택 안분과세</strong>1세대1주택이나 12억 초과. 양도차익 중 ' + (r.taxableGainRatio * 100).toFixed(1) + '%만 과세대상입니다.';
    return '';
  }
  if (r.exempted) return '<strong>' + L('exemptTitle') + '</strong>' + L('exemptBody');
  if (r.surchargeWaived && regulated && homes >= 2) return '<strong>' + L('waiverTitle') + '</strong>' + L('waiverBody').replace('{d}', r.waiverUntil);
  if (r.surchargeRatePct > 0) return '<strong>' + L('heavyTitle') + '</strong>' + L('heavyBody').replace('{p}', r.surchargeRatePct).replace('{n}', homes);
  if (r.taxableGainRatio < 1 && r.taxableGainRatio > 0) return '<strong>' + L('highValueTitle') + '</strong>' + L('highValueBody').replace('{p}', (r.taxableGainRatio * 100).toFixed(1));
  return '';
}

// 감면 적용/미적용 이유를 결과 하단에 그대로 노출한다.
//  세무 계산기는 "얼마"보다 "왜 그 금액인지"가 신뢰를 만든다.
function renderAcqNotes(scope, r) {
  const box = scope.querySelector('[data-acq-notes]');
  if (!box) return;
  const notes = (r && r.notes) || [];
  if (!notes.length) { box.hidden = true; box.innerHTML = ''; return; }
  const icon = { warn: '⚠', skip: '✕', info: 'ℹ' };
  box.hidden = false;
  // 한국어 UI는 n.text, 그 외 언어는 n.en(없으면 n.text)로 표시한다.
  const useEn = (document.documentElement.lang || 'ko') !== 'ko';
  box.innerHTML = notes.map((n) => {
    const safe = String((useEn && n.en) ? n.en : n.text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<li class="acq-note acq-note-' + n.kind + '"><span class="acq-note-icon" aria-hidden="true">'
      + (icon[n.kind] || 'ℹ') + '</span><span>' + safe + '</span></li>';
  }).join('');
}

(function () {
  const root = document.querySelector('[data-calc="acquisition-tax"]');
  if (!root) return;
  const inputs = root.querySelectorAll('input, select');
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  // 취득유형에 따라 관련 입력만 노출 (data-show 속성에 유형 슬러그 나열)
  const toggleFields = (acqType) => {
    root.querySelectorAll('[data-show]').forEach((el) => {
      const show = el.getAttribute('data-show').split(' ').includes(acqType);
      el.style.display = show ? '' : 'none';
    });
  };
  // 사용자가 판단해야 하는 사실만 묻고, 가격·주택 수·면적으로 알 수 있는 적용 가능성은 자동 처리한다.
  const syncEligibility = (price, acqType, homes, areaOver85) => {
    const setEligible = (name, eligible) => {
      const input = root.querySelector('[name="' + name + '"]');
      if (!input) return;
      input.disabled = !eligible;
      if (!eligible) input.checked = false;
      const field = input.closest('.field');
      if (field) field.classList.toggle('is-disabled', !eligible);
    };
    // 분양받은 신축주택(presale)도 유상거래이므로 감면 대상이 될 수 있다.
    const paid = acqType === 'purchase' || acqType === 'presale';
    setEligible('tempTwoHome', paid && homes === 2);
    setEligible('firstHome', paid && homes === 1 && price <= 1200000000);
    setEligible('childbirth', paid && homes === 1 && price <= 1200000000);
    setEligible('unsold2026', paid && !areaOver85 && price <= 600000000);
    // 소형주택 한도(300만원)와 조례 추가 감면은 상위 항목이 켜져 있을 때만 의미가 있다.
    const firstHomeOn = root.querySelector('[name="firstHome"]')?.checked || false;
    const unsoldOn = root.querySelector('[name="unsold2026"]')?.checked || false;
    setEligible('firstHomeSmallHouse', paid && firstHomeOn);
    // 조례 추가 감면은 '지방 준공 후 미분양'을 실제로 체크한 사람에게만 의미가 있다.
    //  비활성 상태로 늘 띄워 두면 대부분의 사용자에게는 읽을 필요 없는 칸이 하나 더
    //  늘어날 뿐이라, 아예 숨긴다.
    const localSel = root.querySelector('[name="unsold2026LocalExtra"]');
    if (localSel) {
      const on = paid && unsoldOn;
      localSel.disabled = !on;
      const f = localSel.closest('.field');
      if (f) { f.classList.toggle('is-disabled', !on); f.style.display = on ? '' : 'none'; }
    }

    const status = root.querySelector('[data-acq-auto-status]');
    if (!status) return;
    if (acqType === 'gift') {
      // ⚠ 중과 판정은 시가표준액으로 한다. 미입력이면 시가인정액으로 대신 판정하고 그 사실을 밝힌다.
      const regulated = root.querySelector('[name="regulated"]')?.checked || false;
      const donorMulti = root.querySelector('[name="giftDonorMultiHome"]')?.checked || false;
      const stdRaw = fmt.parseWon(root.querySelector('[name="giftStdValue"]')?.value || '0');
      const marketRaw = fmt.parseWon(root.querySelector('[name="giftMarketValue"]')?.value || '0') || price;
      const judgeBase = stdRaw > 0 ? stdRaw : marketRaw;
      const heavy = judgeBase >= 300000000 && regulated && donorMulti;
      const basis = stdRaw > 0
        ? (isEn ? 'standard market value' : '시가표준액')
        : (isEn ? 'recognised market value (standard value not entered)' : '시가인정액(시가표준액 미입력)');
      status.textContent = isEn
        ? (heavy ? 'Automatically applied: 12% gift rate, judged on ' + basis + '.'
          : 'Automatically applied: standard 3.5% gift rate, judged on ' + basis + '.')
        : (heavy ? '자동 판정: ' + basis + ' 기준으로 증여 취득세 12% 중과가 적용됩니다.'
          : '자동 판정: ' + basis + ' 기준으로 증여 취득세 표준세율 3.5%가 적용됩니다.');
      return;
    }
    if (acqType === 'purchase' || acqType === 'presale') {
      const disabled = [];
      if (homes !== 2) disabled.push(isEn ? 'temporary 2-home relief' : '일시적 2주택');
      if (homes !== 1 || price > 1200000000) disabled.push(isEn ? 'first-home relief' : '생애최초 감면', isEn ? 'childbirth relief' : '출산·양육 감면');
      if (areaOver85 || price > 600000000) disabled.push(isEn ? 'unsold-unit relief' : '지방 미분양 감면');
      status.textContent = disabled.length
        ? (isEn ? 'Automatically unavailable under the current inputs: ' : '현재 입력값으로 자동 제외: ') + disabled.join(isEn ? ', ' : ' · ')
        : (isEn ? 'Eligibility limits are checked automatically from price, home count, and floor area.' : '가격·주택 수·면적에 따른 적용 가능 여부를 자동으로 확인합니다.');
      return;
    }
    if (acqType === 'redevelop') {
      status.textContent = isEn
        ? 'Redevelopment member acquisition is a rough estimate — the prior-share and additional-contribution tax bases must be assessed separately.'
        : '조합원 취득은 종전지분과 추가분담금의 과세표준을 나누어 판정해야 합니다. 아래 결과는 개략 추정치입니다.';
      return;
    }
    status.textContent = isEn
      ? 'The applicable acquisition-tax rate is selected automatically from the facts above.'
      : '입력한 사실을 기준으로 적용 취득세율을 자동 판정합니다.';
  };
  // 세율 요약 표에서 현재 적용 구간 하이라이트
  const highlightRateRow = (r, homes, regulated, eok) => {
    const table = document.querySelector('[data-rate-table]');
    if (!table) return;
    table.querySelectorAll('tr[data-row]').forEach((tr) => tr.classList.remove('is-active'));
    if (!r.isPaidTransfer) return; // 표는 유상취득(매매·분양) 기준
    let key;
    if (r.isHeavy) {
      if (homes === 2) key = 'h2-reg';
      else if (homes === 3) key = regulated ? 'h3-reg' : 'h3-non';
      else key = 'h4';
    } else {
      key = homes === 1 || r.scenario.includes('일시적') ? 'h1' : 'h2-non';
    }
    const tr = table.querySelector('tr[data-row="' + key + '"]');
    if (tr) tr.classList.add('is-active');
  };
  const recalc = () => {
    const price = fmt.parseWon(root.querySelector('[name="price"]').value);
    const acqType = root.querySelector('[name="acqType"]:checked')?.value || 'purchase';
    const homes = Number(root.querySelector('[name="homes"]:checked')?.value || 1);
    const regulated = root.querySelector('[name="regulated"]')?.checked || false;
    const areaOver85 = root.querySelector('[name="areaOver85"]')?.checked || false;
    toggleFields(acqType);
    syncEligibility(price, acqType, homes, areaOver85);
    const firstHome = root.querySelector('[name="firstHome"]')?.checked || false;
    const tempTwoHome = root.querySelector('[name="tempTwoHome"]')?.checked || false;
    const inheritNoHome = root.querySelector('[name="inheritNoHome"]')?.checked || false;
    const giftDonorMultiHome = root.querySelector('[name="giftDonorMultiHome"]')?.checked || false;
    const legacyGiftHeavy = root.querySelector('[name="giftHeavy"]');
    const unsold2026 = root.querySelector('[name="unsold2026"]')?.checked || false;
    const localSelEl = root.querySelector('[name="unsold2026LocalExtra"]');
    const localRaw = localSelEl ? localSelEl.value : '';
    const unsold2026LocalExtra = (localRaw === '' || localRaw === 'unknown') ? null : Number(localRaw);
    const firstHomeSmallHouse = root.querySelector('[name="firstHomeSmallHouse"]')?.checked || false;
    const childbirth = root.querySelector('[name="childbirth"]')?.checked || false;
    // 증여: 과세표준(시가인정액)·중과 판정(시가표준액)·승계채무액은 서로 다른 입력이다.
    const giftNum = (name) => {
      const el = root.querySelector('[name="' + name + '"]');
      if (!el) return null;
      const v = fmt.parseWon(el.value);
      return v > 0 ? v : null;
    };
    const r = calcAcquisitionTax({
      price, homes, regulated, areaOver85, firstHome, acqType,
      tempTwoHome, inheritNoHome, giftDonorMultiHome, unsold2026,
      unsold2026LocalExtra, firstHomeSmallHouse, childbirth,
      giftMarketValue: giftNum('giftMarketValue'),
      giftStdValue: giftNum('giftStdValue'),
      giftAssumedDebt: giftNum('giftAssumedDebt') || 0,
      ...(legacyGiftHeavy ? { giftHeavy: legacyGiftHeavy.checked } : {}),
    });
    if (!r) {
      setText('total', fmt.won(0));
      ['acquisition','ruralTax','localEduTax','firstHomeDeduct'].forEach(k => setText(k, fmt.won(0)));
      setText('rate', '—');
      setText('scenario', isEn ? 'Enter a price' : '매매가를 입력하세요');
      renderAcqNotes(root, null);
      return;
    }
    setText('scenario', scenarioText(r, document.documentElement.lang));
    setText('rate', (r.baseRate * 100).toFixed(2) + '%' + (r.isHeavy ? (isEn ? ' (heavy)' : ' (중과)') : ''));
    setText('acquisition', fmt.won(r.acquisition));
    setText('ruralTax', r.ruralTax ? fmt.won(r.ruralTax) : (isEn ? 'Exempt' : '면제'));
    setText('localEduTax', fmt.won(r.localEduTax));
    // 어떤 감면이 적용됐는지 라벨로 함께 밝힌다(생애최초 / 출산·양육).
    const reliefLabel = r.appliedReliefKey === 'childbirth'
      ? (isEn ? 'Childbirth relief' : '출산·양육 감면')
      : (isEn ? 'First-home relief' : '생애최초 감면');
    const reliefLabelEl = root.querySelector('[data-out-label="firstHomeDeduct"]');
    if (reliefLabelEl && r.firstHomeDeduct) reliefLabelEl.textContent = reliefLabel;
    setText('firstHomeDeduct', r.firstHomeDeduct ? '−' + fmt.won(r.firstHomeDeduct) : (isEn ? 'N/A' : '해당 없음'));
    setText('unsoldDeduct', r.unsoldDeduct
      ? '−' + fmt.won(r.unsoldDeduct) + ' (' + Math.round(r.unsoldRatio * 100) + '%)'
      : (isEn ? 'N/A' : '해당 없음'));
    setText('total', fmt.won(r.total));

    // ── 증여: 과세표준과 부담부증여 유상취득 부분을 분리해 표시 ──
    const giftRows = root.querySelectorAll('[data-gift-row]');
    const showGiftBase = acqType === 'gift' && r.giftFreeBase != null;
    giftRows.forEach((el) => { el.hidden = !showGiftBase; });
    if (showGiftBase) setText('giftFreeBase', fmt.won(r.giftFreeBase));

    const burdenedBox = root.querySelector('[data-burdened-box]');
    if (burdenedBox) {
      const bp = r.burdenedPaidPart;
      burdenedBox.hidden = !bp;
      if (bp) {
        setText('burdenedRate', '(' + (bp.baseRate * 100).toFixed(2) + '%)');
        setText('burdenedAcq', fmt.won(bp.acquisition));
        setText('burdenedRural', bp.ruralTax ? fmt.won(bp.ruralTax) : (isEn ? 'Exempt' : '면제'));
        setText('burdenedEdu', fmt.won(bp.localEduTax));
        setText('combinedTotal', fmt.won(r.combinedTotal));
      }
    }

    highlightRateRow(r, homes, regulated, price / 100000000);
    renderAcqNotes(root, r);
  };
  inputs.forEach((el) => el.addEventListener('input', recalc));
  inputs.forEach((el) => el.addEventListener('change', recalc));
  recalc();
})();

// ===== Brokerage Fee Calculator =====
// 출처: 공인중개사법 시행규칙 제20조 및 [별표] / 서울특별시 주택 중개보수 조례
//  - 주택(매매·전세·월세): 시·도 조례 상한요율. 본 위젯은 서울특별시 기준.
//  - 월세·보증부 월세: 거래금액 = 보증금 + 월세 × 100.
//      그 금액이 5천만원 미만이면 월세 × 70으로 다시 환산한다(시행규칙 제20조 제4항).
//  - 주거용 오피스텔(85㎡ 이하 + 부엌·화장실·목욕시설): 매매 0.5% / 임대차 0.4% — 상한 없음.
//  - 그 밖의 중개대상물(상가·토지·업무용 오피스텔): 0.9% 이내 협의.
//  - 중개보수는 매도인·매수인(임대인·임차인)이 '각각' 부담한다. 결과는 1인당 금액.
//  - 부가가치세는 일반과세자 10%. 간이과세자는 다르므로 토글로 분리한다.
//
// deposit/monthlyRent를 주면 월세 환산 거래금액을 산출하고, price를 주면 그대로 쓴다.
function calcBrokerageFee(opts) {
  const {
    price, type,
    deposit = 0, monthlyRent = 0,
    negotiatedRate = null,  // 협의 요율(%) 직접 입력. 상한을 넘으면 경고와 함께 상한으로 제한
    includeVat = true,      // 부가세 포함 여부
    vatRate = null,         // 간이과세자 등 다른 요율을 쓸 때
    // 주택 상한요율은 시·도 조례로 정한다. 아래 요율표는 서울특별시 조례 기준이며,
    // 다른 시·도는 같은 요율표로 계산하되 '조례 미대조' 경고를 함께 낸다.
    region = null,
  } = opts || {};

  const R = (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.brokerage) || {};
  const mult = R.monthlyRentMultiplier || 100;
  const multLow = R.monthlyRentMultiplierLow || 70;
  const lowThreshold = R.monthlyRentLowThreshold || 50000000;
  const otherMax = R.otherPropertyMaxRate || 0.009;
  const oT = R.officetelResidential || { sale: 0.005, lease: 0.004 };
  const vRate = vatRate != null ? vatRate : (R.vatRate != null ? R.vatRate : 0.10);

  // ── 거래금액 산정 ──
  let amount = price;
  let conversionNote = '';
  if (type === 'monthly' || type === 'officetel-monthly') {
    // 보증부 월세: 보증금 + 월세 × 100, 5천만원 미만이면 월세 × 70으로 재환산
    amount = deposit + monthlyRent * mult;
    conversionNote = '보증금 + 월세 × ' + mult;
    if (amount < lowThreshold) {
      amount = deposit + monthlyRent * multLow;
      conversionNote = '환산액 5천만원 미만 → 보증금 + 월세 × ' + multLow;
    }
  }
  if (!amount || amount <= 0) return null;

  const eok = amount / 100000000;
  let rate = null, max = null, capRate = null, category = '';

  if (type === 'sale') {
    category = '주택 매매·교환';
    if (eok < 0.5) { rate = 0.006; max = 250000; }
    else if (eok < 2) { rate = 0.005; max = 800000; }
    else if (eok < 9) { rate = 0.004; }
    else if (eok < 12) { rate = 0.005; }
    else if (eok < 15) { rate = 0.006; }
    else { rate = 0.007; }
  } else if (type === 'jeonse' || type === 'monthly') {
    category = type === 'monthly' ? '주택 임대차(보증부 월세)' : '주택 임대차(전세)';
    if (eok < 0.5) { rate = 0.005; max = 200000; }
    else if (eok < 1) { rate = 0.004; max = 300000; }
    else if (eok < 6) { rate = 0.003; }
    else if (eok < 12) { rate = 0.004; }
    else if (eok < 15) { rate = 0.005; }
    else { rate = 0.006; }
  } else if (type === 'officetel-sale') {
    category = '주거용 오피스텔 매매';
    rate = oT.sale;
  } else if (type === 'officetel-jeonse' || type === 'officetel-monthly') {
    category = '주거용 오피스텔 임대차';
    rate = oT.lease;
  } else if (type === 'other') {
    category = '상가·토지·업무용 오피스텔 등';
    rate = otherMax; // 0.9% 이내 협의 — 기본값은 상한
  } else {
    return null;
  }

  capRate = rate;
  // 협의 요율: 상한 이내에서만 인정된다. 초과 입력은 상한으로 제한하고 경고.
  let negotiatedExceeded = false;
  if (negotiatedRate != null && negotiatedRate !== '') {
    const nr = Math.max(0, Number(negotiatedRate) / 100);
    if (nr > capRate) { negotiatedExceeded = true; rate = capRate; }
    else rate = nr;
  }

  let fee = amount * rate;
  let capApplied = false;
  if (max != null && fee > max) { fee = max; capApplied = true; }

  const vat = includeVat ? fee * vRate : 0;

  // ── 시·도 조례 ──
  //  주택(매매·전세·월세) 상한요율만 조례 사항이다. 오피스텔·상가·토지는 법령 상한이라
  //  시·도와 무관하므로 경고를 붙이지 않는다.
  const regionList = R.regions || [];
  const regionKey = region || R.defaultRegion || 'KR-11';
  const regionInfo = regionList.find((x) => x.key === regionKey) || regionList[0] || null;
  const regionApplies = (R.regionAppliesTo || ['sale', 'jeonse', 'monthly']).indexOf(type) >= 0;
  const regionUnverified = Boolean(regionApplies && regionInfo && !regionInfo.verified);

  return {
    amount, category, conversionNote,
    rate, capRate, max, capApplied, negotiatedExceeded,
    region: regionInfo, regionApplies, regionUnverified,
    regionWarn: regionUnverified ? (R.regionUnverifiedWarn || '') : '',
    fee, vat, vatRate: includeVat ? vRate : 0, includeVat,
    total: fee + vat,
    // 매도인·매수인(임대인·임차인) 각각 부담 → 거래 전체에서 중개업자가 받는 총액
    bothParties: (fee + vat) * 2,
  };
}

// ===== RTI 공통 계산 =====
// 보증금의 간주임대료(기본 3.5%)까지 포함해 전용 계산기와 종합계산기가 같은 값을 사용한다.
function calcRti({ monthlyRent, deposit = 0, loan, annualRate, depositRate = 0.035 }) {
  const rent12 = Math.max(0, monthlyRent || 0) * 12;
  const depositIncome = Math.max(0, deposit || 0) * depositRate;
  const annualRent = rent12 + depositIncome;
  const annualInterest = Math.max(0, loan || 0) * (Math.max(0, annualRate || 0) / 100);
  const ratio = annualInterest > 0 ? annualRent / annualInterest : 0;
  return { rent12, depositIncome, annualRent, annualInterest, ratio, depositRate };
}

(function () {
  const root = document.querySelector('[data-calc="brokerage-fee"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector(sel); if (el) el.textContent = txt; };
  const isMonthly = (t) => t === 'monthly' || t === 'officetel-monthly';
  const recalc = () => {
    const type = root.querySelector('[name="type"]:checked')?.value || 'sale';
    // 거래 유형에 따라 입력 필드를 바꾼다: 월세면 보증금+월세, 그 외는 거래금액 하나.
    root.querySelectorAll('[data-bf-show]').forEach((el) => {
      const on = el.getAttribute('data-bf-show').split(' ').includes(isMonthly(type) ? 'monthly' : 'lump');
      el.style.display = on ? '' : 'none';
    });
    const price = fmt.parseWon(root.querySelector('[name="price"]')?.value || '0');
    const deposit = fmt.parseWon(root.querySelector('[name="deposit"]')?.value || '0');
    const monthlyRent = fmt.parseWon(root.querySelector('[name="monthlyRent"]')?.value || '0');
    const negRaw = root.querySelector('[name="negotiatedRate"]')?.value;
    const negotiatedRate = (negRaw === '' || negRaw == null) ? null : negRaw;
    const vatEl = root.querySelector('[name="includeVat"]');
    const includeVat = vatEl ? vatEl.checked : true;
    const region = root.querySelector('[name="bfRegion"]')?.value || null;
    const r = calcBrokerageFee({ price, type, deposit, monthlyRent, negotiatedRate, includeVat, region });
    if (!r) {
      ['rate','cap','category','amount'].forEach(k => setText('[data-out="'+k+'"]', '—'));
      ['fee','vat','total','bothParties'].forEach(k => setText('[data-out="'+k+'"]', fmt.won(0)));
      const w = root.querySelector('[data-out="bfWarn"]'); if (w) w.style.display = 'none';
      return;
    }
    setText('[data-out="category"]', r.category
      + (r.regionApplies && r.region ? ' · ' + r.region.name + ' 조례 기준' : ''));
    const regionBox = root.querySelector('[data-out="bfRegionNote"]');
    if (regionBox) {
      if (r.regionApplies && r.region) {
        regionBox.hidden = false;
        regionBox.className = r.regionUnverified ? 'data-stale' : 'data-fresh';
        regionBox.textContent = r.regionUnverified
          ? r.regionWarn + ' (' + r.region.ordinance + ')'
          : r.region.ordinance + ' 요율표로 계산했습니다.';
      } else {
        regionBox.hidden = true;
      }
    }
    setText('[data-out="amount"]', fmt.won(r.amount) + (r.conversionNote ? ' (' + r.conversionNote + ')' : ''));
    setText('[data-out="rate"]', (r.rate * 100).toFixed(2) + '%'
      + (r.rate < r.capRate ? (isEn ? ' (negotiated)' : ' (협의)') : ''));
    setText('[data-out="cap"]', (r.capRate * 100).toFixed(2) + '%'
      + (r.max ? ' · ' + (isEn ? 'cap ' : '한도 ') + fmt.won(r.max) : ''));
    setText('[data-out="fee"]', fmt.won(r.fee));
    setText('[data-out="vat"]', r.includeVat ? fmt.won(r.vat) : (isEn ? 'Excluded' : '미포함'));
    setText('[data-out="total"]', fmt.won(r.total));
    setText('[data-out="bothParties"]', fmt.won(r.bothParties));
    // 상한 초과 협의 요율은 무효 — 사용자에게 명시적으로 알린다.
    const warn = root.querySelector('[data-out="bfWarn"]');
    if (warn) {
      const msgs = [];
      if (r.negotiatedExceeded) {
        msgs.push(isEn
          ? 'The rate you entered exceeds the legal maximum, so the cap rate was applied instead.'
          : '입력한 협의 요율이 법정 상한을 초과해 상한요율로 제한했습니다. 상한을 넘는 중개보수 약정은 초과분이 무효입니다.');
      }
      if (r.capApplied) {
        msgs.push(isEn
          ? 'A fixed maximum applies to this bracket, so the fee was capped.'
          : '이 구간은 정액 한도가 있어 한도액으로 제한했습니다.');
      }
      warn.style.display = msgs.length ? '' : 'none';
      warn.textContent = msgs.join(' ');
    }
  };
  root.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });
  recalc();
})();

// ===== 등기 부대비용 공통 엔진 (등기·법무사 계산기 / 종합계산기 공용) =====
//  ⚠ 과거엔 registration-cost.html 인라인 스크립트와 종합계산기가 인지세·채권매입률·
//    법무사 보수 산식을 각각 복붙해 갖고 있었다. 한쪽만 고치면 두 화면의 값이 갈린다.
//    아래 함수가 단일 기준이고, 두 화면은 이것만 호출한다.
//
//  ⚠ 법무사 "기본보수"와 "대행수수료·실비"는 다른 항목이다. 협회 보수표는 기본보수의
//    **상한** 산정방법만 정한 것이고, 실제 청구서에는 위임한 부대업무의 대행수수료와
//    일당·교통비·부가세가 따로 붙는다. 그래서 결과도 항목별로 분리해 돌려준다.

// 인지세 (인지세법 제3조) — 계약금액 구간별 정액
function calcStampDuty(price) {
  const table = (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.stampDuty) || [
    { upTo: 10000000, amount: 0 }, { upTo: 30000000, amount: 20000 },
    { upTo: 50000000, amount: 40000 }, { upTo: 100000000, amount: 70000 },
    { upTo: 1000000000, amount: 150000 }, { upTo: Infinity, amount: 350000 },
  ];
  for (const b of table) if (price <= b.upTo) return b.amount;
  return 0;
}

// 국민주택채권 매입률 (주택도시기금법 시행령 별표, 시가표준액 구간별)
//  region: 'metro'(특별시·광역시) | 'other'(그 밖의 지역) — 상위 구간 요율이 다름
function calcBondPurchaseRate(std, asset, region) {
  const eok = std / 100000000;
  const metro = region !== 'other';
  if (asset === 'land') {
    if (std < 5000000) return 0;
    if (eok < 0.5) return metro ? 0.025 : 0.020;
    if (eok < 1) return metro ? 0.040 : 0.035;
    return metro ? 0.050 : 0.045;
  }
  if (std < 20000000) return 0;
  if (eok < 0.5) return 0.013;
  if (eok < 1) return 0.019;
  if (eok < 1.6) return metro ? 0.021 : 0.018;
  if (eok < 2.6) return metro ? 0.023 : 0.021;
  if (eok < 6) return metro ? 0.026 : 0.024;
  return metro ? 0.031 : 0.026;
}

// 채권 매입금액은 만원 단위로 절상(5천원 미만 절사·5천원 이상 절상)
function roundBondAmount(amount) {
  const unit = ((typeof window !== 'undefined' && window.TOPDA_RATES
    && window.TOPDA_RATES.bond && window.TOPDA_RATES.bond.roundUnit) || 10000);
  return Math.round(amount / unit) * unit;
}

// 법무사 **기본보수 상한** (대한법무사협회 보수표 2024.9.12 시행)
//  ⚠ 10억 초과 금액에 계속 0.05%를 적용하면 20억·200억 초과 구간이 통째로 빠져
//    고가 부동산에서 보수가 과다 산정된다. 구간표를 rates.js에서 읽어 그대로 적용한다.
function calcScrivenerBaseFee(price, opts) {
  opts = opts || {};
  if (!price || price <= 0) return { fee: 0, bracket: null, unverified: false, extraProperties: 0 };
  const cfg = (typeof window !== 'undefined' && window.TOPDA_RATES
    && window.TOPDA_RATES.registration && window.TOPDA_RATES.registration.scrivenerBaseFee) || {};
  const brackets = cfg.brackets || [
    { upTo: 50000000, base: 210000, rate: 0, from: 0 },
    { upTo: 100000000, base: 210000, rate: 0.0010, from: 50000000 },
    { upTo: 300000000, base: 260000, rate: 0.0009, from: 100000000 },
    { upTo: 500000000, base: 440000, rate: 0.0008, from: 300000000 },
    { upTo: 1000000000, base: 600000, rate: 0.0007, from: 500000000 },
    { upTo: 2000000000, base: 950000, rate: 0.0005, from: 1000000000 },
    { upTo: 20000000000, base: 1450000, rate: 0.0003, from: 2000000000 },
    { upTo: Infinity, base: 6850000, rate: 0.0001, from: 20000000000 },
  ];
  const b = brackets.find((x) => price <= x.upTo) || brackets[brackets.length - 1];
  let fee = b.base + Math.max(0, price - b.from) * b.rate;
  // 1건의 신청서로 여러 부동산 → 초과 1개마다 가산
  const extra = Math.max(0, Math.round(Number(opts.propertyCount || 1)) - 1);
  const extraAdd = extra * (cfg.extraPropertyAdd || 0);
  fee += extraAdd;
  const unit = cfg.roundUnit || 1000;
  return {
    fee: Math.round(fee / unit) * unit,
    bracket: b,
    unverified: b.confidence === 'needs-verification',
    unverifiedNote: cfg.unverifiedNote || '',
    extraProperties: extra, extraPropertyAdd: extraAdd,
  };
}

// 등기 총비용 (취득세 제외 — 취득세는 calcAcquisitionTax가 담당)
function calcRegistrationCost(input) {
  const {
    price, stdValue = 0, asset = 'house', region = 'metro',
    discountPct = null,       // 채권 고객부담률(%). null이면 예시값을 쓴다.
    self = false,             // 셀프 등기 → 법무사 보수·대행료·부가세 0
    filingMethod = 'visit',
    propertyCount = 1,
    agencyTasks = [],         // 실제로 위임한 부대업무 키 배열
    fieldwork = 'none',       // 'none' | 'under4h' | 'over4h'
    scrivenerQuote = null,    // 실제 견적 기본보수(원). 있으면 상한 대신 이 값을 쓴다.
    extraExpense = 0,         // 기타 실비·출장 교통비(사용자 입력)
  } = input;

  const REG = (typeof window !== 'undefined' && window.TOPDA_RATES
    && window.TOPDA_RATES.registration) || {};
  const notes = [];
  const empty = {
    total: 0, totalMin: 0, totalMax: 0, stamp: 0, filingFee: 0,
    bondBuy: 0, bondSelfPay: 0, bondRate: 0, scrivenerBase: 0,
    agencyFeeMin: 0, agencyFeeMax: 0, fieldworkFee: 0, vatMin: 0, vatMax: 0,
    stdValue: 0, stdValueEstimated: false, agencyFeeItems: [], notes,
  };
  if (!price || price <= 0) return empty;

  // ── 시가표준액: 미입력 시 매매가 × 70% 추정. 법정값이 아니다. ──
  const estimateRatio = REG.stdValueEstimateRatio != null ? REG.stdValueEstimateRatio : 0.7;
  const stdValueEstimated = !stdValue || stdValue <= 0;
  const std = stdValueEstimated ? Math.round(price * estimateRatio) : stdValue;
  if (stdValueEstimated) {
    notes.push({ kind: 'warn', key: 'stdEstimate',
      text: REG.stdValueEstimateNote
        || '시가표준액을 입력하지 않아 「매매가 × 70%」로 추정했습니다. 법정 비율이 아니라 단순 추정치입니다.' });
  }

  // ── 인지세 (법정 확정) ──
  const stamp = calcStampDuty(price);

  // ── 등기신청 수수료 (신청 방식별) ──
  const fCfg = REG.filingFee || {};
  const methods = fCfg.methods || [{ key: 'visit', label: '방문(서면) 신청', amount: 18000 }];
  const method = methods.find((m) => m.key === filingMethod) || methods[0];
  const count = Math.max(1, Math.round(Number(propertyCount) || 1));
  const filingFee = method.amount * count;
  if (method.confidence === 'needs-verification' && method.note) {
    notes.push({ kind: 'warn', key: 'filingFee', text: method.note });
  }

  // ── 국민주택채권 (법정 매입률 × 시가표준액 / 본인부담은 시세) ──
  const bondCfg = (typeof window !== 'undefined' && window.TOPDA_RATES
    && window.TOPDA_RATES.bond) || {};
  const usedDiscountPct = discountPct != null && discountPct !== ''
    ? Number(discountPct)
    : (bondCfg.exampleDiscountPct != null ? bondCfg.exampleDiscountPct : 15);
  const bondRate = calcBondPurchaseRate(std, asset, region);
  const bondBuy = roundBondAmount(std * bondRate);
  const bondSelfPay = Math.round(bondBuy * (usedDiscountPct / 100));

  // ── 법무사 보수: 기본보수 상한 / 대행수수료 / 실비 / 부가세를 분리 ──
  const baseRes = calcScrivenerBaseFee(price, { propertyCount: count });
  let scrivenerBase = self ? 0 : baseRes.fee;
  let scrivenerBaseIsQuote = false;
  if (!self && scrivenerQuote != null && scrivenerQuote !== '' && Number(scrivenerQuote) > 0) {
    scrivenerBase = Math.round(Number(scrivenerQuote));
    scrivenerBaseIsQuote = true;
  }
  if (!self && !scrivenerBaseIsQuote && baseRes.unverified && baseRes.unverifiedNote) {
    notes.push({ kind: 'warn', key: 'scrivenerBracket', text: baseRes.unverifiedNote });
  }

  const agencyDefs = REG.agencyFees || [];
  const agencyFeeItems = self ? [] : agencyDefs
    .filter((a) => agencyTasks.indexOf(a.key) >= 0)
    .map((a) => ({
      key: a.key, label: a.label,
      min: a.amount != null ? a.amount : (a.amountMin || 0),
      max: a.amount != null ? a.amount : (a.amountMax || a.amountMin || 0),
      isRange: a.amount == null,
      confidence: a.confidence || 'estimate', note: a.note || '',
    }));
  agencyFeeItems.forEach((a) => { if (a.isRange && a.note) notes.push({ kind: 'warn', key: a.key, text: a.note }); });
  const agencyFeeMin = agencyFeeItems.reduce((s, a) => s + a.min, 0);
  const agencyFeeMax = agencyFeeItems.reduce((s, a) => s + a.max, 0);

  const fw = REG.fieldwork || {};
  const fieldworkFee = self ? 0
    : (fieldwork === 'under4h' ? (fw.dayAllowanceUnder4h || 0)
      : fieldwork === 'over4h' ? (fw.dayAllowanceOver4h || 0) : 0);

  const extra = self ? 0 : Math.max(0, Number(extraExpense) || 0);

  // 부가세는 법무사 보수(기본보수 + 대행수수료 + 일당·실비)에만 붙는다.
  //  인지세·등기신청수수료·채권 본인부담금은 세금·실비라 부가세 대상이 아니다.
  const vatRate = REG.vatRate != null ? REG.vatRate : 0.10;
  const scrivenerSubtotalMin = scrivenerBase + agencyFeeMin + fieldworkFee + extra;
  const scrivenerSubtotalMax = scrivenerBase + agencyFeeMax + fieldworkFee + extra;
  const vatMin = Math.round(scrivenerSubtotalMin * vatRate);
  const vatMax = Math.round(scrivenerSubtotalMax * vatRate);
  const scrivenerTotalMin = scrivenerSubtotalMin + vatMin;
  const scrivenerTotalMax = scrivenerSubtotalMax + vatMax;

  const fixed = stamp + filingFee + bondSelfPay;
  const totalMin = fixed + scrivenerTotalMin;
  const totalMax = fixed + scrivenerTotalMax;

  if (!self && !scrivenerBaseIsQuote) {
    notes.push({ kind: 'info', key: 'baseIsCap',
      text: '법무사 기본보수는 협회 보수표가 정한 **상한**입니다. 사무소별 할인이 흔하고, 반대로 난이도·복잡도에 따라 협의로 가산될 수도 있습니다. 실제 금액은 견적서로 확인하세요.' });
  }

  return {
    price, stdValue: std, stdValueEstimated, estimateRatio,
    stamp,
    filingFee, filingMethod: method, propertyCount: count,
    bondRate, bondBuy, bondSelfPay, discountPct: usedDiscountPct,
    scrivenerBase, scrivenerBaseIsQuote, scrivenerBracket: baseRes.bracket,
    scrivenerBaseUnverified: baseRes.unverified,
    extraPropertyAdd: baseRes.extraPropertyAdd,
    agencyFeeItems, agencyFeeMin, agencyFeeMax,
    fieldworkFee, extraExpense: extra,
    vatRate, vatMin, vatMax,
    scrivenerSubtotalMin, scrivenerSubtotalMax, scrivenerTotalMin, scrivenerTotalMax,
    isRange: totalMax > totalMin,
    total: totalMin, totalMin, totalMax,
    self,
    notes,
  };
}

// bond_rate.json 적용 — seed·수집실패 값을 '실시간 조회값'처럼 보여주지 않는다.
//  성공: 값을 채우고 as_of·수집일을 초록 배지로 표시
//  seed/실패/오래된 값: 값을 강제로 바꾸지 않고 "실시간 조회 실패 — 예시값 사용 중" 경고
function applyBondDiscountRate(json, opts) {
  opts = opts || {};
  const bondCfg = (typeof window !== 'undefined' && window.TOPDA_RATES
    && window.TOPDA_RATES.bond) || {};
  const staleDays = bondCfg.stalenessWarnDays || 7;
  const example = bondCfg.exampleDiscountPct != null ? bondCfg.exampleDiscountPct : 15;

  const rate = json && Number(json.customer_burden_rate_pct);
  const isSeed = !json || json.seed === true || !rate || !(rate > 0);
  const collectedAt = json && (json.collected_at || json.last_success_at || null);
  const asOf = json && json.as_of ? json.as_of : null;

  let ageDays = null;
  if (collectedAt) {
    const t = Date.parse(collectedAt);
    if (!isNaN(t)) ageDays = Math.floor((Date.now() - t) / 86400000);
  }
  const isStale = !isSeed && (collectedAt == null || (ageDays != null && ageDays > staleDays));

  // 자동 수집이 며칠째 실패 중이면 그 사실도 함께 밝힌다 — "오늘도 안 됐다"를
  // 사용자가 알아야 직접 입력하러 간다.
  const fails = Number((json && json.consecutive_failures) || 0);
  const lastAttempt = json && json.last_attempt_at;
  const failNote = fails >= 3
    ? ' 자동 수집이 ' + fails + '회 연속 실패했습니다'
      + (lastAttempt ? ' (마지막 시도 ' + lastAttempt + ')' : '') + '.'
    : '';

  if (isSeed) {
    return {
      state: 'example', rate: example, asOf, collectedAt, ageDays, fails,
      shouldFill: false,
      message: '실시간 조회 실패 — 예시값(' + example + '%) 사용 중. 고객부담률은 시장금리에 따라 매일 바뀌므로, '
        + '잔금일 당일 값을 은행 국민주택채권 포털에서 확인해 직접 입력하세요.'
        + (asOf ? ' (마지막 표시 기준일 ' + asOf + ')' : '') + failNote,
    };
  }
  if (isStale) {
    return {
      state: 'stale', rate, asOf, collectedAt, ageDays,
      shouldFill: true,
      message: '마지막 정상 수집이 ' + (collectedAt || '확인 불가')
        + (ageDays != null ? ' (' + ageDays + '일 전)' : '')
        + '입니다. 고객부담률은 매일 바뀌므로 당일 고객부담률을 직접 입력하세요.'
        + (asOf ? ' 적용 기준일 ' + asOf + '.' : ''),
    };
  }
  return {
    state: 'fresh', rate, asOf, collectedAt, ageDays,
    shouldFill: true,
    message: '실시간 조회값 ' + rate + '%'
      + (asOf ? ' · 적용 기준일 ' + asOf : '')
      + (collectedAt ? ' · 마지막 정상 수집 ' + collectedAt : ''),
  };
}

// ===== Transfer Tax (양도소득세) Calculator =====
// 단순화 모델 (일반 주거용 주택 · 2025~2026년 기준)
// - 1세대1주택 비과세: 양도가 12억 이하면 전액 면세. 초과 시 (양도차익 × (양도가-12억)/양도가) 만큼만 과세
// - 장기보유특별공제:
//   * 일반: 3년 6%, 매년 +2%, 15년 30% 상한 (보유 2년 미만 0%)
//   * 1세대1주택: 보유 3년 12% +4%/년 (10년 40% 상한) + 거주 3년 12% +4%/년 (10년 40% 상한). 합산 최대 80%
// - 기본공제 250만원
// - 누진세율: 8구간 (1,400 / 5,000 / 8,800 / 1.5억 / 3억 / 5억 / 10억 / 그 외)
// - 단기보유 중과: 1년 미만 70%, 1~2년 60% (주택 기준, 비교과세 단순화)
// - 다주택 중과: 조정대상지역 2주택 +20%p, 3주택+ +30%p (자동 적용).
//   * 중과 대상 주택은 장기보유특별공제도 배제 (소득세법 제95조 제2항)
//   * 2년 이상 보유 + 양도일 ≤ 2026-05-09 이면 한시 유예로 중과 미적용
//   * '중과 배제 주택'(장기임대·상속 등)으로 표시하면 중과·장특공 배제 해제
// - 지방소득세 = 양도소득세 × 10%
function calcTransferTax(input) {
  const {
    sellPrice, buyPrice, cost,
    holdYears: holdYearsInput, liveYears: liveYearsInput,
    homes, onlyHome, regulated,
    assetType = 'house', // 종합계산기의 비주택(상가·업무용 오피스텔·토지) 단기세율 분기용
    surchargeExempt = false, // 조정지역 다주택이라도 중과 제외 요건(장기임대·상속 등) 해당 시 true
    sellDate,        // 'YYYY-MM-DD' — 다주택 중과 한시 유예 자동 판단용
    // ── 보유·거주기간을 날짜로 계산 (정수 연수 입력보다 정확) ──
    //  취득일·양도일이 모두 있으면 holdYears를, 거주 시작·종료일이 있으면 liveYears를
    //  실제 경과일수로 덮어쓴다. 2년 비과세 요건과 장특공 구간이 하루 차이로 갈리기 때문.
    acquireDate = '',
    residenceStartDate = '',
    residenceEndDate = '',
    jointOwners = 1, // 공동명의 인원(1=단독, 2=부부 공동 등). ownerShares가 없으면 균등 분할
    ownerShares = null, // 소유자별 지분율(%) 배열 예: [60, 40]. 합이 100이 아니면 정규화한다.
    // ── 중과 유예 경과규정 판정용 (2026-05-09 이후 양도) ──
    contractDate = '',           // 매매계약일
    downPaymentReceived = false, // 계약금 수령 여부
    newRegulatedArea = false,    // 신규 조정대상지역(유예 기간 6개월 적용 대상)
    landPermitTarget = false,    // 토지거래허가 대상
    landPermitApplyDate = '',    // 토지거래허가 신청일
    // ── 증여재산 이월과세 (소득세법 제97조의2) ──
    giftedFromRelative = false,  // 배우자·직계존비속으로부터 증여받은 부동산인가
    giftReceivedDate = '',       // 증여받은 날
    donorBuyPrice = 0,           // 증여자의 취득가액(이월 적용 대상)
  } = input;
  if (!sellPrice || sellPrice <= 0) return null;

  const isHousing = assetType !== 'nonhouse';

  // ── 보유·거주기간: 날짜가 있으면 실제 경과일수로 계산한다 ──
  const isDateStr = (s) => Boolean(s) && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const yearsBetween = (from, to) => {
    const a = Date.parse(from), b = Date.parse(to);
    if (isNaN(a) || isNaN(b) || b <= a) return 0;
    return (b - a) / (365.2425 * 24 * 3600 * 1000);
  };
  let holdYears = Number(holdYearsInput) || 0;
  let liveYears = Number(liveYearsInput) || 0;
  let holdFromDates = false, liveFromDates = false;
  if (isDateStr(acquireDate) && isDateStr(sellDate)) {
    holdYears = yearsBetween(acquireDate, sellDate);
    holdFromDates = true;
  }
  if (isDateStr(residenceStartDate) && isDateStr(residenceEndDate)) {
    liveYears = yearsBetween(residenceStartDate, residenceEndDate);
    liveFromDates = true;
  }

  // ── 증여재산 이월과세 ──
  //  배우자·직계존비속에게서 증여받은 부동산을 10년 이내 양도하면 취득가액에
  //  '증여자의 취득가액'이 이월 적용된다(수증자의 증여받은 가액이 아님).
  //  취득가액이 낮아져 양도차익이 커지므로 세액이 크게 달라진다.
  const TR = (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.transferTax) || {};
  const carryoverYears = (TR.carryoverBasis && TR.carryoverBasis.withinYears) || 10;
  let carryoverApplied = false;
  let effectiveBuyPrice = buyPrice;
  if (giftedFromRelative && donorBuyPrice > 0) {
    // 증여일~양도일이 10년 이내면 이월과세. 날짜가 없으면 사용자의 선택을 그대로 신뢰한다.
    let withinWindow = true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(giftReceivedDate) && /^\d{4}-\d{2}-\d{2}$/.test(sellDate || '')) {
      const g = new Date(giftReceivedDate), s = new Date(sellDate);
      withinWindow = (s - g) / (365.2425 * 24 * 3600 * 1000) < carryoverYears;
    }
    if (withinWindow) {
      carryoverApplied = true;
      effectiveBuyPrice = donorBuyPrice;
    }
  }

  const rawGain = Math.max(0, sellPrice - effectiveBuyPrice - cost);

  // 1세대 1주택 비과세 / 안분
  let exempted = false;
  let taxableGainRatio = 1;
  const isOneHome = isHousing && homes === 1 && onlyHome;
  if (isOneHome && holdYears >= 2) {
    if (sellPrice <= 1200000000) {
      exempted = true;
      taxableGainRatio = 0;
    } else {
      taxableGainRatio = (sellPrice - 1200000000) / sellPrice;
    }
  }
  const taxableGain = rawGain * taxableGainRatio;

  // 단기보유 판정
  let shortTermRate = null;
  if (holdYears < 1) shortTermRate = isHousing ? 0.70 : 0.50;
  else if (holdYears < 2) shortTermRate = isHousing ? 0.60 : 0.40;

  // ── 다주택 중과 한시 유예 판단 ──
  //  ① 원칙: 보유 2년+ & 양도일 ≤ 유예 종료일이면 조정지역·다주택이어도 중과 미적용.
  //  ② 경과규정: 유예 종료일까지 매매계약 + 계약금 수령을 마쳤다면, 계약일부터
  //     4개월(신규 조정대상지역 6개월) 이내 양도까지 유예가 이어진다.
  //     토지거래허가 대상은 종료일까지 허가를 신청했다면 6개월 이내 양도까지 인정된다.
  //  → 잔금일이 종료일 다음 날이라고 무조건 중과되는 것이 아니다.
  const W = TR;
  const waiverUntil = W.multiHomeSurchargeWaiverUntil || '2026-05-09';
  const waiverMinHold = W.multiHomeSurchargeWaiverMinHoldYears || 2;
  const G = W.multiHomeSurchargeGrace || {};
  const graceContractBy = G.contractBy || waiverUntil;
  const graceMonths = G.transferWithinMonths || 4;
  const graceMonthsNew = G.newRegulatedWithinMonths || 6;
  const gracePermitBy = G.landPermitApplyBy || waiverUntil;
  const graceMonthsPermit = G.landPermitWithinMonths || 6;

  const isDate = (s) => Boolean(s) && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const sd = isDate(sellDate) ? sellDate : '';
  const monthsBetween = (from, to) => {
    const a = new Date(from), b = new Date(to);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
      + (b.getDate() >= a.getDate() ? 0 : -1);
  };

  const holdOk = holdYears >= waiverMinHold;
  const inWaiverWindow = Boolean(sd && sd <= waiverUntil);

  // 경과규정 판정 (양도일이 유예 종료일 이후일 때만 의미가 있다)
  let graceApplied = false;
  let graceReason = '';
  if (sd && !inWaiverWindow && holdOk) {
    const limitMonths = newRegulatedArea ? graceMonthsNew : graceMonths;
    if (isDate(contractDate) && downPaymentReceived && contractDate <= graceContractBy
        && monthsBetween(contractDate, sd) < limitMonths) {
      graceApplied = true;
      graceReason = graceContractBy + '까지 매매계약·계약금 수령 완료 + 계약일부터 '
        + limitMonths + '개월 이내 양도';
    } else if (landPermitTarget && isDate(landPermitApplyDate)
        && landPermitApplyDate <= gracePermitBy
        && monthsBetween(landPermitApplyDate, sd) < graceMonthsPermit) {
      graceApplied = true;
      graceReason = '토지거래허가 대상 — ' + gracePermitBy + '까지 허가 신청 + 신청일부터 '
        + graceMonthsPermit + '개월 이내 양도';
    }
  }

  const waiverBase = inWaiverWindow || graceApplied;
  const surchargeWaived = Boolean(isHousing && regulated && homes >= 2 && sd && waiverBase && holdOk);

  // 다주택 중과 대상 판정 (조정대상지역 + 2주택 이상 + 장기보유 + 한시유예/중과배제 미해당).
  //  조정지역 다주택 양도는 세율 가산과 함께 장기보유특별공제가 배제된다 (소득세법 제95조 제2항).
  const heavyTax = isHousing && !shortTermRate && regulated && homes >= 2 && !surchargeWaived && !surchargeExempt;

  // 장기보유특별공제 (단기보유·다주택 중과 대상은 배제)
  let ltDeductRate = 0;
  if (!shortTermRate && !heavyTax && holdYears >= 3) {
    if (isOneHome && sellPrice > 1200000000 && liveYears >= 2) {
      // 표2(1세대1주택·거주 2년 이상): 보유 연 4%(최대 40%) + 거주 연 4%(최대 40%), 합산 최대 80%
      //  ⚠ 거주기간 공제는 2년 이상 3년 미만 구간 8%가 별도로 존재한다.
      //    3년부터 시작하면 거주 2년대 고가 1주택자의 세액이 과다 계산된다.
      const LD = (W.ltDeductResidence) || {};
      const under3y = LD.under3yRate != null ? LD.under3yRate : 0.08;
      const from3y = LD.from3yBaseRate != null ? LD.from3yBaseRate : 0.12;
      const perYear = LD.perYearRate != null ? LD.perYearRate : 0.04;
      const maxRate = LD.maxRate != null ? LD.maxRate : 0.40;
      const holdY = Math.min(holdYears, 10);
      const liveY = Math.min(liveYears, 10);
      const holdRate = holdY >= 3 ? Math.min(maxRate, from3y + (Math.floor(holdY) - 3) * perYear) : 0;
      const liveRate = liveY >= 3
        ? Math.min(maxRate, from3y + (Math.floor(liveY) - 3) * perYear)
        : under3y; // 거주 2년 이상 3년 미만
      ltDeductRate = Math.min(0.80, holdRate + liveRate);
    } else {
      // 표1(일반): 보유 연 2%, 3년 6% ~ 15년 30%
      const y = Math.min(holdYears, 15);
      ltDeductRate = Math.min(0.30, y * 0.02);
    }
  }
  const ltDeduct = taxableGain * ltDeductRate;
  const incomeAmount = Math.max(0, taxableGain - ltDeduct);

  // 기본공제 250만원
  const basicDeduct = Math.min(2500000, incomeAmount);
  const taxBase = Math.max(0, incomeAmount - basicDeduct);

  // 산출세액 (기본세율)
  let rate, deduction, appliedRateLabel;
  if (shortTermRate) {
    rate = shortTermRate;
    deduction = 0;
    appliedRateLabel = (shortTermRate * 100) + '% (단기보유 중과)';
  } else {
    const t = calcProgressiveTax(taxBase);
    rate = t.marginalRate;
    deduction = t.deduction;
    appliedRateLabel = (t.marginalRate * 100).toFixed(0) + '% (누진)';
  }

  // 다주택 중과세율 가산 (기본세율 + 2주택 20%p / 3주택+ 30%p)
  let surchargeRate = 0;
  if (heavyTax) {
    surchargeRate = homes >= 3 ? 0.30 : 0.20;
    rate += surchargeRate;
    appliedRateLabel += ' + ' + (surchargeRate * 100) + '%p 중과';
  } else if (surchargeWaived && regulated && homes >= 2) {
    appliedRateLabel += graceApplied
      ? ' (중과 유예 경과규정 적용)'
      : ' (중과 한시유예 적용 — ' + waiverUntil + '까지)';
  }

  // 산출세액 = 과세표준 × 세율 − 누진공제.
  //  중과 시에도 기본세율 구간의 누진공제는 유지된다(가산분만 정률). 단기보유는 누진공제 0.
  const incomeTax = Math.max(0, taxBase * rate - deduction);

  // 공동명의 안분: 각 소유자의 **지분율**만큼 양도차익을 나눠 각자 누진세율로 산출 → 합산.
  //  ⚠ 인원수 균등분할로 고정하면 6:4·7:3 같은 실제 지분 구성에서 세액이 틀린다.
  //    ownerShares(지분율 배열)가 있으면 그대로 쓰고, 없으면 인원수 균등분할로 되돌린다.
  //  기본공제 250만원은 **각 소유자마다** 적용된다(공동명의의 실제 절세 요인 중 하나).
  //  단기보유·다주택 중과 세율은 지분과 무관하므로 동일하게 적용한다.
  let shares = null;
  if (Array.isArray(ownerShares) && ownerShares.length > 1) {
    const nums = ownerShares.map((s) => Math.max(0, Number(s) || 0)).filter((s) => s > 0);
    const sum = nums.reduce((a, b) => a + b, 0);
    if (nums.length > 1 && sum > 0) shares = nums.map((s) => s / sum);
  }
  const owners = shares ? shares.length : Math.max(1, Math.min(4, Math.round(Number(jointOwners) || 1)));
  if (!shares && owners > 1) shares = new Array(owners).fill(1 / owners);
  const sharesEqual = !shares || shares.every((s) => Math.abs(s - shares[0]) < 1e-9);

  let jointBasicDeduct = null, jointTaxBase = null;
  let jointMarginalRatePct = null, jointAppliedRateLabel = null;
  let jointIncomeTax = null, jointLocalTax = null, jointTotal = null, savings = 0;
  let jointPerOwner = null;
  if (owners > 1 && shares && !exempted) {
    jointPerOwner = shares.map((share) => {
      const perGain = taxableGain * share;
      const perLtDeduct = perGain * ltDeductRate;
      const perIncome = Math.max(0, perGain - perLtDeduct);
      const perBasic = Math.min(2500000, perIncome);
      const perBase = Math.max(0, perIncome - perBasic);
      let perTax, ratePct, rateLabel;
      if (shortTermRate) {
        perTax = perBase * shortTermRate;
        ratePct = shortTermRate * 100;
        rateLabel = (shortTermRate * 100) + '% (단기보유 중과)';
      } else {
        const t = calcProgressiveTax(perBase);
        perTax = Math.max(0, perBase * (t.marginalRate + surchargeRate) - t.deduction);
        ratePct = Math.round(t.marginalRate * 100);
        rateLabel = ratePct + '% (누진)';
        if (surchargeRate > 0) rateLabel += ' + ' + (surchargeRate * 100) + '%p 중과';
        else if (surchargeWaived) rateLabel += ' (중과 한시유예 적용 — ' + waiverUntil + '까지)';
      }
      const perLocal = perTax * 0.10;
      return {
        sharePct: share * 100, gain: perGain, ltDeduct: perLtDeduct,
        basicDeduct: perBasic, taxBase: perBase,
        marginalRatePct: ratePct, appliedRateLabel: rateLabel,
        incomeTax: perTax, localTax: perLocal, total: perTax + perLocal,
      };
    });
    jointBasicDeduct = jointPerOwner.reduce((s, o) => s + o.basicDeduct, 0);
    jointTaxBase = jointPerOwner.reduce((s, o) => s + o.taxBase, 0);
    jointIncomeTax = jointPerOwner.reduce((s, o) => s + o.incomeTax, 0);
    jointLocalTax = jointIncomeTax * 0.10;
    jointTotal = jointIncomeTax + jointLocalTax;
    // 대표 표기는 지분이 가장 큰 소유자 기준(지분이 다르면 소유자별 세율이 다를 수 있다).
    const lead = jointPerOwner.reduce((m, o) => (o.sharePct > m.sharePct ? o : m), jointPerOwner[0]);
    jointMarginalRatePct = lead.marginalRatePct;
    jointAppliedRateLabel = lead.appliedRateLabel + (sharesEqual ? '' : ' (지분 최대 소유자 기준)');
    savings = Math.max(0, (incomeTax + incomeTax * 0.10) - jointTotal);
  }

  const localTax = incomeTax * 0.10;
  const total = incomeTax + localTax;
  const effective = sellPrice > 0 ? (total / sellPrice * 100) : 0;

  return {
    exempted, taxableGainRatio, rawGain, taxableGain,
    ltDeductRate, ltDeduct, incomeAmount, basicDeduct, taxBase,
    rate, appliedRateLabel, incomeTax, localTax, total, effective,
    surchargeWaived, jointOwners: owners,
    // 중과 유예 경과규정 · 증여 이월과세 판정 결과 (결과 화면에서 근거로 노출)
    graceApplied, graceReason, inWaiverWindow,
    carryoverApplied, effectiveBuyPrice,
    carryoverExtraGain: carryoverApplied ? Math.max(0, buyPrice - donorBuyPrice) : 0,
    jointBasicDeduct, jointTaxBase, jointMarginalRatePct, jointAppliedRateLabel,
    jointIncomeTax, jointLocalTax, jointTotal, jointSavings: savings,
    jointPerOwner, ownerSharePcts: shares ? shares.map((s) => s * 100) : null, sharesEqual,
    // 보유·거주기간을 날짜로 계산했는지 (화면에서 근거로 노출)
    holdYears, liveYears, holdFromDates, liveFromDates,
    // 비-한국어 표시용 구조화 필드(계산 로직은 위와 동일, 라벨 조립만 언어별로 분기)
    isShortTerm: !!shortTermRate, shortTermRatePct: shortTermRate ? shortTermRate * 100 : 0,
    marginalRatePct: !shortTermRate ? Math.round((rate - surchargeRate) * 100) : 0,
    surchargeRatePct: surchargeRate * 100, waiverUntil,
  };
}

function calcProgressiveTax(base) {
  // 2025 기준 누진세율 (8구간)
  const brackets = [
    { upTo: 14000000,    rate: 0.06, deduction: 0 },
    { upTo: 50000000,    rate: 0.15, deduction: 1260000 },
    { upTo: 88000000,    rate: 0.24, deduction: 5760000 },
    { upTo: 150000000,   rate: 0.35, deduction: 15440000 },
    { upTo: 300000000,   rate: 0.38, deduction: 19940000 },
    { upTo: 500000000,   rate: 0.40, deduction: 25940000 },
    { upTo: 1000000000,  rate: 0.42, deduction: 35940000 },
    { upTo: Infinity,    rate: 0.45, deduction: 65940000 },
  ];
  for (const b of brackets) {
    if (base <= b.upTo) return { marginalRate: b.rate, deduction: b.deduction };
  }
  const last = brackets[brackets.length - 1];
  return { marginalRate: last.rate, deduction: last.deduction };
}

(function () {
  const root = document.querySelector('[data-calc="transfer-tax"]');
  if (!root) return;
  const inputs = root.querySelectorAll('input, select');
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const recalc = () => {
    const sellPrice = fmt.parseWon(root.querySelector('[name="sellPrice"]').value);
    const buyPrice = fmt.parseWon(root.querySelector('[name="buyPrice"]').value);
    const cost = fmt.parseWon(root.querySelector('[name="cost"]').value);
    const holdYears = Number(root.querySelector('[name="holdYears"]').value || 0);
    const liveYears = Number(root.querySelector('[name="liveYears"]').value || 0);
    const homes = Number(root.querySelector('[name="homes"]:checked')?.value || 1);
    const onlyHome = root.querySelector('[name="onlyHome"]')?.checked || false;
    const regulated = root.querySelector('[name="regulated"]')?.checked || false;
    const surchargeExempt = root.querySelector('[name="surchargeExempt"]')?.checked || false;
    const sellDate = root.querySelector('[name="sellDate"]')?.value || '';
    const acquireDate = root.querySelector('[name="acquireDate"]')?.value || '';
    const residenceStartDate = root.querySelector('[name="residenceStartDate"]')?.value || '';
    const residenceEndDate = root.querySelector('[name="residenceEndDate"]')?.value || '';
    const jointOwners = Number(root.querySelector('[name="jointOwners"]')?.value || 1);
    // 공동명의 지분율 — 인원 수만큼만 읽는다. 합이 100이 아니어도 비율대로 정규화된다.
    root.querySelectorAll('[data-tt-show="shares"]').forEach((el) => {
      el.style.display = jointOwners > 1 ? '' : 'none';
    });
    root.querySelectorAll('[data-tt-show="shares34"]').forEach((el) => {
      el.style.display = jointOwners > 2 ? '' : 'none';
    });
    let ownerShares = null;
    if (jointOwners > 1) {
      const raw = [];
      for (let i = 1; i <= jointOwners; i += 1) {
        const el = root.querySelector('[name="ownerShare' + i + '"]');
        raw.push(el ? Math.max(0, Number(el.value) || 0) : 0);
      }
      const sum = raw.reduce((a, b) => a + b, 0);
      if (sum > 0 && raw.filter((s) => s > 0).length > 1) ownerShares = raw;
      const sumEl = root.querySelector('[data-out="shareSum"]');
      if (sumEl) {
        sumEl.textContent = isEn
          ? 'Total ' + sum + '%' + (Math.abs(sum - 100) > 0.01 ? ' — normalised to the entered ratio' : '')
          : '합계 ' + sum + '%' + (Math.abs(sum - 100) > 0.01 ? ' — 입력한 비율대로 정규화해 계산합니다' : '');
      }
    }
    const contractDate = root.querySelector('[name="contractDate"]')?.value || '';
    const downPaymentReceived = root.querySelector('[name="downPaymentReceived"]')?.checked || false;
    const newRegulatedArea = root.querySelector('[name="newRegulatedArea"]')?.checked || false;
    const landPermitTarget = root.querySelector('[name="landPermitTarget"]')?.checked || false;
    const landPermitApplyDate = root.querySelector('[name="landPermitApplyDate"]')?.value || '';
    const giftedFromRelative = root.querySelector('[name="giftedFromRelative"]')?.checked || false;
    const giftReceivedDate = root.querySelector('[name="giftReceivedDate"]')?.value || '';
    const donorBuyPrice = fmt.parseWon(root.querySelector('[name="donorBuyPrice"]')?.value || '0');
    // 경과규정·이월과세 입력은 해당 사실을 선택했을 때만 노출한다.
    root.querySelectorAll('[data-tt-show="grace"]').forEach((el) => {
      el.style.display = (regulated && homes >= 2) ? '' : 'none';
    });
    root.querySelectorAll('[data-tt-show="permit"]').forEach((el) => {
      el.style.display = (regulated && homes >= 2 && landPermitTarget) ? '' : 'none';
    });
    root.querySelectorAll('[data-tt-show="carryover"]').forEach((el) => {
      el.style.display = giftedFromRelative ? '' : 'none';
    });
    const r = calcTransferTax({
      sellPrice, buyPrice, cost, holdYears, liveYears,
      homes, onlyHome, regulated, surchargeExempt,
      sellDate, jointOwners, ownerShares,
      acquireDate, residenceStartDate, residenceEndDate,
      contractDate, downPaymentReceived, newRegulatedArea,
      landPermitTarget, landPermitApplyDate,
      giftedFromRelative, giftReceivedDate, donorBuyPrice,
    });
    const exemptBox = root.querySelector('[data-out="exemptBox"]');
    const jointBox = root.querySelector('[data-out="jointBox"]');
    if (!r) {
      ['total','gain','ltDeduct','income','basicDeduct','taxBase','incomeTax','localTax'].forEach(k => setText(k, fmt.won(0)));
      setText('rate', '—');
      setText('effective', (document.documentElement.lang !== 'ko') ? (TT_I18N.effRate.en + ' —') : '실효세율 —');
      if (exemptBox) exemptBox.style.display = 'none';
      if (jointBox) jointBox.style.display = 'none';
      return;
    }
    setText('gain', fmt.won(r.rawGain));
    setText('ltDeduct', '−' + fmt.won(r.ltDeduct) + ' (' + (r.ltDeductRate * 100).toFixed(0) + '%)');
    setText('income', fmt.won(r.incomeAmount));
    setText('basicDeduct', '−' + fmt.won(r.basicDeduct));
    setText('taxBase', fmt.won(r.taxBase));
    const ttLang = document.documentElement.lang || 'ko';
    setText('rate', rateLabelText(r, ttLang));
    setText('incomeTax', fmt.won(r.incomeTax));
    setText('localTax', fmt.won(r.localTax));
    setText('total', fmt.won(r.total));
    setText('effective', effectiveRateText(r, ttLang));
    // 증여재산 이월과세가 적용되면 취득가액이 바뀌어 세액이 크게 달라진다 — 반드시 알린다.
    const carryBox = root.querySelector('[data-out="carryoverBox"]');
    if (carryBox) {
      if (r.carryoverApplied) {
        carryBox.style.display = '';
        const msg = root.querySelector('[data-out="carryoverMsg"]');
        if (msg) {
          msg.innerHTML = isEn
            ? '<strong>Carry-over basis applied</strong>The property was gifted by a spouse or lineal relative and is being sold within 10 years, so the <em>donor’s</em> acquisition price (' + fmt.won(r.effectiveBuyPrice) + ') replaces your acquisition price. Taxable gain increases by ' + fmt.won(r.carryoverExtraGain) + '.'
            : '<strong>증여재산 이월과세 적용</strong>배우자·직계존비속에게 증여받은 부동산을 10년 이내 양도하므로 취득가액에 <em>증여자의 취득가액</em>(' + fmt.won(r.effectiveBuyPrice) + ')이 이월 적용됩니다. 그만큼 양도차익이 ' + fmt.won(r.carryoverExtraGain) + ' 늘어납니다. (소득세법 제97조의2)';
        }
      } else {
        carryBox.style.display = 'none';
      }
    }
    if (exemptBox) {
      const html = exemptBoxHtml(r, ttLang, regulated, homes);
      if (html) {
        exemptBox.style.display = '';
        const msg = root.querySelector('[data-out="exemptMsg"]');
        if (msg) msg.innerHTML = html;
      } else {
        exemptBox.style.display = 'none';
      }
    }
    // 공동명의 절세 비교
    if (jointBox) {
      if (r.jointTotal != null && r.jointOwners > 1 && r.jointSavings > 0) {
        jointBox.style.display = '';
        const JOINT_I18N = {
          ko: { owners: (n) => n + '인 공동', saved: ' 절세' },
          en: { owners: (n) => n + '-way joint', saved: ' saved' },
          'zh-Hans': { owners: (n) => n + '人共有', saved: ' 节税' },
          'zh-Hant': { owners: (n) => n + '人共有', saved: ' 節稅' },
          vi: { owners: (n) => 'Đồng sở hữu ' + n + ' người', saved: ' tiết kiệm' },
          th: { owners: (n) => 'ร่วมเจ้าของ ' + n + ' คน', saved: ' ประหยัด' },
        };
        const J = JOINT_I18N[ttLang] || JOINT_I18N.en;
        setText('jointSingle', fmt.won(r.total));
        setText('jointOwnersOut', J.owners(r.jointOwners));
        setText('jointTotalOut', fmt.won(r.jointTotal));
        setText('jointSavings', '−' + fmt.won(r.jointSavings) + J.saved);
        // 지분이 균등하지 않으면 소유자별 세액을 그대로 보여준다(합계만 보면 검증이 안 된다).
        const perBox = root.querySelector('[data-out="jointPerOwner"]');
        if (perBox) {
          if (r.jointPerOwner && !r.sharesEqual) {
            perBox.hidden = false;
            perBox.innerHTML = r.jointPerOwner.map((o, i) =>
              '<div class="row sub"><span class="key">소유자 ' + (i + 1) + ' (지분 '
              + o.sharePct.toFixed(1) + '%) · ' + o.appliedRateLabel
              + '</span><span class="val">' + fmt.won(o.total) + '</span></div>').join('');
          } else {
            perBox.hidden = true;
            perBox.innerHTML = '';
          }
        }
      } else {
        jointBox.style.display = 'none';
      }
    }
    // 보유·거주기간을 날짜로 계산했으면 그 사실과 계산된 연수를 밝힌다.
    const periodNote = root.querySelector('[data-out="periodNote"]');
    if (periodNote) {
      const parts = [];
      if (r.holdFromDates) parts.push((isEn ? 'Holding period from dates: ' : '날짜 기준 보유 ') + r.holdYears.toFixed(2) + (isEn ? ' yrs' : '년'));
      if (r.liveFromDates) parts.push((isEn ? 'Residency from dates: ' : '날짜 기준 거주 ') + r.liveYears.toFixed(2) + (isEn ? ' yrs' : '년'));
      periodNote.hidden = !parts.length;
      periodNote.textContent = parts.join(' · ');
    }
  };
  inputs.forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();

// ===== Balance-Day Settlement (잔금일 정산) Calculator =====
function calcBalanceSettlement(input) {
  const { monthlyFee, daysInMonth, daysOccupiedBySeller, prepaidFee, accumLongRepair, gasCost, electricCost, additional } = input;
  const sellerShare = monthlyFee * (daysOccupiedBySeller / daysInMonth);
  const buyerShare = monthlyFee - sellerShare;
  // 매도자가 매수자에게 반환받는 항목: 선수관리비
  // 매도자가 임차인에게 정산받는 항목: 장기수선충당금 (소유자 부담분이지만 임차인이 매월 납부한 경우 임차인에게 반환)
  // 본 계산기는 매매 잔금일 기준 (선수관리비는 매수자 → 매도자에게 반환)
  const sellerNet = sellerShare + gasCost + electricCost + additional - prepaidFee;
  const buyerNet = prepaidFee - sellerShare - gasCost - electricCost - additional;
  return {
    sellerShare, buyerShare, prepaidFee, accumLongRepair,
    sellerNet, // 매도자가 추가로 내야 할 금액 (음수면 받을 금액)
    buyerNet,  // 매수자가 매도자에게 전달할 금액 (음수면 받을 금액)
  };
}

(function () {
  const root = document.querySelector('[data-calc="balance-settlement"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const recalc = () => {
    const monthlyFee = fmt.parseWon(root.querySelector('[name="monthlyFee"]').value);
    const daysInMonth = Number(root.querySelector('[name="daysInMonth"]').value || 30);
    const daysOccupiedBySeller = Number(root.querySelector('[name="daysOccupiedBySeller"]').value || 0);
    const prepaidFee = fmt.parseWon(root.querySelector('[name="prepaidFee"]').value);
    const accumLongRepair = fmt.parseWon(root.querySelector('[name="accumLongRepair"]').value);
    const gasCost = fmt.parseWon(root.querySelector('[name="gasCost"]').value);
    const electricCost = fmt.parseWon(root.querySelector('[name="electricCost"]').value);
    const additional = fmt.parseWon(root.querySelector('[name="additional"]').value);
    const r = calcBalanceSettlement({ monthlyFee, daysInMonth, daysOccupiedBySeller, prepaidFee, accumLongRepair, gasCost, electricCost, additional });
    setText('sellerShare', fmt.won(r.sellerShare));
    setText('buyerShare', fmt.won(r.buyerShare));
    setText('prepaidOut', fmt.won(r.prepaidFee));
    setText('longRepairOut', fmt.won(r.accumLongRepair));
    // 매도자 받을 금액 = 선수관리비 - 매도자 사용분 관리비 - 가스 - 전기 - 기타
    // = -buyerNet
    const netToSeller = r.prepaidFee - r.sellerShare - gasCost - electricCost - additional;
    const lang = document.documentElement.lang || 'ko';
    const ARROW = {
      ko: { buyerToSeller: '매수자 → 매도자 ', sellerToBuyer: '매도자 → 매수자 ' },
      en: { buyerToSeller: 'Buyer → Seller ', sellerToBuyer: 'Seller → Buyer ' },
      'zh-Hans': { buyerToSeller: '买方 → 卖方 ', sellerToBuyer: '卖方 → 买方 ' },
      'zh-Hant': { buyerToSeller: '買方 → 賣方 ', sellerToBuyer: '賣方 → 買方 ' },
      vi: { buyerToSeller: 'Bên mua → Bên bán ', sellerToBuyer: 'Bên bán → Bên mua ' },
      th: { buyerToSeller: 'ผู้ซื้อ → ผู้ขาย ', sellerToBuyer: 'ผู้ขาย → ผู้ซื้อ ' },
    };
    const arrow = ARROW[lang] || ARROW.en;
    if (netToSeller >= 0) {
      setText('settlement', arrow.buyerToSeller + fmt.won(netToSeller));
    } else {
      setText('settlement', arrow.sellerToBuyer + fmt.won(-netToSeller));
    }
    setText('netSeller', fmt.won(netToSeller));
    setText('tenantLongRepair', fmt.won(r.accumLongRepair));
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();

// ===== Jeonse ↔ Monthly Rent Conversion =====
// 법정 전월세전환율 상한 = min(연 10%, 한국은행 기준금리 + 2%p)
//  ⚠ 이 상한은 '기존 계약의 전세 → 월세 전환'에 적용되는 법정 한도(주임법 제7조의2)이며,
//    신규 계약에서 흔히 쓰이는 시장 전환율과는 다르다. 화면에서 두 값을 분리해 보여준다.
function legalConversionCapPct() {
  const C = (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.jeonseConversion) || {};
  const base = C.baseRatePct != null ? C.baseRatePct : 2.75;
  const add = C.addPct != null ? C.addPct : 2.0;
  const hard = C.hardCapPct != null ? C.hardCapPct : 10.0;
  return {
    cap: Math.min(hard, base + add),
    baseRatePct: base, addPct: add, hardCapPct: hard,
    baseRateAsOf: C.baseRateAsOf || '',
  };
}

function calcJeonseMonthly(input) {
  const { mode, deposit, monthly, baseDeposit, rate } = input;
  // 전환율(연 %): 보증금 × rate / 12 = 월세 (원)
  const monthlyRate = rate / 100 / 12;
  if (mode === 'toMonthly') {
    // 전세 → 순수 월세 (보증금 = baseDeposit, 나머지 보증금을 월세로 환산)
    const convertibleDeposit = Math.max(0, deposit - baseDeposit);
    const calcMonthly = convertibleDeposit * monthlyRate;
    return { calcMonthly, calcDeposit: baseDeposit, convertibleDeposit };
  } else {
    // 월세 → 전세 (월세 부분을 보증금으로 환산해 합산)
    const convertibleDeposit = monthly / monthlyRate;
    const totalDeposit = deposit + convertibleDeposit;
    return { calcDeposit: totalDeposit, convertibleDeposit, monthlyConverted: monthly };
  }
}

(function () {
  const root = document.querySelector('[data-calc="jeonse-monthly"]');
  if (!root) return;
  // 전환 방향(toMonthly/toJeonse) 두 블록에 같은 data-out이 있으므로 전부 갱신한다.
  const setText = (sel, txt) => {
    root.querySelectorAll('[data-out="' + sel + '"]').forEach((el) => { el.textContent = txt; });
  };
  const recalc = () => {
    const mode = root.querySelector('[name="mode"]:checked')?.value || 'toMonthly';
    const deposit = fmt.parseWon(root.querySelector('[name="deposit"]').value);
    const monthly = fmt.parseWon(root.querySelector('[name="monthly"]').value);
    const baseDeposit = fmt.parseWon(root.querySelector('[name="baseDeposit"]').value);
    const rate = Number(root.querySelector('[name="rate"]').value || 6);
    const r = calcJeonseMonthly({ mode, deposit, monthly, baseDeposit, rate });
    // Show/hide depending on mode
    const toMonthlyEl = root.querySelector('[data-mode="toMonthly"]');
    const toJeonseEl = root.querySelector('[data-mode="toJeonse"]');
    if (mode === 'toMonthly') {
      if (toMonthlyEl) toMonthlyEl.style.display = '';
      if (toJeonseEl) toJeonseEl.style.display = 'none';
      setText('outMonthly', fmt.won(r.calcMonthly));
      setText('outBaseDeposit', fmt.won(r.calcDeposit));
      setText('outConverted', fmt.won(r.convertibleDeposit));
    } else {
      if (toMonthlyEl) toMonthlyEl.style.display = 'none';
      if (toJeonseEl) toJeonseEl.style.display = '';
      setText('outTotalDeposit', fmt.won(r.calcDeposit));
      setText('outAddedDeposit', fmt.won(r.convertibleDeposit));
    }
    setText('outRate', rate.toFixed(2) + '% (연)');

    // 법정 상한과 시장 전환율을 분리해 표시한다.
    const cap = legalConversionCapPct();
    setText('legalCap', cap.cap.toFixed(2) + '%');
    setText('legalCapBasis', isEn
      ? 'min(10%, BOK base rate ' + cap.baseRatePct.toFixed(2) + '% + ' + cap.addPct.toFixed(2) + '%p)'
        + (cap.baseRateAsOf ? ' · as of ' + cap.baseRateAsOf : '')
      : 'min(연 10%, 한국은행 기준금리 ' + cap.baseRatePct.toFixed(2) + '% + ' + cap.addPct.toFixed(2) + '%p)'
        + (cap.baseRateAsOf ? ' · ' + cap.baseRateAsOf + ' 기준' : ''));
    const capWarn = root.querySelector('[data-out="capWarn"]');
    if (capWarn) {
      const over = rate > cap.cap + 1e-9;
      capWarn.style.display = over ? '' : 'none';
      capWarn.textContent = over
        ? (isEn
          ? 'The rate you entered (' + rate.toFixed(2) + '%) exceeds the statutory cap of ' + cap.cap.toFixed(2) + '%. The cap binds when converting an existing jeonse contract to monthly rent; a new contract is set by the market.'
          : '입력한 전환율 ' + rate.toFixed(2) + '%는 법정 상한 ' + cap.cap.toFixed(2) + '%를 초과합니다. 법정 상한은 기존 계약의 전세 → 월세 전환에 적용되며, 신규 계약은 시장에서 정해집니다 — 비교용으로만 사용하세요.')
        : '';
    }
    // 법정 상한으로 계산했을 때의 월세도 함께 보여준다(협상 기준선).
    if (mode === 'toMonthly') {
      const legal = calcJeonseMonthly({ mode, deposit, monthly, baseDeposit, rate: cap.cap });
      setText('outMonthlyLegal', fmt.won(legal.calcMonthly));
    }
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();

// ===== Housing Subscription Score (청약가점) =====
function calcSubscriptionScore({ noHomeYears, dependents, accountYears, spouseAccountYears = 0 }) {
  const S = (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.subscription) || {};
  const accountMax = S.accountMax || 17;
  const spouseRatio = S.spouseAccountRatio != null ? S.spouseAccountRatio : 0.5;
  const spouseMaxPts = S.spouseAccountMaxPoints != null ? S.spouseAccountMaxPoints : 3;

  // 무주택기간 (32점): 만30세 미만이거나 미혼이면 0점. 1년 미만 2점, 1년부터 매년 +2점, 15년 32점
  let s1;
  if (noHomeYears < 1) s1 = 2;
  else s1 = Math.min(32, 2 + Math.floor(noHomeYears) * 2);
  if (noHomeYears <= 0) s1 = 0;

  // 부양가족 (35점): 0명 5점, 1~6명 매명 +5점, 7명+ 35점
  let s2 = Math.min(35, 5 + dependents * 5);

  // 청약통장 가입기간 (17점): 6개월 미만 1점, 6개월~1년 2점, 1년부터 매년 +1점, 15년 이상 17점
  const bandScore = (y) => {
    if (y < 0.5) return 1;
    if (y < 1) return 2;
    return Math.min(accountMax, 2 + Math.floor(y));
  };
  const ownAccount = bandScore(accountYears);
  // 배우자 청약통장 가입기간은 그 점수의 50%를 최대 3점까지 합산한다.
  //  합산 후에도 통장 항목 전체 상한은 17점이다.
  const spouseRaw = spouseAccountYears > 0 ? bandScore(spouseAccountYears) : 0;
  const spouseAccount = Math.min(spouseMaxPts, Math.floor(spouseRaw * spouseRatio));
  const s3 = Math.min(accountMax, ownAccount + spouseAccount);

  return { s1, s2, s3, ownAccount, spouseAccount, accountMax, total: s1 + s2 + s3 };
}

(function () {
  const root = document.querySelector('[data-calc="housing-subscription"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const recalc = () => {
    const noHomeYears = Number(root.querySelector('[name="noHomeYears"]').value || 0);
    const dependents = Number(root.querySelector('[name="dependents"]').value || 0);
    const accountYears = Number(root.querySelector('[name="accountYears"]').value || 0);
    const spouseAccountYears = Number(root.querySelector('[name="spouseAccountYears"]')?.value || 0);
    const r = calcSubscriptionScore({ noHomeYears, dependents, accountYears, spouseAccountYears });
    setText('s1', r.s1 + '점');
    setText('s2', r.s2 + '점');
    setText('s3', r.s3 + '점');
    setText('s3Own', r.ownAccount + '점');
    setText('s3Spouse', r.spouseAccount ? '+' + r.spouseAccount + '점' : '해당 없음');
    setText('total', r.total + '점');
    setText('totalLabel', '/ 84점 만점');
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();


// ===== Total Cost Dashboard — 6 시나리오 통합 =====
// 매수 · 양도 · 전세 임차 · 임대(RTI) · 상속 · 증여
// DSR은 매수에서만, RTI는 임대에서만 노출. 전세대출은 DSR 산정 제외.
(function () {
  const root = document.querySelector('[data-calc="total-cost-dashboard"]');
  if (!root) return;
  if (typeof Chart === 'undefined') {
    const wait = setInterval(() => {
      if (typeof Chart !== 'undefined') { clearInterval(wait); init(); }
    }, 100);
    return;
  }
  init();

  function init() {
    let currentScn = 'sale';
    let leaseBizTouched = false;   // 임대사업자 체크박스를 사용자가 직접 만졌으면 자동 제안을 멈춘다
    const RATES = window.TOPDA_RATES || {};
    const DSR_T1 = (RATES.dsr && RATES.dsr.tier1) || 40; // 1금융 한도(%)
    const DSR_T2 = (RATES.dsr && RATES.dsr.tier2) || 50; // 2금융 한도(%)
    let chart = null;
    const canvas = document.getElementById('costChart');
    const chartEmpty = root.querySelector('[data-chart-empty]');
    const panels = document.querySelectorAll('[data-scn-panel]');
    const resultTitle = root.querySelector('[data-scn-result-title]');
    const detailBox = root.querySelector('[data-detail-breakdown]');
    const dsrBox = root.querySelector('[data-dsr-box]');
    const rtiBox = root.querySelector('[data-rti-box]');
    const mortgageLimitBox = root.querySelector('[data-mortgage-limit-box]');
    const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
    const setLabel = (attr, txt) => { const el = root.querySelector('['+attr+']'); if (el) el.textContent = txt; };
    // 이 계산기의 라벨·안내문은 이 블록 안에서만 L(한국어, 영어)로 분기한다(isEn은 파일 상단에서 전역 선언).
    const L = (ko, en) => (isEn ? en : ko);

    const getN = (name) => fmt.parseWon(root.querySelector('[name="'+name+'"]')?.value || '0');
    const getNum = (name) => Number(root.querySelector('[name="'+name+'"]')?.value || 0);
    const getRadio = (name) => root.querySelector('[name="'+name+'"]:checked')?.value;
    const getCheck = (name) => root.querySelector('[name="'+name+'"]')?.checked || false;

    function acquisitionTotal(price, options) {
      const r = calcAcquisitionTax({ price, ...options });
      return r || { total: 0, acquisition: 0, ruralTax: 0, localEduTax: 0, firstHomeDeduct: 0, baseRate: 0 };
    }

    function brokerFee(price, type) {
      const r = calcBrokerageFee({ price, type: type === 'lease' ? 'jeonse' : 'sale' });
      return r ? Math.round(r.total) : 0;
    }

    function monthlyPayment(principal, annualRate, years) {
      if (!principal || annualRate <= 0 || years <= 0) return 0;
      const i = annualRate / 100 / 12;
      const n = years * 12;
      return principal * i * Math.pow(1+i, n) / (Math.pow(1+i, n) - 1);
    }

    // 원금균등: 첫 달 상환액(원금 균등 + 잔액 이자) — 매월 줄어들며 첫 달이 가장 크다.
    function equalPrincipalFirstMonth(principal, annualRate, years) {
      if (!principal || years <= 0) return 0;
      const n = years * 12;
      const i = annualRate / 100 / 12;
      return principal / n + principal * i;
    }
    // 원금균등: 첫 1년(12개월) 원리금 합계 — DSR은 상환 부담이 가장 큰 첫해 기준으로 산정.
    function equalPrincipalFirstYear(principal, annualRate, years) {
      if (!principal || years <= 0) return 0;
      const n = years * 12;
      const i = annualRate / 100 / 12;
      const months = Math.min(12, n);
      let sum = 0;
      for (let k = 0; k < months; k++) {
        const balance = principal - (principal / n) * k;
        sum += principal / n + balance * i;
      }
      return sum;
    }
    // 원금균등: 만기까지 총 이자 = i × 원금 × (n+1)/2
    function equalPrincipalTotalInterest(principal, annualRate, years) {
      if (!principal || annualRate <= 0 || years <= 0) return 0;
      const n = years * 12;
      const i = annualRate / 100 / 12;
      return principal * i * (n + 1) / 2;
    }

    // 법무사·등기 부대비용 — 자체 산식을 두지 않고 공통 엔진 calcRegistrationCost()를 호출한다.
    //  (과거엔 인지세·채권매입률·법무사 보수 산식이 여기 복붙돼 있어 등기 계산기와 값이 갈렸다.)
    //  종합계산기는 부대업무 위임 여부를 따로 묻지 않으므로, 등기 계산기의 기본 선택
    //  (취득세 신고 대행 + 채권 매입 대행)과 같은 조건으로 계산해 두 화면의 값을 맞춘다.
    const DASHBOARD_AGENCY_TASKS = ['acqTaxFiling', 'bondAgency'];
    function registrationCost(price, std, discount, self, asset, region) {
      const r = calcRegistrationCost({
        price, stdValue: std, asset: asset || 'house', region,
        discountPct: discount != null ? discount * 100 : null,
        self, filingMethod: getRadio('regFilingMethod') || 'visit',
        agencyTasks: self ? [] : DASHBOARD_AGENCY_TASKS,
      });
      // 종합계산기 화면이 쓰는 축약 필드명으로 맞춰 돌려준다(기존 표시 코드 유지).
      return {
        total: r.totalMin, stamp: r.stamp, regFee: r.filingFee,
        bond: r.bondSelfPay, bondBuy: r.bondBuy, rate: r.bondRate,
        scrivener: r.scrivenerBase + r.agencyFeeMin + r.fieldworkFee,
        scrivenerBase: r.scrivenerBase, agencyFee: r.agencyFeeMin,
        vat: r.vatMin, std: r.stdValue, stdEstimated: r.stdValueEstimated,
        detail: r,
      };
    }

    function inheritGiftTax(base) {
      const brackets = [
        { upTo: 100000000,   rate: 0.10, deduction: 0 },
        { upTo: 500000000,   rate: 0.20, deduction: 10000000 },
        { upTo: 1000000000,  rate: 0.30, deduction: 60000000 },
        { upTo: 3000000000,  rate: 0.40, deduction: 160000000 },
        { upTo: Infinity,    rate: 0.50, deduction: 460000000 },
      ];
      for (const b of brackets) if (base <= b.upTo) return Math.max(0, base * b.rate - b.deduction);
      return 0;
    }

    // ── 배우자 상속공제 (상증법 제19조) ──
    //  ⚠ '순재산 × 30%'는 법령 어디에도 없는 근사식이다. 실제 공제액은
    //     min(배우자가 실제 상속받은 금액, 법정상속분 한도, 30억) 이며 최소 5억이 보장된다.
    //  법정상속분: 배우자 1.5 : 자녀 각 1 → 배우자 지분 = 1.5 / (1.5 + 자녀수)
    //  실제 분할 방식·신고기한 내 분할·등기 여부에 따라 결과가 크게 달라지므로
    //  단일 값이 아니라 최소~최대 범위로 제시한다.
    function spouseInheritDeduction(netAssets, children, actualSpouseShare) {
      const IG = (RATES.inheritGift) || {};
      const minD = IG.spouseMinDeduct || 500000000;
      const maxD = IG.spouseMaxDeduct || 3000000000;
      const statutoryRatio = 1.5 / (1.5 + Math.max(0, children));
      const statutoryLimit = Math.min(maxD, Math.max(0, netAssets) * statutoryRatio);
      // 최소: 배우자가 거의 상속받지 않는 경우 → 최소 공제 5억만 인정
      const low = minD;
      // 최대: 배우자가 법정상속분(또는 그 이상)을 실제로 상속받는 경우
      const high = Math.max(minD, statutoryLimit);
      // 실제 상속액을 입력했다면 그 값으로 확정 계산
      const exact = actualSpouseShare > 0
        ? Math.max(minD, Math.min(actualSpouseShare, statutoryLimit))
        : null;
      return { low, high, exact, statutoryRatio, statutoryLimit };
    }

    // ── 증여세 10년 합산 과세 (상증법 제47조·제58조) ──
    //  동일인(직계존속은 그 배우자 포함)으로부터 10년 내 받은 증여재산을 현재 증여재산과
    //  합산해 누진세율을 적용한 뒤, 이미 납부한 증여세를 세액공제한다.
    //  ⚠ 과거 증여액을 '남은 공제액' 계산에만 쓰면 누진구간이 낮게 적용돼 과소 계산된다.
    function giftTaxAggregated(opts) {
      const {
        currentValue, priorValue = 0, priorTaxPaid = 0,
        relationDeduct = 0, marriageBirthDeduct = 0,
        surchargeRate = 0, // 세대생략 할증 (0.30 / 0.40)
      } = opts;
      const IG = (RATES.inheritGift) || {};
      const mbMax = (IG.marriageBirthDeduct && IG.marriageBirthDeduct.max) || 100000000;

      // 10년 합산 과세가액
      const aggregatedValue = Math.max(0, currentValue) + Math.max(0, priorValue);
      // 증여재산공제는 10년 합산 기준 한도 — 합산 과세가액에서 한 번만 차감
      const mb = Math.min(mbMax, Math.max(0, marriageBirthDeduct));
      const totalDeduct = Math.min(aggregatedValue, relationDeduct + mb);
      const aggregatedBase = Math.max(0, aggregatedValue - totalDeduct);

      // 합산 과세표준에 누진세율 적용 → 산출세액
      const grossTax = inheritGiftTax(aggregatedBase);
      // 세대생략 할증
      const surcharge = grossTax * surchargeRate;
      const taxBeforeCredit = grossTax + surcharge;
      // 기납부 증여세액공제 (산출세액을 초과해 환급되지는 않는다)
      const priorCredit = Math.min(taxBeforeCredit, Math.max(0, priorTaxPaid));
      const tax = Math.max(0, taxBeforeCredit - priorCredit);

      // 비교용: 합산하지 않고 이번 증여만 계산했을 때(구버전 방식)
      const naiveBase = Math.max(0, currentValue - Math.max(0, relationDeduct + mb - priorValue));
      const naiveTax = inheritGiftTax(naiveBase);

      return {
        aggregatedValue, relationDeduct, marriageBirthDeduct: mb, totalDeduct,
        aggregatedBase, grossTax, surcharge, surchargeRate, priorCredit, tax,
        naiveTax, aggregationEffect: tax - naiveTax,
      };
    }

    function renderChart(items) {
      if (!canvas) return;
      const data = items.filter(x => x.value > 0);
      if (chartEmpty) chartEmpty.hidden = data.length > 0;
      if (!data.length) {
        if (chart) { chart.data.labels = []; chart.data.datasets[0].data = []; chart.update(); }
        return;
      }
      const cfg = {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.label),
          datasets: [{ data: data.map(d => d.value), backgroundColor: data.map(d => d.color), borderColor: '#fff', borderWidth: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          animation: { duration: 500, easing: 'easeOutQuart' },
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 12 }, usePointStyle: true, padding: 10 } },
            tooltip: { callbacks: { label: (ctx) => {
              const v = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? (v / total * 100).toFixed(1) : '0.0';
              return ctx.label + ': ' + fmt.won(v) + ' (' + pct + '%)';
            } } },
          },
        },
      };
      if (chart) {
        chart.data.labels = cfg.data.labels;
        chart.data.datasets[0].data = cfg.data.datasets[0].data;
        chart.data.datasets[0].backgroundColor = cfg.data.datasets[0].backgroundColor;
        chart.update();
      } else {
        chart = new Chart(canvas.getContext('2d'), cfg);
      }
      // 인쇄용 도넛 이미지 캐시: 애니메이션이 끝나고 화면에 보일 때 캡처해 둔다.
      // (인쇄 시점에는 print 미디어가 캔버스를 숨겨 toBase64Image가 빈 이미지가 되는 문제 회피)
      try {
        clearTimeout(window.__topdaChartT);
        window.__topdaChartT = setTimeout(function () {
          // 인쇄 중에는 캔버스가 숨겨져 빈 이미지가 되므로 캐시를 덮어쓰지 않는다.
          if (document.body.classList.contains('printing-report')) return;
          try {
            if (chart) {
              const url = chart.toBase64Image('image/png', 1);
              if (url && url.length > 1000) window.__topdaChartImg = url;   // 유효한 캡처만 저장
            }
          } catch (e) {}
        }, 650);
      } catch (e) {}
    }

    function renderDetail(items) {
      if (!detailBox) return;
      detailBox.innerHTML = '';
      items.forEach((it) => {
        if (it.divider) {
          const row = document.createElement('div');
          row.className = 'row';
          row.style.borderTop = '1px dashed var(--border)';
          row.style.paddingTop = '8px';
          row.style.marginTop = '6px';
          const dv = typeof it.value === 'string' ? it.value : fmt.won(it.value);
          row.innerHTML = `<span class="key" style="font-weight:700;">${it.label}</span><span class="val" style="font-weight:700;">${dv}</span>`;
          detailBox.appendChild(row);
          return;
        }
        const row = document.createElement('div');
        row.className = it.sub ? 'row sub' : 'row';
        const dot = it.color ? `<span class="dot" style="background:${it.color}"></span>` : '';
        row.innerHTML = `<span class="key">${dot}${it.label}</span><span class="val">${typeof it.value === 'string' ? it.value : fmt.won(it.value)}</span>`;
        detailBox.appendChild(row);
      });
    }

    // ── 기타 대출(여러 건) — 금감원 DSR 원금 산정 방식 ──
    var OTHER_TYPES = [
      ['none', L('없음', 'None')],
      ['mortgage', L('주택담보대출 (분할상환·타 물건)', 'Mortgage (amortizing, other property)')],
      ['mortgageBullet', L('주택담보대출 (만기일시·거치)', 'Mortgage (bullet / grace period)')],
      ['nonhouse', L('비주택담보대출 (상가·오피스텔·토지)', 'Non-housing mortgage (retail/officetel/land)')],
      ['jeonse', L('전세자금대출', 'Jeonse loan')],
      ['progress', L('중도금·이주비대출', 'Interim payment / relocation loan')],
      ['deposit', L('예적금·보험약관 담보대출', 'Deposit/insurance-secured loan')],
      ['stock', L('유가증권·기타담보대출', 'Securities/other secured loan')],
      ['card', L('카드론·현금서비스', 'Card loan / cash advance')],
      ['auto', L('자동차 할부·리스', 'Auto loan/lease')],
      ['minus', L('마이너스통장 (한도대출)', 'Overdraft line of credit')],
    ];
    // 종류 → [원금산정함수(amount,term), 설명, 만기입력필요]
    function otherLoanSpec(type) {
      switch (type) {
        case 'mortgage': return [function (a, t) { return a / t; }, L('주택담보대출(분할상환) → 원금(잔액÷잔존만기 N년) + 이자', 'Mortgage (amortizing) → principal (balance ÷ N-year remaining term) + interest'), true];
        // 원금일시상환 주담대의 산정만기는 「대출총액 ÷ 대출기간(**최대 10년**)」이다.
        // 만기를 그대로 나누면 15년·20년짜리에서 연간 원금이 실제 산정보다 작게 잡혀
        // 기존 부채를 줄이고, 그만큼 주담대 한도가 과대 산출된다.
        case 'mortgageBullet': return [function (a, t) { return a / Math.min(t || 10, 10); }, L('주택담보대출(만기일시·거치) → 원금(대출액÷대출기간, 최대 10년) + 이자', 'Mortgage (bullet/grace) → principal (loan ÷ term, capped at 10 years) + interest'), true];
        case 'nonhouse': return [function (a) { return a / 8; }, L('비주택담보대출 → 원금(대출액÷8년) + 이자 (산정만기 8년)', 'Non-housing mortgage → principal (loan ÷ 8 years) + interest (8-year assumed term)'), false];
        case 'progress': return [function (a) { return a / 25; }, L('중도금·이주비대출 → 원금(대출액÷25년) + 이자 (기존 부채일 때. 이 대출을 새로 신청하는 경우엔 DSR 규제 미적용)', 'Interim/relocation loan → principal (loan ÷ 25 years) + interest (as existing debt)'), false];
        case 'jeonse': return [function () { return 0; }, L('전세자금대출 → 이자만 반영 (원금 미산입)', 'Jeonse loan → interest only (principal excluded)'), false];
        // ⚠ 「규제 미적용」과 「기존 부채 미산입」은 다른 말이다.
        //
        //   예·적금담보대출과 보험계약(약관)대출은 **그 대출을 새로 신청할 때** 차주단위
        //   DSR 규제를 적용하지 않을 뿐, 다른 대출(주담대 등)을 신청하면 **기존 부채로
        //   산입**된다. 은행 여신업무기준 FAQ(2025-11) Q7 단서가 명시한다 —
        //   기존 부채에서까지 빠지는 건 주택연금(역모기지론) 하나뿐이다.
        //
        //   이 칸은 '이미 갖고 있는 대출'을 넣는 자리이므로 산입해야 맞다. 0으로 두면
        //   기존 부채가 줄어 주담대 한도가 **과대 산출**된다(2026-08-02~04의 오류).
        //   다만 이 종류의 산정만기는 기준표 해당 행을 아직 확인하지 못해, 원금은 빼고
        //   이자만 산입하는 보수적 중간값을 쓴다(전세대출과 같은 취급).
        case 'deposit': return [function () { return 0; }, L('예적금·보험약관 담보대출 → 이자만 반영 <strong>(기존 부채로는 산입 — 이 대출을 새로 신청할 때만 DSR 규제 미적용)</strong>', 'Deposit/insurance-secured loan → interest only (counted as existing debt)'), false];
        // 유가증권(주식)담보대출은 제외 대상이 아니다. 실사용자 은행 DSR 원장(2026-04-14)이
        // 이를 확인해 준다 — 잔액 29,934,000 · 연간원리금 4,867,000으로 산입돼 있었다.
        // 산정만기는 8년/10년 두 갈래로 읽혀 아직 확정하지 못했다(rates.js
        // securedLoanTermUnresolved 참고). 한도를 과대 산출하지 않는 8년을 쓴다.
        case 'stock': return [function (a) { return a / 8; }, L('유가증권·기타담보대출 → 원금(대출액÷8년) + 이자 <strong>(DSR 산입 — 제외 대상 아님)</strong>', 'Securities/other secured loan → principal (loan ÷ 8 years) + interest <strong>(included in DSR)</strong>'), false];
        case 'card': return [function (a, t) { return a / t; }, L('카드론·현금서비스 → 원금(잔액÷약정 N년) + 이자', 'Card loan/cash advance → principal (balance ÷ N-year term) + interest'), true];
        case 'auto': return [function (a, t) { return a / t; }, L('자동차 할부·리스 → 원금(잔액÷약정 N년) + 이자', 'Auto loan/lease → principal (balance ÷ N-year term) + interest'), true];
        case 'minus': return [function (a) { return a / 5; }, L('마이너스통장(한도대출) → 원금(한도÷5년) + 이자', 'Overdraft line → principal (limit ÷ 5 years) + interest'), false];
        default: return [function () { return 0; }, '', false];
      }
    }

    function updateOtherLoanRow(row) {
      var type = row.querySelector('.ol-type').value;
      var spec = otherLoanSpec(type);
      var show = type !== 'none';
      var amount = fmt.parseWon(row.querySelector('.ol-amount').value);
      var rate = (Number(row.querySelector('.ol-rate').value) || 0) / 100;
      var term = Math.max(1, Number(row.querySelector('.ol-term').value) || 1);
      row.querySelector('[data-row-detail]').style.display = show ? '' : 'none';
      row.querySelector('[data-row-term]').style.display = (show && spec[2]) ? '' : 'none';
      var note = row.querySelector('[data-row-note]');
      if (!show) { note.style.display = 'none'; return 0; }
      // 종류를 고르는 즉시 설명 노출(금액 0이어도)
      // spec[3] === true 이면 DSR 산정 제외 대출 — 이자도 산입하지 않는다.
      var dsrExempt = spec[3] === true;
      var principal = spec[0](amount, term), interest = dsrExempt ? 0 : amount * rate;
      var annual = dsrExempt ? 0 : principal + interest;
      note.style.display = '';
      note.innerHTML = spec[1].replace('N', term)
        + (amount > 0
          ? (dsrExempt
            ? L('<br/>이 대출의 DSR 반영액 = <strong>0원</strong> — 잔액이 있어도 한도를 줄이지 않습니다.',
              '<br/>DSR impact = <strong>KRW 0</strong> — this balance does not reduce your limit.')
            : L('<br/>이 대출의 DSR 반영액 ≈ <strong>' + fmt.won(Math.round(annual)) + ' / 년</strong>',
              '<br/>This loan’s DSR impact ≈ <strong>' + fmt.won(Math.round(annual)) + ' / yr</strong>'))
          : '');
      return annual;
    }

    function otherLoansTotal() {
      var sum = 0;
      root.querySelectorAll('.other-loan-row').forEach(function (row) { sum += updateOtherLoanRow(row); });
      return sum;
    }

    function addOtherLoanRow() {
      var box = root.querySelector('[data-other-loans]');
      if (!box) return;
      var row = document.createElement('div');
      row.className = 'other-loan-row';
      var opts = OTHER_TYPES.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
      row.innerHTML =
        '<div class="other-loan-head">'
        + '<select class="ol-type">' + opts + '</select>'
        + '<button type="button" class="ol-remove" aria-label="' + L('삭제', 'Remove') + '">✕</button>'
        + '</div>'
        + '<div class="field-row" data-row-detail style="display:none;">'
        + '  <div class="field"><label>' + L('금액 (잔액·한도)', 'Amount (balance/limit)') + '</label><div class="input-suffix" data-suffix="' + (isEn ? 'KRW' : '원') + '"><input class="ol-amount" type="text" inputmode="numeric" data-format="won" value="0" /></div></div>'
        + '  <div class="field"><label>' + L('금리 (연 %)', 'Rate (annual %)') + '</label><input class="ol-rate" type="number" min="0" max="20" step="0.1" value="6" /></div>'
        + '</div>'
        + '<div class="field" data-row-term style="display:none;"><label>' + L('남은 만기 (년)', 'Remaining term (yrs)') + '</label><input class="ol-term" type="number" min="1" max="40" step="1" value="3" /></div>'
        + '<p class="scn-note" data-row-note style="display:none;"></p>';
      box.appendChild(row);
      row.querySelectorAll('input, select').forEach(function (el) {
        el.addEventListener('input', recalc);
        el.addEventListener('change', recalc);
      });
      row.querySelector('.ol-remove').addEventListener('click', function () { row.remove(); recalc(); });
      return row;
    }

    function initOtherLoans() {
      addOtherLoanRow(); // 기본 1행
      var addBtn = root.querySelector('[data-add-loan]');
      if (addBtn) addBtn.addEventListener('click', function () { addOtherLoanRow(); recalc(); });
    }

    function renderDSR(annualPmt, existingAnnualDebt) {
      const income = getN('annualIncome');
      const credit = getN('creditDebt');
      const creditAnnual = credit / 5;
      const existing = existingAnnualDebt == null ? creditAnnual + otherLoansTotal() : existingAnnualDebt;
      const totalAnnualPmt = annualPmt + existing;
      const dsr = income > 0 ? totalAnnualPmt / income * 100 : 0;
      setText('dsrPct', income > 0 ? dsr.toFixed(1) + '%' : L('소득 입력 필요', 'Enter income'));
      const fillEl = root.querySelector('[data-out="dsrFill"]');
      if (fillEl) {
        fillEl.style.width = Math.min(100, dsr) + '%';
        if (dsr > DSR_T2) fillEl.style.background = '#b91c1c';
        else if (dsr > DSR_T1) fillEl.style.background = '#b45309';
        else fillEl.style.background = '#047857';
      }
      let verdict;
      if (income <= 0) verdict = L('소득을 입력하면 DSR이 자동 계산됩니다.', 'Enter income to calculate DSR automatically.');
      else if (dsr > DSR_T2) verdict = L(`2금융 한도(${DSR_T2}%)도 초과 — 대출 금액·기간 조정이 필요합니다.`, `Exceeds even the 2nd-tier limit (${DSR_T2}%) — adjust loan amount or term.`);
      else if (dsr > DSR_T1) verdict = L(`1금융 한도(${DSR_T1}%) 초과, 2금융(${DSR_T2}%) 내에서 검토 가능합니다.`, `Exceeds the 1st-tier limit (${DSR_T1}%), but within the 2nd-tier limit (${DSR_T2}%).`);
      else if (dsr > 0) verdict = L(`1금융 한도(${DSR_T1}%) 내 — 정상 승인이 가능한 수준입니다.`, `Within the 1st-tier limit (${DSR_T1}%) — normally approvable.`);
      else verdict = L('대출 정보가 0이라 DSR이 적용되지 않습니다.', 'No loan entered, so DSR does not apply.');
      if (credit > 0 && income > 0) verdict += L(` (신용대출 ${fmt.won(credit)} → 연환산 ${fmt.won(creditAnnual)})`, ` (credit loan ${fmt.won(credit)} → annualized ${fmt.won(creditAnnual)})`);
      setText('dsrVerdict', verdict);
    }

    function renderRTI(annualRent, annualInterest, threshold, depositIncome) {
      const rti = annualInterest > 0 ? annualRent / annualInterest : 0;
      setText('rtiRatio', annualInterest > 0 ? rti.toFixed(2) + 'x' : L('이자 입력 필요', 'Enter interest'));
      const fillEl = root.querySelector('[data-out="rtiFill"]');
      if (fillEl) {
        const pct = Math.min(100, rti / 2 * 100);
        fillEl.style.width = pct + '%';
        if (rti < threshold) fillEl.style.background = '#b91c1c';
        else if (rti < threshold + 0.25) fillEl.style.background = '#b45309';
        else fillEl.style.background = '#047857';
      }
      let verdict;
      if (annualInterest <= 0) verdict = L('임대 대출 이자가 0이라 RTI가 적용되지 않습니다.', 'No rental loan interest entered, so RTI does not apply.');
      else if (rti >= threshold + 0.25) verdict = L(`기준(${threshold}x) 이상 — 임대업 대출 승인이 가능한 수준입니다.`, `At or above the ${threshold}x threshold — normally approvable for a rental-business loan.`);
      else if (rti >= threshold) verdict = L(`기준(${threshold}x) 충족 — 다만 여유가 크지 않습니다.`, `Meets the ${threshold}x threshold, but with little margin.`);
      else verdict = L(`기준(${threshold}x) 미달 — 대출 금액 축소 또는 임대수입 증명이 필요합니다.`, `Below the ${threshold}x threshold — reduce the loan amount or document more rental income.`);
      if (depositIncome > 0) verdict += L(
        ` 보증금 간주임대료 ${fmt.won(depositIncome)} / 년을 포함했습니다.`,
        ` Includes imputed deposit income of ${fmt.won(depositIncome)} / yr.`
      );
      setText('rtiVerdict', verdict);
    }

    function syncDashboardAcquisition(price, homes, areaOver85) {
      const setEligible = (name, eligible) => {
        const input = root.querySelector('[name="' + name + '"]');
        if (!input) return;
        input.disabled = !eligible;
        if (!eligible) input.checked = false;
        const field = input.closest('.field');
        if (field) field.classList.toggle('is-disabled', !eligible);
      };
      setEligible('tempTwoHome', homes === 2);
      setEligible('firstHome', homes === 1 && price <= 1200000000);
      setEligible('unsold2026', !areaOver85 && price <= 600000000);
      // 조례 추가 감면 선택은 미분양 감면을 켰을 때만 유효하다.
      const localSel = root.querySelector('[name="unsold2026LocalExtra"]');
      if (localSel) {
        const on = !areaOver85 && price <= 600000000 && getCheck('unsold2026');
        localSel.disabled = !on;
        const f = localSel.closest('.field');
        // 해당하지 않는 사람에게는 아예 숨긴다 — 비활성 칸은 화면만 어지럽힌다.
        if (f) { f.classList.toggle('is-disabled', !on); f.style.display = on ? '' : 'none'; }
      }
      const status = root.querySelector('[data-dashboard-acq-status]');
      if (status) {
        const excluded = [];
        if (homes !== 2) excluded.push(L('일시적 2주택', 'temporary 2-home relief'));
        if (homes !== 1 || price > 1200000000) excluded.push(L('생애최초 감면', 'first-home relief'));
        if (areaOver85 || price > 600000000) excluded.push(L('지방 미분양 감면', 'unsold-unit relief'));
        status.textContent = excluded.length
          ? L('현재 입력값으로 자동 제외: ', 'Automatically unavailable: ') + excluded.join(L(' · ', ', '))
          : L('가격·주택 수·면적으로 감면 적용 가능 여부를 자동 확인합니다.', 'Relief eligibility is checked automatically from price, home count, and floor area.');
      }
    }

    // price 인자는 **담보 평가액(대출 신청일 기준 시가)** 이다. 매매가가 아니다.
    // usedPurchasePrice=true 이면 시가를 입력받지 못해 매매가로 대신 판정했다는 뜻이라 경고한다.
    function renderMortgageLimit(price, homes, regulated, firstHome, tempTwoHome, rate, term, repay, existingAnnualDebt, loan, usedPurchasePrice) {
      const box = root.querySelector('[data-mortgage-limit-box]');
      if (!box) return null;
      const income = getN('annualIncome');
      // 지역·보유유형 판정과 LTV·스트레스 산정은 대출 한도 계산기와 같은 공통 함수를 쓴다.
      //  (과거엔 여기 자체 분기를 둬서 규제지역 LTV 50%가 이 화면에만 남아 있었다.)
      const isMulti = homes >= 2 && !tempTwoHome;
      const regionKey = getRadio('loanRegion')
        || (regulated ? 'regulated' : 'provincialNonRegulated');
      const ownership = firstHome ? 'first' : (isMulti ? 'multi' : 'none');
      const rateType = getRadio('loanRateType') || 'variable';
      const ltvMeta = suggestLtvPercent(regionKey, ownership);
      const stressMeta = suggestStressAdd(regionKey, rateType);
      const ltvPercent = ltvMeta.value;
      const stressAdd = stressMeta.value;
      const r = calcMortgageLimit({
        price, ltvPercent, region: regionKey, ownership, rateType,
        income, existingAnnualDebt, rate, stressAdd, termYears: term,
        dsrLimitPercent: DSR_T1, repayType: repay === 'principal' ? 'principal' : 'equal',
      });
      box.hidden = !r;
      if (!r) return null;
      const bindingLabels = {
        ltv: L('LTV 한도', 'LTV limit'),
        priceCap: L('지역 가격대별 한도', 'regional price cap'),
        dsr: L('스트레스 DSR 한도', 'stress-DSR limit'),
      };
      setText('mortgageLimit', fmt.won(r.limit));
      setText('mortgageBinding', L('결정 요인: ', 'Binding constraint: ') + (bindingLabels[r.binding?.key] || '—'));
      setText('mortgageInputs',
        `${r.region.label} · LTV ${ltvPercent}% · ${L('스트레스 가산', 'stress add')} ${stressAdd.toFixed(2)}%p`
        + ` → ${L('적용 금리', 'applied rate')} ${r.stressedRate.toFixed(2)}%`
        + (r.priceCapApplies ? '' : L(' · 가격대별 한도 미적용', ' · no price cap')));
      const over = loan > r.limit;
      let verdict = over
        ? L(`입력 대출이 추정 한도를 ${fmt.won(loan - r.limit)} 초과합니다.`, `Entered loan exceeds the estimate by ${fmt.won(loan - r.limit)}.`)
        : L(`입력 대출은 추정 한도보다 ${fmt.won(r.limit - loan)} 낮습니다.`, `Entered loan is ${fmt.won(r.limit - loan)} below the estimate.`);
      // 담보 평가액을 입력받지 못하면 매매가로 대신 판정한다 — 구간이 한 칸 올라가
      // 한도가 실제보다 적게 나올 수 있으므로 반드시 알린다.
      if (usedPurchasePrice) {
        verdict += L(
          ` ⚠ KB시세를 입력하지 않아 매매가(${fmt.won(price)})로 판정했습니다. 한도는 대출 신청일 기준 시가로 정해지므로, 시세가 매매가보다 낮으면 실제 한도는 이보다 큽니다.`,
          ` ⚠ No KB market price entered, so the purchase price (${fmt.won(price)}) was used. The limit is set on the market value as of the loan application date — if that is lower, your actual limit is higher.`);
      }
      setText('mortgageVerdict', verdict);
      return r;
    }

    function calcSale() {
      const price = getN('price');
      const homes = Number(getRadio('homes') || 1);
      const regulated = getCheck('regulated');
      const areaOver85 = getCheck('areaOver85');
      syncDashboardAcquisition(price, homes, areaOver85);
      const firstHome = getCheck('firstHome');
      const tempTwoHome = getCheck('tempTwoHome');
      const unsold2026 = getCheck('unsold2026');
      const loan = getN('loan');
      const rate = getNum('rate');
      const term = getNum('term');
      const purpose = getRadio('purpose') || 'own';
      const jeonseDeposit = purpose === 'gap' ? getN('jeonseDeposit') : 0;
      const gapField = root.querySelector('[data-purpose="gap"]');
      if (gapField) gapField.style.display = purpose === 'gap' ? '' : 'none';

      const nonhouse = (getRadio('assetType') || 'house') === 'nonhouse';
      // 임대사업자 대출 여부는 명시적 체크박스로 구분(주택도 임대사업자 등록 시 RTI 적용 가능).
      // 사용자가 직접 만지기 전까지는 비주택=체크(대부분 사업자 대출)·주택=미체크(실거주·갭투자 흔함)로 자동 제안.
      const leaseBizField = root.querySelector('[data-lease-biz-field]');
      const leaseBizInput = root.querySelector('[data-lease-biz]');
      if (leaseBizField) leaseBizField.style.display = purpose === 'gap' ? '' : 'none';
      if (leaseBizInput && purpose === 'gap' && !leaseBizTouched) leaseBizInput.checked = nonhouse;
      const isLeaseBiz = purpose === 'gap' && getCheck('leaseBiz');
      const rtiField = root.querySelector('[data-rti-input]');
      if (rtiField) rtiField.style.display = isLeaseBiz ? '' : 'none';
      let acq;
      if (nonhouse) {
        // 비주택(상가·오피스텔(업무용)·토지 등): 취득세 4.0% + 농특세 0.2% + 지방교육세 0.4% = 4.6%
        const base = price * 0.04, rural = price * 0.002, edu = price * 0.004;
        acq = { total: base + rural + edu, acquisition: base, ruralTax: rural, localEduTax: edu, firstHomeDeduct: 0, baseRate: 0.04 };
      } else {
        const localRaw = root.querySelector('[name="unsold2026LocalExtra"]')?.value;
        acq = acquisitionTotal(price, {
          homes, regulated, areaOver85, firstHome, tempTwoHome, unsold2026,
          unsold2026LocalExtra: (localRaw === '' || localRaw == null || localRaw === 'unknown') ? null : Number(localRaw),
          childbirth: getCheck('childbirth'),
          firstHomeSmallHouse: getCheck('firstHomeSmallHouse'),
          acqType: 'purchase',
        });
      }
      renderAcqNotes(root, acq);
      const broker = nonhouse ? Math.round(price * 0.009 * 1.1) : brokerFee(price, 'sale');
      const regStd = getN('regStd');
      const regDiscount = (getNum('regDiscount') || 0) / 100;
      const selfReg = getCheck('selfReg');
      const reg = registrationCost(price, regStd, regDiscount, selfReg, nonhouse ? 'land' : 'house');
      // 상환 방식(원리금균등 / 원금균등)에 따라 월 상환액·총이자·DSR 산정이 달라진다.
      const repay = getRadio('repay') || 'amortize';
      const isEqualPrincipal = repay === 'principal';
      let monthly, monthlyLabel, totalInterest, dsrAnnual;
      if (isEqualPrincipal) {
        monthly = equalPrincipalFirstMonth(loan, rate, term);   // 첫 달(가장 큼)
        monthlyLabel = L('월 상환액 (첫달·최대)', 'Monthly payment (1st mo., max)');
        totalInterest = equalPrincipalTotalInterest(loan, rate, term);
        dsrAnnual = equalPrincipalFirstYear(loan, rate, term);  // DSR은 첫해 기준
      } else {
        monthly = monthlyPayment(loan, rate, term);             // 매월 동일
        monthlyLabel = L('월 원리금 상환', 'Monthly payment');
        totalInterest = monthly > 0 ? monthly * term * 12 - loan : 0;
        dsrAnnual = monthly * 12;
      }
      const existingAnnualDebt = getN('creditDebt') / 5 + otherLoansTotal();
      const mortgageBox = root.querySelector('[data-mortgage-limit-box]');
      if (!nonhouse && !isLeaseBiz) {
        // ⚠ LTV·가격대별 한도는 매매가가 아니라 '대출 신청일 기준 시가'(KB시세 일반평균가 등)로
        //   판정한다. 매매가를 그대로 넘기면 15.65억에 산 집(신청일 KB시세 15억)이 15~25억
        //   구간으로 잘못 걸려 한도가 6억 → 4억으로 2억 깎여 나온다. 실제 사례로 확인된 오류다.
        const kbPrice = getN('kbPrice');
        renderMortgageLimit(kbPrice > 0 ? kbPrice : price, homes, regulated, firstHome, tempTwoHome,
          rate, term, repay, existingAnnualDebt, loan, kbPrice <= 0);
      } else if (mortgageBox) {
        mortgageBox.hidden = true;
      }
      const equity = Math.max(0, price - loan - jeonseDeposit);
      const initialCapital = equity + acq.total + broker + reg.total;
      const grandTotal = price + acq.total + broker + reg.total;

      if (resultTitle) resultTitle.textContent = purpose === 'gap'
        ? (nonhouse ? L('임대 — 실제 투입 자기자본', 'Rental — actual equity invested') : L('갭투자 — 실제 투입 자기자본', 'Gap investment — actual equity invested'))
        : L('예상 총 매수 비용', 'Estimated total purchase cost');
      setText('primaryTotal', fmt.won(initialCapital));
      setLabel('data-quick-label1', monthlyLabel);
      setText('quick1', fmt.won(monthly));
      setLabel('data-quick-label2', L('총 이자 (만기까지)', 'Total interest (to maturity)'));
      setText('quick2', fmt.won(totalInterest));
      setLabel('data-quick-label3', L('취득세 합계', 'Total acquisition tax'));
      setText('quick3', fmt.won(acq.total));

      renderChart([
        { label: L('자기자본', 'Equity'), value: equity, color: '#1e3a8a' },
        { label: L('대출 원금', 'Loan principal'), value: loan, color: '#3b82f6' },
        { label: L('전세보증금 인수', 'Assumed Jeonse deposit'), value: jeonseDeposit, color: '#60a5fa' },
        { label: L('취득세 합계', 'Total acquisition tax'), value: acq.total, color: '#f59e0b' },
        { label: L('중개수수료', 'Brokerage fee'), value: broker, color: '#ef4444' },
        { label: L('등기·법무사', 'Registration & scrivener'), value: reg.total, color: '#a855f7' },
      ]);
      renderDetail([
        { label: L('자기자본', 'Equity'), value: equity, color: '#1e3a8a' },
        { label: L('대출 원금', 'Loan principal'), value: loan, color: '#3b82f6' },
        ...(purpose === 'gap' ? [{ label: L('전세보증금 인수', 'Assumed Jeonse deposit'), value: jeonseDeposit, color: '#60a5fa' }] : []),
        { label: L('취득세 (감면 후)', 'Acquisition tax (after relief)'), value: acq.acquisition, color: '#f59e0b', sub: true },
        ...(acq.firstHomeDeduct > 0 ? [{ label: L('생애최초 감면', 'First-home relief'), value: '−' + fmt.won(acq.firstHomeDeduct), sub: true }] : []),
        ...(acq.unsoldDeduct > 0 ? [{ label: L('2026 미분양 감면', '2026 unsold-unit relief'), value: '−' + fmt.won(acq.unsoldDeduct), sub: true }] : []),
        ...(!nonhouse ? [{ label: L('취득세 자동 판정', 'Acquisition-tax rule'), value: scenarioText(acq, isEn ? 'en' : 'ko'), sub: true }] : []),
        { label: L('농어촌특별세', 'Rural special tax'), value: acq.ruralTax, sub: true },
        { label: L('지방교육세', 'Local education tax'), value: acq.localEduTax, sub: true },
        { label: L('중개수수료(VAT 포함)', 'Brokerage fee (incl. VAT)'), value: broker, color: '#ef4444' },
        { label: L('등기·법무사', 'Registration & scrivener'), value: reg.total, color: '#a855f7' },
        { label: L('인지세', 'Stamp duty'), value: reg.stamp, sub: true },
        { label: L('등기신청 수수료', 'Registration filing fee'), value: reg.regFee, sub: true },
        { label: L('국민주택채권 할인부담 (매입률 ' + (reg.rate * 100).toFixed(1) + '% · 할인 ' + (regDiscount * 100).toFixed(1) + '%)', 'National Housing Bond discount cost (purchase rate ' + (reg.rate * 100).toFixed(1) + '% · discount ' + (regDiscount * 100).toFixed(1) + '%)'), value: reg.bond, sub: true },
        ...(selfReg
          ? [{ label: L('법무사 보수', 'Scrivener fee'), value: L('셀프 등기 (0원)', 'Self-filed (KRW 0)'), sub: true }]
          : [
            { label: L('법무사 기본보수 상한', 'Scrivener base fee (cap)'), value: reg.scrivenerBase, sub: true },
            { label: L('└ 대행료 (취득세 신고·채권 매입)', '└ Agency fees (tax filing, bond purchase)'), value: reg.agencyFee, sub: true },
            { label: L('└ 부가세 (10%)', '└ VAT (10%)'), value: reg.vat, sub: true },
          ]),
        ...(reg.stdEstimated ? [{ label: L('⚠ 추정 시가표준액 사용 (매매가 × 70%)', '⚠ Estimated standard value used (price × 70%)'), value: fmt.won(reg.std), sub: true }] : []),
        { divider: true, label: L('총 매수 비용 (대출 포함)', 'Total purchase cost (incl. loan)'), value: grandTotal },
      ]);

      if (isLeaseBiz) {
        // 임대사업자 대출 → RTI (주택 1.25배 / 비주택 1.5배 기준)
        const rtiResult = calcRti({
          monthlyRent: getN('saleRent'),
          deposit: jeonseDeposit,
          loan,
          annualRate: rate,
        });
        const rtiThreshold = nonhouse ? (RATES.rti && RATES.rti.commercial) || 1.5 : (RATES.rti && RATES.rti.residential) || 1.25;
        if (dsrBox) dsrBox.hidden = true;
        if (rtiBox) rtiBox.hidden = false;
        renderRTI(rtiResult.annualRent, rtiResult.annualInterest, rtiThreshold, rtiResult.depositIncome);
      } else {
        if (rtiBox) rtiBox.hidden = true;
        if (dsrBox) dsrBox.hidden = false;
        renderDSR(dsrAnnual, existingAnnualDebt);
      }
    }

    function calcTransfer() {
      const sellPrice = getN('sellPrice');
      const buyPrice = getN('buyPrice');
      const cost = getN('cost');
      const holdYears = getNum('holdYears');
      const liveYears = getNum('liveYears');
      const homes = Number(getRadio('homes') || 1);
      const onlyHome = getCheck('onlyHome');
      const assetType = getRadio('assetType') || 'house';
      const regulated = getCheck('regulated');
      const surchargeExempt = getCheck('surchargeExempt');
      const sellDate = root.querySelector('[name="sellDate"]')?.value || '';
      const jointOwners = getNum('jointOwners') || 1;
      // 중과 유예 경과규정 · 증여재산 이월과세 (매도 탭 추가 입력)
      const contractDate = root.querySelector('[name="contractDate"]')?.value || '';
      const landPermitApplyDate = root.querySelector('[name="landPermitApplyDate"]')?.value || '';
      const giftReceivedDate = root.querySelector('[name="giftReceivedDate"]')?.value || '';
      root.querySelectorAll('[data-tt-show="grace"]').forEach((el) => {
        el.style.display = (regulated && homes >= 2) ? '' : 'none';
      });
      root.querySelectorAll('[data-tt-show="permit"]').forEach((el) => {
        el.style.display = (regulated && homes >= 2 && getCheck('landPermitTarget')) ? '' : 'none';
      });
      root.querySelectorAll('[data-tt-show="carryover"]').forEach((el) => {
        el.style.display = getCheck('giftedFromRelative') ? '' : 'none';
      });
      const r = calcTransferTax({
        sellPrice, buyPrice, cost, holdYears, liveYears,
        homes, onlyHome, regulated, assetType,
        surchargeExempt, sellDate, jointOwners,
        contractDate,
        downPaymentReceived: getCheck('downPaymentReceived'),
        newRegulatedArea: getCheck('newRegulatedArea'),
        landPermitTarget: getCheck('landPermitTarget'),
        landPermitApplyDate,
        giftedFromRelative: getCheck('giftedFromRelative'),
        giftReceivedDate,
        donorBuyPrice: getN('donorBuyPrice'),
      });

      if (!r) {
        if (resultTitle) resultTitle.textContent = L('예상 양도소득세', 'Estimated capital gains tax');
        setText('primaryTotal', fmt.won(0));
        setLabel('data-quick-label1', L('양도차익', 'Capital gain'));
        setText('quick1', fmt.won(0));
        setLabel('data-quick-label2', L('과세표준', 'Tax base'));
        setText('quick2', fmt.won(0));
        setLabel('data-quick-label3', L('실효세율 (양도가 대비)', 'Effective rate (of sale price)'));
        setText('quick3', '—');
        renderChart([]);
        renderDetail([]);
        return;
      }

      // 공동명의가 선택되면 안분 후 합산한 실제 예상세액을 대표값으로 사용한다.
      const hasJointEstimate = r.jointOwners > 1 && r.jointTotal != null;
      const incomeTax = hasJointEstimate ? r.jointIncomeTax : r.incomeTax;
      const localTax = hasJointEstimate ? r.jointLocalTax : r.localTax;
      const total = hasJointEstimate ? r.jointTotal : r.total;
      const basicDeduct = hasJointEstimate ? r.jointBasicDeduct : r.basicDeduct;
      const taxBase = hasJointEstimate ? r.jointTaxBase : r.taxBase;
      const rateResult = hasJointEstimate
        ? { ...r, appliedRateLabel: r.jointAppliedRateLabel, marginalRatePct: r.jointMarginalRatePct }
        : r;
      const effective = sellPrice > 0 ? total / sellPrice * 100 : 0;

      if (resultTitle) resultTitle.textContent = r.exempted ? L('1세대1주택 비과세 (양도세 0원)', '1-home exemption (KRW 0 capital gains tax)') : L('예상 양도소득세', 'Estimated capital gains tax');
      setText('primaryTotal', fmt.won(total));
      setLabel('data-quick-label1', L('양도차익', 'Capital gain'));
      setText('quick1', fmt.won(r.rawGain));
      setLabel('data-quick-label2', L('과세표준', 'Tax base'));
      setText('quick2', fmt.won(taxBase));
      setLabel('data-quick-label3', L('실효세율 (양도가 대비)', 'Effective rate (of sale price)'));
      setText('quick3', effective.toFixed(2) + '%');

      renderChart([
        { label: L('국세 양도소득세', 'National capital gains tax'), value: incomeTax, color: '#1e3a8a' },
        { label: L('지방소득세 (10%)', 'Local income tax (10%)'), value: localTax, color: '#3b82f6' },
        { label: L('장기보유 공제분', 'Long-term holding deduction'), value: r.ltDeduct, color: '#047857' },
      ]);
      renderDetail([
        { label: L('양도가액', 'Sale price'), value: sellPrice, sub: true },
        { label: L('취득가액 + 필요경비', 'Purchase price + costs'), value: r.effectiveBuyPrice + cost, sub: true },
        ...(r.carryoverApplied ? [{
          label: L('└ 증여재산 이월과세 — 증여자 취득가액 적용', '└ Carry-over basis — donor’s acquisition price applied'),
          value: L('양도차익 +' + fmt.won(r.carryoverExtraGain), 'gain +' + fmt.won(r.carryoverExtraGain)), sub: true,
        }] : []),
        { label: L('양도차익', 'Capital gain'), value: r.rawGain, color: '#1e3a8a' },
        ...(r.taxableGainRatio < 1 && r.taxableGainRatio > 0 ? [{ label: L('과세 비율 (12억 초과)', 'Taxable ratio (over KRW 1.2B)'), value: (r.taxableGainRatio*100).toFixed(1)+'%', sub: true }] : []),
        { label: L('장기보유특별공제 (' + (r.ltDeductRate*100).toFixed(0) + '%)', 'Long-term holding deduction (' + (r.ltDeductRate*100).toFixed(0) + '%)'), value: '−' + fmt.won(r.ltDeduct), sub: true },
        { label: L('기본공제', 'Basic deduction'), value: '−' + fmt.won(basicDeduct), sub: true },
        { label: L('과세표준', 'Tax base'), value: taxBase },
        { label: L('적용 세율', 'Applied rate'), value: rateLabelText(rateResult, isEn ? 'en' : 'ko'), sub: true },
        ...(r.surchargeWaived && regulated && homes >= 2 ? [{
          label: L('다주택 중과', 'Multi-home surcharge'),
          value: r.graceApplied
            ? L('경과규정 적용 — ' + r.graceReason, 'Transitional rule applied — ' + r.graceReason)
            : L(r.waiverUntil + '까지 한시 유예', 'Waived through ' + r.waiverUntil),
          sub: true,
        }] : []),
        ...(hasJointEstimate ? [
          { label: L('단독명의 예상세액', 'Sole-owner estimate'), value: r.total, sub: true },
          { label: L(r.jointOwners + '인 공동명의 절세액', r.jointOwners + '-owner estimated savings'), value: '−' + fmt.won(r.jointSavings), sub: true },
        ] : []),
        { label: L('산출세액 (국세)', 'Calculated tax (national)'), value: incomeTax, color: '#1e3a8a' },
        { label: L('지방소득세', 'Local income tax'), value: localTax, color: '#3b82f6' },
        { divider: true, label: L('총 부담세액', 'Total tax'), value: total },
      ]);
    }

    function calcLease() {
      const deposit = getN('leaseDeposit');
      const loan = getN('leaseLoan');
      const rate = getNum('leaseRate');
      const term = getNum('leaseTerm') || 2;
      const broker = brokerFee(deposit, 'lease');
      const monthlyInterest = loan * (rate/100) / 12;
      const totalInterest = monthlyInterest * 12 * term;
      const equity = Math.max(0, deposit - loan);

      if (resultTitle) resultTitle.textContent = L('전세 임차 — 실제 투입 자기자본', 'Jeonse lease — actual equity invested');
      setText('primaryTotal', fmt.won(equity + broker));
      setLabel('data-quick-label1', L('월 이자 (전세대출)', 'Monthly interest (Jeonse loan)'));
      setText('quick1', fmt.won(monthlyInterest));
      setLabel('data-quick-label2', L('총 이자 (계약 기간)', 'Total interest (lease term)'));
      setText('quick2', fmt.won(totalInterest));
      setLabel('data-quick-label3', L('중개수수료', 'Brokerage fee'));
      setText('quick3', fmt.won(broker));

      renderChart([
        { label: L('자기자본', 'Equity'), value: equity, color: '#1e3a8a' },
        { label: L('전세자금대출', 'Jeonse loan'), value: loan, color: '#3b82f6' },
        { label: L('중개수수료', 'Brokerage fee'), value: broker, color: '#ef4444' },
      ]);
      renderDetail([
        { label: L('자기자본', 'Equity'), value: equity, color: '#1e3a8a' },
        { label: L('전세자금대출 (DSR 산정 제외)', 'Jeonse loan (excluded from DSR)'), value: loan, color: '#3b82f6' },
        { label: L('중개수수료(VAT 포함)', 'Brokerage fee (incl. VAT)'), value: broker, color: '#ef4444' },
        { divider: true, label: L('총 임차 비용 (보증금 + 부대)', 'Total lease cost (deposit + fees)'), value: deposit + broker },
      ]);
    }

    function calcInherit() {
      const propValue = getN('inheritValue');
      const other = getN('otherInherit');
      const debt = getN('debt');
      const hasSpouse = getCheck('hasSpouse');
      const children = getNum('children');
      const inheritNoHome = getCheck('inheritNoHome');
      const inheritAreaOver85 = getCheck('inheritAreaOver85');
      const grossAssets = propValue + other;
      const netAssets = Math.max(0, grossAssets - debt);
      const basicDeduct = 200000000;
      const personalDeduct = children * 50000000;
      const totalBasic = basicDeduct + personalDeduct;
      const publicDeduct = Math.max(500000000, totalBasic);

      // 배우자 상속공제는 실제 분할 방식에 따라 5억 ~ 법정상속분 한도(최대 30억)로 크게 달라진다.
      // 실제 상속액을 입력하면 확정 계산하고, 비우면 최소~최대 범위를 함께 제시한다.
      const spouseActual = getN('spouseActualShare');
      const sd = hasSpouse
        ? spouseInheritDeduction(netAssets, children, spouseActual)
        : { low: 0, high: 0, exact: 0, statutoryRatio: 0, statutoryLimit: 0 };
      const spouseExact = hasSpouse ? sd.exact : 0;
      const isRange = hasSpouse && spouseExact == null;

      const taxFor = (spouseDeduct) => {
        const td = publicDeduct + spouseDeduct;
        const base = Math.max(0, netAssets - td);
        return { totalDeduct: td, taxBase: base, tax: inheritGiftTax(base) };
      };
      // 공제가 클수록 세금이 작다 → high 공제 = 낮은 세액
      const lowTax = taxFor(isRange ? sd.high : (spouseExact || 0));  // 세액 하한
      const highTax = taxFor(isRange ? sd.low : (spouseExact || 0));  // 세액 상한
      const spouseDeduct = isRange ? sd.high : (spouseExact || 0);
      const { totalDeduct, taxBase } = taxFor(spouseDeduct);
      const tax = lowTax.tax;

      const acq = acquisitionTotal(propValue, {
        acqType: 'inherit',
        inheritNoHome,
        areaOver85: inheritAreaOver85,
      });
      const totalBurden = tax + acq.total;
      const totalBurdenHigh = highTax.tax + acq.total;

      const rangeText = (lo, hi) => fmt.won(lo) + ' ~ ' + fmt.won(hi);

      if (resultTitle) resultTitle.textContent = isRange
        ? L('예상 총 부담 범위 (상속세 + 취득세)', 'Estimated total range (inheritance + acquisition tax)')
        : L('예상 총 부담 (상속세 + 취득세)', 'Estimated total (inheritance + acquisition tax)');
      setText('primaryTotal', isRange ? rangeText(totalBurden, totalBurdenHigh) : fmt.won(totalBurden));
      setLabel('data-quick-label1', L('상속세', 'Inheritance tax'));
      setText('quick1', isRange ? rangeText(lowTax.tax, highTax.tax) : fmt.won(tax));
      setLabel('data-quick-label2', L('부동산 취득세', 'Property acquisition tax'));
      setText('quick2', fmt.won(acq.total));
      setLabel('data-quick-label3', L('과세표준', 'Tax base'));
      setText('quick3', isRange ? rangeText(lowTax.taxBase, highTax.taxBase) : fmt.won(taxBase));

      // 범위 추정임을 결과 화면에 분명히 밝힌다(간편 추정 · 베타).
      const estBox = root.querySelector('[data-estimate-note]');
      if (estBox) {
        estBox.hidden = false;
        estBox.innerHTML = isRange
          ? L('<strong>간편 추정 · 범위 표시</strong> 배우자 상속공제는 배우자가 <em>실제로 상속받는 금액</em>과 민법상 법정상속분 한도(최대 30억원)에 따라 결정됩니다. 실제 상속액을 입력하지 않아 최소 5억원 공제(세액 상한)와 법정상속분 한도 공제(세액 하한)의 범위로 표시했습니다. 신고기한 내 분할·등기를 마쳐야 공제가 인정되며, 사전증여재산·배우자 사전증여 과세표준에 따라 결과가 달라집니다.',
              '<strong>Simplified estimate · shown as a range</strong> The spousal deduction depends on the amount the spouse <em>actually</em> inherits and the statutory-share ceiling (max KRW 3B). Since no actual spousal share was entered, the result is shown as a range between the KRW 500M minimum deduction and the statutory-share ceiling.')
          : L('<strong>간편 추정</strong> 배우자 상속공제는 min(실제 상속액, 법정상속분 한도, 30억원)이며 최소 5억원이 보장됩니다. 신고기한 내 분할·등기 완료가 요건이고, 사전증여재산이 있으면 결과가 달라집니다. 실제 신고는 세무사와 확인하세요.',
              '<strong>Simplified estimate</strong> The spousal deduction is min(actual inherited amount, statutory-share ceiling, KRW 3B), with a KRW 500M floor. Division and registration must be completed by the filing deadline.');
      }

      renderChart([
        { label: L('순 상속재산', 'Net estate'), value: netAssets, color: '#1e3a8a' },
        { label: L('공제 합계', 'Total deductions'), value: totalDeduct, color: '#047857' },
        { label: L('상속세', 'Inheritance tax'), value: tax, color: '#ef4444' },
        { label: L('부동산 취득세', 'Property acquisition tax'), value: acq.total, color: '#f59e0b' },
      ]);
      renderDetail([
        { label: L('부동산 평가액', 'Property value'), value: propValue, sub: true },
        { label: L('기타 상속재산', 'Other estate assets'), value: other, sub: true },
        { label: L('채무·장례비', 'Debts & funeral costs'), value: '−' + fmt.won(debt), sub: true },
        { label: L('순 상속재산', 'Net estate'), value: netAssets },
        { label: L('기초공제 + 인적공제', 'Basic + personal deduction'), value: '−' + fmt.won(totalBasic), sub: true },
        { label: L('일괄공제 5억 (max 적용)', 'Lump-sum deduction KRW 500M (max applied)'), value: '−' + fmt.won(publicDeduct), sub: true },
        ...(hasSpouse ? [
          { label: L('배우자 법정상속분', 'Spouse statutory share'),
            value: (sd.statutoryRatio * 100).toFixed(1) + '% (' + L('배우자 1.5 : 자녀 각 1', 'spouse 1.5 : each child 1') + ')', sub: true },
          { label: L('배우자 법정상속분 한도', 'Statutory-share ceiling'), value: sd.statutoryLimit, sub: true },
          { label: L('배우자 상속공제', 'Spousal deduction'),
            value: isRange ? '−' + rangeText(sd.low, sd.high) : '−' + fmt.won(spouseDeduct), sub: true },
        ] : []),
        { label: L('과세표준', 'Tax base'), value: isRange ? rangeText(lowTax.taxBase, highTax.taxBase) : fmt.won(taxBase) },
        { label: L('예상 상속세', 'Estimated inheritance tax'),
          value: isRange ? rangeText(lowTax.tax, highTax.tax) : fmt.won(tax), color: '#ef4444' },
        { label: L('상속 취득세', 'Inheritance acquisition tax'), value: acq.total, color: '#f59e0b' },
        { label: L('취득세 자동 판정', 'Acquisition-tax rule'), value: scenarioText(acq, isEn ? 'en' : 'ko'), sub: true },
        { divider: true, label: L('예상 총 부담', 'Estimated total burden'),
          value: isRange ? rangeText(totalBurden, totalBurdenHigh) : fmt.won(totalBurden) },
      ]);
    }

    function calcGift() {
      const value = getN('giftValue');
      const donee = getRadio('donee') || 'adult';
      const prev = getN('prevGift');
      const prevTaxPaid = getN('prevGiftTax');
      const marriageBirth = getN('marriageBirthDeduct');
      const generationSkip = getCheck('generationSkip');
      const doneeMinor = donee === 'minor';

      const IG = (RATES.inheritGift) || {};
      const deductMap = IG.giftDeduct || { spouse: 600000000, adult: 50000000, minor: 20000000, other: 10000000 };
      // ⚠ 기타친족 1천만원 공제는 6촌 이내 혈족·4촌 이내 인척에게만 적용된다.
      //   완전한 비친족(타인) 증여는 증여재산공제가 없다.
      const relationDeduct = donee === 'stranger' ? 0 : (deductMap[donee] || 0);
      // 혼인·출산 증여재산공제는 직계존속으로부터 받는 경우에만 적용된다.
      const mbEligible = donee === 'adult' || donee === 'minor';
      // 세대생략 할증: 손자녀 등 30%, 미성년자가 20억 초과를 받으면 40%
      const gs = IG.generationSkipSurcharge || { base: 0.30, minorHighValue: 0.40, minorHighValueOver: 2000000000 };
      let surchargeRate = 0;
      if (generationSkip) {
        surchargeRate = (doneeMinor && (value + prev) > (gs.minorHighValueOver || 2000000000))
          ? (gs.minorHighValue || 0.40)
          : (gs.base || 0.30);
      }

      const g = giftTaxAggregated({
        currentValue: value,
        priorValue: prev,
        priorTaxPaid: prevTaxPaid,
        relationDeduct,
        marriageBirthDeduct: mbEligible ? marriageBirth : 0,
        surchargeRate,
      });
      const tax = g.tax;

      const acq = acquisitionTotal(value, {
        acqType: 'gift',
        regulated: getCheck('giftRegulated'),
        giftDonorMultiHome: getCheck('giftDonorMultiHome'),
        areaOver85: getCheck('giftAreaOver85'),
        giftAssumedDebt: getN('giftAssumedDebt'),
      });
      const totalBurden = tax + acq.total;
      const giftStatus = root.querySelector('[data-gift-acq-status]');
      if (giftStatus) giftStatus.textContent = L('자동 판정: ', 'Automatically selected: ') + scenarioText(acq, isEn ? 'en' : 'ko');

      // 혼인·출산 공제 입력란은 직계존속 증여일 때만 노출
      const mbField = root.querySelector('[data-gift-mb-field]');
      if (mbField) mbField.style.display = mbEligible ? '' : 'none';

      const estBox = root.querySelector('[data-estimate-note]');
      if (estBox) {
        estBox.hidden = false;
        const parts = [];
        parts.push(L('<strong>간편 추정</strong> 동일인(직계존속은 그 배우자 포함)으로부터 10년 내 받은 증여재산을 합산해 누진세율을 적용하고, 이미 낸 증여세를 세액공제했습니다.',
          '<strong>Simplified estimate</strong> Gifts received from the same donor within 10 years are aggregated before the progressive rate is applied, and previously paid gift tax is credited.'));
        if (donee === 'stranger') {
          parts.push(L(' 비친족(타인) 증여에는 증여재산공제가 적용되지 않습니다.',
            ' No relationship deduction applies to gifts between unrelated parties.'));
        }
        if (surchargeRate > 0) {
          parts.push(L(' 세대생략 할증 ' + Math.round(surchargeRate * 100) + '%를 가산했습니다(상증법 제57조).',
            ' A ' + Math.round(surchargeRate * 100) + '% generation-skipping surcharge was added.'));
        }
        parts.push(L(' 부담부증여·비상장주식·저가양수 등은 별도 규정이 적용되니 세무사와 확인하세요.',
          ' Gifts with assumed debt, unlisted shares, or below-market transfers follow separate rules.'));
        estBox.innerHTML = parts.join('');
      }

      if (resultTitle) resultTitle.textContent = L('예상 총 부담 (증여세 + 취득세)', 'Estimated total (gift + acquisition tax)');
      setText('primaryTotal', fmt.won(totalBurden));
      setLabel('data-quick-label1', L('10년 합산 증여가액', 'Aggregated gift value (10-yr)'));
      setText('quick1', fmt.won(g.aggregatedValue));
      setLabel('data-quick-label2', L('증여재산공제 합계', 'Total gift deduction'));
      setText('quick2', fmt.won(g.totalDeduct));
      setLabel('data-quick-label3', L('합산 과세표준', 'Aggregated tax base'));
      setText('quick3', fmt.won(g.aggregatedBase));

      renderChart([
        { label: L('이번 증여 평가액', 'Current gift value'), value: value, color: '#1e3a8a' },
        { label: L('과거 10년 증여액', 'Prior gifts (10-yr)'), value: prev, color: '#60a5fa' },
        { label: L('증여재산공제', 'Gift deduction'), value: g.totalDeduct, color: '#047857' },
        { label: L('증여세', 'Gift tax'), value: tax, color: '#ef4444' },
        { label: L('취득세 (부동산)', 'Acquisition tax (property)'), value: acq.total, color: '#f59e0b' },
      ]);
      renderDetail([
        { label: L('이번 증여 평가액', 'Current gift value'), value: value, sub: true },
        { label: L('과거 10년 증여액 (동일인)', 'Prior gifts from same donor (10-yr)'), value: prev, sub: true },
        { label: L('10년 합산 증여가액', 'Aggregated gift value'), value: g.aggregatedValue },
        { label: L('증여재산공제 (관계별)', 'Relationship deduction'), value: '−' + fmt.won(relationDeduct), sub: true },
        ...(g.marriageBirthDeduct > 0 ? [{ label: L('혼인·출산 증여재산공제', 'Marriage/childbirth deduction'), value: '−' + fmt.won(g.marriageBirthDeduct), sub: true }] : []),
        { label: L('합산 과세표준', 'Aggregated tax base'), value: g.aggregatedBase },
        { label: L('산출세액 (합산 누진)', 'Calculated tax (aggregated, progressive)'), value: g.grossTax, sub: true },
        ...(g.surcharge > 0 ? [{ label: L('세대생략 할증 (' + Math.round(surchargeRate * 100) + '%)', 'Generation-skipping surcharge (' + Math.round(surchargeRate * 100) + '%)'), value: '+' + fmt.won(g.surcharge), sub: true }] : []),
        ...(g.priorCredit > 0 ? [{ label: L('기납부 증여세액공제', 'Credit for gift tax already paid'), value: '−' + fmt.won(g.priorCredit), sub: true }] : []),
        { label: L('증여세', 'Gift tax'), value: tax, color: '#ef4444' },
        ...(g.aggregationEffect > 0 ? [{ label: L('└ 10년 합산으로 늘어난 세액', '└ Increase from 10-yr aggregation'), value: '+' + fmt.won(g.aggregationEffect), sub: true }] : []),
        { label: L('부동산 취득세', 'Property acquisition tax'), value: acq.total, color: '#f59e0b' },
        { label: L('취득세 자동 판정', 'Acquisition-tax rule'), value: scenarioText(acq, isEn ? 'en' : 'ko'), sub: true },
        { divider: true, label: L('예상 총 부담 (증여세 + 취득세)', 'Estimated total (gift tax + acquisition tax)'), value: totalBurden },
      ]);
    }

    // ── 보유비용 추정: 재산세 (지방세법 제110·111조) ──
    //  과세표준 = 공시가격 × 공정시장가액비율. 1주택 특례세율(공시 9억 이하)은 별도 구간.
    //  도시지역분(과표 × 0.14%)과 지방교육세(재산세 × 20%)를 합산한다.
    function propertyTaxEstimate(officialPrice, isOneHome) {
      if (!officialPrice || officialPrice <= 0) return { total: 0, base: 0, main: 0, urban: 0, edu: 0, fairRatio: 0 };
      // 공정시장가액비율: 1주택 특례 43~45% 적용 사례가 있으나 보수적으로 표준 60%,
      // 1주택은 특례 45%를 적용한다(연도별 고시로 변동 — 추정치).
      const fairRatio = isOneHome ? 0.45 : 0.60;
      const base = officialPrice * fairRatio;
      let main;
      if (isOneHome && officialPrice <= 900000000) {
        // 1주택 특례세율 (공시가격 9억 이하)
        if (base <= 60000000) main = base * 0.0005;
        else if (base <= 150000000) main = 30000 + (base - 60000000) * 0.001;
        else if (base <= 300000000) main = 120000 + (base - 150000000) * 0.002;
        else main = 420000 + (base - 300000000) * 0.0035;
      } else {
        if (base <= 60000000) main = base * 0.001;
        else if (base <= 150000000) main = 60000 + (base - 60000000) * 0.0015;
        else if (base <= 300000000) main = 195000 + (base - 150000000) * 0.0025;
        else main = 570000 + (base - 300000000) * 0.004;
      }
      const urban = base * 0.0014;      // 도시지역분 재산세
      const edu = main * 0.20;          // 지방교육세
      return { total: main + urban + edu, base, main, urban, edu, fairRatio };
    }

    // ── 보유비용 추정: 종합부동산세 (종부세법) ──
    //  공제: 1세대1주택 12억, 그 외 9억. 과세표준 = (공시가격 − 공제) × 공정시장가액비율 60%.
    //  ⚠ 재산세 중복분 공제·세부담 상한·연령/보유 세액공제는 반영하지 않은 개략 추정치.
    function comprehensiveTaxEstimate(officialPrice, homes, regulated) {
      const threshold = homes === 1 ? 1200000000 : 900000000;
      const over = Math.max(0, (officialPrice || 0) - threshold);
      if (over <= 0) return { total: 0, base: 0, threshold, applies: false };
      const base = over * 0.60;
      // 다주택 중과 대상(3주택 이상 또는 조정지역 2주택)은 상위 구간 세율이 높다.
      const heavy = homes >= 3 || (homes >= 2 && regulated);
      const brackets = heavy
        ? [[300000000, 0.005, 0], [600000000, 0.007, 600000], [1200000000, 0.010, 2400000],
           [2500000000, 0.020, 14400000], [5000000000, 0.030, 39400000],
           [9400000000, 0.040, 89400000], [Infinity, 0.050, 183400000]]
        : [[300000000, 0.005, 0], [600000000, 0.007, 600000], [1200000000, 0.010, 2400000],
           [2500000000, 0.013, 6000000], [5000000000, 0.015, 11000000],
           [9400000000, 0.020, 36000000], [Infinity, 0.027, 101800000]];
      let main = 0;
      for (const [upTo, rate, ded] of brackets) {
        if (base <= upTo) { main = Math.max(0, base * rate - ded); break; }
      }
      const rural = main * 0.20; // 농어촌특별세 (종부세의 20%)
      return { total: main + rural, base, main, rural, threshold, applies: true, heavy };
    }

    // ===== 자금계획 탭 =====
    //  매수 탭의 거래 조건(매매가·대출·등기 입력)을 그대로 재사용하고,
    //  섞여 있던 세 레이어를 네 블록으로 분리해 보여준다.
    //   A. 계약 단계별 필요 현금   B. 총 취득원가   C. 자금조달   D. 연간 보유비용
    //  ※ 자체 세율식을 두지 않고 calcAcquisitionTax·calcBrokerageFee·registrationCost만 호출한다.
    function calcPlan() {
      const price = getN('price');
      const homes = Number(getRadio('homes') || 1);
      const regulated = getCheck('regulated');
      const areaOver85 = getCheck('areaOver85');
      const nonhouse = (getRadio('assetType') || 'house') === 'nonhouse';

      // ── 공통 엔진 재사용 ──
      let acq;
      if (nonhouse) {
        const base = price * 0.04;
        acq = { total: price * 0.046, acquisition: base, ruralTax: price * 0.002, localEduTax: price * 0.004, firstHomeDeduct: 0, unsoldDeduct: 0 };
      } else {
        acq = acquisitionTotal(price, {
          homes, regulated, areaOver85,
          firstHome: getCheck('firstHome'),
          tempTwoHome: getCheck('tempTwoHome'),
          unsold2026: getCheck('unsold2026'),
          acqType: 'purchase',
        });
      }
      const broker = nonhouse ? Math.round(price * 0.009 * 1.1) : brokerFee(price, 'sale');
      const reg = registrationCost(price, getN('regStd'), (getNum('regDiscount') || 0) / 100,
        getCheck('selfReg'), nonhouse ? 'land' : 'house');

      // ── 자금조달 ──
      const loan = getN('loan');
      const rate = getNum('rate');
      const term = getNum('term');
      const creditLoan = getN('planCreditLoan');
      const creditRate = getNum('planCreditRate');
      const assumedDeposit = getN('planAssumedDeposit'); // 임차보증금 승계
      const ownEquity = getN('planEquity');              // 준비된 자기자본

      // ── 계약 단계별 현금 ──
      const downPct = getNum('planDownPct') || 10;
      const midPct = getNum('planMidPct') || 0;
      const downPayment = price * (downPct / 100);
      const midPayment = price * (midPct / 100);
      const interior = getN('planInterior');
      const moving = getN('planMoving');
      const prepaid = getN('planPrepaid');   // 대출 실행 전 선납비용(감정료·인지대 등)

      // 잔금일에 필요한 현금 = 잔금 − 대출 − 승계보증금 + 취득세·등기·중개보수 등
      const balanceDue = Math.max(0, price - downPayment - midPayment);
      const balanceDayCash = Math.max(0,
        balanceDue - loan - creditLoan - assumedDeposit
        + acq.total + reg.total + broker + moving + prepaid);

      // ── B. 총 취득원가 (경제적 취득가액) ──
      const capex = interior; // 자본적 지출로 인정될 수 있는 인테리어(샷시·확장 등)
      const totalAcquisitionCost = price + acq.total + broker + reg.total + capex;

      // ── C. 자금조달 ──
      const fundingNeed = price + acq.total + broker + reg.total + interior + moving + prepaid;
      const funded = ownEquity + loan + creditLoan + assumedDeposit;
      const shortfall = fundingNeed - funded;

      // ── D. 연간 보유비용 ──
      const mortgageMonthly = monthlyPayment(loan, rate, term);
      const creditMonthly = creditLoan > 0 ? creditLoan * (creditRate / 100) / 12 : 0;
      const officialPrice = getN('regStd') || Math.round(price * 0.7);
      const ptax = nonhouse ? { total: 0 } : propertyTaxEstimate(officialPrice, homes === 1);
      const ctax = nonhouse ? { total: 0, applies: false } : comprehensiveTaxEstimate(officialPrice, homes, regulated);
      const mgmtMonthly = getN('planMgmt');
      const insuranceYear = getN('planInsurance');
      const repairYear = getN('planRepair');
      const annualHolding = (mortgageMonthly + creditMonthly + mgmtMonthly) * 12
        + ptax.total + ctax.total + insuranceYear + repairYear;

      if (resultTitle) resultTitle.textContent = L('잔금일에 필요한 현금', 'Cash needed on closing day');
      setText('primaryTotal', fmt.won(balanceDayCash));
      setLabel('data-quick-label1', L('총 취득원가', 'Total acquisition cost'));
      setText('quick1', fmt.won(totalAcquisitionCost));
      setLabel('data-quick-label2', shortfall > 0 ? L('부족자금', 'Funding shortfall') : L('자금 여유', 'Surplus'));
      setText('quick2', fmt.won(Math.abs(shortfall)));
      setLabel('data-quick-label3', L('연간 보유비용', 'Annual holding cost'));
      setText('quick3', fmt.won(annualHolding));

      const estBox = root.querySelector('[data-estimate-note]');
      if (estBox) {
        estBox.hidden = false;
        estBox.innerHTML = shortfall > 0
          ? L('<strong>부족자금 ' + fmt.won(shortfall) + '</strong> 준비된 자기자본·대출·승계보증금으로 총 소요자금을 충당하지 못합니다. 자기자본을 늘리거나 대출 한도(매수 탭의 DSR·LTV 점검)를 다시 확인하세요. 재산세·종합부동산세는 공시가격 기준 <em>추정치</em>이며, 재산세 중복분 공제·세부담 상한·연령/보유 세액공제는 반영하지 않았습니다.',
              '<strong>Shortfall of ' + fmt.won(shortfall) + '</strong> Equity, loans, and the assumed deposit do not cover total funding needs. Property and comprehensive real-estate taxes are <em>estimates</em> based on the official assessed price.')
          : L('<strong>자금 계획 충족</strong> 준비된 자금이 총 소요자금을 ' + fmt.won(-shortfall) + ' 초과합니다. 재산세·종합부동산세는 공시가격 기준 <em>추정치</em>이며, 재산세 중복분 공제·세부담 상한·연령/보유 세액공제는 반영하지 않았습니다.',
              '<strong>Plan is funded</strong> Available funds exceed the requirement by ' + fmt.won(-shortfall) + '. Property and comprehensive real-estate taxes are <em>estimates</em>.');
      }

      renderChart([
        { label: L('자기자본', 'Equity'), value: Math.max(0, ownEquity), color: '#1e3a8a' },
        { label: L('주택담보대출', 'Mortgage'), value: loan, color: '#3b82f6' },
        { label: L('신용대출', 'Credit loan'), value: creditLoan, color: '#60a5fa' },
        { label: L('임차보증금 승계', 'Assumed lease deposit'), value: assumedDeposit, color: '#93c5fd' },
        { label: L('부족자금', 'Shortfall'), value: Math.max(0, shortfall), color: '#ef4444' },
      ]);

      renderDetail([
        { label: 'A. ' + L('계약 단계별 필요 현금', 'Cash by contract stage'), value: '' },
        { label: L('계약금 (' + downPct + '%)', 'Down payment (' + downPct + '%)'), value: downPayment, sub: true },
        ...(midPayment > 0 ? [{ label: L('중도금 (' + midPct + '%)', 'Interim payment (' + midPct + '%)'), value: midPayment, sub: true }] : []),
        { label: L('잔금', 'Balance'), value: balanceDue, sub: true },
        { label: L('취득세·등기비용', 'Acquisition tax & registration'), value: acq.total + reg.total, sub: true },
        { label: L('중개보수(VAT 포함)', 'Brokerage fee (incl. VAT)'), value: broker, sub: true },
        { label: L('인테리어·이사비', 'Interior & moving'), value: interior + moving, sub: true },
        { label: L('대출 실행 전 선납비용', 'Pre-disbursement costs'), value: prepaid, sub: true },
        { divider: true, label: L('잔금일에 필요한 현금', 'Cash needed on closing day'), value: balanceDayCash },

        { label: 'B. ' + L('총 취득원가 (양도세 취득가액 기초)', 'Total acquisition cost'), value: '' },
        { label: L('매매대금', 'Purchase price'), value: price, sub: true },
        { label: L('취득세 합계', 'Acquisition tax total'), value: acq.total, sub: true },
        { label: L('중개보수', 'Brokerage fee'), value: broker, sub: true },
        { label: L('법무·등기비용', 'Registration & scrivener'), value: reg.total, sub: true },
        { label: L('자본적 지출(인테리어)', 'Capital expenditure (interior)'), value: capex, sub: true },
        { divider: true, label: L('총 취득원가', 'Total acquisition cost'), value: totalAcquisitionCost },

        { label: 'C. ' + L('자금조달', 'Funding'), value: '' },
        { label: L('자기자본', 'Equity'), value: ownEquity, sub: true },
        { label: L('주택담보대출', 'Mortgage'), value: loan, sub: true },
        { label: L('신용대출', 'Credit loan'), value: creditLoan, sub: true },
        { label: L('임차보증금 승계', 'Assumed lease deposit'), value: assumedDeposit, sub: true },
        { label: L('총 소요자금', 'Total funding need'), value: fundingNeed, sub: true },
        { divider: true, label: shortfall > 0 ? L('부족자금', 'Shortfall') : L('자금 여유', 'Surplus'), value: Math.abs(shortfall) },

        { label: 'D. ' + L('연간 보유비용', 'Annual holding cost'), value: '' },
        { label: L('주담대 원리금 (연)', 'Mortgage payments (yr)'), value: mortgageMonthly * 12, sub: true },
        ...(creditMonthly > 0 ? [{ label: L('신용대출 이자 (연)', 'Credit loan interest (yr)'), value: creditMonthly * 12, sub: true }] : []),
        { label: L('재산세 추정 (도시지역분·지방교육세 포함)', 'Property tax est.'), value: ptax.total, sub: true },
        { label: L('종합부동산세 추정', 'Comprehensive real-estate tax est.'),
          value: ctax.applies ? fmt.won(ctax.total) : L('해당 없음 (공시가격 ' + fmt.won(ctax.threshold) + ' 이하)', 'N/A'), sub: true },
        { label: L('관리비 (연)', 'Maintenance fee (yr)'), value: mgmtMonthly * 12, sub: true },
        { label: L('보험료 (연)', 'Insurance (yr)'), value: insuranceYear, sub: true },
        { label: L('예상 수선비 (연)', 'Expected repairs (yr)'), value: repairYear, sub: true },
        { divider: true, label: L('연간 보유비용 합계', 'Total annual holding cost'), value: annualHolding },
      ]);

      // 자금계획 탭에서는 DSR·RTI·대출한도 박스를 매수 탭과 동일하게 유지한다.
      if (rtiBox) rtiBox.hidden = true;
      if (dsrBox) dsrBox.hidden = false;
      renderDSR(mortgageMonthly * 12, getN('creditDebt') / 5 + otherLoansTotal());
    }

    function switchScn(name) {
      currentScn = name;
      document.querySelectorAll('[data-scn]').forEach((t) => {
        const on = t.dataset.scn === name;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      panels.forEach((p) => { p.hidden = p.dataset.scnPanel !== name; });
      root.querySelectorAll('[data-show-on]').forEach((el) => {
        const arr = el.dataset.showOn.split(',').map(s => s.trim());
        el.style.display = arr.includes(name) ? '' : 'none';
      });
      if (dsrBox) dsrBox.hidden = !(name === 'sale' || name === 'plan');
      if (rtiBox) rtiBox.hidden = true; // 매수 시나리오에서 calcSale이 비주택 임대일 때만 노출
      if (mortgageLimitBox) mortgageLimitBox.hidden = (name !== 'sale');
      // 간편 추정 안내는 범위·추정이 포함된 시나리오에서만 노출
      const estBox = root.querySelector('[data-estimate-note]');
      if (estBox) estBox.hidden = !['inherit', 'gift', 'plan'].includes(name);
      recalc();
    }
    document.querySelectorAll('[data-scn]').forEach((t) => t.addEventListener('click', () => switchScn(t.dataset.scn)));

    function applyAssetType() {
      const nonhouse = (root.querySelector('[name="assetType"]:checked') || {}).value === 'nonhouse';
      root.querySelectorAll('[data-house-only]').forEach((el) => {
        const showOn = el.dataset.showOn;
        const visibleInScn = !showOn || showOn.split(',').map(s => s.trim()).includes(currentScn);
        el.style.display = (!nonhouse && visibleInScn) ? '' : 'none';
      });
      // 자산 유형에 맞춰 연관 라벨도 함께 바꾼다 (실거주↔직접사용 / 갭투자↔임대 등)
      const setTxt = (sel, txt) => { const el = root.querySelector(sel); if (el) el.textContent = txt; };
      setTxt('[data-loan-title]', nonhouse ? L('담보대출', 'Secured loan') : L('주담대', 'Mortgage'));
      setTxt('[data-purpose-label]', nonhouse ? L('이용 계획', 'Intended use') : L('구매 목적', 'Purchase purpose'));
      setTxt('[data-purpose-own]', nonhouse ? L('직접 사용', 'Own use') : L('실거주', 'Own residence'));
      setTxt('[data-purpose-gap]', nonhouse ? L('임대 (임차인)', 'Rental (with tenant)') : L('갭투자', 'Gap investment'));
      setTxt('[data-jeonse-label]', nonhouse ? L('예상 임대 보증금 (인수)', 'Assumed rental deposit') : L('예상 전세 보증금 인수', 'Assumed Jeonse deposit'));
      const nhNote = root.querySelector('[data-nonhouse-note]');
      if (nhNote) nhNote.style.display = nonhouse ? '' : 'none';
    }

    function recalc() {
      applyAssetType();
      if (currentScn === 'sale') calcSale();
      else if (currentScn === 'plan') calcPlan();
      else if (currentScn === 'transfer') calcTransfer();
      else if (currentScn === 'lease') calcLease();
      else if (currentScn === 'inherit') calcInherit();
      else if (currentScn === 'gift') calcGift();
    }

    root.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
    const leaseBizInput = root.querySelector('[data-lease-biz]');
    if (leaseBizInput) leaseBizInput.addEventListener('change', () => { leaseBizTouched = true; });
    initOtherLoans();
    switchScn('sale');
  }
})();

// ===== D-Day Scheduler (체크리스트 페이지) =====
// 단계별 이벤트(일정+금액+방향) 입력 → 달력 시각화 + 타임라인 + ICS 내보내기
(function () {
  const root = document.querySelector('[data-dday-app]');
  if (!root) return;

  const KEY = 'dday:events';
  const KEY_TYPE = 'dday:type';
  const eventsBox = root.querySelector('[data-dday-events]');
  const timelineBox = root.querySelector('[data-dday-timeline]');
  const calGrid = root.querySelector('[data-cal-grid]');
  const calTitle = root.querySelector('[data-cal-title]');
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };

  let calCursor = new Date(); calCursor.setDate(1);
  let dealType = localStorage.getItem(KEY_TYPE) || 'sale';
  let events;

  function today() { const d = new Date(); d.setHours(0,0,0,0); return d; }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function fmtDate(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
  }
  function isoDate(d) {
    if (!(d instanceof Date)) d = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function dDayLabel(target) {
    const t = today();
    const diff = Math.round((new Date(target) - t) / 86400000);
    if (diff === 0) return 'D-day';
    return diff > 0 ? 'D-' + diff : 'D+' + Math.abs(diff);
  }
  function loadEvents() {
    try {
      const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (Array.isArray(arr) && arr.length) return arr.map(e => ({ ...e, date: new Date(e.date) }));
    } catch (e) {}
    return null;
  }
  function saveEvents() {
    localStorage.setItem(KEY, JSON.stringify(events.map(e => ({ ...e, date: isoDate(e.date) }))));
  }
  function presetSale() { return [
    { id: uid(), title: '계약 체결 · 계약금 지급', date: today(), amount: 50000000, dir: 'out', tag: '매매' },
    { id: uid(), title: '중도금 지급', date: addDays(today(), 30), amount: 0, dir: 'out', tag: '매매' },
    { id: uid(), title: '대출 사전심사', date: addDays(today(), 45), amount: 0, dir: 'info', tag: '대출' },
    { id: uid(), title: '잔금 · 등기 · 정산', date: addDays(today(), 60), amount: 0, dir: 'out', tag: '잔금일' },
    { id: uid(), title: '전입신고 · 확정일자', date: addDays(today(), 60), amount: 0, dir: 'info', tag: '행정' },
    { id: uid(), title: '취득세 납부 기한 (60일 내)', date: addDays(today(), 120), amount: 0, dir: 'out', tag: '세금' },
  ]; }
  function presetLease() { return [
    { id: uid(), title: '계약 체결 · 계약금 지급', date: today(), amount: 30000000, dir: 'out', tag: '임차' },
    { id: uid(), title: '전세자금대출 신청', date: addDays(today(), 15), amount: 0, dir: 'info', tag: '대출' },
    { id: uid(), title: '잔금일 · 전입 · 확정 · 보증보험', date: addDays(today(), 30), amount: 0, dir: 'out', tag: '잔금일' },
    { id: uid(), title: 'HUG/HF 보증보험 가입 마감', date: addDays(today(), 45), amount: 0, dir: 'info', tag: '보증' },
    { id: uid(), title: '만기 · 보증금 반환', date: addDays(today(), 730), amount: 500000000, dir: 'in', tag: '만기' },
  ]; }
  function setType(t) {
    dealType = t;
    localStorage.setItem(KEY_TYPE, t);
    root.querySelectorAll('[name="dealType"]').forEach(el => el.checked = el.value === t);
  }
  events = loadEvents() || (dealType === 'lease' ? presetLease() : presetSale());
  setType(dealType);

  function escapeAttr(s) { return String(s||'').replace(/"/g, '&quot;'); }

  function renderEvents() {
    if (!eventsBox) return;
    eventsBox.innerHTML = '';
    events.forEach((ev) => {
      const row = document.createElement('div');
      row.className = 'dday-event-row';
      row.innerHTML = `
        <input type="text" class="de-title" value="${escapeAttr(ev.title)}" placeholder="일정 이름" />
        <input type="date" class="de-date" value="${isoDate(ev.date)}" />
        <input type="text" class="de-amount" inputmode="numeric" value="${ev.amount ? Number(ev.amount).toLocaleString('ko-KR') : ''}" placeholder="0원" />
        <select class="de-dir">
          <option value="out" ${ev.dir==='out'?'selected':''}>지급</option>
          <option value="in" ${ev.dir==='in'?'selected':''}>수령</option>
          <option value="info" ${ev.dir==='info'?'selected':''}>일정만</option>
        </select>
        <input type="text" class="de-tag" value="${escapeAttr(ev.tag || '')}" placeholder="태그" />
        <button type="button" class="de-del" aria-label="삭제">✕</button>
      `;
      row.querySelector('.de-title').addEventListener('input', (e) => { ev.title = e.target.value; persist(); });
      row.querySelector('.de-date').addEventListener('change', (e) => { ev.date = new Date(e.target.value); persist(); });
      row.querySelector('.de-amount').addEventListener('input', (e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        ev.amount = Number(raw) || 0;
        e.target.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
        persist();
      });
      row.querySelector('.de-dir').addEventListener('change', (e) => { ev.dir = e.target.value; persist(); });
      row.querySelector('.de-tag').addEventListener('input', (e) => { ev.tag = e.target.value; persist(false); });
      row.querySelector('.de-del').addEventListener('click', () => {
        events = events.filter(x => x.id !== ev.id);
        saveEvents(); renderAll();
      });
      eventsBox.appendChild(row);
    });
  }

  function persist(rerender = true) {
    saveEvents();
    updateSummary();
    renderTimeline();
    renderCalendar();
  }

  function updateSummary() {
    setText('totalCount', events.length + '건');
    const total = events.filter(e => e.dir !== 'info').reduce((a, b) => a + (Number(b.amount)||0), 0);
    setText('totalAmount', total.toLocaleString('ko-KR') + '원');
    const t = today();
    const future = events.filter(e => new Date(e.date) >= t).sort((a,b) => new Date(a.date)-new Date(b.date))[0];
    setText('nextEvent', future ? (dDayLabel(future.date) + ' · ' + future.title) : '예정 일정 없음');
  }

  function renderTimeline() {
    if (!timelineBox) return;
    if (!events.length) {
      timelineBox.innerHTML = '<li class="dt-empty">일정을 추가하면 타임라인이 표시됩니다.</li>';
      return;
    }
    const sorted = events.slice().sort((a,b) => new Date(a.date)-new Date(b.date));
    timelineBox.innerHTML = '';
    sorted.forEach((ev) => {
      const past = new Date(ev.date) < today();
      const dirClass = ev.dir === 'in' ? 'in' : (ev.dir === 'out' ? 'out' : 'info');
      const dirLabel = ev.dir === 'in' ? '+ 수령' : (ev.dir === 'out' ? '− 지급' : '· 일정');
      const li = document.createElement('li');
      li.className = 'dt-item dt-' + dirClass + (past ? ' dt-past' : '');
      li.innerHTML = `
        <div class="dt-dot"></div>
        <div class="dt-meta">
          <span class="dt-dday">${dDayLabel(ev.date)}</span>
          <span class="dt-date">${fmtDate(ev.date)}</span>
        </div>
        <div class="dt-body">
          <div class="dt-title">${ev.tag ? '<span class="dt-tag">'+escapeAttr(ev.tag)+'</span>' : ''}${escapeAttr(ev.title)}</div>
          <div class="dt-desc">${ev.amount ? `<span class="dt-amt dt-amt-${dirClass}">${dirLabel} ${Number(ev.amount).toLocaleString('ko-KR')}원</span>` : `<span class="dt-amt dt-amt-info">일정 메모</span>`}</div>
        </div>
      `;
      timelineBox.appendChild(li);
    });
  }

  function renderCalendar() {
    if (!calGrid) return;
    const y = calCursor.getFullYear();
    const m = calCursor.getMonth();
    if (calTitle) calTitle.textContent = `${y}년 ${m+1}월`;
    const firstDay = new Date(y, m, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(y, m+1, 0).getDate();
    const t = today();

    const byDate = {};
    events.forEach(ev => {
      const d = new Date(ev.date);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const key = d.getDate();
        (byDate[key] = byDate[key] || []).push(ev);
      }
    });

    calGrid.innerHTML = '';
    for (let i = 0; i < startWeekday; i++) {
      const cell = document.createElement('div');
      cell.className = 'dc-cell dc-empty';
      calGrid.appendChild(cell);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      const cellDate = new Date(y, m, d);
      const isToday = (cellDate.getTime() === t.getTime());
      cell.className = 'dc-cell' + (isToday ? ' dc-today' : '');
      const evs = byDate[d] || [];
      let badge = '';
      if (evs.length) {
        const hasIn = evs.some(e => e.dir === 'in');
        const hasOut = evs.some(e => e.dir === 'out');
        const dot = hasIn && hasOut ? 'dc-dot-both' : (hasOut ? 'dc-dot-out' : (hasIn ? 'dc-dot-in' : 'dc-dot-info'));
        badge = `<span class="dc-dot ${dot}"></span>`;
      }
      const evList = evs.map(e => {
        const dirCls = e.dir === 'in' ? 'in' : (e.dir === 'out' ? 'out' : 'info');
        const sign = e.dir === 'in' ? '+' : (e.dir === 'out' ? '−' : '·');
        const amt = e.amount ? sign + Number(e.amount).toLocaleString('ko-KR') : '';
        return `<div class="dc-ev dc-ev-${dirCls}" title="${escapeAttr(e.title)}"><span class="dc-ev-title">${escapeAttr(e.title)}</span>${amt ? `<span class="dc-ev-amt">${amt}</span>` : ''}</div>`;
      }).join('');
      cell.innerHTML = `<div class="dc-num">${d}${badge}</div>${evList}`;
      calGrid.appendChild(cell);
    }
  }

  function exportICS() {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Topda//DDay Scheduler//KR'];
    events.forEach((ev) => {
      const dt = new Date(ev.date);
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}`;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + ev.id + '@topda');
      lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z');
      lines.push('DTSTART;VALUE=DATE:' + stamp);
      const dirLabel = ev.dir === 'in' ? '[수령] ' : (ev.dir === 'out' ? '[지급] ' : '[일정] ');
      const amt = ev.amount ? ` (${Number(ev.amount).toLocaleString('ko-KR')}원)` : '';
      lines.push('SUMMARY:' + dirLabel + ev.title + amt);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'topda-dday.ics';
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); a.remove();
  }

  root.querySelectorAll('[name="dealType"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (!confirm('거래 유형을 바꾸면 현재 일정이 기본 템플릿으로 교체됩니다. 진행할까요?')) {
        el.checked = (el.value === dealType);
        return;
      }
      setType(el.value);
      events = el.value === 'lease' ? presetLease() : presetSale();
      saveEvents(); renderAll();
    });
  });
  root.querySelector('[data-dday-add]')?.addEventListener('click', () => {
    events.push({ id: uid(), title: '새 일정', date: today(), amount: 0, dir: 'info', tag: '' });
    saveEvents(); renderAll();
  });
  root.querySelector('[data-dday-reset]')?.addEventListener('click', () => {
    if (!confirm('모든 일정을 기본값으로 초기화할까요?')) return;
    events = dealType === 'lease' ? presetLease() : presetSale();
    saveEvents(); renderAll();
  });
  root.querySelector('[data-dday-export]')?.addEventListener('click', exportICS);

  // ===== 카카오톡 공유(안내) =====
  // 다음 일정을 카카오톡으로 공유해 리마인드로 쓸 수 있게 한다. 예약 발송이 아니라
  // 클릭 시점의 '지금 공유'이며, 로그인·서버 저장 없이 카카오 JS SDK만 사용한다.
  // (자동 예약 알림은 서버에 사용자 토큰을 저장해야 해 이 사이트의 '서버 전송·저장 금지'
  // 원칙과 맞지 않아 제외했다.) 배포 시 __KAKAO_JS_KEY__ 는 지도(kmap.js)와 동일한
  // 시크릿(KAKAO_JAVASCRIPT_KEY)으로 치환된다.
  const KAKAO_KEY = '__KAKAO_JS_KEY__';
  const kakaoKeyValid = !/^__.*__$/.test(KAKAO_KEY) && KAKAO_KEY.length >= 16;

  function ensureKakao(cb) {
    if (!kakaoKeyValid) { cb(false); return; }
    if (window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized()) { cb(true); return; }
    if (window.Kakao && window.Kakao.Share) {
      try { window.Kakao.init(KAKAO_KEY); } catch (e) {}
      cb(!!(window.Kakao.isInitialized && window.Kakao.isInitialized()));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    s.onload = () => {
      try { window.Kakao.init(KAKAO_KEY); } catch (e) {}
      cb(!!(window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized()));
    };
    s.onerror = () => cb(false);
    document.head.appendChild(s);
  }

  function shareMessage() {
    const t = today();
    const upcoming = events
      .filter((e) => new Date(e.date) >= t)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const lines = ['[톺다] 거래 일정 안내'];
    lines.push(upcoming
      ? dDayLabel(upcoming.date) + ' · ' + upcoming.title + ' (' + fmtDate(upcoming.date) + ')'
      : '등록된 예정 일정이 없습니다.');
    lines.push('전체 일정·자금 흐름 보기 ↓');
    return lines.join('\n');
  }

  function shareKakao() {
    const btn = root.querySelector('[data-dday-kakao]');
    const url = location.href.split('#')[0].split('?')[0];
    const text = shareMessage();
    ensureKakao((ok) => {
      if (ok) {
        try {
          window.Kakao.Share.sendDefault({
            objectType: 'text',
            text,
            link: { mobileWebUrl: url, webUrl: url },
            buttons: [{ title: '내 일정 보기', link: { mobileWebUrl: url, webUrl: url } }],
          });
          return;
        } catch (e) { /* 실패 시 아래 클립보드 복사로 대체 */ }
      }
      // 카카오 SDK를 쓸 수 없으면(도메인 미등록·로컬 환경 등) 텍스트를 복사해 대신 붙여넣게 한다.
      navigator.clipboard?.writeText(text + '\n' + url).then(() => {
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = '복사됨 — 카톡에 붙여넣기 ✓';
        setTimeout(() => { btn.textContent = original; }, 2000);
      });
    });
  }
  root.querySelector('[data-dday-kakao]')?.addEventListener('click', shareKakao);

  root.querySelector('[data-cal-prev]')?.addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth()-1); renderCalendar(); });
  root.querySelector('[data-cal-next]')?.addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth()+1); renderCalendar(); });

  function renderAll() {
    renderEvents();
    updateSummary();
    renderTimeline();
    renderCalendar();
  }
  renderAll();
})();

// ===== Auction Bid Simulator =====
// 입찰가 + 인수보증금 + 취득세(+10% 부가) + 명도비 + 미납관리비 + 기타 = 총 부담액
// 시세 대비 마진 = (시세 - 총 부담액) / 시세 × 100
(function () {
  const root = document.querySelector('[data-calc="auction-bid"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };

  // 취득세는 자체 산식을 두지 않고 공통 엔진 calcAcquisitionTax()를 그대로 재사용한다.
  //  (구버전은 '본세 × 1.10'으로 지방교육세·농특세를 단순 가산해, 85㎡ 이하 농특세 면제·
  //   8·12% 중과 시 0.4% 고정 교육세·각종 감면을 모두 틀리게 계산했다.)
  const recalc = () => {
    const bid = fmt.parseWon(root.querySelector('[name="bid"]').value);
    const market = fmt.parseWon(root.querySelector('[name="market"]').value);
    const deposit = fmt.parseWon(root.querySelector('[name="deposit"]').value);
    const homes = Number(root.querySelector('[name="homes"]:checked')?.value || 1);
    const regulated = root.querySelector('[name="regulated"]')?.checked || false;
    const areaOver85 = root.querySelector('[name="areaOver85"]')?.checked || false;
    const firstHome = root.querySelector('[name="firstHome"]')?.checked || false;
    const tempTwoHome = root.querySelector('[name="tempTwoHome"]')?.checked || false;
    const assetType = root.querySelector('[name="assetType"]:checked')?.value || 'house';
    const evict = fmt.parseWon(root.querySelector('[name="evict"]').value);
    const unpaid = fmt.parseWon(root.querySelector('[name="unpaid"]').value);
    const misc = fmt.parseWon(root.querySelector('[name="misc"]').value);

    if (!bid) {
      ['total','bid','depositOut','taxOut','evictOut','unpaidOut','miscOut','marketOut'].forEach(k => setText(k, '0원'));
      setText('margin', '—'); setText('verdict', '—');
      renderAcqNotes(root, null);
      return;
    }

    let acq, rate;
    if (assetType === 'nonhouse') {
      // 비주택(상가·업무용 오피스텔·토지): 취득세 4.0% + 농특세 0.2% + 지방교육세 0.4% = 4.6%
      const base = bid * 0.04;
      acq = { acquisition: base, ruralTax: bid * 0.002, localEduTax: bid * 0.004,
        total: bid * 0.046, baseRate: 0.04, isHeavy: false, notes: [],
        scenario: '비주택 취득(4.6% — 취득세 4.0% + 농특세 0.2% + 지방교육세 0.4%)' };
      rate = 0.04;
    } else {
      acq = calcAcquisitionTax({
        price: bid, homes, regulated, areaOver85, firstHome, tempTwoHome,
        acqType: 'purchase',
      });
      rate = acq.baseRate;
    }
    const taxBundle = acq.total; // 취득세 + 농특세 + 지방교육세 (공통 엔진 산정)
    const total = bid + deposit + taxBundle + evict + unpaid + misc;
    const margin = market > 0 ? (market - total) / market * 100 : 0;

    setText('bid', fmt.won(bid));
    setText('depositOut', fmt.won(deposit));
    setText('taxOut', fmt.won(taxBundle) + ' (' + (rate * 100).toFixed(2) + '%)');
    setText('taxScenario', acq.scenario || '—');
    setText('taxAcquisition', fmt.won(acq.acquisition));
    setText('taxRural', acq.ruralTax ? fmt.won(acq.ruralTax) : (isEn ? 'Exempt' : '면제'));
    setText('taxEdu', fmt.won(acq.localEduTax));
    renderAcqNotes(root, acq);
    setText('evictOut', fmt.won(evict));
    setText('unpaidOut', fmt.won(unpaid));
    setText('miscOut', fmt.won(misc));
    setText('marketOut', fmt.won(market));
    setText('total', fmt.won(total));
    setText('margin', (margin >= 0 ? '+' : '') + margin.toFixed(1) + '% (' + fmt.won(market - total) + ')');

    let verdict;
    if (isEn) {
      if (market <= 0) verdict = 'Enter market value';
      else if (margin >= 20) verdict = 'Wide margin — short-term flip range';
      else if (margin >= 10) verdict = 'Safe margin';
      else if (margin >= 5) verdict = 'Owner-occupier range';
      else if (margin >= 0) verdict = 'Thin margin — risk of loss';
      else verdict = 'Above market — reconsider';
    } else {
      if (market <= 0) verdict = '시세 입력 필요';
      else if (margin >= 20) verdict = '여유 있음 (단기차익 검토 구간)';
      else if (margin >= 10) verdict = '안전마진 확보';
      else if (margin >= 5) verdict = '실수요 적정 구간';
      else if (margin >= 0) verdict = '마진 얇음 — 추가 비용 발생 시 손실';
      else verdict = '시세보다 비쌈 — 재검토';
    }
    setText('verdict', verdict);
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();

// ===== Topic tabs (가이드 / 계산기 분리) =====
// 사용법:
// <div class="topic-tabs" data-topic-tabs>
//   <button class="topic-tab" data-tab="guides" aria-selected="true">가이드 <span class="tt-count">7</span></button>
//   <button class="topic-tab" data-tab="calculators">계산기 <span class="tt-count">3</span></button>
// </div>
// <div class="topic-tabpanel active" data-tabpanel="guides">...</div>
// <div class="topic-tabpanel" data-tabpanel="calculators">...</div>
(function () {
  const groups = document.querySelectorAll('[data-topic-tabs]');
  if (!groups.length) return;
  groups.forEach((group) => {
    const tabs = group.querySelectorAll('[data-tab]');
    // 패널들은 group의 같은 부모 안에서 형제로 존재
    const scope = group.parentElement || document;
    const switchTo = (key) => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === key)));
      scope.querySelectorAll('[data-tabpanel]').forEach((p) => {
        p.classList.toggle('active', p.dataset.tabpanel === key);
      });
      // URL 해시 갱신 (페이지 새로고침 후에도 유지)
      try {
        const id = group.id || 'tabs';
        history.replaceState(null, '', '#' + id + ':' + key);
      } catch (e) {}
    };
    tabs.forEach((t) => t.addEventListener('click', () => switchTo(t.dataset.tab)));
    // URL 해시에서 복원
    try {
      const m = location.hash.match(/^#([\w-]+):([\w-]+)$/);
      if (m && (group.id === m[1] || !group.id)) {
        const target = group.querySelector('[data-tab="' + m[2] + '"]');
        if (target) switchTo(m[2]);
      }
    } catch (e) {}
  });
})();

// ===== Interactive contract viewer (좌측 계약서 / 우측 해설) =====
// 사용법: 계약서 요소에 data-clause="K" 부여, .contract-panel에 [data-clause-panel] 배치
(function () {
  const viewers = document.querySelectorAll('[data-contract-viewer]');
  if (!viewers.length) return;
  viewers.forEach((v) => {
    const panel = v.querySelector('[data-clause-panel]');
    const titleEl = v.querySelector('[data-clause-title]');
    const bodyEl = v.querySelector('[data-clause-body]');
    const cautionEl = v.querySelector('[data-clause-caution]');
    const defaultTitle = titleEl ? titleEl.textContent : '';
    const defaultBody = bodyEl ? bodyEl.innerHTML : '';
    const defaultCaution = cautionEl ? cautionEl.innerHTML : '';

    const fill = (el) => {
      const title = el.dataset.clauseTitle || '';
      const body = el.dataset.clauseBody || '';
      const caution = el.dataset.clauseCaution || '';
      if (titleEl) titleEl.textContent = title;
      if (bodyEl) bodyEl.innerHTML = body;
      if (cautionEl) cautionEl.innerHTML = caution;
      v.querySelectorAll('[data-clause]').forEach((c) => c.classList.remove('active'));
      el.classList.add('active');
      if (panel) panel.classList.add('has-selection');
    };
    const reset = () => {
      if (titleEl) titleEl.textContent = defaultTitle;
      if (bodyEl) bodyEl.innerHTML = defaultBody;
      if (cautionEl) cautionEl.innerHTML = defaultCaution;
      v.querySelectorAll('[data-clause]').forEach((c) => c.classList.remove('active'));
      if (panel) panel.classList.remove('has-selection');
    };

    v.querySelectorAll('[data-clause]').forEach((el) => {
      el.addEventListener('mouseenter', () => fill(el));
      el.addEventListener('focus', () => fill(el));
      el.addEventListener('click', (e) => { e.preventDefault(); fill(el); });
      el.setAttribute('tabindex', '0');
    });
    // 모바일: 패널 영역 밖 클릭 시 초기화
    const resetBtn = v.querySelector('[data-clause-reset]');
    if (resetBtn) resetBtn.addEventListener('click', reset);
  });
})();

// ===== Interior estimate calculator =====
// 단가표(원): 기본/중간/프리미엄
// - 면적 비례: 도배(㎡), 바닥재(㎡), 도장(㎡)
// - 평형 비례 1식: 욕실, 주방, 샷시, 발코니, 조명, 전기, 방문, 붙박이장, 에어컨, 철거
const INTERIOR_PRICES = {
  // 면적당 단가 (원/㎡)
  wallpaper: { basic: 18000, standard: 25000, premium: 35000 },
  floor:     { basic: 40000, standard: 60000, premium: 90000 },
  paint:     { basic: 12000, standard: 18000, premium: 26000 }, // 천장+벽 일부 (전용면적의 60%)
  film:      { basic: 9000,  standard: 14000, premium: 20000 }, // 전용면적의 20%
  // 정액 (원/식 또는 단위당)
  bath:      { basic: 2500000, standard: 4000000, premium: 7000000 },
  bath2:     { basic: 2500000, standard: 4000000, premium: 7000000 },
  kitchen:   { basic: 4000000, standard: 6500000, premium: 12000000 },
  window:    { basic: 9000000, standard: 14000000, premium: 22000000, scaleBy: 'area', scaleBase: 84 },
  balcony:   { basic: 3000000, standard: 4500000, premium: 7000000 },
  tile:      { basic: 1200000, standard: 1800000, premium: 2800000 },
  lighting:  { basic: 800000,  standard: 1500000, premium: 3000000 },
  electric:  { basic: 600000,  standard: 900000,  premium: 1400000 },
  door:      { basic: 900000,  standard: 1350000, premium: 2100000 }, // 3개분
  closet:    { basic: 2400000, standard: 3600000, premium: 5600000 }, // 2m
  airconClean:{basic: 200000,  standard: 280000,  premium: 380000 },
  cleanout:  { basic: 1500000, standard: 2200000, premium: 3500000, scaleBy: 'area', scaleBase: 84 },
};
const INTERIOR_LABELS = {
  wallpaper: '도배', floor: '바닥재', paint: '도장', film: '시트지/필름',
  bath: '욕실', bath2: '욕실 추가', kitchen: '주방',
  window: '샷시·창호', balcony: '발코니 확장', tile: '타일',
  lighting: '조명', electric: '전기·콘센트', door: '방문 교체',
  closet: '붙박이장', airconClean: '에어컨', cleanout: '철거·폐기물',
};
const AREA_BASED = new Set(['wallpaper', 'floor', 'paint', 'film']);
const PAINT_RATIO = { paint: 0.6, film: 0.2 }; // 면적 일부만 적용

function calcInteriorEstimate({ area, grade, items }) {
  if (!area || area <= 0) return null;
  const breakdown = [];
  let total = 0;
  items.forEach((key) => {
    const def = INTERIOR_PRICES[key];
    if (!def) return;
    const unit = def[grade];
    let cost;
    if (AREA_BASED.has(key)) {
      const ratio = PAINT_RATIO[key] || 1.0;
      cost = unit * area * ratio;
    } else if (def.scaleBy === 'area') {
      cost = unit * (area / (def.scaleBase || 84));
    } else {
      cost = unit;
    }
    cost = Math.round(cost);
    breakdown.push({ key, label: INTERIOR_LABELS[key] || key, cost });
    total += cost;
  });
  return { total, breakdown };
}

(function () {
  const root = document.querySelector('[data-calc="interior-estimate"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const recalc = () => {
    const area = Number(root.querySelector('[name="area"]').value || 0);
    const grade = root.querySelector('[name="grade"]:checked')?.value || 'basic';
    const items = Array.from(root.querySelectorAll('[name="item"]:checked')).map(el => el.value);
    const r = calcInteriorEstimate({ area, grade, items });
    if (!r) {
      setText('total', fmt.won(0));
      setText('range', '—'); setText('perPyeong', '—');
      const bd = root.querySelector('[data-out="itemBreakdown"]');
      if (bd) bd.innerHTML = '';
      return;
    }
    setText('total', fmt.won(r.total));
    setText('range', fmt.won(r.total * 0.85) + ' ~ ' + fmt.won(r.total * 1.25));
    const pyeong = area / 3.3058;
    setText('perPyeong', pyeong > 0 ? fmt.won(r.total / pyeong) + ' / 평' : '—');
    const bd = root.querySelector('[data-out="itemBreakdown"]');
    if (bd) {
      bd.innerHTML = '';
      r.breakdown.forEach((b) => {
        const row = document.createElement('div');
        row.className = 'row sub';
        row.innerHTML = `<span class="key">${b.label}</span><span class="val">${fmt.won(b.cost)}</span>`;
        bd.appendChild(row);
      });
      if (!r.breakdown.length) {
        bd.innerHTML = '<div class="row sub"><span class="key" style="color:var(--text-subtle)">시공 항목을 선택하세요</span><span class="val"></span></div>';
      }
    }
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();

// ===== Checklist as a service =====
(function () {
  const apps = document.querySelectorAll('[data-cl-app]');
  if (!apps.length) return;

  apps.forEach((app) => {
    const key = 'cl:' + (app.dataset.clApp || location.pathname);
    const noteKey = 'cl-note:' + (app.dataset.clApp || location.pathname);
    let state = {};
    let notes = {};
    try { state = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    try { notes = JSON.parse(localStorage.getItem(noteKey) || '{}'); } catch (e) {}

    const rows = app.querySelectorAll('.cl-row');
    rows.forEach((row) => {
      const cb = row.querySelector('input[type="checkbox"]');
      const ta = row.querySelector('.cl-userNote');
      const id = row.dataset.id;
      if (!id) return;
      if (cb && state[id]) { cb.checked = true; row.classList.add('done'); }
      if (ta && notes[id]) { ta.value = notes[id]; ta.classList.add('has-value'); }
      if (cb) cb.addEventListener('change', () => {
        row.classList.toggle('done', cb.checked);
        state[id] = cb.checked;
        localStorage.setItem(key, JSON.stringify(state));
        updateAll(app);
      });
      if (ta) {
        ta.addEventListener('input', () => {
          notes[id] = ta.value;
          ta.classList.toggle('has-value', !!ta.value.trim());
          localStorage.setItem(noteKey, JSON.stringify(notes));
        });
      }
    });

    // Wire actions
    app.querySelectorAll('[data-cl-action]').forEach((btn) => {
      const action = btn.dataset.clAction;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (action === 'reset') {
          if (!confirm('체크 상태와 메모를 모두 초기화할까요?')) return;
          localStorage.removeItem(key);
          localStorage.removeItem(noteKey);
          rows.forEach((row) => {
            const cb = row.querySelector('input[type="checkbox"]');
            const ta = row.querySelector('.cl-userNote');
            if (cb) cb.checked = false;
            row.classList.remove('done');
            if (ta) { ta.value = ''; ta.classList.remove('has-value'); }
          });
          state = {}; notes = {};
          updateAll(app);
        } else if (action === 'export') {
          const lines = [];
          const title = app.querySelector('[data-cl-title]')?.textContent?.trim() || '체크리스트';
          lines.push(`# ${title}`);
          lines.push(`갱신: ${new Date().toLocaleString('ko-KR')}`);
          lines.push('');
          app.querySelectorAll('.cl-section-title').forEach((h) => {
            lines.push(`\n## ${h.textContent.trim()}`);
            let el = h.nextElementSibling;
            while (el && !el.matches('.cl-section-title')) {
              if (el.matches('.cl-row')) {
                const cb = el.querySelector('input[type="checkbox"]');
                const text = el.querySelector('.cl-text')?.textContent.trim().split('\n')[0] || '';
                const note = el.querySelector('.cl-userNote')?.value?.trim();
                lines.push(`- [${cb?.checked ? 'x' : ' '}] ${text}${note ? '  // ' + note : ''}`);
              }
              el = el.nextElementSibling;
            }
          });
          const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = (app.dataset.clApp || 'checklist') + '.txt';
          a.click();
          URL.revokeObjectURL(url);
        } else if (action === 'print') {
          window.print();
        } else if (action === 'copy') {
          const lines = [];
          rows.forEach((row) => {
            const cb = row.querySelector('input[type="checkbox"]');
            const text = row.querySelector('.cl-text')?.textContent.trim().split('\n')[0] || '';
            lines.push(`${cb?.checked ? '✅' : '⬜'} ${text}`);
          });
          navigator.clipboard?.writeText(lines.join('\n')).then(() => {
            const original = btn.textContent;
            btn.textContent = '복사됨 ✓';
            setTimeout(() => { btn.textContent = original; }, 1500);
          });
        }
      });
    });

    updateAll(app);

    // Active tab on scroll
    const tabs = app.querySelectorAll('.cl-tabs a');
    if (tabs.length) {
      tabs.forEach((tab) => {
        tab.addEventListener('click', (e) => {
          // Native anchor scroll OK; just update active
          tabs.forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
        });
      });
    }
  });

  function updateAll(app) {
    const total = app.querySelectorAll('.cl-row input[type="checkbox"]').length;
    const done = app.querySelectorAll('.cl-row input[type="checkbox"]:checked').length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    // Ring
    const ring = app.querySelector('.cl-ring .fg');
    if (ring) {
      const r = parseFloat(ring.getAttribute('r')) || 60;
      const c = 2 * Math.PI * r;
      ring.setAttribute('stroke-dasharray', c.toFixed(2));
      ring.setAttribute('stroke-dashoffset', (c * (1 - pct / 100)).toFixed(2));
    }
    const pctEl = app.querySelector('.cl-ring .pct');
    if (pctEl) pctEl.textContent = pct + '%';
    const totalEl = app.querySelector('.cl-ring .total');
    if (totalEl) totalEl.textContent = `${done} / ${total}`;

    // Section counts
    app.querySelectorAll('.cl-tabs a').forEach((tab) => {
      const sec = tab.getAttribute('href');
      if (!sec) return;
      const target = app.querySelector(sec);
      if (!target) return;
      let next = target.nextElementSibling;
      let t = 0, d = 0;
      while (next && !next.matches('.cl-section-title')) {
        if (next.matches('.cl-row')) {
          t++;
          if (next.querySelector('input[type="checkbox"]:checked')) d++;
        }
        next = next.nextElementSibling;
      }
      const count = tab.querySelector('.count');
      if (count) count.textContent = `${d}/${t}`;
    });

    // Save into hub stats (cross-page progress)
    try {
      const hub = JSON.parse(localStorage.getItem('cl-hub') || '{}');
      const slug = app.dataset.clApp || location.pathname;
      hub[slug] = { done, total, pct, updated: Date.now() };
      localStorage.setItem('cl-hub', JSON.stringify(hub));
    } catch (e) {}
  }
})();

// ===== Checklist hub progress display =====
(function () {
  const cards = document.querySelectorAll('[data-cl-hub-card]');
  if (!cards.length) return;
  let hub = {};
  try { hub = JSON.parse(localStorage.getItem('cl-hub') || '{}'); } catch (e) {}
  cards.forEach((card) => {
    const slug = card.dataset.clHubCard;
    const data = hub[slug];
    const bar = card.querySelector('[data-cl-hub-bar]');
    const pct = card.querySelector('[data-cl-hub-pct]');
    const stats = card.querySelector('[data-cl-hub-stats]');
    if (data && bar) bar.style.width = data.pct + '%';
    if (data && pct) pct.textContent = data.pct + '%';
    if (data && stats) stats.textContent = `${data.done} / ${data.total} 완료`;
    else if (stats) stats.textContent = '시작 전';
  });
})();

// ===== 여정 로드맵 (checklists/index.html #journey) =====
// 매매/전세 토글 + 단계 클릭으로 '지금 내 단계' 표시(localStorage, 서버 전송 없음).
// 홈 '이어서 하기' 위젯이 이 값을 읽어 재방문 시 이어보기를 제공한다.
(function () {
  const panels = document.querySelectorAll('[data-journey-panel]');
  if (!panels.length) return;
  const KEY = 'topda:journey';
  const params = new URLSearchParams(location.search);

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };

  function setType(type, persist) {
    const t = type === 'lease' ? 'lease' : 'sale';
    document.querySelectorAll('[name="journeyType"]').forEach((el) => { el.checked = el.value === t; });
    panels.forEach((p) => { p.style.display = p.dataset.journeyPanel === t ? '' : 'none'; });
  }
  const initialType = params.get('type') || (read() && read().type) || 'sale';
  setType(initialType);
  document.querySelectorAll('[name="journeyType"]').forEach((el) => {
    el.addEventListener('change', () => setType(el.value));
  });

  function applyCurrent() {
    const cur = read();
    document.querySelectorAll('.timeline li[data-stage]').forEach((li) => {
      li.classList.toggle('is-current', !!(cur && li.dataset.stage === cur.id));
    });
  }
  document.querySelectorAll('.timeline li[data-stage]').forEach((li) => {
    li.addEventListener('click', (e) => {
      if (e.target.closest('a, .tip')) return; // 링크·툴팁 클릭은 단계 표시로 취급하지 않음
      const cur = read();
      const id = li.dataset.stage;
      const label = (li.querySelector('.t-what')?.textContent || '').split('—')[0].trim() || li.querySelector('.t-when')?.textContent || '';
      const panel = li.closest('[data-journey-panel]');
      if (cur && cur.id === id) {
        localStorage.removeItem(KEY);
      } else {
        try {
          localStorage.setItem(KEY, JSON.stringify({
            id, label, type: panel ? panel.dataset.journeyPanel : 'sale', updated: Date.now(),
          }));
        } catch (e) {}
      }
      applyCurrent();
    });
  });
  applyCurrent();

  if (location.hash) {
    const el = document.querySelector(location.hash);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }
})();

// ===== Site-wide accessibility + SEO enhancements =====
// 모든 페이지에서 app.js가 로드되므로 한 곳에서 일괄 적용한다.
// 1) 접근성: 본문 바로가기 링크, 장식용 아이콘 aria-hidden, main 랜드마크 보강
// 2) SEO: canonical, Open Graph/Twitter 메타, JSON-LD 구조화 데이터 자동 주입
(function () {
  try {
    const head = document.head;
    const lang = (document.documentElement.lang || 'ko').toLowerCase();
    const pageLang = document.documentElement.lang || 'ko';
    // 한국어 외 모든 언어판은 비-국문(영문 UI 문구·국제 로케일)로 처리
    const isEnPage = !lang.startsWith('ko');
    // 페이지 식별자(관리자 편집 오버라이드 스코프·분석용)
    document.documentElement.setAttribute('data-topda-page', location.pathname);

    // ---------- 분석 도구 ----------
    // GA4·네이버 애널리틱스는 assets/analytics.js에서 일괄 로드한다(전 페이지 정적 포함).
    // 측정 ID도 그 파일 한 곳에서만 교체하면 된다. 여기서는 중복 로드하지 않는다.

    // ---------- 접근성 ----------
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'main';
    if (main && !document.querySelector('.skip-link')) {
      const skip = document.createElement('a');
      skip.className = 'skip-link';
      skip.href = '#' + (main.id || 'main');
      skip.textContent = isEnPage ? 'Skip to content' : '본문 바로가기';
      document.body.insertBefore(skip, document.body.firstChild);
    }
    // 장식용 텍스트 아이콘(⚠, i, ! 등)은 보조공학에 읽히지 않도록 숨김
    document.querySelectorAll('.callout > .icon, .source-icon').forEach((el) => {
      if (!el.hasAttribute('aria-hidden')) el.setAttribute('aria-hidden', 'true');
    });
    // aria-label/title 없는 순수 장식 svg 보강
    document.querySelectorAll('svg:not([aria-label]):not([aria-hidden]):not([role="img"])').forEach((svg) => {
      if (!svg.querySelector('title')) svg.setAttribute('aria-hidden', 'true');
    });

    // ---------- SEO ----------
    const canonicalUrl = location.origin + location.pathname;
    const ensureMeta = (sel, create) => {
      if (head.querySelector(sel)) return;
      head.appendChild(create());
    };
    const metaProp = (prop, content) => {
      if (!content) return;
      ensureMeta(`meta[property="${prop}"]`, () => {
        const m = document.createElement('meta');
        m.setAttribute('property', prop); m.setAttribute('content', content); return m;
      });
    };
    const metaName = (name, content) => {
      if (!content) return;
      ensureMeta(`meta[name="${name}"]`, () => {
        const m = document.createElement('meta');
        m.setAttribute('name', name); m.setAttribute('content', content); return m;
      });
    };

    // canonical
    if (!head.querySelector('link[rel="canonical"]')) {
      const link = document.createElement('link');
      link.rel = 'canonical'; link.href = canonicalUrl;
      head.appendChild(link);
    }

    // hreflang: 확실한 KR↔EN 1:1 대응 페이지에만 적용
    (function () {
      const pairs = [
        ['index.html', 'en/index.html'],
        ['guides.html', 'en/guides.html'],
        ['about.html', 'en/about.html'],
        ['feedback.html', 'en/feedback.html'],
        ['calculators/index.html', 'en/calculators/index.html'],
        ['calculators/acquisition-tax.html', 'en/calculators/acquisition-tax.html'],
        ['calculators/brokerage-fee.html', 'en/calculators/brokerage-fee.html'],
        ['calculators/jeonse-monthly.html', 'en/calculators/jeonse-monthly.html'],
        ['calculators/auction-bid.html', 'en/calculators/auction-bid.html'],
        ['calculators/transfer-tax.html', 'en/calculators/transfer-tax.html'],
        ['calculators/balance-settlement.html', 'en/calculators/balance-settlement.html'],
        ['calculators/total-cost-dashboard.html', 'en/calculators/total-cost-dashboard.html'],
      ].sort((a, b) => b[0].length - a[0].length);
      let path = location.pathname;
      if (path.endsWith('/')) path += 'index.html';
      let koUrl = null, enUrl = null;
      if (path.includes('/en/')) {
        for (const [ko, en] of pairs) {
          if (path.endsWith('/' + en)) {
            enUrl = location.origin + path;
            koUrl = location.origin + path.slice(0, path.length - en.length) + ko;
            break;
          }
        }
      } else {
        for (const [ko, en] of pairs) {
          if (path.endsWith('/' + ko)) {
            koUrl = location.origin + path;
            enUrl = location.origin + path.slice(0, path.length - ko.length) + en;
            break;
          }
        }
      }
      if (koUrl && enUrl) {
        const addAlt = (hl, href) => {
          if (head.querySelector(`link[rel="alternate"][hreflang="${hl}"]`)) return;
          const l = document.createElement('link');
          l.rel = 'alternate'; l.hreflang = hl; l.href = href;
          head.appendChild(l);
        };
        addAlt('ko', koUrl);
        addAlt('en', enUrl);
        addAlt('x-default', koUrl);
      }
    })();

    const title = document.title || '톺다';
    const descEl = head.querySelector('meta[name="description"]');
    const desc = descEl ? descEl.getAttribute('content') : '';
    const isPost = location.pathname.includes('/posts/');
    const isCalc = location.pathname.includes('/calculators/');

    // Open Graph / Twitter
    metaProp('og:site_name', '톺다');
    metaProp('og:title', title);
    metaProp('og:description', desc);
    metaProp('og:type', isPost ? 'article' : 'website');
    metaProp('og:url', canonicalUrl);
    metaProp('og:locale', isEnPage ? 'en_US' : 'ko_KR');
    metaName('twitter:card', 'summary');
    metaName('twitter:title', title);
    metaName('twitter:description', desc);

    // JSON-LD 구조화 데이터
    // 정적 HTML에 이미 JSON-LD가 포함된 페이지(대부분)에서는 중복을 피하기 위해 건너뛴다.
    // 정적 블록이 없는 페이지에 한해 폴백으로 동작한다.
    const hasStaticLd = !!head.querySelector('script[type="application/ld+json"]');
    const addJsonLd = (obj) => {
      if (hasStaticLd) return;
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.textContent = JSON.stringify(obj);
      head.appendChild(s);
    };

    // 홈: WebSite + Organization
    const isHome = !!document.querySelector('.home-intro, .cat-tile-grid');
    if (isHome) {
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: '톺다',
        url: location.origin + location.pathname.replace(/index\.html$/, ''),
        description: desc,
      });
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '톺다',
        inLanguage: pageLang,
        url: location.origin + location.pathname.replace(/index\.html$/, ''),
      });
    }

    // 브레드크럼 → BreadcrumbList
    const crumb = document.querySelector('.breadcrumb');
    if (crumb) {
      const items = [];
      let pos = 1;
      crumb.querySelectorAll('a').forEach((a) => {
        items.push({ '@type': 'ListItem', position: pos++, name: a.textContent.trim(), item: a.href });
      });
      // 마지막(현재 페이지) 텍스트 노드
      const lastText = (crumb.textContent.split('/').pop() || '').trim();
      if (lastText) items.push({ '@type': 'ListItem', position: pos++, name: lastText, item: canonicalUrl });
      if (items.length > 1) {
        addJsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items });
      }
    }

    // 계산기 → SoftwareApplication
    if (isCalc) {
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: title.replace(/\s*[—-]\s*톺다.*$/, '').trim(),
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        url: canonicalUrl,
        description: desc,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
      });
    }

    // 글 → Article
    if (isPost) {
      const h1 = document.querySelector('h1');
      addJsonLd({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: (h1 ? h1.textContent : title).trim().slice(0, 110),
        inLanguage: pageLang,
        description: desc,
        url: canonicalUrl,
        author: { '@type': 'Organization', name: '톺다' },
        publisher: { '@type': 'Organization', name: '톺다' },
      });
    }
  } catch (e) { /* 보강 실패는 페이지 동작에 영향 없음 */ }
})();

// ===== 계산기 '다음 단계' 흐름 자동 주입 =====
// 정적으로 블록을 넣지 않은 계산기 페이지에도 관련 도구·체크리스트로 이어지는
// 행동 흐름을 일괄 제공한다(전환성 강화). 한국어 계산기 페이지에만 적용.
(function () {
  try {
    if (!location.pathname.includes('/calculators/')) return;
    if (location.pathname.includes('/en/')) return;
    if (document.querySelector('.next-actions')) return; // 이미 존재하면 건너뜀
    const file = (location.pathname.split('/').pop() || '').toLowerCase();

    const MAP = {
      'acquisition-tax.html': [
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '취득세 포함 총 매수 비용을 한눈에'],
        ['dsr.html', '대출', 'DSR 한도 점검', '소득 대비 대출 한도 확인'],
        ['../checklists/sale-balance-day.html', '점검', '잔금일 체크리스트', '등기·정산 누락 방지'],
      ],
      'transfer-tax.html': [
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '매도 시나리오로 전체 비교'],
        ['brokerage-fee.html', '비용', '중개수수료 계산', '매도 시 부담 비용 확인'],
        ['acquisition-tax.html', '세금', '취득세 계산', '갈아타기 시 매수 비용까지'],
      ],
      'brokerage-fee.html': [
        ['acquisition-tax.html', '세금', '취득세 계산', '매수 시 총 세금 확인'],
        ['../checklists/sale-balance-day.html', '점검', '잔금일 체크리스트', '수수료 지급 시점 점검'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '전체 거래비용 비교'],
      ],
      'balance-settlement.html': [
        ['../checklists/sale-balance-day.html', '점검', '잔금일 체크리스트', '정산 항목 빠짐없이'],
        ['acquisition-tax.html', '세금', '취득세 계산', '잔금일 납부 세액 확인'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '총 비용으로 마무리'],
      ],
      'loan-compare.html': [
        ['dsr.html', '대출', 'DSR 한도 점검', '상환액이 한도 내인지 확인'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '대출 포함 총비용 비교'],
        ['acquisition-tax.html', '세금', '취득세 계산', '매수 부대비용 확인'],
      ],
      'jeonse-monthly.html': [
        ['brokerage-fee.html', '비용', '중개수수료 계산', '전·월세 중개보수 확인'],
        ['../checklists/lease-contract.html', '점검', '전세계약 체크리스트', '보증금 지키는 3종 세트'],
        ['dsr.html', '대출', 'DSR 한도 점검', '전세자금 한도 가늠'],
      ],
      'housing-subscription.html': [
        ['dsr.html', '대출', 'DSR 한도 점검', '당첨 후 자금 계획'],
        ['acquisition-tax.html', '세금', '취득세 계산', '분양가 기준 취득세'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '입주까지 총비용'],
      ],
      'interior-estimate.html': [
        ['../checklists/interior-contract.html', '점검', '인테리어 계약 체크리스트', '견적·표준계약·하자'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '리모델링 포함 자금 계획'],
        ['balance-settlement.html', '정산', '잔금일 정산 계산', '입주 전 정산 점검'],
      ],
      'auction-bid.html': [
        ['acquisition-tax.html', '세금', '취득세 계산', '낙찰 후 취득세 확인'],
        ['dsr.html', '대출', 'DSR 한도 점검', '경락잔금대출 가늠'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '총 부담액 종합 점검'],
      ],
      'search.html': [
        ['acquisition-tax.html', '세금', '취득세 계산', '마음에 든 단지 매수 시 세금'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '매수 총비용 계산'],
        ['loan-limit.html', '대출', '대출 한도 시뮬레이터', '실제 받을 수 있는 한도'],
      ],
      'loan-limit.html': [
        ['dsr.html', '대출', 'DSR 한도 계산', 'DSR만 따로 점검'],
        ['acquisition-tax.html', '세금', '취득세 계산', '매수 부대비용 확인'],
        ['total-cost-dashboard.html', '종합', '종합 비용 대시보드', '대출 포함 총비용'],
      ],
    };

    const items = MAP[file];
    if (!items) return;

    const sec = document.createElement('section');
    sec.className = 'next-actions';
    sec.innerHTML = '<div class="next-actions-head">계산 후 다음 단계</div>' +
      '<div class="next-actions-grid">' +
      items.map(([href, step, title, desc]) =>
        `<a class="next-action" href="${href}">` +
        `<span class="na-step">${step}</span>` +
        `<span class="na-title">${title}</span>` +
        `<span class="na-desc">${desc}</span>` +
        `<span class="na-go">바로가기 →</span></a>`
      ).join('') +
      '</div>';

    const anchor = document.querySelector('.calc-layout');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor.nextSibling);
    else {
      const main = document.querySelector('main');
      if (main) main.appendChild(sec);
    }
  } catch (e) { /* noop */ }
})();

// ===== 관리자 편집 도구 조건부 로더 =====
// 일반 방문자에게는 admin.js를 아예 내려받지 않게 한다.
// 활성 조건: (1) 이전에 로그인해 둔 경우, (2) URL에 ?admin/#admin,
//           (3) 우하단 코너의 숨은 진입 버튼 클릭 (크롬 단축키 충돌 회피)
(function () {
  try {
    function assetBase() {
      const cur = document.querySelector('script[src*="app.js"]');
      const src = cur ? cur.getAttribute('src') : 'assets/app.js';
      return src.replace(/app\.js(\?.*)?$/, '');
    }
    let loaded = false;
    function loadAdmin() {
      if (loaded) return;
      loaded = true;
      const s = document.createElement('script');
      s.src = assetBase() + 'admin.js';
      document.body.appendChild(s);
    }
    const authed = (function () { try { return localStorage.getItem('topda_admin') === '1'; } catch (e) { return false; } })();
    if (authed || /[?#]admin\b/.test(location.href)) {
      loadAdmin();
    } else {
      // 숨은 진입 버튼: 우하단 코너의 작은 점. 평소엔 흐릿, 마우스 오버 시 또렷.
      const hint = document.createElement('button');
      hint.id = 'topda-enter';
      hint.type = 'button';
      hint.setAttribute('aria-label', '관리자 진입');
      hint.title = '관리자 편집';
      hint.tabIndex = -1;
      hint.style.cssText = 'position:fixed;right:10px;bottom:10px;width:26px;height:26px;padding:0;z-index:99998;'
        + 'display:flex;align-items:center;justify-content:center;border-radius:50%;'
        + 'background:#0f172a;border:0;cursor:pointer;opacity:0.22;transition:opacity .15s,transform .15s;';
      hint.innerHTML = '<span style="display:block;width:11px;height:11px;border-radius:50%;border:2px solid #fff"></span>';
      hint.addEventListener('mouseenter', function () { hint.style.opacity = '0.85'; hint.style.transform = 'scale(1.1)'; });
      hint.addEventListener('mouseleave', function () { hint.style.opacity = '0.22'; hint.style.transform = 'none'; });
      hint.addEventListener('click', function () { hint.remove(); loadAdmin(); });
      (document.body || document.documentElement).appendChild(hint);
    }
  } catch (e) { /* noop */ }
})();


// ===== 도움말 툴팁 (?) — 클릭/터치 토글 (hover는 CSS가 처리) =====
(function () {
  document.addEventListener('click', function (e) {
    var tip = e.target.closest ? e.target.closest('.tip') : null;
    document.querySelectorAll('.tip.open').forEach(function (t) { if (t !== tip) t.classList.remove('open'); });
    if (tip) { e.preventDefault(); e.stopPropagation(); tip.classList.toggle('open'); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tip')) {
      e.preventDefault(); e.target.classList.toggle('open');
    }
  });
})();


// ===== 계산기: 입력값 복원(URL·localStorage) + 결과 공유 + 인쇄/PDF + aria-live =====
// HTML 수정 없이 모든 계산기에 적용된다.
//  - 우선순위: URL 쿼리파라미터(공유 링크) > localStorage(지난 방문) > 페이지 기본값
//  - '결과 링크 복사' 버튼: 현재 입력값을 URL 파라미터로 인코딩해 클립보드 복사
//  - '인쇄 / PDF' 버튼: window.print() (전용 인쇄 CSS로 계산 영역만 깔끔하게 출력)
//  - 결과 총액 영역에 aria-live 부여 (WCAG 2.2)
//  - 입력값은 클라이언트(로컬·URL)에만 존재하며 서버로 전송하지 않는다.
(function () {
  'use strict';

  const lang = (document.documentElement.lang || 'ko').toLowerCase();
  const isEn = lang.startsWith('en');
  const T = isEn
    ? { copy: '🔗 Copy result link', print: '🖨 Print / PDF', copied: 'Link copied', copyFail: 'Copy failed — link shown for manual copy' }
    : { copy: '🔗 결과 링크 복사', print: '🖨 인쇄 / PDF', copied: '링크가 복사되었습니다', copyFail: '복사 실패 — 링크를 직접 복사하세요' };

  // 인쇄 트리거(기본은 단순 print, wirePrint에서 '보고서 생성 후 인쇄'로 교체).
  // beforeprint가 발생하지 않는 모바일 브라우저 대응의 핵심.
  let triggerPrint = function () { try { window.print(); } catch (e) {} };

  const nameOf = (el) => el.name || el.id;
  const fieldsIn = (scope) => Array.from(scope.querySelectorAll('input[name], input[id], select[name], select[id]'))
    .filter((el) => el.type !== 'button' && el.type !== 'submit' && el.type !== 'file');
  const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');

  // 결과 영역의 입력 범위(폼) 찾기: 대시보드는 [data-calc] 내부, 일반 계산기는 .calc-layout 형제
  function scopeFor(resultEl) {
    return resultEl.closest('[data-calc]') || resultEl.closest('.calc-layout') || document;
  }

  function applyValue(el, v) {
    if (el.type === 'checkbox') el.checked = (v === '1' || v === 'true' || v === true);
    else if (el.type === 'radio') el.checked = (el.value === String(v));
    else el.value = v;
  }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- 결과 영역 aria-live (접근성) ----
  function markLive() {
    document.querySelectorAll('.calc-result .total, [data-out="primaryTotal"], #rc-total').forEach((el) => {
      if (!el.hasAttribute('aria-live')) {
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('role', 'status');
      }
    });
  }

  // ---- 토스트 ----
  let toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'calc-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  // ---- 실거래가 페이지(/apt/...)에서 넘어온 프리필 ----
  // 단지 페이지의 '이 거래가격으로 계산' 링크가 ?price=…&source=apt 로 값을 넘긴다.
  // 계산식은 건드리지 않고 입력값만 채우되, 외부에서 온 값이므로 범위를 검증한다.
  //
  // 파라미터 이름 주의: 지역·면적은 region/area가 아니라 region_name/area_m2로 받는다.
  // region은 loan-limit·registration-cost의 '규제지역' 라디오 name과, area는
  // interior-estimate의 면적 입력 name과 같아, 그대로 쓰면 프리필이 그 필드를 잘못 건드린다.
  const PREFILL_LIMITS = { price: [1e6, 1e12], std: [1e5, 1e12] };  // 원 단위

  function sanitizeParams(params) {
    Object.keys(PREFILL_LIMITS).forEach((k) => {
      if (!params.has(k)) return;
      const n = Number(String(params.get(k)).replace(/[^0-9.]/g, ''));
      const lim = PREFILL_LIMITS[k];
      if (!isFinite(n) || n < lim[0] || n > lim[1]) params.delete(k);   // 비정상 값은 무시
      else params.set(k, String(Math.round(n)));
    });
    return params;
  }

  function prefillBanner(params) {
    if (params.get('source') !== 'apt') return;
    const form = document.querySelector('.calc-form, [data-calc]');
    if (!form || document.querySelector('[data-prefill-banner]')) return;
    const name = (params.get('complex') || '').slice(0, 40);
    const price = Number(params.get('price') || 0);
    // price가 sanitizeParams에서 걸러졌으면(범위 밖·비숫자) 아무것도 채워지지 않았으므로
    // 배너를 띄우지 않는다 — 안 채운 값을 채웠다고 말하면 안 된다.
    if (!price) return;

    const eok = price / 100000000;
    const money = eok >= 1
      ? eok.toFixed(eok >= 10 ? 1 : 2).replace(/\.?0+$/, '') + '억원'
      : Math.round(price / 10000).toLocaleString() + '만원';
    const area = params.get('area_m2');
    const what = [name, area ? '전용 ' + area + '㎡' : ''].filter(Boolean).join(' ');
    const box = document.createElement('div');
    box.className = 'calc-prefill';
    box.setAttribute('data-prefill-banner', '');
    box.innerHTML =
      '<strong>' + (what || '선택한 단지') + '</strong>의 최근 실거래가 '
      + '<strong>' + money + '</strong>이 입력되었습니다. '
      + '주택 수·조정대상지역·소득 등 나머지 조건은 직접 확인하고 조정하세요. '
      + '<a href="' + (params.get('back') || '/apt/') + '">← 단지 페이지로</a>';
    form.parentNode.insertBefore(box, form);
    if (window.topdaTrack) {
      window.topdaTrack('calculator_prefill_loaded', {
        calculator_type: location.pathname.split('/').pop().replace('.html', ''),
        complex: name, region: params.get('region_name') || '',
        source_page: 'apt', prefill_used: true
      });
    }
  }

  // ---- 입력값 저장/복원 + 공유/인쇄 툴바 ----
  function setup() {
    const params = sanitizeParams(new URLSearchParams(location.search));
    prefillBanner(params);

    // 1) 폼 단위 저장/복원 (URL > localStorage)
    const forms = document.querySelectorAll('.calc-form, [data-calc]');
    forms.forEach((form, idx) => {
      const key = 'calc:' + location.pathname + ':' + idx;
      const fields = fieldsIn(form);
      if (!fields.length) return;

      // 대시보드 시나리오 탭 복원(필드 적용 전에 패널 전환)
      if (params.has('scn')) {
        const tab = form.querySelector('[data-scn="' + esc(params.get('scn')) + '"]')
          || document.querySelector('[data-scn="' + esc(params.get('scn')) + '"]');
        if (tab) tab.click();
      }

      const urlHasAny = fields.some((el) => params.has(nameOf(el)));
      const touched = new Set();
      if (urlHasAny) {
        fields.forEach((el) => { const n = nameOf(el); if (params.has(n)) { applyValue(el, params.get(n)); touched.add(el); } });
      } else {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { saved = null; }
        if (saved && typeof saved === 'object') {
          fields.forEach((el) => { const n = nameOf(el); if (n in saved) { applyValue(el, saved[n]); touched.add(el); } });
        }
      }
      // 라디오 선택지 값이 바뀐 뒤(예: 지역 구분 세분화) 저장된 옛 값은 어느 라디오와도
      // 맞지 않아 그룹 전체가 선택 해제된 채 남는다. 그러면 화면상 아무것도 안 골라진
      // 상태가 되고 계산은 코드 기본값으로 조용히 넘어간다. 매칭이 하나도 없으면
      // 페이지가 정한 기본값(checked 속성)으로 되돌린다.
      const radioGroups = new Set();
      touched.forEach((el) => { if (el.type === 'radio' && el.name) radioGroups.add(el.name); });
      radioGroups.forEach((name) => {
        const group = Array.from(form.querySelectorAll('input[type="radio"][name="' + esc(name) + '"]'));
        if (group.length && !group.some((el) => el.checked)) {
          const fallback = group.find((el) => el.defaultChecked) || group[0];
          fallback.checked = true;
          touched.add(fallback);
        }
      });

      touched.forEach(fire);

      // 저장 (디바운스)
      let t = null;
      const save = () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          const data = {};
          fields.forEach((el) => {
            const n = nameOf(el);
            if (!n) return;
            if (el.type === 'checkbox') data[n] = el.checked;
            else if (el.type === 'radio') { if (el.checked) data[n] = el.value; }
            else data[n] = el.value;
          });
          try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
        }, 250);
      };
      form.addEventListener('input', save);
      form.addEventListener('change', save);
    });

    // 2) 결과 영역마다 공유/인쇄 툴바 주입
    document.querySelectorAll('.calc-result').forEach((result) => {
      if (result.querySelector('[data-calc-share]')) return;
      const scope = scopeFor(result);
      const bar = document.createElement('div');
      bar.className = 'calc-share';
      bar.setAttribute('data-calc-share', '');
      const shareBtn = document.createElement('button');
      shareBtn.type = 'button'; shareBtn.className = 'calc-share-btn'; shareBtn.textContent = T.copy;
      const printBtn = document.createElement('button');
      printBtn.type = 'button'; printBtn.className = 'calc-share-btn'; printBtn.textContent = T.print;
      bar.appendChild(shareBtn); bar.appendChild(printBtn);
      result.appendChild(bar);

      shareBtn.addEventListener('click', () => {
        const url = buildShareUrl(scope);
        if (window.topdaTrack) window.topdaTrack('share_click', { page: location.pathname });
        copyToClipboard(url);
      });
      printBtn.addEventListener('click', () => {
        if (window.topdaTrack) window.topdaTrack('print_click', { page: location.pathname });
        triggerPrint();
      });
    });

    wireNextStepPrefill();
    wirePrint();
  }

  function serializeParams(scope) {
    const p = new URLSearchParams();
    fieldsIn(scope).forEach((el) => {
      const n = nameOf(el);
      if (!n) return;
      if (el.type === 'checkbox') p.set(n, el.checked ? '1' : '0');
      else if (el.type === 'radio') { if (el.checked) p.set(n, el.value); }
      else if (el.value !== '') p.set(n, el.value);
    });
    const scn = document.querySelector('[data-scn].active');
    if (scn) p.set('scn', scn.dataset.scn);
    return p;
  }

  function buildShareUrl(scope) {
    return location.origin + location.pathname + '?' + serializeParams(scope).toString();
  }

  // 계산기 간 연동: '다음 단계' 링크에 현재 입력값을 실어 보내 대상 계산기를 프리필한다.
  // (대상은 #27 URL 복원 로직으로 자기 필드명과 일치하는 값만 적용 — 나머지는 무시)
  function wireNextStepPrefill() {
    const scope = document.querySelector('[data-calc]') || document.querySelector('.calc-layout');
    if (!scope) return;
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a.next-action, a[data-prefill]');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const base = href.split('?')[0];
      if (!/\.html$/.test(base)) return;       // 계산기 페이지 링크만
      if (href.includes('?')) return;          // 이미 파라미터가 있으면 건드리지 않음
      if (href.includes('/checklists/')) return;
      const qs = serializeParams(scope).toString();
      if (qs) a.setAttribute('href', base + '?' + qs);
    }, true);
  }

  // ===== 인쇄 / PDF: 입력+결과를 한 장짜리 전문 보고서로 출력 =====
  // 버튼 클릭과 브라우저 Ctrl+P 모두 beforeprint에서 보고서를 생성하고 afterprint에서 정리한다.
  function wirePrint() {
    const result = document.querySelector('.calc-result');
    if (!result) return;                 // 계산기 페이지에만 적용
    const scope = scopeFor(result);
    let reportEl = null;
    const teardown = () => {
      document.body.classList.remove('printing-report');
      if (reportEl && reportEl.parentNode) reportEl.parentNode.removeChild(reportEl);
      reportEl = null;
    };
    const build = () => {
      teardown();
      reportEl = buildPrintReport(scope, result);
      if (reportEl) { document.body.appendChild(reportEl); document.body.classList.add('printing-report'); }
    };
    // 데스크톱: 브라우저 인쇄(Ctrl+P)도 보고서로 출력
    window.addEventListener('beforeprint', build);
    window.addEventListener('afterprint', teardown);

    // 버튼/모바일: beforeprint가 발생하지 않는 환경을 위해 직접 보고서를 만든 뒤 인쇄한다.
    // (#print-report는 화면에서 항상 숨김이라 미리 만들어도 화면엔 영향이 없다)
    triggerPrint = function () {
      build();
      const go = function () {
        window.addEventListener('afterprint', teardown, { once: true });
        // 모바일은 afterprint가 안 뜰 수 있어 복귀 시점(focus)에 정리 + 안전장치 타이머
        setTimeout(function () { window.addEventListener('focus', teardown, { once: true }); }, 500);
        setTimeout(teardown, 30000);
        try { window.print(); } catch (e) { teardown(); }
      };
      // PC에서 보고서의 도넛(data URL 이미지)이 그려지기 전에 동기 인쇄가 시작돼
      // 차트가 비던 문제 → 이미지가 디코딩된 뒤에 인쇄한다.
      const img = reportEl && reportEl.querySelector('img.pr-chart');
      if (img) {
        let started = false;
        const once = function () { if (started) return; started = true; go(); };
        if (img.decode) { img.decode().then(once, once); }
        else if (img.complete) { once(); }
        else { img.addEventListener('load', once); img.addEventListener('error', once); }
        setTimeout(once, 700); // 안전장치
      } else {
        go();
      }
    };
  }

  const cleanText = (el) => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('.tip, .note, .hint, .eok-hint').forEach((x) => x.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').replace(/\?$/, '').trim();
  };

  function collectInputs(scope) {
    const rows = [];
    const scn = document.querySelector('[data-scn].active');
    if (scn) rows.push(['시나리오', cleanText(scn)]);
    scope.querySelectorAll('.field').forEach((field) => {
      if (field.offsetParent === null) return;          // 숨겨진(비활성 시나리오) 필드 제외
      const radios = field.querySelectorAll('input[type="radio"]');
      const checks = field.querySelectorAll('input[type="checkbox"]');
      const free = field.querySelector('input[type="text"], input[type="number"], select');
      let label = '', value = '';
      if (checks.length) {
        const c = checks[0];
        label = cleanText(field.querySelector('.text') || field.querySelector('label'));
        if (!c.checked) return;                          // 체크된 항목만 표기
        value = '예';
      } else if (radios.length) {
        label = cleanText(field.querySelector('label'));
        const c = field.querySelector('input[type="radio"]:checked');
        value = c ? cleanText(c.closest('label')) : '';
      } else if (free) {
        label = cleanText(field.querySelector('label'));
        value = (free.value || '').trim();
        if (free.tagName === 'SELECT' && free.selectedOptions[0]) value = free.selectedOptions[0].textContent.trim();
        const suffix = (field.querySelector('.input-suffix') || {}).getAttribute && field.querySelector('.input-suffix').getAttribute('data-suffix');
        if (value && suffix) value += suffix;
      }
      if (label && value !== '') rows.push([label, value]);
    });
    return rows;
  }

  function collectResults(result) {
    const rows = [];
    result.querySelectorAll('.breakdown .row').forEach((r) => {
      const k = r.querySelector('.key'), v = r.querySelector('.val');
      if (k && v) rows.push([cleanText(k), cleanText(v), r.classList.contains('sub') || r.classList.contains('divider')]);
    });
    const totalEl = result.querySelector('.total');
    const titleEl = result.querySelector('[data-scn-result-title]') || result.querySelector('h3');
    // DSR / RTI 박스(보이는 것만)
    const meters = [];
    result.querySelectorAll('.dsr-box').forEach((box) => {
      if (box.hidden || box.offsetParent === null) return;
      const head = cleanText(box.querySelector('.dsr-box-head strong'));
      const pct = cleanText(box.querySelector('.dsr-pct'));
      const verdict = cleanText(box.querySelector('.dsr-verdict'));
      if (head) meters.push([head, pct, verdict]);
    });
    return {
      title: titleEl ? cleanText(titleEl) : '계산 결과',
      total: totalEl ? cleanText(totalEl) : '',
      rows: rows,
      meters: meters,
    };
  }

  function buildPrintReport(scope, result) {
    const title = (document.title || '톺다').replace(/\s*[—-]\s*톺다.*$/, '').replace(/\s*[—-]\s*TOPDA.*$/, '').trim();
    const inputs = collectInputs(scope);
    const res = collectResults(result);
    const today = new Date();
    const ymd = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

    // 차트 이미지 — Chart.js 인스턴스의 toBase64Image()를 우선 사용(빈 캡처 방지),
    // 없으면 canvas.toDataURL()로 폴백. (인쇄 시 도넛이 누락되던 문제 해결)
    let chartImg = '';
    const canvas = scope.querySelector('canvas') || document.querySelector('.calc-result canvas');
    let dataUrl = window.__topdaChartImg || '';   // 미리 캐시해 둔 이미지 우선 사용
    if (!dataUrl && canvas) {
      try {
        const inst = (window.Chart && Chart.getChart) ? Chart.getChart(canvas) : null;
        if (inst && inst.toBase64Image) dataUrl = inst.toBase64Image('image/png', 1);
        else if (canvas.width > 0) dataUrl = canvas.toDataURL('image/png');
      } catch (e) { dataUrl = ''; }
    }
    if (dataUrl) chartImg = '<img class="pr-chart" alt="구성 차트" src="' + dataUrl + '" />';

    const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    const inputRows = inputs.map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('');
    const resultRows = res.rows.map(([k, v, sub]) =>
      '<tr class="' + (sub ? 'sub' : '') + '"><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>').join('');
    const meterRows = res.meters.map(([h, p, vd]) =>
      '<div class="pr-meter"><strong>' + esc(h) + '</strong> <span>' + esc(p) + '</span><div class="pr-meter-v">' + esc(vd) + '</div></div>').join('');

    const wrap = document.createElement('div');
    wrap.id = 'print-report';
    wrap.innerHTML =
      '<div class="pr-head"><span class="pr-brand"><img class="pr-logo" alt="" src="https://topda.kr/assets/images/brand/logo.png" />톺다 · 부동산 계산 보고서</span><span class="pr-date">' + ymd + '</span></div>'
      + '<h1 class="pr-title">' + esc(title) + '</h1>'
      + '<div class="pr-cols">'
      + '  <section class="pr-block"><h2>입력 요약</h2><table class="pr-table">' + (inputRows || '<tr><td>—</td></tr>') + '</table></section>'
      + '  <section class="pr-block"><h2>계산 결과</h2>'
      + (res.total ? '<div class="pr-total"><span>' + esc(res.title) + '</span><strong>' + esc(res.total) + '</strong></div>' : '')
      + chartImg
      + '<table class="pr-table">' + resultRows + '</table>'
      + meterRows
      + '  </section>'
      + '</div>'
      + '<div class="pr-foot">본 보고서는 일반 정보 제공용 추정치입니다. 실제 세액·대출 한도는 과세관청 판단·금융기관 심사·개인별 조건에 따라 달라질 수 있습니다. · 톺다 topda.kr</div>';
    return wrap;
  }

  function copyToClipboard(text) {
    const done = () => toast(T.copied);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast(T.copied);
    } catch (e) {
      toast(T.copyFail);
      window.prompt(T.copyFail, text);
    }
  }

  function init() {
    markLive();
    // 각 계산기의 자체 초기화(인라인 스크립트)가 끝난 뒤 복원하도록 한 틱 양보
    requestAnimationFrame(() => { try { setup(); } catch (e) {} });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ===== 대출 한도 시뮬레이터 (주택담보대출 / 전세대출) =====
// 주담대 한도 = min( LTV한도, 수도권·규제지역 가격대별 한도, DSR한도 )
//  - LTV한도 = 주택가격 × LTV%
//  - 가격대별 한도(6.27/10.15 대책, 수도권·규제지역 구입자금): 15억↓ 6억 / 15~25억 4억 / 25억↑ 2억
//  - DSR한도 = (연소득×DSR% − 기존 연원리금)을 스트레스 금리·만기로 역산한 대출원금
//
// ⚠ 지역은 3분류다(2026-08-02 정정). 「규제지역·수도권 / 비규제」 2분류로 묶으면
//    수도권 비규제지역이 규제지역과 같은 LTV 40%를 쓰거나(과소), 반대로 지방 비규제지역에
//    가격대별 한도·스트레스 3.0%p가 붙는(과대) 오류가 난다.
//      metroNonRegulated      수도권 비규제: LTV 70% · 가격대별 한도 O · 스트레스 3.0%p
//      regulated              규제지역:     LTV 40% · 가격대별 한도 O · 스트레스 3.0%p
//      provincialNonRegulated 지방 비규제:  LTV 70% · 가격대별 한도 X · 스트레스 0.75%p
// 출처: 금융위 가계부채 관리 강화 방안(2025.6.27)·대출수요 관리 방안(2025.10.15)·스트레스 DSR 3단계.
//       값은 rates.js에서 갱신.

function loanRatesCfg() {
  return (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.loan) || {};
}

// DSR 규정 블록 (적용 대상 요건 포함)
function RATES_DSR() {
  return (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.dsr) || {};
}

// 지역 키 정규화 — 구 값('regulated'/'non')과 boolean regulatedMetro도 받아준다.
//  ⚠ 매핑 표를 파일 상단 스코프의 const로 두면 안 된다. 종합계산기 IIFE가 이 파일 중간에서
//    즉시 실행되며 이 함수를 호출하는데, 그 시점에 아래쪽 const는 아직 TDZ라 예외가 난다
//    (함수 선언만 호이스팅되고 const는 안 된다). 함수 안에 두면 호출 시점에 만들어져 안전하다.
function loanRegionConfig(regionKey) {
  const LEGACY = { regulated: 'regulated', non: 'provincialNonRegulated' };
  const cfg = loanRatesCfg();
  const list = cfg.regions || [];
  const key = LEGACY[regionKey] === undefined ? regionKey : LEGACY[regionKey];
  return list.find((r) => r.key === key)
    || list.find((r) => r.key === 'regulated')
    || { key: 'regulated', label: '규제지역', metro: true, regulated: true };
}

// 지역 × 보유유형 → 권장 LTV(%). confidence로 '법정 확정값'과 '관행 추정값'을 구분한다.
function suggestLtvPercent(regionKey, ownership) {
  const cfg = loanRatesCfg();
  const region = loanRegionConfig(regionKey);
  const table = (cfg.ltvByRegion || {})[region.key] || {};
  const own = table[ownership] != null ? ownership : 'none';
  const value = table[own] != null ? table[own] : 70;
  const confidence = (cfg.ltvConfidence || {})[region.key + '.' + own] || 'estimate';
  return { value, confidence, ownership: own, region };
}

// 지역 × 금리유형 → 스트레스 가산금리(%p).
//  가산금리 = 스트레스 금리 × 기본 적용비율 × 금리유형별 적용비율
// 경과규정(2025.10.15까지 계약+계약금 납부 등)이 걸리는 선택지인지.
// rates.js 의 grandfather.priorRules.appliesToKeys 가 단일 기준이다 — 대환은
// 종전 조건 승계가 은행마다 갈려 여기에 넣지 않는다(경고만 남긴다).
function loanPriorRules(grandfather) {
  const pr = (loanRatesCfg().grandfather || {}).priorRules;
  if (!pr || !grandfather || grandfather === 'new') return null;
  return (pr.appliesToKeys || []).indexOf(grandfather) >= 0 ? pr : null;
}

function suggestStressAdd(regionKey, rateType, grandfather) {
  const cfg = loanRatesCfg();
  const region = loanRegionConfig(regionKey);
  const st = cfg.stress || {};
  const byRegion = (st.byRegion || {})[region.key]
    || { stressRate: 3.0, applyRatio: 1.0, add: 3.0, stage: '3단계' };
  const ratios = st.rateTypeRatio || { variable: 1, mixed: 0.8, periodic: 0.4, fixed: 0 };
  const rt = ratios[rateType] != null ? rateType : 'variable';
  let baseAdd = byRegion.add != null ? byRegion.add : (byRegion.stressRate * byRegion.applyRatio);

  // 경과규정 대상이면 10·15 이전의 스트레스 금리(전국 하한 1.5%)로 돌아간다.
  // 종전 값보다 높아질 일은 없으므로 min 으로 눌러 안전하게 둔다 — 지방(0.75%p)처럼
  // 이미 1.5%보다 낮은 지역이 경과규정 때문에 되레 올라가면 안 된다.
  const prior = loanPriorRules(grandfather);
  let priorApplied = false;
  if (prior && prior.stressRate != null) {
    const priorAdd = prior.stressRate * (byRegion.applyRatio != null ? byRegion.applyRatio : 1);
    if (priorAdd < baseAdd) { baseAdd = priorAdd; priorApplied = true; }
  }

  const value = Math.round(baseAdd * ratios[rt] * 100) / 100;
  return {
    value, baseAdd, rateType: rt, rateTypeRatio: ratios[rt],
    stressRate: priorApplied ? prior.stressRate : byRegion.stressRate,
    applyRatio: byRegion.applyRatio,
    stage: byRegion.stage, region, priorApplied,
    validUntil: byRegion.validUntil || null, note: byRegion.note || '',
  };
}

// DSR 산정용 「대출원금 1원당 연간 원리금상환액」.
//
// ⚠ 한 곳에만 둔다. 예전에는 스트레스 적용분과 미적용분이 각자 산식을 들고 있어서,
//   한쪽만 고치면 "스트레스가 한도를 얼마나 깎았는지"가 조용히 틀어졌다.
//
// ■ 원금균등은 **연평균 원리금** = (원금 + 총이자) ÷ 대출연수 로 잡는다
//
//   2026-08-04 이전에는 "상환부담이 가장 큰 첫해" 기준(12/n + i*(12-66/n))을 썼다.
//   보수적으로 보였지만 실제 은행 DSR 산출과 달라 한도를 크게 적게 냈다. 실사용자가
//   은행 DSR 원장 화면(2026-04-14 조회)을 제공해 대조한 결과:
//
//     본건 5.86억 · 원금균등 30년 · 스트레스 적용금리 6.86%
//       은행 표시 본건 원리금   39,688,960원
//       연평균 방식             39,688,966원   ← 6원 차이(사실상 일치)
//       첫해 방식               58,945,700원   ← 48% 과다
//
//     은행 표시 「DSR 40% 기준 신청가능금액」 589,800,000원
//       연평균 방식 역산        589,844,755원  ← 만원 단위 절사하면 일치
//       첫해 방식               397,151,021원  ← 33% 과소
//
//   원리금균등은 매달 같은 금액이라 첫해 = 연평균이다. 원금균등만 첫해로 잡으면 두
//   방식의 취급이 서로 어긋난다. 연평균으로 통일한다.
//   (그 결과 원금균등이 원리금균등보다 한도가 **크게** 나온다 — 총이자가 적기 때문이며
//    정상이다. 첫해 기준이던 때는 방향이 반대였다.)
function dsrAnnualFactor(annualRatePercent, months, repayType) {
  if (!(months > 0)) return Infinity;
  const i = (annualRatePercent || 0) / 100 / 12;
  if (repayType === 'principal') {
    const totalInterest = i * (months + 1) / 2;  // 원금 1원당 총이자(잔액 선형 감소)
    return (1 + totalInterest) / (months / 12);
  }
  const m = i > 0 ? i * Math.pow(1 + i, months) / (Math.pow(1 + i, months) - 1) : 1 / months;
  return m * 12;
}

function calcMortgageLimit(input) {
  const {
    price, ltvPercent, regulatedMetro,
    region: regionInput,
    ownership = 'none',
    rateType = 'variable',
    grandfather = 'new',
    income, existingAnnualDebt = 0,
    rate, stressAdd = 0, termYears, dsrLimitPercent, repayType = 'equal',
  } = input;
  if (!price || price <= 0) return null;

  // 지역: 명시 키 우선, 없으면 레거시 boolean(regulatedMetro)에서 유추한다.
  const region = loanRegionConfig(
    regionInput != null ? regionInput : (regulatedMetro === false ? 'provincialNonRegulated' : 'regulated')
  );
  const cfg = loanRatesCfg();

  const ltvLimit = price * (ltvPercent / 100);

  // 가격대별 한도는 수도권·규제지역 주택구입 목적 주담대에만 적용된다(지방 비규제 제외).
  const capRegions = cfg.priceCapAppliesTo || ['metroNonRegulated', 'regulated'];
  const priceCapApplies = capRegions.indexOf(region.key) >= 0;
  // 경과규정 대상이면 10·15가 새로 만든 15억↑ 4억 / 25억↑ 2억 구간이 적용되지 않고,
  // 6·27 대책의 **시가 무관 단일 6억**으로 돌아간다. 이 갈래가 없던 동안 경과규정
  // 대상자는 자기 대출을 계산기로 재현할 수 없었다(실사용자 사례).
  const priorRules = loanPriorRules(grandfather);
  let priceCap = Infinity;
  if (priceCapApplies) {
    if (priorRules && priorRules.priceCapSingle != null) {
      priceCap = priorRules.priceCapSingle;
    } else {
      const caps = cfg.metroPriceCaps || [
        { upToEok: 15, cap: 600000000 }, { upToEok: 25, cap: 400000000 }, { upToEok: Infinity, cap: 200000000 },
      ];
      const eok = price / 1e8;
      const tier = caps.find((c) => eok <= c.upToEok) || caps[caps.length - 1];
      priceCap = tier.cap;
    }
  }

  // DSR 한도 (스트레스 금리·만기 역산)
  const availAnnual = Math.max(0, (income || 0) * (dsrLimitPercent / 100) - (existingAnnualDebt || 0));
  const stressedRate = (rate || 0) + (stressAdd || 0);
  const n = (termYears || 0) * 12;
  const dsrFactorAnnual = dsrAnnualFactor(stressedRate, n, repayType);
  const dsrLimit = dsrFactorAnnual > 0 && isFinite(dsrFactorAnnual) ? availAnnual / dsrFactorAnnual : 0;

  const candidates = [
    { key: 'ltv', label: 'LTV 한도', value: ltvLimit },
    { key: 'priceCap', label: '지역 가격대별 한도', value: priceCap },
    { key: 'dsr', label: 'DSR 한도', value: dsrLimit },
  ];
  const binding = candidates.filter((c) => isFinite(c.value)).sort((a, b) => a.value - b.value)[0];
  const limit = Math.max(0, binding ? binding.value : 0);

  // 최종 한도(LTV·가격대별·DSR 중 최소값)를 실제로 빌렸을 때의 예상 DSR —
  // 한도 산정엔 스트레스 가산 금리를 쓰지만, 실제 상환은 스트레스 없는 실금리 기준이라
  // (binding이 DSR이 아니라 LTV·가격대별인 경우) 실제 DSR은 40/50% 한도보다 낮게 나온다.
  const realFactorRaw = dsrAnnualFactor(rate || 0, n, repayType);
  const realFactorAnnual = isFinite(realFactorRaw) ? realFactorRaw : 0;
  const actualAnnualPmt = limit * realFactorAnnual;
  const actualDsrPct = income > 0 ? (actualAnnualPmt + (existingAnnualDebt || 0)) / income * 100 : 0;

  // ── 스트레스 DSR이 이 결과에 실제로 영향을 줬는가 ──
  //  DSR이 결정 요인이 아니면(LTV·가격대별 한도가 더 작으면) 스트레스 가산은 한도를
  //  한 푼도 바꾸지 않는다. "스트레스 3.0%p 적용"만 써 두면 사용자는 자기 한도가
  //  그것 때문에 깎였다고 오해한다 — 실제로 얼마나 줄였는지 계산해 함께 보여준다.
  let limitWithoutStress = limit;
  if ((stressAdd || 0) > 0 && n > 0) {
    const f0 = dsrAnnualFactor(rate || 0, n, repayType);
    const dsrNoStress = f0 > 0 && isFinite(f0) ? availAnnual / f0 : 0;
    limitWithoutStress = Math.max(0, Math.min(ltvLimit, priceCap, dsrNoStress));
  }
  const stressImpact = Math.max(0, limitWithoutStress - limit);

  // ── 결과의 성격 구분 (법정·확정 / 사용자 입력 / 추정) ──
  //  세 값이 한 화면에 섞여 있으면 사용자가 "은행에서 확인해야 할 것"을 알 수 없다.
  const ltvMeta = suggestLtvPercent(region.key, ownership);
  const stressMeta = suggestStressAdd(region.key, rateType, grandfather);
  const ltvIsSuggested = Math.abs(ltvPercent - ltvMeta.value) < 1e-9;
  const stressIsSuggested = Math.abs((stressAdd || 0) - stressMeta.value) < 1e-9;
  const classification = {
    statutory: [
      { key: 'priceCap', label: '지역 가격대별 한도',
        detail: priceCapApplies ? '수도권·규제지역 주택구입 목적 주담대에 적용' : '지방 비규제지역 — 적용 없음' },
      { key: 'dsrLimitPct', label: 'DSR 한도율', detail: dsrLimitPercent + '%' },
    ],
    userInput: [
      { key: 'income', label: '연소득' },
      { key: 'existingDebt', label: '기존 대출 연 원리금' },
      { key: 'rate', label: '대출금리' },
      { key: 'termYears', label: '만기' },
      { key: 'grandfather', label: '경과규정·대환 해당 여부' },
    ],
    estimated: [],
  };
  (ltvIsSuggested && ltvMeta.confidence === 'verified' ? classification.statutory : classification.estimated)
    .push({ key: 'ltv', label: '적용 LTV', detail: ltvPercent + '%'
      + (ltvIsSuggested ? '' : ' (직접 입력)') });
  (stressIsSuggested && stressMeta.rateType === 'variable' ? classification.statutory : classification.estimated)
    .push({ key: 'stress', label: '스트레스 가산금리', detail: (stressAdd || 0).toFixed(2) + '%p'
      + (stressIsSuggested ? '' : ' (직접 입력)') });

  // 경과규정·대환은 은행이 증빙으로 판정한다 — 계산기는 사용자 선택을 그대로 반영만 한다.
  const grandfatherCfg = cfg.grandfather || {};
  const grandfatherOption = (grandfatherCfg.options || []).find((o) => o.key === grandfather) || null;
  const grandfatherActive = grandfather && grandfather !== 'new';

  return {
    ltvLimit, priceCap, dsrLimit, limit, binding, stressedRate, availAnnual, actualDsrPct,
    limitWithoutStress, stressImpact, stressAffectsLimit: stressImpact > 0,
    region, priceCapApplies, ownership: ltvMeta.ownership,
    ltvMeta, stressMeta, classification,
    grandfather, grandfatherActive, grandfatherOption,
    priorRulesApplied: !!priorRules, priorRules: priorRules || null,
  };
}

// 전세대출 한도: 보증기관별 비교.
//   한도 = min(보증금×보증비율, 기관 최대한도, [HF만] 소득기준 한도)
//   소득기준 한도(HF) = 부부합산 연소득 × incomeMultiple − 타행 신용대출 × creditDeductRatio
// 보증금 한도 초과·소득 한도 초과·산식 결과 0 이하 시 eligible=false.
function calcJeonseLoanByAgency(deposit, opts) {
  opts = opts || {};
  const R = (window.TOPDA_RATES && window.TOPDA_RATES.loan && window.TOPDA_RATES.loan.jeonseAgencies) || [];
  if (!deposit || deposit <= 0) return [];
  const income = opts.income || 0;            // 부부합산 연소득(원)
  const credit = opts.creditLoan || 0;        // 타행 신용대출 잔액(원)
  return R.map((a) => {
    const ratio = opts.youth && a.ratioYouth ? a.ratioYouth : a.ratio;
    const depositCap = opts.metro ? a.depositCapMetro : a.depositCapOther;
    const incomeCap = opts.youth && a.incomeCapYouth ? a.incomeCapYouth : a.incomeCap;
    const depositOk = deposit <= depositCap;
    const incomeOk = !incomeCap || !income || income <= incomeCap;

    // 산식별 후보 한도
    const cands = [];
    cands.push({ k: 'byRatio', v: deposit * (ratio / 100), label: '보증금×' + ratio + '%' });
    cands.push({ k: 'cap', v: a.maxAmount, label: '기관 최대 ' + Math.round(a.maxAmount / 100000000) + '억' });
    // 소득기준 산식이 정의된 기관(HF)만 추가 후보
    let incomeBased = null;
    if (a.incomeMultiple && income > 0) {
      incomeBased = Math.max(0, income * a.incomeMultiple - credit * (a.creditDeductRatio || 0));
      cands.push({ k: 'income', v: incomeBased, label: '상환능력별(소득×' + a.incomeMultiple + '·근사)' +
        (credit ? ' − 신용대출×' + Math.round((a.creditDeductRatio || 0) * 100) + '%' : '') });
    }
    const minCand = cands.reduce((m, c) => (c.v < m.v ? c : m), cands[0]);
    const eligible = depositOk && incomeOk && minCand.v > 0;
    const limit = eligible ? Math.max(0, Math.round(minCand.v)) : 0;

    const reasons = [];
    if (!depositOk) reasons.push('보증금 한도 초과');
    if (!incomeOk) reasons.push('소득 한도 초과(' + Math.round(incomeCap / 100000000 * 10) / 10 + '억)');
    if (depositOk && incomeOk && minCand.v <= 0) reasons.push('산식 결과가 0 이하');

    return {
      key: a.key, name: a.name, ratioApplied: ratio, maxAmount: a.maxAmount,
      depositCap, incomeCap, depositOk, incomeOk, eligible, limit,
      bindingLabel: eligible ? minCand.label : '',   // 가장 작은(=결정요인) 산식
      incomeBased,                                    // HF 소득기준 한도(참고용)
      fee: a.fee, note: a.note, source: a.source,
      ineligibleReason: reasons.join(' · '),
    };
  }).sort((x, y) => y.limit - x.limit);
}

(function () {
  const root = document.querySelector('[data-calc="loan-limit"]');
  if (!root) return;
  const R = (window.TOPDA_RATES && window.TOPDA_RATES.loan) || {};
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="' + sel + '"]'); if (el) el.textContent = txt; };
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

  // 대출 종류 탭 — 입력폼·결과패널이 각각 data-panel을 갖고 있으므로 둘 다 토글한다.
  // (querySelectorAll: 과거엔 querySelector로 첫 폼만 토글해 전세 탭에서도 주담대 결과가
  //  남아 소득을 바꿔도 한도가 안 변하는 것처럼 보였다.)
  const panels = {
    mortgage: root.querySelectorAll('[data-panel="mortgage"]'),
    jeonse: root.querySelectorAll('[data-panel="jeonse"]'),
  };
  function switchTab() {
    const t = root.querySelector('[name="loanKind"]:checked')?.value || 'mortgage';
    panels.mortgage.forEach((el) => show(el, t === 'mortgage'));
    panels.jeonse.forEach((el) => show(el, t === 'jeonse'));
  }

  // LTV 자동 채움 (지역×보유) — 사용자가 직접 수정 가능.
  //  지역·보유유형을 바꾸면 "직접 입력한 값"을 유지할지가 애매해지므로,
  //  사용자가 손대기 전까지만 자동 채우고, 손댄 뒤에는 되돌리기 버튼으로 복귀시킨다.
  const ltvInput = root.querySelector('[name="ltvPercent"]');
  let ltvTouched = false;
  if (ltvInput) ltvInput.addEventListener('input', () => { ltvTouched = true; });
  const stressInput = root.querySelector('[name="stressAdd"]');
  let stressTouched = false;
  if (stressInput) stressInput.addEventListener('input', () => { stressTouched = true; });

  const regionKey = () => root.querySelector('[name="region"]:checked')?.value || 'regulated';
  const ownershipKey = () => root.querySelector('[name="ownership"]:checked')?.value || 'none';
  const rateTypeKey = () => root.querySelector('[name="rateType"]')?.value || 'variable';
  const grandfatherKey = () => root.querySelector('[name="grandfather"]')?.value || 'new';

  function applySuggestions() {
    const ltvMeta = suggestLtvPercent(regionKey(), ownershipKey());
    // 경과규정을 고르면 스트레스 가산도 종전(1.5%) 기준으로 다시 제안된다 —
    // 한도 계산만 바꾸고 제안값을 그대로 두면 화면의 두 숫자가 서로 어긋난다.
    const stressMeta = suggestStressAdd(regionKey(), rateTypeKey(), grandfatherKey());
    if (ltvInput && !ltvTouched) ltvInput.value = ltvMeta.value;
    if (stressInput && !stressTouched) stressInput.value = stressMeta.value;
    return { ltvMeta, stressMeta };
  }

  // '기준값으로 되돌리기' — 직접 입력한 뒤에도 현행 규제값으로 언제든 복귀할 수 있게 한다.
  root.querySelectorAll('[data-reset-suggestion]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-reset-suggestion');
      if (target === 'ltv') ltvTouched = false;
      if (target === 'stress') stressTouched = false;
      recalcMortgage();
    });
  });

  function recalcMortgage() {
    const price = fmt.parseWon(root.querySelector('[name="price"]').value);
    const region = regionKey();
    const own = ownershipKey();
    const rateType = rateTypeKey();
    const grandfather = grandfatherKey();
    const { ltvMeta, stressMeta } = applySuggestions();
    const ltvPercent = Number(ltvInput?.value || 0);
    const income = fmt.parseWon(root.querySelector('[name="income"]').value);
    const existingMonthly = fmt.parseWon(root.querySelector('[name="existingMonthly"]').value);
    const rate = Number(root.querySelector('[name="rate"]').value || 0);
    const stressAdd = Number(stressInput?.value || 0);
    const termYears = Number(root.querySelector('[name="termYears"]').value || 0);
    const dsrLimitPercent = Number(root.querySelector('[name="dsrLimit"]:checked')?.value || 40);
    const repayType = root.querySelector('[name="repayType"]:checked')?.value || 'equal';

    const zeroLtvWarn = root.querySelector('[data-out="multiWarn"]');
    show(zeroLtvWarn, ltvMeta.value === 0);
    const zeroLtvBody = root.querySelector('[data-out="multiWarnBody"]');
    if (zeroLtvBody && ltvMeta.value === 0) {
      zeroLtvBody.innerHTML = '<strong>' + ltvMeta.region.label + '에서 '
        + ((R.ownershipLabels || {})[own] || own)
        + '는 주택구입 목적 주담대가 원칙적으로 금지</strong>됩니다(LTV 0%). '
        + '기존 주택을 6개월 이내 처분하는 조건이면 「처분조건부 1주택」을 선택하세요.';
    }

    const r = calcMortgageLimit({
      price, ltvPercent, region, ownership: own, rateType, grandfather,
      income, existingAnnualDebt: existingMonthly * 12,
      rate, stressAdd, termYears, dsrLimitPercent, repayType,
    });
    if (!r) { setText('mLimit', fmt.won(0)); return; }
    setText('mLimit', fmt.won(r.limit));
    setText('mBinding', r.binding ? r.binding.label + ' 기준' : '—');
    setText('mLtv', fmt.won(r.ltvLimit));
    setText('mPriceCap', isFinite(r.priceCap)
      ? fmt.won(r.priceCap)
      : (isEn ? 'N/A' : '미적용 (지방 비규제지역)'));
    setText('mDsr', fmt.won(r.dsrLimit));
    setText('mStressed', r.stressedRate.toFixed(2) + '%');
    setText('mOwn', fmt.won(Math.max(0, price - r.limit)));
    setText('mActualDsr', income > 0 ? r.actualDsrPct.toFixed(1) + '%' : '소득 입력 필요');
    setText('mActualDsrNote', r.binding && r.binding.key === 'dsr'
      ? 'DSR이 결정 요인 — 한도 산정 기준(스트레스 포함)과 거의 동일'
      : (r.binding ? r.binding.label + '이 결정 요인 — DSR 한도보다 여유 있게 대출' : '—'));

    // ── 적용 규제 요약 ──
    //  같은 주택가격이라도 지역·보유 수·금리유형·신청 시점에 따라 적용 규제가 달라진다.
    //  결과만 보여주면 "왜 이 값인지"를 알 수 없으므로 적용 근거를 함께 노출한다.
    setText('mRegionLabel', ltvMeta.region.label);
    setText('mAppliedRule',
      ltvMeta.region.label + ' · ' + ((R.ownershipLabels || {})[own] || own)
      + ' → LTV ' + ltvMeta.value + '%'
      + (r.priceCapApplies ? ' · 가격대별 한도 적용' : ' · 가격대별 한도 없음')
      + ' · 스트레스 ' + stressMeta.value.toFixed(2) + '%p('
      + ((R.stress && R.stress.rateTypeLabels && R.stress.rateTypeLabels[rateType]) || rateType)
      + ' · ' + stressMeta.stage + ')');

    const noteBox = root.querySelector('[data-out="mRuleNotes"]');
    if (noteBox) {
      const notes = [];
      // 스트레스 DSR이 실제로 한도를 깎았는지 — 결정 요인이 DSR이 아니면 영향은 0이다.
      //  "스트레스 3.00%p 적용"만 써 두면 그것 때문에 한도가 줄었다고 오해한다.
      if (stressMeta.value > 0) {
        notes.push(r.stressAffectsLimit
          ? { kind: 'warn', text: '스트레스 가산 ' + stressMeta.value.toFixed(2) + '%p가 한도를 '
              + fmt.won(r.stressImpact) + ' 줄였습니다 (가산이 없다면 ' + fmt.won(r.limitWithoutStress) + ').' }
          : { kind: 'info', text: '스트레스 DSR은 이 결과에 영향이 없습니다 — '
              + (r.binding ? r.binding.label : '다른 한도') + '이(가) 더 작아 한도를 결정했습니다. '
              + '가산금리를 0으로 두어도 한도는 같습니다.' });
      }
      // 판정 기준값이 매매가가 아니라는 점은 사용자가 가장 자주 틀리는 부분이다.
      notes.push({ kind: 'warn', text: (R.valuationBasis && R.valuationBasis.note)
        || 'LTV와 가격대별 한도는 매매가가 아니라 대출 신청일 기준 시가로 판정합니다.' });
      notes.push({ kind: 'info', text: ltvMeta.region.note || R.regionNote || '' });
      if (ltvMeta.confidence !== 'verified') {
        notes.push({ kind: 'warn', text: '이 지역·보유유형의 LTV는 법령·고시로 확정된 값이 아니라 은행 관행에 가까운 추정치입니다. 실제 적용 비율을 은행에 확인하고 직접 입력하세요.' });
      }
      if (stressMeta.validUntil) {
        notes.push({ kind: 'warn', text: '이 지역의 스트레스 DSR 완화(' + stressMeta.stage + ')는 ' + stressMeta.validUntil + '까지 적용 예정입니다. 대출 실행일이 그 이후면 가산금리가 올라 한도가 줄어듭니다.' });
      }
      if (rateType !== 'variable') {
        notes.push({ kind: 'warn', text: (R.stress && R.stress.rateTypeNote) || '' });
      }
      if (r.grandfatherActive && r.grandfatherOption) {
        const gf = R.grandfather || {};
        // ⚠ 이 notes 배열은 HTML을 이스케이프해서 그린다(renderNotes). 태그를 넣으면
        //   글자 그대로 나오므로 평문으로만 쓴다.
        if (r.priorRulesApplied) {
          // 종전 규정으로 계산했다면 '무엇을 되돌렸고 무엇은 안 되돌렸는지'까지 말해야
          // 한다. 되돌리지 않은 LTV 를 밝히지 않으면 이 한도를 그대로 믿는다.
          notes.push({ kind: 'warn', text: '「' + r.grandfatherOption.label + '」을 선택해 '
            + '종전 규정으로 계산했습니다 — 가격대별 한도 6억원 단일(시가 무관), 스트레스 금리 1.5%. '
            + 'LTV는 되돌리지 않았습니다: '
            + ((gf.priorRules && gf.priorRules.ltvNote) || '은행에 확인한 종전 LTV를 직접 입력하세요.')
            + ' ' + (gf.note || '경과규정 해당 여부는 은행이 증빙으로 판정합니다.') });
        } else {
          notes.push({ kind: 'warn', text: '「' + r.grandfatherOption.label + '」을 선택했지만 '
            + '현행 규정으로 계산했습니다 — '
            + (gf.refinanceNote || '종전 조건 승계 여부가 은행·상품마다 달라 자동으로 되돌리지 않습니다.') });
        }
      }
      // ── 적용 대상 요건 ──
      //  "얼마"만 보여주고 "이 규제가 당신 대출에 붙는지"를 안 밝히면, 대상이 아닌
      //  대출(생활안정자금·중도금·전세)까지 깎인 한도로 오해한다.
      const scope = R.purposeScope || {};
      if (scope.covered) {
        notes.push({ kind: 'info', text: '이 결과는 「' + scope.covered + '」 기준입니다. '
          + (scope.excluded || []).slice(0, 3).join(' / ') + ' 등은 규제가 달라 이 값을 쓰면 안 됩니다.' });
      }
      const dsrApp = (RATES_DSR() || {}).applicability;
      if (dsrApp && r.binding && r.binding.key === 'dsr') {
        notes.push({ kind: 'info', text: 'DSR이 한도를 결정했습니다. 차주단위 DSR은 전 금융권 총 대출액이 '
          + Math.round((dsrApp.totalDebtThreshold || 100000000) / 100000000) + '억원을 넘을 때 적용됩니다 — '
          + '이 계산기는 보수적으로 항상 적용하므로, 요건에 해당하지 않으면 실제 한도는 더 높을 수 있습니다.' });
        // DSR이 한도를 정했다면 분모(연소득)를 어떻게 잡느냐가 곧 한도다. 은행이
        // 장래소득을 얹으면 여기 결과보다 커진다 — 실제로 가장 흔한 차이 원인이다.
        if (dsrApp.futureIncome && dsrApp.futureIncome.appliedInCalculator === false) {
          notes.push({ kind: 'info', text: dsrApp.futureIncome.note });
        }
      }
      notes.push({ kind: 'info', text: '대출 규제는 신청·실행 시점의 기준으로 판정됩니다. 이 계산기는 ' + (R.effectiveFrom || '') + ' 시행 기준이며, 이후 대책이 나오면 달라집니다.' });
      const icon = { warn: '⚠', info: 'ℹ' };
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rows = notes.filter((n) => n.text);
      noteBox.hidden = !rows.length;
      noteBox.innerHTML = rows.map((n) =>
        '<li class="acq-note acq-note-' + n.kind + '"><span class="acq-note-icon" aria-hidden="true">'
        + icon[n.kind] + '</span><span>' + esc(n.text) + '</span></li>').join('');
    }

    // 법정·확정 / 사용자 입력 / 추정 항목 구분
    const classBox = root.querySelector('[data-out="mClassify"]');
    if (classBox) {
      const c = r.classification;
      const group = (title, items) => items.length
        ? '<div class="calc-classify-group"><h4>' + title + '</h4><ul>'
          + items.map((i) => '<li>' + i.label + (i.detail ? ' <span>' + i.detail + '</span>' : '') + '</li>').join('')
          + '</ul></div>'
        : '';
      classBox.innerHTML =
        group('법정·확정 항목', c.statutory)
        + group('사용자 입력 항목', c.userInput)
        + group('추정 항목 (확인 필요)', c.estimated);
    }
  }

  function recalcJeonse() {
    const deposit = fmt.parseWon(root.querySelector('[name="deposit"]').value);
    const metro = (root.querySelector('[name="jArea"]:checked')?.value || 'metro') === 'metro';
    const youth = root.querySelector('[name="youth"]')?.checked || false;
    const incomeEl = root.querySelector('[name="jIncome"]');
    const income = incomeEl ? fmt.parseWon(incomeEl.value) : 0;
    const creditEl = root.querySelector('[name="jCredit"]');
    const creditLoan = creditEl ? fmt.parseWon(creditEl.value) : 0;
    const agencySel = root.querySelector('[name="jAgency"]:checked')?.value || 'all';
    let list = calcJeonseLoanByAgency(deposit, { metro, youth, income, creditLoan });
    // 보증기관을 먼저 선택했으면 해당 기관만 표시(전체 비교는 그대로 3곳)
    if (agencySel !== 'all') list = list.filter((a) => a.key === agencySel);
    const box = root.querySelector('[data-out="agencyList"]');
    if (!box) return;
    // 헤딩·시나리오 라벨을 선택 상태에 맞게 갱신
    if (agencySel === 'all') {
      setText('jHeading', '보증기관별 전세대출 한도');
      setText('jScenario', '가장 많이 받을 수 있는 곳');
    } else {
      setText('jHeading', (list[0]?.name || agencySel) + ' 전세대출 한도');
      setText('jScenario', '선택한 보증기관 기준');
    }
    if (!deposit) { box.innerHTML = '<p style="color:var(--text-muted)">임차보증금을 입력하세요.</p>'; setText('jBest', fmt.won(0)); return; }
    setText('jBest', fmt.won(list.length ? list[0].limit : 0));
    box.innerHTML = list.map((a, idx) => {
      const isBest = (agencySel === 'all' && idx === 0 && a.eligible);
      const pct = a.eligible ? (a.ratioApplied + '%') : '대상 외';
      const self = Math.max(0, deposit - a.limit);
      const incomeRow = a.incomeCap
        ? '<div class="agency-meta">소득 한도 부부합산 ≤ ' + fmt.eokMan(a.incomeCap).replace('약 ', '') + (a.incomeOk ? ' <span style="color:#059669;">✓ 충족</span>' : ' <span style="color:#dc2626;">× 초과</span>') + '</div>'
        : '<div class="agency-meta">소득 제한 없음 <span style="color:#059669;">✓</span></div>';
      const bindingRow = a.eligible ? '<div class="agency-meta" style="color:var(--accent,#2563eb);">결정 산식: ' + a.bindingLabel + '</div>' : '';
      const incomeBasedRow = (a.incomeBased != null) ? '<div class="agency-meta">상환능력별 한도(근사): ' + fmt.eokMan(Math.round(a.incomeBased)).replace('약 ', '') + ' <span style="color:var(--text-muted);">— 실제는 인정소득−부채상환예상액+우대</span></div>' : '';
      return '<div class="agency-card' + (isBest ? ' is-best' : '') + '">' +
        '<div class="agency-top"><span class="agency-name">' + a.name + (isBest ? ' <span class="agency-best">최대</span>' : '') + '</span>' +
        '<span class="agency-limit">' + fmt.won(a.limit) + '</span></div>' +
        '<div class="agency-meta">보증비율 ' + pct + ' · 최대 ' + fmt.eokMan(a.maxAmount).replace('약 ', '') + ' · 대상 보증금 ' + (isFinite(a.depositCap) ? '≤' + fmt.eokMan(a.depositCap).replace('약 ', '') : '제한 적음') + '</div>' +
        incomeRow +
        bindingRow +
        incomeBasedRow +
        (a.eligible ? '<div class="agency-meta">내 보증금 중 자기부담 ≈ ' + fmt.won(self) + ' · 보증료 ' + (a.fee || '—') + '</div>' : '<div class="agency-meta agency-warn">' + (a.ineligibleReason || '이용이 어렵습니다') + '</div>') +
        (a.note ? '<div class="agency-note">' + a.note + '</div>' : '') +
        (a.source ? '<div class="agency-meta"><a href="' + a.source + '" target="_blank" rel="noopener" style="color:var(--accent,#2563eb);">공식 상품 안내·정확한 한도 확인 →</a></div>' : '') +
        '</div>';
    }).join('');

    // HF 소득구간별 한도 미리보기 — 현재 보증금·신용대출 입력 기준, 내 소득 구간 강조.
    const hfConf = (((window.TOPDA_RATES || {}).loan || {}).jeonseAgencies || []).find((a) => a.key === 'HF');
    if (hfConf && (agencySel === 'all' || agencySel === 'HF')) {
      const bands = [
        { inc: 40000000, label: '4천만 이하' },
        { inc: 60000000, label: '6천만 이하' },
        { inc: 80000000, label: '8천만 이하' },
        { inc: 100000000, label: '1억 이하' },
        { inc: 130000000, label: '1.3억 이하' },
      ];
      const ratio = youth && hfConf.ratioYouth ? hfConf.ratioYouth : hfConf.ratio;
      const myBand = income > 0 ? bands.find((b) => income <= b.inc) : null;
      // 모바일 표 폭을 위해 억 단위 축약 표기 (1.8억 / 4억)
      const eok = (v) => {
        const e = v / 100000000;
        return (e >= 10 ? Math.round(e) : Math.round(e * 10) / 10) + '억';
      };
      const rows = bands.map((b) => {
        const ib = Math.max(0, b.inc * hfConf.incomeMultiple - creditLoan * (hfConf.creditDeductRatio || 0));
        const lim = Math.round(Math.min(deposit * ratio / 100, hfConf.maxAmount, ib));
        const mine = myBand && b.inc === myBand.inc;
        return '<tr' + (mine ? ' class="is-active"' : '') + '>' +
          '<td>' + b.label + (mine ? ' ★' : '') + '</td>' +
          '<td>' + eok(ib) + '</td>' +
          '<td><strong>' + eok(lim) + '</strong></td>' +
          '</tr>';
      }).join('');
      box.innerHTML += '<div class="agency-card" style="background:var(--surface-2,#f8fafc);">' +
        '<div class="agency-top"><span class="agency-name">HF 소득구간별 한도 미리보기</span></div>' +
        '<div class="agency-meta">현재 입력한 보증금(' + fmt.won(deposit) + ')·신용대출 기준의 <strong>근사치</strong>입니다. ' +
        '상환능력별 = 연소득×' + hfConf.incomeMultiple + (creditLoan ? ' − 신용대출×' + Math.round((hfConf.creditDeductRatio || 0) * 100) + '%' : '') +
        ' · 최종 한도 = min(보증금×' + ratio + '%, ' + Math.round(hfConf.maxAmount / 100000000) + '억, 상환능력별)</div>' +
        '<div class="table-wrap compact" style="margin-top:8px;"><table class="data" style="font-size:0.8rem;">' +
        '<thead><tr><th>연소득(부부합산)</th><th>상환능력<span style="font-weight:500;">(근사)</span></th><th>최종 한도</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        '<div class="agency-note">소득에 자격 제한은 없으며, 소득이 낮으면 상환능력별 한도가 줄어들 뿐입니다. 정확한 금액은 <a href="https://www.hf.go.kr/ko/sub02/sub02_03_01.do" target="_blank" rel="noopener" style="color:var(--accent,#2563eb);">HF 예상보증금액 조회</a>로 확인하세요.</div>' +
        '</div>';
    }

    // 기금성 전세대출(버팀목 시리즈) — 부부합산 소득 상한은 이 상품군에만 있다.
    // 입력한 소득·보증금·지역으로 상품별 충족 여부와 예상 한도를 보여준다.
    const fundProducts = (((window.TOPDA_RATES || {}).loan || {}).jeonseFundProducts) || [];
    if (fundProducts.length && agencySel === 'all') {
      const fundRows = fundProducts.map((p) => {
        const depositCap = metro ? p.depositCapMetro : p.depositCapOther;
        const maxAmt = metro ? p.maxMetro : p.maxOther;
        const incomeOk = !income || income <= p.incomeCap;
        const depositOk = deposit <= depositCap;
        const lim = (incomeOk && depositOk) ? Math.round(Math.min(deposit * p.ratio / 100, maxAmt)) : 0;
        const badge = !incomeOk
          ? '<span style="color:#b45309;">소득 상한(' + fmt.eokMan(p.incomeCap).replace('약 ', '') + ') 초과</span>'
          : !depositOk
            ? '<span style="color:#b45309;">보증금 상한(' + fmt.eokMan(depositCap).replace('약 ', '') + ') 초과</span>'
            : '<strong>' + fmt.eokMan(lim).replace('약 ', '') + '</strong>';
        return '<tr><td>' + p.name + '<br/><span style="color:var(--text-muted);font-size:0.9em;">' + p.who + '</span></td>' +
          '<td>≤' + fmt.eokMan(p.incomeCap).replace('약 ', '') + '</td>' +
          '<td>' + badge + '</td>' +
          '<td style="white-space:normal;">' + p.rate + '</td></tr>';
      }).join('');
      box.innerHTML += '<div class="agency-card" style="background:var(--surface-2,#f8fafc);">' +
        '<div class="agency-top"><span class="agency-name">기금성 전세대출 (버팀목 시리즈)</span></div>' +
        '<div class="agency-meta">부부합산 <strong>소득 상한은 이 상품군에만</strong> 있습니다(일반 보증은 소득 무관). 요건이 맞으면 금리가 낮아 일반 보증보다 우선 검토하세요.</div>' +
        '<div class="table-wrap compact" style="margin-top:8px;"><table class="data" style="font-size:0.8rem;">' +
        '<thead><tr><th>상품 · 대상</th><th>소득 상한</th><th>내 예상 한도</th><th>금리(참고)</th></tr></thead>' +
        '<tbody>' + fundRows + '</tbody></table></div>' +
        '<div class="agency-note">한도 = min(보증금×대출비율, 상품 최대한도). 무주택·자산 요건 등 세부 자격은 <a href="' + ((((window.TOPDA_RATES || {}).loan || {}).jeonseFundSource) || 'https://nhuf.molit.go.kr') + '" target="_blank" rel="noopener" style="color:var(--accent,#2563eb);">주택도시기금 포털</a>에서 확인하세요. 금리·요건은 고시로 수시 변경됩니다.</div>' +
        '</div>';
    }
  }

  function recalcAll() { switchTab(); recalcMortgage(); recalcJeonse(); }
  root.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', recalcAll); el.addEventListener('change', recalcAll);
  });
  recalcAll();
})();

/* =========================================================
 * Topda Extras (2026-06-08)
 *  1) 폼 자동저장 — data-autosave="key" 가 붙은 form/section의 input/select 값을
 *     localStorage('topda:autosave:<key>')에 저장 → 다음 방문 시 자동 복원.
 *     사이트 업데이트(PR 배포)와 무관하게 브라우저에 유지됩니다.
 *  2) 음성 읽기 — [data-tts-target="<selector>"] 버튼을 누르면 해당 영역의
 *     텍스트를 한국어 음성으로 읽어줍니다 (Web Speech Synthesis).
 *     별도 버튼이 없는 페이지에도 floating 버튼으로 결과/주요 영역을 자동 부착.
 * ========================================================= */
(function () {
  'use strict';

  /* ---------- 1) 폼 자동저장 ---------- */
  function autosaveInit() {
    // 명시 [data-autosave] + 자동 [data-calc] (계산기 공통)
    var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-autosave]'));
    document.querySelectorAll('[data-calc]').forEach(function (n) {
      if (!n.hasAttribute('data-autosave')) {
        n.setAttribute('data-autosave', 'calc:' + n.getAttribute('data-calc'));
        nodes.push(n);
      }
    });
    nodes.forEach(function (root) {
      var key = 'topda:autosave:' + root.getAttribute('data-autosave');
      var fields = root.querySelectorAll('input, select, textarea');
      // 복원
      try {
        var saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && typeof saved === 'object') {
          fields.forEach(function (el) {
            if (!el.name && !el.id) return;
            var k = el.name || el.id;
            if (!(k in saved)) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
              if (el.type === 'radio') { if (el.value === saved[k]) el.checked = true; }
              else el.checked = !!saved[k];
            } else {
              el.value = saved[k];
            }
            // 변경 이벤트 트리거로 재계산되게
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
      } catch (e) {}
      // 저장 (debounce)
      var t;
      function persist() {
        clearTimeout(t);
        t = setTimeout(function () {
          var data = {};
          fields.forEach(function (el) {
            var k = el.name || el.id;
            if (!k) return;
            if (el.type === 'checkbox') data[k] = !!el.checked;
            else if (el.type === 'radio') { if (el.checked) data[k] = el.value; }
            else data[k] = el.value;
          });
          try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
        }, 250);
      }
      root.addEventListener('input', persist);
      root.addEventListener('change', persist);
    });
  }

  /* ---------- 2) 음성 읽기 (TTS) ---------- */
  var synth = window.speechSynthesis;
  var supportsTTS = !!synth;
  var ttsVoice = null;
  var pageLang = document.documentElement.lang || 'ko';
  var ttsLocale = pageLang === 'en' ? 'en-US' : (pageLang === 'ko' ? 'ko-KR' : pageLang);
  function pickTtsVoice() {
    if (!supportsTTS) return null;
    if (ttsVoice) return ttsVoice;
    var voices = synth.getVoices();
    var langPrefix = ttsLocale.split('-')[0];
    ttsVoice = voices.find(function (v) { return (v.lang || '').toLowerCase() === ttsLocale.toLowerCase(); })
            || voices.find(function (v) { return (v.lang || '').toLowerCase().startsWith(langPrefix.toLowerCase()); })
            || null;
    return ttsVoice;
  }
  if (supportsTTS) {
    synth.onvoiceschanged = function () { ttsVoice = null; pickTtsVoice(); };
    pickTtsVoice();
  }

  function cleanText(node) {
    if (!node) return '';
    var clone = node.cloneNode(true);
    // 스크립트·스타일·SVG·아이콘 제거, 버튼 자체도 제거
    clone.querySelectorAll('script, style, svg, .tts-btn, [data-tts-skip]').forEach(function (n) { n.remove(); });
    var text = (clone.innerText || clone.textContent || '')
      .replace(/[​-‍﻿]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 1200); // 안전 상한
  }

  function speak(text, btn) {
    if (!supportsTTS) { alert(isEn ? 'This browser does not support text-to-speech.' : '이 브라우저는 음성 읽기를 지원하지 않습니다.'); return; }
    if (synth.speaking) {
      synth.cancel();
      if (btn) btn.setAttribute('aria-pressed', 'false');
      return;
    }
    if (!text) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = ttsLocale;
    var v = pickTtsVoice();
    if (v) u.voice = v;
    u.rate = 1.0; u.pitch = 1.0;
    u.onend = function () { if (btn) btn.setAttribute('aria-pressed', 'false'); };
    u.onerror = function () { if (btn) btn.setAttribute('aria-pressed', 'false'); };
    if (btn) btn.setAttribute('aria-pressed', 'true');
    synth.speak(u);
  }

  function ttsButtonsInit() {
    // 명시적 버튼
    document.querySelectorAll('[data-tts-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-tts-target');
        var node = document.querySelector(sel);
        speak(cleanText(node), btn);
      });
    });
    // 자동 부착: 결과 영역 우상단에 작은 버튼
    //  - 명시 [data-tts-auto] + 계산기 .calc-result 영역(첫 번째만)
    var autoSet = new Set();
    document.querySelectorAll('[data-tts-auto]').forEach(function (n) { autoSet.add(n); });
    var firstCalcResult = document.querySelector('.calc-result');
    if (firstCalcResult) autoSet.add(firstCalcResult);
    autoSet.forEach(function (el) {
      if (el.querySelector('.tts-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tts-btn';
      btn.setAttribute('aria-label', isEn ? 'Read results aloud' : '결과 읽어주기');
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/><path d="M19 5a9 9 0 010 14"/></svg><span>' + (isEn ? 'Listen' : '읽기') + '</span>';
      btn.addEventListener('click', function () { speak(cleanText(el), btn); });
      el.style.position = el.style.position || 'relative';
      el.appendChild(btn);
    });
  }

  // 페이지 떠나면 음성 중단
  window.addEventListener('beforeunload', function () { if (supportsTTS && synth.speaking) synth.cancel(); });

  function init() { autosaveInit(); ttsButtonsInit(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* =========================================================
 * 홈 뉴스 렌더링 (2026-07-01 개편)
 *  assets/news.json 으로
 *   1) "이번 주 부동산 핵심 이슈" — 섹터별 주간 1위 기사를 뉴스 헤드라인 목록으로
 *   2) "섹터별 부동산 뉴스" — 매일 자정 자동 갱신되는 섹터별 목록
 *  을 채운다. news.json 이 없거나 비면 HTML 정적 폴백(collect_news.py가
 *  마커 구간에 주입)을 그대로 둔다. 마크업은 _meta/collect_news.py와 동일해야 한다.
 * ========================================================= */
(function () {
  'use strict';
  var hasWeekly = document.querySelector('[data-news-headlines]');
  var hasDaily = document.querySelector('[data-news-daily]');
  if (!hasWeekly && !hasDaily) return;   // 홈 외 페이지

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function setText(sel, txt) {
    var el = document.querySelector(sel);
    if (el && txt) el.textContent = txt;
  }

  function renderWeekly(w) {
    if (!w) return;
    setText('[data-news-asof]', w.as_of);
    var list = document.querySelector('[data-news-headlines]');
    // 구버전 news.json(cards)도 헤드라인으로 흡수.
    var items = (w.headlines || w.cards || []).filter(function (it) {
      return it && it.title && it.url;
    });
    if (list && items.length) {
      list.innerHTML = items.map(function (it, i) {
        var meta = [it.source, it.date].filter(Boolean).join(' · ');
        return '<li><a class="headline-item" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
          '<span class="headline-rank">' + (i + 1) + '</span>' +
          '<span class="headline-body">' +
            (it.badge ? '<span class="headline-badge">' + esc(it.badge) + '</span>' : '') +
            '<span class="headline-title">' + esc(it.title) + '</span>' +
            (meta ? '<span class="headline-meta">' + esc(meta) + '</span>' : '') +
          '</span></a></li>';
      }).join('');
    }
  }

  function renderDaily(d) {
    var wrap = document.querySelector('[data-news-daily]');
    var list = document.querySelector('[data-news-daily-list]');
    if (!wrap || !list || !d || !d.sectors) return;
    var sectors = d.sectors.filter(function (s) { return s.items && s.items.length; });
    if (!sectors.length) return;   // 폴백: 섹션 숨김 유지
    setText('[data-news-daily-updated]', d.updated ? d.updated + ' 갱신' : null);
    // 섹터별 가로형 한 줄 — 핵심 기사 최대 3건만.
    list.innerHTML = sectors.map(function (s) {
      var cards = s.items.slice(0, 3).map(function (it) {
        var ext = /^https?:/i.test(it.url || '');
        var meta = [it.source, it.date].filter(Boolean).join(' · ');
        return '<a class="news-card" href="' + esc(it.url || '#') + '"' +
          (ext ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<span class="news-title">' + esc(it.title) + '</span>' +
          (meta ? '<span class="news-meta">' + esc(meta) + '</span>' : '') +
        '</a>';
      }).join('');
      return '<div class="news-row">' +
        '<div class="news-row-label">' + esc(s.name) + '</div>' +
        '<div class="news-row-items">' + cards + '</div>' +
      '</div>';
    }).join('');
    wrap.hidden = false;
  }

  fetch('assets/news.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data) return;
      renderWeekly(data.weekly);
      renderDaily(data.daily);
    })
    .catch(function () { /* 폴백: 정적 HTML 유지 */ });
})();

/* ===== 맨 위로 버튼 (전역) — 한 화면 이상 스크롤하면 우하단에 표시 ===== */
(function () {
  'use strict';
  var btn = document.createElement('button');
  btn.className = 'to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', '맨 위로');
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(btn);
  var ticking = false;
  function update() {
    ticking = false;
    btn.classList.toggle('show', window.scrollY > window.innerHeight);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ===== Guide TOC: 모바일 접기 + 스크롤 스파이 =====
   .g-toc(목차) 안의 링크(#anchor)를 감지해 현재 챕터를 강조한다. */
(function () {
  var toc = document.querySelector('.g-toc');
  if (!toc) return;

  // 모바일에서 접기/펼치기
  var toggle = toc.querySelector('.g-toc-toggle');
  if (toggle) {
    var collapsed = window.matchMedia('(max-width: 767px)').matches;
    toc.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.addEventListener('click', function () {
      var now = toc.getAttribute('data-collapsed') === 'true';
      toc.setAttribute('data-collapsed', now ? 'false' : 'true');
      toggle.setAttribute('aria-expanded', now ? 'true' : 'false');
      toggle.textContent = now ? '접기' : '펼치기';
    });
  }

  // 링크 클릭 시 모바일에서 목차 자동 접기
  var links = Array.prototype.slice.call(toc.querySelectorAll('.g-toc-list a[href^="#"]'));
  links.forEach(function (a) {
    a.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 767px)').matches && toggle) {
        toc.setAttribute('data-collapsed', 'true');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = '펼치기';
      }
    });
  });

  // 스크롤 스파이
  var targets = links
    .map(function (a) {
      var id = a.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      return el ? { link: a, el: el } : null;
    })
    .filter(Boolean);
  if (!targets.length) return;

  var ticking = false;
  function spy() {
    ticking = false;
    var offset = 120;
    var current = targets[0];
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].el.getBoundingClientRect().top - offset <= 0) current = targets[i];
    }
    targets.forEach(function (t) { t.link.classList.toggle('is-active', t === current); });
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(spy); }
  }, { passive: true });
  spy();
})();

// ===== 홈 '이어서 하기' — 저장된 진행 상태 기반 재방문 위젯 =====
// 체크리스트 진행률(cl-hub)·D-Day 일정(dday:events)·여정 로드맵 현재 단계(topda:journey)가
// 이 브라우저에 저장되어 있으면, 홈 상단에 이어서 할 일을 보여준다.
// 저장 데이터가 전혀 없으면(첫 방문) 아무것도 렌더링하지 않는다. 모든 데이터는 로컬 전용.
(function () {
  try {
    if ((document.documentElement.lang || 'ko') !== 'ko') return;
    var intro = document.querySelector('.home-intro');
    if (!intro || document.querySelector('.home-resume')) return;

    var esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    var read = function (key, fallback) {
      try { return JSON.parse(localStorage.getItem(key) || fallback); } catch (e) { return JSON.parse(fallback); }
    };
    var cards = [];

    // 1) D-Day 스케줄러: 가장 가까운 예정 일정 + 시점별 '지금 챙길 일' 힌트
    var events = read('dday:events', '[]');
    var dealType = (function () { try { return localStorage.getItem('dday:type') || 'sale'; } catch (e) { return 'sale'; } })();
    if (Array.isArray(events) && events.length) {
      var t0 = new Date(); t0.setHours(0, 0, 0, 0);
      var next = events
        .map(function (e) { return { title: e.title || '', tag: e.tag || '', date: new Date(e.date) }; })
        .filter(function (e) { return !isNaN(e.date) && e.date >= t0; })
        .sort(function (a, b) { return a.date - b.date; })[0];
      if (next) {
        var diff = Math.round((next.date - t0) / 86400000);
        var dLabel = diff === 0 ? 'D-Day' : 'D-' + diff;
        var pad = function (n) { return String(n).padStart(2, '0'); };
        var dateStr = next.date.getFullYear() + '.' + pad(next.date.getMonth() + 1) + '.' + pad(next.date.getDate());
        var hint = '';
        var probe = next.title + ' ' + next.tag;
        if (/잔금/.test(probe)) {
          hint = dealType === 'lease'
            ? '당일 전입신고+확정일자+보증보험까지 — 전세계약 체크리스트로 점검하세요'
            : '등기·정산 누락 방지 — 잔금일 체크리스트로 최종 점검하세요';
        } else if (/취득세|세금/.test(probe)) {
          hint = '기한을 넘기면 가산세 — 취득세 계산기에서 납부액을 확인하세요';
        } else if (/전입|확정/.test(probe)) {
          hint = '전입신고는 14일 내 — 이사 당일 체크리스트를 참고하세요';
        } else if (/계약/.test(probe)) {
          hint = '계약 전 등기부 재확인 — 체크리스트의 계약 단계를 점검하세요';
        } else if (/보증/.test(probe)) {
          hint = '보증보험은 미루면 조건이 바뀔 수 있어요 — 바로 가입하세요';
        }
        cards.push(
          '<a class="resume-card" href="checklists/dday-scheduler.html">' +
          '<span class="resume-tag">다음 일정</span>' +
          '<span class="resume-title">' + esc(dLabel + ' · ' + next.title) + '</span>' +
          '<span class="resume-meta">' + esc(dateStr) + ' · D-Day 스케줄러</span>' +
          (hint ? '<span class="resume-hint">⚠ ' + esc(hint) + '</span>' : '') +
          '</a>'
        );
      }
    }

    // 2) 여정 로드맵(체크리스트 내 섹션): 표시해 둔 현재 단계
    var rm = read('topda:journey', 'null');
    if (rm && rm.id && rm.label) {
      var typeLabel = rm.type === 'lease' ? '전세·월세' : '매매';
      cards.push(
        '<a class="resume-card" href="checklists/index.html?type=' + esc(rm.type || 'sale') + '#stage-' + esc(rm.id) + '">' +
        '<span class="resume-tag">여정 로드맵</span>' +
        '<span class="resume-title">' + esc(rm.label) + ' 단계 진행 중</span>' +
        '<span class="resume-meta">' + esc(typeLabel) + ' 여정 · 다음 단계 미리 보기</span>' +
        '</a>'
      );
    }

    // 3) 진행 중인 체크리스트 (완료 전 항목, 최근 사용순)
    var HUB_META = {
      'sale-balance-day': ['매매 잔금일 체크리스트', 'checklists/sale-balance-day.html'],
      'lease-contract': ['전세계약 체크리스트', 'checklists/lease-contract.html'],
      'moving-day': ['이사 당일 체크리스트', 'checklists/moving-day.html'],
      'interior-contract': ['인테리어 계약 체크리스트', 'checklists/interior-contract.html'],
    };
    var hub = read('cl-hub', '{}');
    Object.keys(hub)
      .filter(function (k) { return HUB_META[k] && hub[k] && hub[k].pct > 0 && hub[k].pct < 100; })
      .sort(function (a, b) { return (hub[b].updated || 0) - (hub[a].updated || 0); })
      .forEach(function (k) {
        if (cards.length >= 3) return;
        var d = hub[k];
        cards.push(
          '<a class="resume-card" href="' + HUB_META[k][1] + '">' +
          '<span class="resume-tag">체크리스트</span>' +
          '<span class="resume-title">' + esc(HUB_META[k][0]) + '</span>' +
          '<span class="resume-meta">' + esc(d.done + ' / ' + d.total + ' 완료 · ' + d.pct + '%') + '</span>' +
          '<span class="resume-bar"><span style="width:' + Math.max(0, Math.min(100, d.pct)) + '%"></span></span>' +
          '</a>'
        );
      });

    if (!cards.length) return;

    var sec = document.createElement('section');
    sec.className = 'home-resume';
    sec.innerHTML =
      '<div class="container"><div class="resume-box">' +
      '<div class="resume-head"><h2>이어서 하기</h2><a href="checklists/index.html#journey">여정 로드맵 →</a></div>' +
      '<div class="resume-grid">' + cards.slice(0, 3).join('') + '</div>' +
      '</div></div>';
    intro.insertAdjacentElement('afterend', sec);
  } catch (e) { /* noop */ }
})();

/* ── 운영자 즉시 미리보기 부트스트랩 ──────────────────────────────────────────
   가이드 본문 편집기(/admin/edit.html)로 저장한 수정본은 다음 배포 때 HTML에
   구워진다. 그 사이 운영자 본인은 결과를 바로 보고 싶으므로, 운영자 키가 있고
   이 페이지에 편집 대상([data-edit])이 있을 때만 미리보기 스크립트를 불러온다.
   일반 방문자에게는 localStorage 읽기 한 번이 전부다 — 네트워크 요청은 0건. */
(function () {
  try {
    if (!localStorage.getItem('board:admin_key')) return;
    if (!document.querySelector('[data-edit]')) return;
    var load = function (src) {
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      document.head.appendChild(s);
      return s;
    };
    if (window.TopdaSupabase) load('/assets/overrides-preview.js?v=20260729');
    else load('/assets/supabase-client.js?v=20260729').addEventListener('load', function () {
      load('/assets/overrides-preview.js?v=20260729');
    });
  } catch (e) { /* noop */ }
})();
