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
// 모델 (주거용 매매 기준, 지방세법 제11·제15조 / 지방세법 시행령 / 농어촌특별세법 / 지방세특례제한법 제36조의2):
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
// 4) 생애최초 주택 취득 감면 (지방세특례제한법 제36조의2)
//    - 무주택 세대 + 가액 12억 이하 → 취득세 최대 200만 원 한도 감면
function calcAcquisitionTax(input) {
  const {
    price, homes, regulated, areaOver85, firstHome,
    acqType = 'purchase', tempTwoHome = false,
    inheritNoHome = false, giftHeavy,
    giftDonorMultiHome = false,
    unsold2026 = false, // 2026 한시: 지방 미분양 아파트 감면(85㎡↓·6억↓, 50%감면+중과제외)
  } = input;
  if (!price || price <= 0) return null;
  const eok = price / 100000000;
  // 유상취득 6~9억 누진식: 세율 = (취득가액×2/3억 − 3) / 100
  const progRate = eok <= 6 ? 0.01 : eok <= 9 ? ((eok * 2 / 3) - 3) / 100 : 0.03;

  // 2026 한시 미분양 감면 적용 가능 여부 (유상취득 + 85㎡↓ + 6억↓)
  const R = (window.TOPDA_RATES && window.TOPDA_RATES.acquisitionTax) || {};
  const relief = R.unsold2026Relief || { areaMaxSqm: 85, priceMax: 600000000, discountRatio: 0.50, excludeHeavySurcharge: true };
  const unsoldEligible = unsold2026 && acqType === 'purchase' && !areaOver85 && price <= relief.priceMax;

  let baseRate, isHeavy = false, scenario = '', scenarioKey = '';

  if (acqType === 'inherit') {
    // 상속 취득: 무주택 세대의 1가구 1주택 상속 0.8% 특례, 그 외 2.8%
    baseRate = inheritNoHome ? 0.008 : 0.028;
    scenario = inheritNoHome ? '상속 · 무주택 1가구1주택 특례(0.8%)' : '상속 취득(2.8%)';
    scenarioKey = inheritNoHome ? 'inherit-nohome' : 'inherit-other';
  } else if (acqType === 'gift') {
    // 무상취득(증여): 표준 3.5%. 조정대상지역 + 시가표준 3억 이상 다주택자 증여 → 12% 중과
    // 기존 호출부가 giftHeavy를 명시하면 그 값을 존중하고, 새 UI에서는 객관 조건으로 자동 판정한다.
    const giftHeavyApplied = giftHeavy == null
      ? regulated && giftDonorMultiHome && price >= 300000000
      : Boolean(giftHeavy);
    if (giftHeavyApplied) { baseRate = 0.12; isHeavy = true; scenario = '증여 · 조정대상 3억↑ 중과(12%)'; scenarioKey = 'gift-heavy'; }
    else { baseRate = 0.035; scenario = '증여 취득(3.5%)'; scenarioKey = 'gift-standard'; }
  } else if (acqType === 'original') {
    // 원시취득(신축·신규 분양 등)
    baseRate = 0.028;
    scenario = '원시취득·신축(2.8%)';
    scenarioKey = 'original';
  } else {
    // 유상취득(매매). 일시적 2주택은 종전주택 처분 조건 충족 시 1주택 세율 적용
    // 2026 미분양 한시감면 적용 시 다주택 중과 제외 → 표준세율로
    const effHomes = (homes === 2 && tempTwoHome) ? 1 :
      (unsoldEligible && relief.excludeHeavySurcharge ? Math.min(homes, 1) : homes);
    if (effHomes === 1) {
      baseRate = progRate;
      if (homes === 2 && tempTwoHome) { scenario = '일시적 2주택 → 1주택 세율 적용'; scenarioKey = 'temp-two-home'; }
      else if (unsoldEligible && homes >= 2) { scenario = '미분양 한시 감면 — 다주택 중과 제외, 표준세율'; scenarioKey = 'unsold-relief'; }
      else { scenario = '1주택 표준세율'; scenarioKey = 'h1-standard'; }
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

  let acquisition = price * baseRate;

  // 생애최초 주택 구입 감면 (유상취득·1주택 표준세율·취득가액 12억 이하, 최대 200만 원)
  let firstHomeDeduct = 0;
  const effHomesForFirst = (homes === 2 && tempTwoHome) ? 1 : homes;
  if (acqType === 'purchase' && firstHome && effHomesForFirst === 1 && !isHeavy && eok <= 12) {
    firstHomeDeduct = Math.min(2000000, acquisition);
    acquisition = acquisition - firstHomeDeduct;
  }

  // 2026 한시 미분양 50% 감면 (취득세 본세에서 차감)
  let unsoldDeduct = 0;
  if (unsoldEligible) {
    unsoldDeduct = acquisition * relief.discountRatio;
    acquisition = acquisition - unsoldDeduct;
    scenario += ' · 미분양 한시 50% 감면';
  }

  // 농어촌특별세: 전용 85㎡ 초과만 과세 (85㎡ 이하 면제)
  let ruralTax = 0;
  if (areaOver85) {
    if (isHeavy && baseRate >= 0.12) ruralTax = price * 0.010;
    else if (isHeavy && baseRate >= 0.08) ruralTax = price * 0.006;
    else ruralTax = price * 0.002;
  }

  // 지방교육세 (지방세법 제151조)
  let localEduTax;
  if (isHeavy) {
    localEduTax = price * 0.004; // 중과(8·12%)는 0.4% 고정
  } else if (acqType === 'purchase') {
    localEduTax = (price * baseRate) * 0.10; // 주택 유상거래: 표준세율의 1/10
  } else {
    // 상속·증여·원시취득: (표준세율 − 2%) × 20%  예) 2.8%→0.16%, 3.5%→0.3%
    localEduTax = price * Math.max(0, (baseRate - 0.02)) * 0.20;
  }

  const total = acquisition + ruralTax + localEduTax;

  return {
    baseRate, isHeavy, scenario, scenarioKey, acqType,
    acquisition, firstHomeDeduct, unsoldDeduct, unsoldEligible,
    giftHeavyApplied: acqType === 'gift' && isHeavy,
    ruralTax, localEduTax,
    total,
  };
}

// scenarioKey → 6개 언어 표시 문구 (한국어 UI는 항상 r.scenario 그대로 사용, 이 표는 비-한국어 페이지 전용)
const SCENARIO_I18N = {
  'inherit-nohome':   { en: 'Inheritance · no-home household special rate (0.8%)', 'zh-Hans': '继承·无房家庭特例（0.8%）', 'zh-Hant': '繼承·無房家庭特例（0.8%）', vi: 'Thừa kế · ưu đãi hộ không nhà (0,8%)', th: 'มรดก · อัตราพิเศษครัวเรือนไม่มีบ้าน (0.8%)' },
  'inherit-other':    { en: 'Inheritance (2.8%)', 'zh-Hans': '继承取得（2.8%）', 'zh-Hant': '繼承取得（2.8%）', vi: 'Thừa kế (2,8%)', th: 'มรดก (2.8%)' },
  'gift-heavy':       { en: 'Gift · regulated area ≥300M heavy rate (12%)', 'zh-Hans': '赠与·调整地区3亿以上重课（12%）', 'zh-Hant': '贈與·調整地區3億以上重課（12%）', vi: 'Tặng cho · khu điều tiết ≥3 trăm triệu, thuế nặng (12%)', th: 'ให้เปล่า · เขตควบคุม ≥300 ล้าน อัตราสูง (12%)' },
  'gift-standard':    { en: 'Gift (3.5%)', 'zh-Hans': '赠与取得（3.5%）', 'zh-Hant': '贈與取得（3.5%）', vi: 'Tặng cho (3,5%)', th: 'ให้เปล่า (3.5%)' },
  original:           { en: 'Original acquisition · new build (2.8%)', 'zh-Hans': '原始取得·新建（2.8%）', 'zh-Hant': '原始取得·新建（2.8%）', vi: 'Nguyên thủy · xây mới (2,8%)', th: 'ได้มาแรกเริ่ม · สร้างใหม่ (2.8%)' },
  'temp-two-home':    { en: 'Temporary 2-home → taxed as 1 home', 'zh-Hans': '一时性2套→按1套税率', 'zh-Hant': '一時性2戶→按1戶稅率', vi: 'Tạm thời 2 căn → áp thuế 1 căn', th: 'ชั่วคราว 2 หลัง → คิดภาษีเหมือน 1 หลัง' },
  'unsold-relief':    { en: '2026 unsold-unit relief — multi-home surcharge excluded, standard rate', 'zh-Hans': '2026滞销房减免—排除多套重课，标准税率', 'zh-Hant': '2026滯銷房減免—排除多戶重課，標準稅率', vi: 'Ưu đãi 2026 nhà tồn kho — miễn phụ thu đa nhà, thuế chuẩn', th: 'ลดหย่อนบ้านค้างขาย 2026 — ยกเว้นภาษีหลายหลัง อัตรามาตรฐาน' },
  'h1-standard':      { en: '1-home standard rate', 'zh-Hans': '1套标准税率', 'zh-Hant': '1戶標準稅率', vi: '1 căn, thuế suất chuẩn', th: 'อัตรามาตรฐาน 1 หลัง' },
  'h2-regulated':     { en: 'Regulated area · 2-home heavy rate (8%)', 'zh-Hans': '调整地区·2套重课（8%）', 'zh-Hant': '調整地區·2戶重課（8%）', vi: 'Khu điều tiết · 2 căn thuế nặng (8%)', th: 'เขตควบคุม · 2 หลัง อัตราสูง (8%)' },
  'h2-nonregulated':  { en: 'Non-regulated · 2-home standard rate', 'zh-Hans': '非调整地区·2套标准税率', 'zh-Hant': '非調整地區·2戶標準稅率', vi: 'Khu không điều tiết · 2 căn thuế chuẩn', th: 'นอกเขตควบคุม · 2 หลัง อัตรามาตรฐาน' },
  'h3-regulated':     { en: 'Regulated area · 3-home heavy rate (12%)', 'zh-Hans': '调整地区·3套重课（12%）', 'zh-Hant': '調整地區·3戶重課（12%）', vi: 'Khu điều tiết · 3 căn thuế nặng (12%)', th: 'เขตควบคุม · 3 หลัง อัตราสูง (12%)' },
  'h3-nonregulated':  { en: 'Non-regulated · 3-home heavy rate (8%)', 'zh-Hans': '非调整地区·3套重课（8%）', 'zh-Hant': '非調整地區·3戶重課（8%）', vi: 'Khu không điều tiết · 3 căn thuế nặng (8%)', th: 'นอกเขตควบคุม · 3 หลัง อัตราสูง (8%)' },
  h4plus:             { en: '4+ homes heavy rate (12%)', 'zh-Hans': '4套以上重课（12%）', 'zh-Hant': '4戶以上重課（12%）', vi: '4+ căn thuế nặng (12%)', th: '4+ หลัง อัตราสูง (12%)' },
};
const UNSOLD_SUFFIX = { en: ' · 2026 unsold-unit 50% relief', 'zh-Hans': ' · 2026滞销房50%减免', 'zh-Hant': ' · 2026滯銷房50%減免', vi: ' · Ưu đãi 50% nhà tồn kho 2026', th: ' · ลดหย่อนบ้านค้างขาย 2026 50%' };
function scenarioText(r, lang) {
  if (lang === 'ko' || !lang) return r.scenario;
  const t = (SCENARIO_I18N[r.scenarioKey] && SCENARIO_I18N[r.scenarioKey][lang]) || (SCENARIO_I18N[r.scenarioKey] && SCENARIO_I18N[r.scenarioKey].en) || r.scenario;
  return t + (r.unsoldDeduct ? ((UNSOLD_SUFFIX[lang] || UNSOLD_SUFFIX.en)) : '');
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
    if (r.surchargeWaived && regulated && homes >= 2) return '<strong>다주택 중과 한시 유예 적용</strong>양도일이 ' + r.waiverUntil + ' 이전이고 보유 2년 이상이라 중과세율(20~30%p)이 자동으로 빠졌습니다.';
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
    setEligible('tempTwoHome', acqType === 'purchase' && homes === 2);
    setEligible('firstHome', acqType === 'purchase' && homes === 1 && price <= 1200000000);
    setEligible('unsold2026', acqType === 'purchase' && !areaOver85 && price <= 600000000);

    const status = root.querySelector('[data-acq-auto-status]');
    if (!status) return;
    if (acqType === 'gift') {
      const regulated = root.querySelector('[name="regulated"]')?.checked || false;
      const donorMulti = root.querySelector('[name="giftDonorMultiHome"]')?.checked || false;
      const heavy = price >= 300000000 && regulated && donorMulti;
      status.textContent = isEn
        ? (heavy ? 'Automatically applied: 12% gift acquisition-tax rate.' : 'Automatically applied: standard 3.5% gift acquisition-tax rate.')
        : (heavy ? '자동 판정: 증여 취득세 12% 중과가 적용됩니다.' : '자동 판정: 증여 취득세 표준세율 3.5%가 적용됩니다.');
      return;
    }
    if (acqType === 'purchase') {
      const disabled = [];
      if (homes !== 2) disabled.push(isEn ? 'temporary 2-home relief' : '일시적 2주택');
      if (homes !== 1 || price > 1200000000) disabled.push(isEn ? 'first-home relief' : '생애최초 감면');
      if (areaOver85 || price > 600000000) disabled.push(isEn ? '2026 unsold-unit relief' : '2026 미분양 감면');
      status.textContent = disabled.length
        ? (isEn ? 'Automatically unavailable under the current inputs: ' : '현재 입력값으로 자동 제외: ') + disabled.join(isEn ? ', ' : ' · ')
        : (isEn ? 'Eligibility limits are checked automatically from price, home count, and floor area.' : '가격·주택 수·면적에 따른 적용 가능 여부를 자동으로 확인합니다.');
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
    if (r.acqType !== 'purchase') return; // 표는 유상취득 기준
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
    const r = calcAcquisitionTax({
      price, homes, regulated, areaOver85, firstHome, acqType,
      tempTwoHome, inheritNoHome, giftDonorMultiHome, unsold2026,
      ...(legacyGiftHeavy ? { giftHeavy: legacyGiftHeavy.checked } : {}),
    });
    if (!r) {
      setText('total', fmt.won(0));
      ['acquisition','ruralTax','localEduTax','firstHomeDeduct'].forEach(k => setText(k, fmt.won(0)));
      setText('rate', '—');
      setText('scenario', isEn ? 'Enter a price' : '매매가를 입력하세요');
      return;
    }
    setText('scenario', scenarioText(r, document.documentElement.lang));
    setText('rate', (r.baseRate * 100).toFixed(2) + '%' + (r.isHeavy ? (isEn ? ' (heavy)' : ' (중과)') : ''));
    setText('acquisition', fmt.won(r.acquisition));
    setText('ruralTax', r.ruralTax ? fmt.won(r.ruralTax) : (isEn ? 'Exempt' : '면제'));
    setText('localEduTax', fmt.won(r.localEduTax));
    setText('firstHomeDeduct', r.firstHomeDeduct ? '−' + fmt.won(r.firstHomeDeduct) : (isEn ? 'N/A' : '해당 없음'));
    setText('unsoldDeduct', r.unsoldDeduct ? '−' + fmt.won(r.unsoldDeduct) : (isEn ? 'N/A' : '해당 없음'));
    setText('total', fmt.won(r.total));
    highlightRateRow(r, homes, regulated, price / 100000000);
  };
  inputs.forEach((el) => el.addEventListener('input', recalc));
  inputs.forEach((el) => el.addEventListener('change', recalc));
  recalc();
})();

// ===== Brokerage Fee Calculator =====
// 주택 매매 기준 (서울 기준 상한요율, 협의 가능).
// 출처: 공인중개사법 시행규칙 별표1 (지자체별 차이 있음, 본 위젯은 서울특별시 기준 단순화)
function calcBrokerageFee({ price, type }) {
  if (!price || price <= 0) return null;
  const eok = price / 100000000;
  let rate;
  let max;
  if (type === 'sale') {
    // 매매 (서울 기준)
    if (eok < 0.5) { rate = 0.006; max = 250000; }
    else if (eok < 2) { rate = 0.005; max = 800000; }
    else if (eok < 9) { rate = 0.004; max = null; }
    else if (eok < 12) { rate = 0.005; max = null; }
    else if (eok < 15) { rate = 0.006; max = null; }
    else { rate = 0.007; max = null; }
  } else if (type === 'jeonse') {
    // 전세 (서울 기준)
    if (eok < 0.5) { rate = 0.005; max = 200000; }
    else if (eok < 1) { rate = 0.004; max = 300000; }
    else if (eok < 6) { rate = 0.003; max = null; }
    else if (eok < 12) { rate = 0.004; max = null; }
    else if (eok < 15) { rate = 0.005; max = null; }
    else { rate = 0.006; max = null; }
  }
  let fee = price * rate;
  if (max != null) fee = Math.min(fee, max);
  return { rate, max, fee, vat: fee * 0.1, total: fee * 1.1 };
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
  const recalc = () => {
    const price = fmt.parseWon(root.querySelector('[name="price"]').value);
    const type = root.querySelector('[name="type"]:checked')?.value || 'sale';
    const r = calcBrokerageFee({ price, type });
    const setText = (sel, txt) => { const el = root.querySelector(sel); if (el) el.textContent = txt; };
    if (!r) {
      setText('[data-out="rate"]', '—');
      setText('[data-out="cap"]', '—');
      setText('[data-out="fee"]', '0원');
      setText('[data-out="vat"]', '0원');
      setText('[data-out="total"]', '0원');
      return;
    }
    setText('[data-out="rate"]', (r.rate * 100).toFixed(2) + '%');
    setText('[data-out="cap"]', r.max ? fmt.won(r.max) : (isEn ? 'No cap (negotiable)' : '상한 없음(협의)'));
    setText('[data-out="fee"]', fmt.won(r.fee));
    setText('[data-out="vat"]', fmt.won(r.vat));
    setText('[data-out="total"]', fmt.won(r.total));
  };
  root.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', recalc);
    el.addEventListener('change', recalc);
  });
  recalc();
})();

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
    sellPrice, buyPrice, cost, holdYears, liveYears,
    homes, onlyHome, regulated,
    assetType = 'house', // 종합계산기의 비주택(상가·업무용 오피스텔·토지) 단기세율 분기용
    surchargeExempt = false, // 조정지역 다주택이라도 중과 제외 요건(장기임대·상속 등) 해당 시 true
    sellDate,        // 'YYYY-MM-DD' — 다주택 중과 한시 유예(2026-05-09까지) 자동 판단용
    jointOwners = 1, // 공동명의 인원(1=단독, 2=부부 공동 등). 양도차익을 균등 분할 후 세액 합산
  } = input;
  if (!sellPrice || sellPrice <= 0) return null;

  const rawGain = Math.max(0, sellPrice - buyPrice - cost);
  const isHousing = assetType !== 'nonhouse';

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

  // 다주택 중과 한시 유예 자동 판단:
  //  보유 2년+ & 양도일 ≤ 2026-05-09 이면 조정지역·다주택이어도 중과 미적용.
  const W = (typeof window !== 'undefined' && window.TOPDA_RATES && window.TOPDA_RATES.transferTax) || {};
  const waiverUntil = W.multiHomeSurchargeWaiverUntil || '2026-05-09';
  const waiverMinHold = W.multiHomeSurchargeWaiverMinHoldYears || 2;
  const sd = (sellDate && /^\d{4}-\d{2}-\d{2}$/.test(sellDate)) ? sellDate : '';
  const surchargeWaived = Boolean(isHousing && regulated && homes >= 2 && sd && sd <= waiverUntil && holdYears >= waiverMinHold);

  // 다주택 중과 대상 판정 (조정대상지역 + 2주택 이상 + 장기보유 + 한시유예/중과배제 미해당).
  //  조정지역 다주택 양도는 세율 가산과 함께 장기보유특별공제가 배제된다 (소득세법 제95조 제2항).
  const heavyTax = isHousing && !shortTermRate && regulated && homes >= 2 && !surchargeWaived && !surchargeExempt;

  // 장기보유특별공제 (단기보유·다주택 중과 대상은 배제)
  let ltDeductRate = 0;
  if (!shortTermRate && !heavyTax && holdYears >= 3) {
    if (isOneHome && sellPrice > 1200000000 && liveYears >= 2) {
      // 표2(1세대1주택·거주 2년 이상): 보유 연 4%(최대 40%) + 거주 연 4%(최대 40%), 합산 최대 80%
      const holdY = Math.min(holdYears, 10);
      const liveY = Math.min(liveYears, 10);
      const holdRate = holdY >= 3 ? Math.min(0.40, 0.12 + (holdY - 3) * 0.04) : 0;
      const liveRate = liveY >= 3 ? Math.min(0.40, 0.12 + (liveY - 3) * 0.04) : 0;
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
    appliedRateLabel += ' (중과 한시유예 적용 — ' + waiverUntil + '까지)';
  }

  // 산출세액 = 과세표준 × 세율 − 누진공제.
  //  중과 시에도 기본세율 구간의 누진공제는 유지된다(가산분만 정률). 단기보유는 누진공제 0.
  const incomeTax = Math.max(0, taxBase * rate - deduction);

  // 공동명의 안분: 양도차익을 인원수로 균등 분할 후 각자 누진세율로 산출 → 합산.
  //  단순 분할로 누진세율 구간이 낮아져 절세 효과가 발생한다.
  //  단기보유·다주택 중과는 인원과 무관하므로 위와 동일 세율 적용.
  const owners = Math.max(1, Math.min(4, Math.round(Number(jointOwners) || 1)));
  let jointBasicDeduct = null, jointTaxBase = null;
  let jointMarginalRatePct = null, jointAppliedRateLabel = null;
  let jointIncomeTax = null, jointLocalTax = null, jointTotal = null, savings = 0;
  if (owners > 1 && !exempted) {
    const perGain = taxableGain / owners;
    const perLtDeduct = perGain * ltDeductRate;
    const perIncome = Math.max(0, perGain - perLtDeduct);
    const perBasic = Math.min(2500000, perIncome);
    const perBase = Math.max(0, perIncome - perBasic);
    jointBasicDeduct = perBasic * owners;
    jointTaxBase = perBase * owners;
    let perTax;
    if (shortTermRate) {
      perTax = perBase * shortTermRate;
      jointMarginalRatePct = shortTermRate * 100;
      jointAppliedRateLabel = (shortTermRate * 100) + '% (단기보유 중과)';
    } else {
      // 분할된 과세표준으로 각자 누진세율 재산정 후 중과 가산분(있으면) 적용
      const t = calcProgressiveTax(perBase);
      perTax = Math.max(0, perBase * (t.marginalRate + surchargeRate) - t.deduction);
      jointMarginalRatePct = Math.round(t.marginalRate * 100);
      jointAppliedRateLabel = jointMarginalRatePct + '% (누진)';
      if (surchargeRate > 0) jointAppliedRateLabel += ' + ' + (surchargeRate * 100) + '%p 중과';
      else if (surchargeWaived) jointAppliedRateLabel += ' (중과 한시유예 적용 — ' + waiverUntil + '까지)';
    }
    jointIncomeTax = perTax * owners;
    jointLocalTax = jointIncomeTax * 0.10;
    jointTotal = jointIncomeTax + jointLocalTax;
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
    jointBasicDeduct, jointTaxBase, jointMarginalRatePct, jointAppliedRateLabel,
    jointIncomeTax, jointLocalTax, jointTotal, jointSavings: savings,
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
    const jointOwners = Number(root.querySelector('[name="jointOwners"]')?.value || 1);
    const r = calcTransferTax({
      sellPrice, buyPrice, cost, holdYears, liveYears,
      homes, onlyHome, regulated, surchargeExempt,
      sellDate, jointOwners,
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
      } else {
        jointBox.style.display = 'none';
      }
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
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
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
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
})();

// ===== Housing Subscription Score (청약가점) =====
function calcSubscriptionScore({ noHomeYears, dependents, accountYears }) {
  // 무주택기간 (32점): 만30세 미만이거나 미혼이면 0점. 1년 미만 2점, 1년부터 매년 +2점, 15년 32점
  let s1;
  if (noHomeYears < 1) s1 = 2;
  else s1 = Math.min(32, 2 + Math.floor(noHomeYears) * 2);
  if (noHomeYears <= 0) s1 = 0;

  // 부양가족 (35점): 0명 5점, 1~6명 매명 +5점, 7명+ 35점
  let s2 = Math.min(35, 5 + dependents * 5);

  // 청약통장 가입기간 (17점): 6개월 미만 1점, 6개월~1년 2점, 1년부터 매년 +1점, 15년 이상 17점
  let s3;
  if (accountYears < 0.5) s3 = 1;
  else if (accountYears < 1) s3 = 2;
  else s3 = Math.min(17, 2 + Math.floor(accountYears));

  return { s1, s2, s3, total: s1 + s2 + s3 };
}

(function () {
  const root = document.querySelector('[data-calc="housing-subscription"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const recalc = () => {
    const noHomeYears = Number(root.querySelector('[name="noHomeYears"]').value || 0);
    const dependents = Number(root.querySelector('[name="dependents"]').value || 0);
    const accountYears = Number(root.querySelector('[name="accountYears"]').value || 0);
    const r = calcSubscriptionScore({ noHomeYears, dependents, accountYears });
    setText('s1', r.s1 + '점');
    setText('s2', r.s2 + '점');
    setText('s3', r.s3 + '점');
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

    // 인지세(부동산 소유권 이전, 인지세법 제3조 구간별 정액)
    function stampDuty(price) {
      if (price <= 10000000) return 0;
      if (price <= 30000000) return 20000;
      if (price <= 50000000) return 40000;
      if (price <= 100000000) return 70000;
      if (price <= 1000000000) return 150000;
      return 350000;
    }

    // 국민주택채권 매입률 (주택도시기금법 시행령 별표, 시가표준액 구간별)
    //  region: 'metro'(특별시·광역시) | 'other'(그 밖의 지역) — 상위 구간 요율이 다름
    function bondRate(std, asset, region) {
      const eok = std / 100000000;
      const metro = region !== 'other';
      if (asset === 'land') {
        if (std < 5000000) return 0;
        if (eok < 0.5) return metro ? 0.025 : 0.020;
        if (eok < 1) return metro ? 0.040 : 0.035;
        return metro ? 0.050 : 0.045;
      }
      // 주택
      if (std < 20000000) return 0;
      if (eok < 0.5) return 0.013;
      if (eok < 1) return 0.019;
      if (eok < 1.6) return metro ? 0.021 : 0.018;
      if (eok < 2.6) return metro ? 0.023 : 0.021;
      if (eok < 6) return metro ? 0.026 : 0.024;
      return metro ? 0.031 : 0.026;
    }

    // 채권 매입금액은 만원 단위로 절상(5천원 미만 절사·5천원 이상 절상) — 주택도시기금법 시행령
    function roundBond(amount) {
      return Math.round(amount / 10000) * 10000;
    }

    // 법무사 기본보수(부동산 소유권이전 등기) — 대한법무사협회 보수표 2024.9.12 시행 상한 기준
    //  5천만↓ 21만 정액 / 5천만~1억 +0.10% / 1억~3억 +0.09% / 3억~5억 +0.08% / 5억~10억 +0.07% / 10억↑ +0.05%
    //  ※ 협회 표는 '기본보수 상한'이며 실제는 사무소별 할인·가산(난이도)·교통비가 더해집니다.
    function scrivenerFee(price) {
      if (price <= 0) return 0;
      let f;
      if (price <= 50000000) f = 210000;
      else if (price <= 100000000) f = 210000 + (price - 50000000) * 0.0010;
      else if (price <= 300000000) f = 260000 + (price - 100000000) * 0.0009;
      else if (price <= 500000000) f = 440000 + (price - 300000000) * 0.0008;
      else if (price <= 1000000000) f = 600000 + (price - 500000000) * 0.0007;
      else f = 950000 + (price - 1000000000) * 0.0005;
      return Math.round(f / 1000) * 1000;
    }

    // 법무사·등기 부대비용 (등록면허세·취득세는 별도 본세로 이미 반영)
    //  인지세 + 등기신청 수수료 + 국민주택채권 즉시매도 할인부담 + 법무사 보수(+부가세)
    function registrationCost(price, std, discount, self, asset, region) {
      if (!price || price <= 0) return { total: 0, stamp: 0, regFee: 0, bond: 0, bondBuy: 0, rate: 0, scrivener: 0, vat: 0, std: 0 };
      if (!std || std <= 0) std = Math.round(price * 0.7);
      const stamp = stampDuty(price);
      const regFee = 15000;
      const rate = bondRate(std, asset || 'house', region);
      const bondBuy = roundBond(std * rate);
      const bond = Math.round(bondBuy * (discount || 0));
      const scrivener = self ? 0 : scrivenerFee(price);
      const vat = Math.round(scrivener * 0.1);
      return { total: stamp + regFee + bond + scrivener + vat, stamp, regFee, bond, bondBuy, rate, scrivener, vat, std };
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
          row.innerHTML = `<span class="key" style="font-weight:700;">${it.label}</span><span class="val" style="font-weight:700;">${fmt.won(it.value)}</span>`;
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
        case 'mortgageBullet': return [function (a, t) { return a / t; }, L('주택담보대출(만기일시·거치) → 원금(대출액÷대출기간 N년) + 이자', 'Mortgage (bullet/grace) → principal (loan ÷ N-year term) + interest'), true];
        case 'nonhouse': return [function (a) { return a / 8; }, L('비주택담보대출 → 원금(대출액÷8년) + 이자 (금감원 산정만기 8년)', 'Non-housing mortgage → principal (loan ÷ 8 years) + interest (FSS assumed 8-year term)'), false];
        case 'jeonse': return [function () { return 0; }, L('전세자금대출 → 이자만 반영 (보증부는 DSR 산정 제외 가능)', 'Jeonse loan → interest only (guarantee-backed loans may be excluded from DSR)'), false];
        case 'deposit': return [function () { return 0; }, L('예적금·보험약관 담보대출 → 이자만 반영 (원금 제외)', 'Deposit/insurance-secured loan → interest only (principal excluded)'), false];
        case 'stock': return [function (a) { return a / 8; }, L('유가증권·기타담보대출 → 원금(대출액÷8년) + 이자 (산정만기 8년)', 'Securities/other secured loan → principal (loan ÷ 8 years) + interest (assumed 8-year term)'), false];
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
      var principal = spec[0](amount, term), interest = amount * rate;
      var annual = principal + interest;
      note.style.display = '';
      note.innerHTML = spec[1].replace('N', term)
        + (amount > 0 ? L('<br/>이 대출의 DSR 반영액 ≈ <strong>' + fmt.won(Math.round(annual)) + ' / 년</strong>', '<br/>This loan’s DSR impact ≈ <strong>' + fmt.won(Math.round(annual)) + ' / yr</strong>') : '');
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
      const status = root.querySelector('[data-dashboard-acq-status]');
      if (status) {
        const excluded = [];
        if (homes !== 2) excluded.push(L('일시적 2주택', 'temporary 2-home relief'));
        if (homes !== 1 || price > 1200000000) excluded.push(L('생애최초 감면', 'first-home relief'));
        if (areaOver85 || price > 600000000) excluded.push(L('2026 미분양 감면', '2026 unsold-unit relief'));
        status.textContent = excluded.length
          ? L('현재 입력값으로 자동 제외: ', 'Automatically unavailable: ') + excluded.join(L(' · ', ', '))
          : L('가격·주택 수·면적으로 감면 적용 가능 여부를 자동 확인합니다.', 'Relief eligibility is checked automatically from price, home count, and floor area.');
      }
    }

    function renderMortgageLimit(price, homes, regulated, firstHome, tempTwoHome, rate, term, repay, existingAnnualDebt, loan) {
      const box = root.querySelector('[data-mortgage-limit-box]');
      if (!box) return null;
      const income = getN('annualIncome');
      const loanCfg = (RATES.loan || {});
      const ltv = loanCfg.ltv || {};
      const isMulti = homes >= 2 && !tempTwoHome;
      const ltvPercent = regulated
        ? (firstHome ? (ltv.regulatedFirst ?? 70) : (isMulti ? 0 : (ltv.regulated ?? 50)))
        : (firstHome ? (ltv.nonRegulatedFirst ?? 80) : (isMulti ? (ltv.nonRegulatedMulti ?? 60) : (ltv.nonRegulated ?? 70)));
      const stress = loanCfg.stress || {};
      const stressAdd = regulated ? (stress.metro ?? 1.5) : (stress.nonMetro ?? 0.75);
      const r = calcMortgageLimit({
        price, ltvPercent, regulatedMetro: regulated,
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
      setText('mortgageInputs', `LTV ${ltvPercent}% · ${L('스트레스 금리', 'stress rate')} ${r.stressedRate.toFixed(2)}%`);
      const over = loan > r.limit;
      setText('mortgageVerdict', over
        ? L(`입력 대출이 추정 한도를 ${fmt.won(loan - r.limit)} 초과합니다.`, `Entered loan exceeds the estimate by ${fmt.won(loan - r.limit)}.`)
        : L(`입력 대출은 추정 한도보다 ${fmt.won(r.limit - loan)} 낮습니다.`, `Entered loan is ${fmt.won(r.limit - loan)} below the estimate.`));
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
        acq = acquisitionTotal(price, {
          homes, regulated, areaOver85, firstHome, tempTwoHome, unsold2026,
          acqType: 'purchase',
        });
      }
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
        renderMortgageLimit(price, homes, regulated, firstHome, tempTwoHome, rate, term, repay, existingAnnualDebt, loan);
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
          : [{ label: L('법무사 보수', 'Scrivener fee'), value: reg.scrivener, sub: true }, { label: L('└ 부가세 (10%)', '└ VAT (10%)'), value: reg.vat, sub: true }]),
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
      const r = calcTransferTax({
        sellPrice, buyPrice, cost, holdYears, liveYears,
        homes, onlyHome, regulated, assetType,
        surchargeExempt, sellDate, jointOwners,
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
        { label: L('취득가액 + 필요경비', 'Purchase price + costs'), value: buyPrice + cost, sub: true },
        { label: L('양도차익', 'Capital gain'), value: r.rawGain, color: '#1e3a8a' },
        ...(r.taxableGainRatio < 1 && r.taxableGainRatio > 0 ? [{ label: L('과세 비율 (12억 초과)', 'Taxable ratio (over KRW 1.2B)'), value: (r.taxableGainRatio*100).toFixed(1)+'%', sub: true }] : []),
        { label: L('장기보유특별공제 (' + (r.ltDeductRate*100).toFixed(0) + '%)', 'Long-term holding deduction (' + (r.ltDeductRate*100).toFixed(0) + '%)'), value: '−' + fmt.won(r.ltDeduct), sub: true },
        { label: L('기본공제', 'Basic deduction'), value: '−' + fmt.won(basicDeduct), sub: true },
        { label: L('과세표준', 'Tax base'), value: taxBase },
        { label: L('적용 세율', 'Applied rate'), value: rateLabelText(rateResult, isEn ? 'en' : 'ko'), sub: true },
        ...(r.surchargeWaived && regulated && homes >= 2 ? [{ label: L('다주택 중과', 'Multi-home surcharge'), value: L(r.waiverUntil + '까지 한시 유예', 'Waived through ' + r.waiverUntil), sub: true }] : []),
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
      let spouseDeduct = 0;
      if (hasSpouse) spouseDeduct = Math.min(3000000000, Math.max(500000000, netAssets * 0.3));
      const totalDeduct = publicDeduct + spouseDeduct;
      const taxBase = Math.max(0, netAssets - totalDeduct);
      const tax = inheritGiftTax(taxBase);
      const acq = acquisitionTotal(propValue, {
        acqType: 'inherit',
        inheritNoHome,
        areaOver85: inheritAreaOver85,
      });
      const totalBurden = tax + acq.total;

      if (resultTitle) resultTitle.textContent = L('예상 총 부담 (상속세 + 취득세)', 'Estimated total (inheritance + acquisition tax)');
      setText('primaryTotal', fmt.won(totalBurden));
      setLabel('data-quick-label1', L('상속세', 'Inheritance tax'));
      setText('quick1', fmt.won(tax));
      setLabel('data-quick-label2', L('부동산 취득세', 'Property acquisition tax'));
      setText('quick2', fmt.won(acq.total));
      setLabel('data-quick-label3', L('과세표준', 'Tax base'));
      setText('quick3', fmt.won(taxBase));

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
        ...(hasSpouse ? [{ label: L('배우자 공제 (추정)', 'Spousal deduction (estimated)'), value: '−' + fmt.won(spouseDeduct), sub: true }] : []),
        { label: L('과세표준', 'Tax base'), value: taxBase },
        { label: L('예상 상속세', 'Estimated inheritance tax'), value: tax, color: '#ef4444' },
        { label: L('상속 취득세', 'Inheritance acquisition tax'), value: acq.total, color: '#f59e0b' },
        { label: L('취득세 자동 판정', 'Acquisition-tax rule'), value: scenarioText(acq, isEn ? 'en' : 'ko'), sub: true },
        { divider: true, label: L('예상 총 부담', 'Estimated total burden'), value: totalBurden },
      ]);
    }

    function calcGift() {
      const value = getN('giftValue');
      const donee = getRadio('donee') || 'adult';
      const prev = getN('prevGift');
      const deductMap = { spouse: 600000000, adult: 50000000, minor: 20000000, other: 10000000 };
      const baseDeduct = deductMap[donee] || 0;
      const remainingDeduct = Math.max(0, baseDeduct - prev);
      const taxBase = Math.max(0, value - remainingDeduct);
      const tax = inheritGiftTax(taxBase);
      const acq = acquisitionTotal(value, {
        acqType: 'gift',
        regulated: getCheck('giftRegulated'),
        giftDonorMultiHome: getCheck('giftDonorMultiHome'),
        areaOver85: getCheck('giftAreaOver85'),
      });
      const totalBurden = tax + acq.total;
      const giftStatus = root.querySelector('[data-gift-acq-status]');
      if (giftStatus) giftStatus.textContent = L('자동 판정: ', 'Automatically selected: ') + scenarioText(acq, isEn ? 'en' : 'ko');

      if (resultTitle) resultTitle.textContent = L('예상 총 부담 (증여세 + 취득세)', 'Estimated total (gift + acquisition tax)');
      setText('primaryTotal', fmt.won(totalBurden));
      setLabel('data-quick-label1', L('공제 한도 (10년)', 'Deduction limit (10-yr)'));
      setText('quick1', fmt.won(baseDeduct));
      setLabel('data-quick-label2', L('잔여 공제', 'Remaining deduction'));
      setText('quick2', fmt.won(remainingDeduct));
      setLabel('data-quick-label3', L('과세표준', 'Tax base'));
      setText('quick3', fmt.won(taxBase));

      renderChart([
        { label: L('증여 평가액', 'Gift value'), value: value, color: '#1e3a8a' },
        { label: L('공제 한도', 'Deduction limit'), value: remainingDeduct, color: '#047857' },
        { label: L('증여세', 'Gift tax'), value: tax, color: '#ef4444' },
        { label: L('취득세 (부동산)', 'Acquisition tax (property)'), value: acq.total, color: '#f59e0b' },
      ]);
      renderDetail([
        { label: L('증여 평가액', 'Gift value'), value: value, sub: true },
        { label: L('과거 10년 증여액', 'Prior gifts (10-yr)'), value: prev, sub: true },
        { label: L('잔여 공제', 'Remaining deduction'), value: '−' + fmt.won(remainingDeduct), sub: true },
        { label: L('과세표준', 'Tax base'), value: taxBase },
        { label: L('증여세 (누진)', 'Gift tax (progressive)'), value: tax, color: '#ef4444' },
        { label: L('부동산 취득세', 'Property acquisition tax'), value: acq.total, color: '#f59e0b' },
        { label: L('취득세 자동 판정', 'Acquisition-tax rule'), value: scenarioText(acq, isEn ? 'en' : 'ko'), sub: true },
        { divider: true, label: L('예상 총 부담 (증여세 + 취득세)', 'Estimated total (gift tax + acquisition tax)'), value: totalBurden },
      ]);
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
      if (dsrBox) dsrBox.hidden = (name !== 'sale');
      if (rtiBox) rtiBox.hidden = true; // 매수 시나리오에서 calcSale이 비주택 임대일 때만 노출
      if (mortgageLimitBox) mortgageLimitBox.hidden = (name !== 'sale');
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

  function acquisitionRate(price, homes, regulated) {
    const eok = price / 100000000;
    if (homes === 1) {
      if (eok <= 6) return 0.01;
      if (eok <= 9) return ((eok * 2 / 3) - 3) / 100;
      return 0.03;
    }
    if (homes === 2) {
      return regulated ? 0.08 : (eok <= 6 ? 0.01 : eok <= 9 ? ((eok * 2 / 3) - 3) / 100 : 0.03);
    }
    return regulated ? 0.12 : 0.08;
  }

  const recalc = () => {
    const bid = fmt.parseWon(root.querySelector('[name="bid"]').value);
    const market = fmt.parseWon(root.querySelector('[name="market"]').value);
    const deposit = fmt.parseWon(root.querySelector('[name="deposit"]').value);
    const homes = Number(root.querySelector('[name="homes"]:checked')?.value || 1);
    const regulated = root.querySelector('[name="regulated"]')?.checked || false;
    const evict = fmt.parseWon(root.querySelector('[name="evict"]').value);
    const unpaid = fmt.parseWon(root.querySelector('[name="unpaid"]').value);
    const misc = fmt.parseWon(root.querySelector('[name="misc"]').value);

    if (!bid) {
      ['total','bid','depositOut','taxOut','evictOut','unpaidOut','miscOut','marketOut'].forEach(k => setText(k, '0원'));
      setText('margin', '—'); setText('verdict', '—');
      return;
    }

    const rate = acquisitionRate(bid, homes, regulated);
    const acqTax = bid * rate;
    const taxBundle = acqTax * 1.10; // 지방교육세·농특세 단순 가산
    const total = bid + deposit + taxBundle + evict + unpaid + misc;
    const margin = market > 0 ? (market - total) / market * 100 : 0;

    setText('bid', fmt.won(bid));
    setText('depositOut', fmt.won(deposit));
    setText('taxOut', fmt.won(taxBundle) + ' (' + (rate * 100).toFixed(2) + '%)');
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

  // ---- 입력값 저장/복원 + 공유/인쇄 툴바 ----
  function setup() {
    const params = new URLSearchParams(location.search);

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
//  - 가격대별 한도(6.27/10월 대책, 수도권·규제지역 구입자금): 15억↓ 6억 / 15~25억 4억 / 25억↑ 2억
//  - DSR한도 = (연소득×DSR% − 기존 연원리금)을 스트레스 금리·만기로 역산한 대출원금
// 출처: 금융위 가계부채 관리방안(6.27)·스트레스 DSR 3단계. 값은 rates.js에서 갱신.
function calcMortgageLimit(input) {
  const {
    price, ltvPercent, regulatedMetro,
    income, existingAnnualDebt = 0,
    rate, stressAdd = 0, termYears, dsrLimitPercent, repayType = 'equal',
  } = input;
  if (!price || price <= 0) return null;

  const ltvLimit = price * (ltvPercent / 100);

  // 수도권·규제지역 주택구입 가격대별 한도
  let priceCap = Infinity;
  if (regulatedMetro) {
    const caps = (window.TOPDA_RATES && window.TOPDA_RATES.loan && window.TOPDA_RATES.loan.metroPriceCaps) || [
      { upToEok: 15, cap: 600000000 }, { upToEok: 25, cap: 400000000 }, { upToEok: Infinity, cap: 200000000 },
    ];
    const eok = price / 1e8;
    const tier = caps.find((c) => eok <= c.upToEok) || caps[caps.length - 1];
    priceCap = tier.cap;
  }

  // DSR 한도 (스트레스 금리·만기 역산)
  const availAnnual = Math.max(0, (income || 0) * (dsrLimitPercent / 100) - (existingAnnualDebt || 0));
  const stressedRate = (rate || 0) + (stressAdd || 0);
  const i = stressedRate / 100 / 12;
  const n = (termYears || 0) * 12;
  let dsrFactorAnnual; // 대출원금 1원당 연간 상환액
  if (n <= 0) dsrFactorAnnual = Infinity;
  else if (repayType === 'principal') {
    // 원금균등: 상환부담이 가장 큰 첫해 12개월 합계 기준
    dsrFactorAnnual = 12 / n + i * (12 - 66 / n);
  } else {
    // 원리금균등
    const m = i > 0 ? i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1) : 1 / n;
    dsrFactorAnnual = m * 12;
  }
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
  const realI = (rate || 0) / 100 / 12;
  let realFactorAnnual;
  if (n <= 0) realFactorAnnual = 0;
  else if (repayType === 'principal') realFactorAnnual = 12 / n + realI * (12 - 66 / n);
  else {
    const m2 = realI > 0 ? realI * Math.pow(1 + realI, n) / (Math.pow(1 + realI, n) - 1) : 1 / n;
    realFactorAnnual = m2 * 12;
  }
  const actualAnnualPmt = limit * realFactorAnnual;
  const actualDsrPct = income > 0 ? (actualAnnualPmt + (existingAnnualDebt || 0)) / income * 100 : 0;

  return { ltvLimit, priceCap, dsrLimit, limit, binding, stressedRate, availAnnual, actualDsrPct };
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
  const ltvCfg = R.ltv || { nonRegulated: 70, nonRegulatedFirst: 80, regulated: 50, regulatedFirst: 70, regulatedStrong: 40 };
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

  // LTV 자동 채움 (지역×보유) — 사용자가 직접 수정 가능
  const ltvInput = root.querySelector('[name="ltvPercent"]');
  let ltvTouched = false;
  if (ltvInput) ltvInput.addEventListener('input', () => { ltvTouched = true; });
  function suggestLtv() {
    if (ltvTouched) return;
    const region = root.querySelector('[name="region"]:checked')?.value || 'regulated';
    const own = root.querySelector('[name="ownership"]:checked')?.value || 'none';
    let v;
    if (region === 'regulated') {
      v = own === 'first' ? ltvCfg.regulatedFirst : (own === 'multi' ? 0 : ltvCfg.regulated);
    } else {
      v = own === 'first' ? ltvCfg.nonRegulatedFirst : (own === 'multi' ? 60 : ltvCfg.nonRegulated);
    }
    if (ltvInput) ltvInput.value = v;
  }

  const stressInput = root.querySelector('[name="stressAdd"]');
  let stressTouched = false;
  if (stressInput) stressInput.addEventListener('input', () => { stressTouched = true; });
  function suggestStress() {
    if (stressTouched) return;
    const region = root.querySelector('[name="region"]:checked')?.value || 'regulated';
    const st = R.stress || { metro: 1.5, nonMetro: 0.75 };
    if (stressInput) stressInput.value = region === 'regulated' ? st.metro : st.nonMetro;
  }

  function recalcMortgage() {
    const price = fmt.parseWon(root.querySelector('[name="price"]').value);
    const region = root.querySelector('[name="region"]:checked')?.value || 'regulated';
    const own = root.querySelector('[name="ownership"]:checked')?.value || 'none';
    suggestLtv(); suggestStress();
    const ltvPercent = Number(ltvInput?.value || 0);
    const income = fmt.parseWon(root.querySelector('[name="income"]').value);
    const existingMonthly = fmt.parseWon(root.querySelector('[name="existingMonthly"]').value);
    const rate = Number(root.querySelector('[name="rate"]').value || 0);
    const stressAdd = Number(stressInput?.value || 0);
    const termYears = Number(root.querySelector('[name="termYears"]').value || 0);
    const dsrLimitPercent = Number(root.querySelector('[name="dsrLimit"]:checked')?.value || 40);
    const repayType = root.querySelector('[name="repayType"]:checked')?.value || 'equal';

    const multiWarn = root.querySelector('[data-out="multiWarn"]');
    show(multiWarn, region === 'regulated' && own === 'multi');

    const r = calcMortgageLimit({
      price, ltvPercent, regulatedMetro: region === 'regulated',
      income, existingAnnualDebt: existingMonthly * 12,
      rate, stressAdd, termYears, dsrLimitPercent, repayType,
    });
    if (!r) { setText('mLimit', fmt.won(0)); return; }
    setText('mLimit', fmt.won(r.limit));
    setText('mBinding', r.binding ? r.binding.label + ' 기준' : '—');
    setText('mLtv', fmt.won(r.ltvLimit));
    setText('mPriceCap', isFinite(r.priceCap) ? fmt.won(r.priceCap) : (isEn ? 'N/A' : '미적용'));
    setText('mDsr', fmt.won(r.dsrLimit));
    setText('mStressed', r.stressedRate.toFixed(2) + '%');
    setText('mOwn', fmt.won(Math.max(0, price - r.limit)));
    setText('mActualDsr', income > 0 ? r.actualDsrPct.toFixed(1) + '%' : '소득 입력 필요');
    setText('mActualDsrNote', r.binding && r.binding.key === 'dsr'
      ? 'DSR이 결정 요인 — 한도 산정 기준(스트레스 포함)과 거의 동일'
      : (r.binding ? r.binding.label + '이 결정 요인 — DSR 한도보다 여유 있게 대출' : '—'));
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
