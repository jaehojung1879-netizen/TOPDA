// ===== Common =====
(function () {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (toggle && menu) {
    toggle.addEventListener('click', () => menu.classList.toggle('open'));
  }

  // ===== Auto-inject language switch into header (if not already present) =====
  try {
    const header = document.querySelector('.site-header .row');
    if (header && !header.querySelector('.lang-switch')) {
      const lang = document.documentElement.lang || 'ko';
      const path = location.pathname;
      // KR ↔ EN 페어 결정: '/en/'을 토글
      let krHref, enHref;
      if (path.includes('/en/')) {
        enHref = path.split('/').pop() || 'index.html';
        krHref = path.replace('/en/', '/');
      } else {
        krHref = path.split('/').pop() || 'index.html';
        // 한국어 페이지 대부분의 영문 대응은 en/index.html로 fallback
        enHref = path.replace(/\/site\//, '/site/en/');
        // 동일 경로의 en 버전이 없을 수 있으므로 단순화: en/index.html
        const parts = path.split('/');
        const fileName = parts.pop();
        // 같은 파일명이 /en/ 에 있다고 가정하고 상대로 변환
        enHref = (parts.length ? parts.join('/') + '/' : '') + 'en/' + fileName;
        // 깊은 폴더(categories/ 등)에서는 상대경로 갱신
        if (path.includes('/categories/') || path.includes('/calculators/') || path.includes('/checklists/') || path.includes('/posts/') || path.includes('/interior/')) {
          // 단순 fallback: 영문 홈
          enHref = '../en/index.html';
        }
      }
      const ls = document.createElement('div');
      ls.className = 'lang-switch';
      const a1 = document.createElement('a');
      a1.textContent = 'KR'; a1.setAttribute('aria-label', '한국어');
      const a2 = document.createElement('a');
      a2.textContent = 'EN'; a2.setAttribute('aria-label', 'English');
      if (lang === 'en') {
        a1.href = krHref;
        a2.href = '#'; a2.classList.add('active');
      } else {
        a1.href = '#'; a1.classList.add('active');
        a2.href = enHref;
      }
      ls.appendChild(a1); ls.appendChild(a2);
      // nav-toggle 앞에 삽입
      const navToggle = header.querySelector('.nav-toggle');
      if (navToggle) header.insertBefore(ls, navToggle);
      else header.appendChild(ls);
    }
  } catch (e) {}

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

// ===== Formatting =====
const isEn = document.documentElement.lang === 'en';
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
  const { price, homes, regulated, areaOver85, firstHome } = input;
  if (!price || price <= 0) return null;
  const eok = price / 100000000;
  let baseRate, isHeavy = false;
  if (homes === 1) {
    if (eok <= 6) baseRate = 0.01;
    else if (eok <= 9) baseRate = ((eok * 2 / 3) - 3) / 100;
    else baseRate = 0.03;
  } else if (homes === 2) {
    if (regulated) { baseRate = 0.08; isHeavy = true; }
    else baseRate = (eok <= 6 ? 0.01 : eok <= 9 ? ((eok * 2 / 3) - 3) / 100 : 0.03);
  } else if (homes === 3) {
    baseRate = regulated ? 0.12 : 0.08;
    isHeavy = true;
  } else {
    baseRate = 0.12;
    isHeavy = true;
  }
  baseRate = Math.max(baseRate, 0.01);

  let acquisition = price * baseRate;

  // 생애최초 감면 (1주택·표준세율·12억 이하)
  let firstHomeDeduct = 0;
  if (firstHome && homes === 1 && !isHeavy && eok <= 12) {
    firstHomeDeduct = Math.min(2000000, acquisition);
    acquisition = acquisition - firstHomeDeduct;
  }

  // 농어촌특별세
  let ruralTax = 0;
  if (areaOver85) {
    if (isHeavy && baseRate >= 0.12) ruralTax = price * 0.010;
    else if (isHeavy && baseRate >= 0.08) ruralTax = price * 0.006;
    else ruralTax = price * 0.002;
  }

  // 지방교육세
  let localEduTax;
  if (isHeavy) localEduTax = price * 0.004;
  else localEduTax = (price * baseRate) * 0.10; // 표준세율 적용분 기준 (감면 전 본세의 10%)

  const total = acquisition + ruralTax + localEduTax;

  return {
    baseRate, isHeavy,
    acquisition, firstHomeDeduct,
    ruralTax, localEduTax,
    total,
  };
}

(function () {
  const root = document.querySelector('[data-calc="acquisition-tax"]');
  if (!root) return;
  const inputs = root.querySelectorAll('input, select');
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const recalc = () => {
    const price = fmt.parseWon(root.querySelector('[name="price"]').value);
    const homes = Number(root.querySelector('[name="homes"]:checked')?.value || 1);
    const regulated = root.querySelector('[name="regulated"]')?.checked || false;
    const areaOver85 = root.querySelector('[name="areaOver85"]')?.checked || false;
    const firstHome = root.querySelector('[name="firstHome"]')?.checked || false;
    const r = calcAcquisitionTax({ price, homes, regulated, areaOver85, firstHome });
    if (!r) {
      setText('total', fmt.won(0));
      ['acquisition','ruralTax','localEduTax','firstHomeDeduct'].forEach(k => setText(k, fmt.won(0)));
      setText('rate', '—');
      return;
    }
    setText('rate', (r.baseRate * 100).toFixed(2) + '%' + (r.isHeavy ? (isEn ? ' (heavy)' : ' (중과)') : ''));
    setText('acquisition', fmt.won(r.acquisition));
    setText('ruralTax', fmt.won(r.ruralTax));
    setText('localEduTax', fmt.won(r.localEduTax));
    setText('firstHomeDeduct', r.firstHomeDeduct ? '−' + fmt.won(r.firstHomeDeduct) : (isEn ? 'N/A' : '해당 없음'));
    setText('total', fmt.won(r.total));
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
// - 다주택 중과: 2주택 +20%p, 3주택+ +30%p (조정대상지역 양도 시)
// - 지방소득세 = 양도소득세 × 10%
function calcTransferTax(input) {
  const { sellPrice, buyPrice, cost, holdYears, liveYears, homes, onlyHome, regulated, multiSurcharge } = input;
  if (!sellPrice || sellPrice <= 0) return null;

  const rawGain = Math.max(0, sellPrice - buyPrice - cost);

  // 1세대 1주택 비과세 / 안분
  let exempted = false;
  let taxableGainRatio = 1;
  const isOneHome = homes === 1 && onlyHome;
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
  if (holdYears < 1) shortTermRate = 0.70;
  else if (holdYears < 2) shortTermRate = 0.60;

  // 장기보유특별공제
  let ltDeductRate = 0;
  if (!shortTermRate && holdYears >= 3) {
    if (isOneHome && sellPrice > 1200000000) {
      const holdY = Math.min(holdYears, 10);
      const liveY = Math.min(liveYears, 10);
      const holdRate = holdY >= 3 ? Math.min(0.40, 0.12 + (holdY - 3) * 0.04) : 0;
      const liveRate = liveY >= 3 ? Math.min(0.40, 0.12 + (liveY - 3) * 0.04) : 0;
      ltDeductRate = Math.min(0.80, holdRate + liveRate);
    } else {
      const y = Math.min(holdYears, 15);
      ltDeductRate = Math.max(0, (y - 2) * 0.02);
      ltDeductRate = Math.min(0.30, ltDeductRate);
    }
  }
  const ltDeduct = taxableGain * ltDeductRate;
  const incomeAmount = Math.max(0, taxableGain - ltDeduct);

  // 기본공제 250만원
  const basicDeduct = Math.min(2500000, incomeAmount);
  const taxBase = Math.max(0, incomeAmount - basicDeduct);

  // 산출세액
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

  // 다주택 중과 (조정지역 + 다주택 + 중과 적용 체크 + 단기보유 아닐 때)
  let surchargeRate = 0;
  if (!shortTermRate && regulated && multiSurcharge && homes >= 2) {
    surchargeRate = homes >= 3 ? 0.30 : 0.20;
    rate += surchargeRate;
    appliedRateLabel += ' + ' + (surchargeRate * 100) + '%p 중과';
  }

  let incomeTax;
  if (shortTermRate || surchargeRate > 0) {
    incomeTax = taxBase * rate;
  } else {
    incomeTax = taxBase * rate - deduction;
  }
  incomeTax = Math.max(0, incomeTax);

  const localTax = incomeTax * 0.10;
  const total = incomeTax + localTax;
  const effective = sellPrice > 0 ? (total / sellPrice * 100) : 0;

  return {
    exempted, taxableGainRatio, rawGain, taxableGain,
    ltDeductRate, ltDeduct, incomeAmount, basicDeduct, taxBase,
    rate, appliedRateLabel, incomeTax, localTax, total, effective,
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
    const multiSurcharge = root.querySelector('[name="multiSurcharge"]')?.checked || false;
    const r = calcTransferTax({ sellPrice, buyPrice, cost, holdYears, liveYears, homes, onlyHome, regulated, multiSurcharge });
    const exemptBox = root.querySelector('[data-out="exemptBox"]');
    if (!r) {
      ['total','gain','ltDeduct','income','basicDeduct','taxBase','incomeTax','localTax'].forEach(k => setText(k, '0원'));
      setText('rate', '—');
      setText('effective', '실효세율 —');
      if (exemptBox) exemptBox.style.display = 'none';
      return;
    }
    setText('gain', fmt.won(r.rawGain));
    setText('ltDeduct', '−' + fmt.won(r.ltDeduct) + ' (' + (r.ltDeductRate * 100).toFixed(0) + '%)');
    setText('income', fmt.won(r.incomeAmount));
    setText('basicDeduct', '−' + fmt.won(r.basicDeduct));
    setText('taxBase', fmt.won(r.taxBase));
    setText('rate', r.appliedRateLabel);
    setText('incomeTax', fmt.won(r.incomeTax));
    setText('localTax', fmt.won(r.localTax));
    setText('total', fmt.won(r.total));
    setText('effective', '실효세율 ' + r.effective.toFixed(2) + '% (양도가액 대비)');
    if (exemptBox) {
      if (r.exempted) {
        exemptBox.style.display = '';
        const msg = root.querySelector('[data-out="exemptMsg"]');
        if (msg) msg.innerHTML = '<strong>1세대 1주택 비과세 대상</strong>양도가액 12억원 이하 + 보유 2년 이상 요건을 충족합니다. 별도 세부담이 없습니다.';
      } else if (r.taxableGainRatio < 1 && r.taxableGainRatio > 0) {
        exemptBox.style.display = '';
        const msg = root.querySelector('[data-out="exemptMsg"]');
        if (msg) msg.innerHTML = '<strong>고가주택 안분과세</strong>1세대1주택이나 12억 초과. 양도차익 중 ' + (r.taxableGainRatio * 100).toFixed(1) + '%만 과세대상입니다.';
      } else {
        exemptBox.style.display = 'none';
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
    if (netToSeller >= 0) {
      setText('settlement', '매수자 → 매도자 ' + fmt.won(netToSeller));
    } else {
      setText('settlement', '매도자 → 매수자 ' + fmt.won(-netToSeller));
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
// 매매(매수) · 매도(양도) · 전세 임차 · 임대인(임대 소득) · 상속 · 증여
// + 모든 시나리오에서 DSR(신용대출 포함) 동시 점검
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
    let chart = null;
    const canvas = document.getElementById('costChart');
    const panels = document.querySelectorAll('[data-scn-panel]');
    const resultTitle = root.querySelector('[data-scn-result-title]');
    const detailBox = root.querySelector('[data-detail-breakdown]');
    const dsrBox = root.querySelector('[data-dsr-box]');
    const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
    const setLabel = (attr, txt) => { const el = root.querySelector('['+attr+']'); if (el) el.textContent = txt; };

    const getN = (name) => fmt.parseWon(root.querySelector('[name="'+name+'"]')?.value || '0');
    const getNum = (name) => Number(root.querySelector('[name="'+name+'"]')?.value || 0);
    const getRadio = (name) => root.querySelector('[name="'+name+'"]:checked')?.value;
    const getCheck = (name) => root.querySelector('[name="'+name+'"]')?.checked || false;

    function acquisitionTotal(price, homes, regulated, areaOver85, firstHome) {
      const r = calcAcquisitionTax({ price, homes, regulated, areaOver85, firstHome });
      return r || { total: 0, acquisition: 0, ruralTax: 0, localEduTax: 0, firstHomeDeduct: 0, baseRate: 0 };
    }

    function brokerFee(price, type) {
      if (!price || price <= 0) return 0;
      const eok = price / 100000000;
      let rate, max;
      if (type === 'lease') {
        if (eok < 0.5) { rate = 0.005; max = 200000; }
        else if (eok < 1) { rate = 0.004; max = 300000; }
        else if (eok < 6) { rate = 0.003; max = null; }
        else if (eok < 12) { rate = 0.004; max = null; }
        else if (eok < 15) { rate = 0.005; max = null; }
        else { rate = 0.006; max = null; }
      } else {
        if (eok < 0.5) { rate = 0.006; max = 250000; }
        else if (eok < 2) { rate = 0.005; max = 800000; }
        else if (eok < 9) { rate = 0.004; max = null; }
        else if (eok < 12) { rate = 0.005; max = null; }
        else if (eok < 15) { rate = 0.006; max = null; }
        else { rate = 0.007; max = null; }
      }
      let fee = price * rate;
      if (max != null) fee = Math.min(fee, max);
      return Math.round(fee * 1.1);
    }

    function monthlyPayment(principal, annualRate, years) {
      if (!principal || annualRate <= 0 || years <= 0) return 0;
      const i = annualRate / 100 / 12;
      const n = years * 12;
      return principal * i * Math.pow(1+i, n) / (Math.pow(1+i, n) - 1);
    }

    function progressiveTax(base) {
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
      for (const b of brackets) if (base <= b.upTo) return Math.max(0, base * b.rate - b.deduction);
      return 0;
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
      if (!data.length) { if (chart) { chart.destroy(); chart = null; } return; }
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

    function renderDSR(annualPmt) {
      const income = getN('annualIncome');
      const otherDebt = getN('otherDebt');
      const credit = getN('creditDebt');
      const creditAnnual = credit / 5;
      const totalAnnualPmt = annualPmt + otherDebt + creditAnnual;
      const dsr = income > 0 ? totalAnnualPmt / income * 100 : 0;
      setText('dsrPct', income > 0 ? dsr.toFixed(1) + '%' : '소득 입력 필요');
      const fillEl = root.querySelector('[data-out="dsrFill"]');
      if (fillEl) {
        fillEl.style.width = Math.min(100, dsr) + '%';
        if (dsr > 50) fillEl.style.background = '#b91c1c';
        else if (dsr > 40) fillEl.style.background = '#b45309';
        else fillEl.style.background = '#047857';
      }
      let verdict;
      if (income <= 0) verdict = '소득을 입력하면 DSR이 자동 계산됩니다.';
      else if (dsr > 50) verdict = '2금융 한도(50%)도 초과 — 대출 금액·기간을 조정해야 합니다.';
      else if (dsr > 40) verdict = '1금융 한도(40%) 초과, 2금융(50%) 내 가능. 금리 부담을 비교 검토하세요.';
      else if (dsr > 0) verdict = '1금융 한도(40%) 내에서 정상 승인 가능한 수준입니다.';
      else verdict = '대출 정보가 0이라 DSR이 적용되지 않습니다.';
      if (credit > 0 && income > 0) verdict += ` (신용대출 ${fmt.won(credit)} → 연환산 ${fmt.won(creditAnnual)})`;
      setText('dsrVerdict', verdict);
    }

    function calcSale() {
      const price = getN('price');
      const homes = Number(getRadio('homes') || 1);
      const regulated = getCheck('regulated');
      const areaOver85 = getCheck('areaOver85');
      const firstHome = getCheck('firstHome');
      const loan = getN('loan');
      const rate = getNum('rate');
      const term = getNum('term');
      const purpose = getRadio('purpose') || 'own';
      const jeonseDeposit = purpose === 'gap' ? getN('jeonseDeposit') : 0;
      const gapField = root.querySelector('[data-purpose="gap"]');
      if (gapField) gapField.style.display = purpose === 'gap' ? '' : 'none';

      const acq = acquisitionTotal(price, homes, regulated, areaOver85, firstHome);
      const broker = brokerFee(price, 'sale');
      const legal = price * 0.002;
      const monthly = monthlyPayment(loan, rate, term);
      const totalInterest = monthly > 0 ? monthly * term * 12 - loan : 0;
      const equity = Math.max(0, price - loan - jeonseDeposit);
      const initialCapital = equity + acq.total + broker + legal;
      const grandTotal = price + acq.total + broker + legal;

      if (resultTitle) resultTitle.textContent = purpose === 'gap' ? '갭투자 — 실제 투입 자기자본' : '예상 총 매수 비용';
      setText('primaryTotal', fmt.won(initialCapital));
      setLabel('data-quick-label1', '월 원리금 상환');
      setText('quick1', fmt.won(monthly));
      setLabel('data-quick-label2', '총 이자 (만기까지)');
      setText('quick2', fmt.won(totalInterest));
      setLabel('data-quick-label3', '취득세 합계');
      setText('quick3', fmt.won(acq.total));

      renderChart([
        { label: '자기자본', value: equity, color: '#1e3a8a' },
        { label: '대출 원금', value: loan, color: '#3b82f6' },
        { label: '전세보증금 인수', value: jeonseDeposit, color: '#60a5fa' },
        { label: '취득세 합계', value: acq.total, color: '#f59e0b' },
        { label: '중개수수료', value: broker, color: '#ef4444' },
        { label: '법무사·등기', value: legal, color: '#a855f7' },
      ]);
      renderDetail([
        { label: '자기자본', value: equity, color: '#1e3a8a' },
        { label: '대출 원금', value: loan, color: '#3b82f6' },
        ...(purpose === 'gap' ? [{ label: '전세보증금 인수', value: jeonseDeposit, color: '#60a5fa' }] : []),
        { label: '취득세 (감면 후)', value: acq.acquisition, color: '#f59e0b', sub: true },
        ...(acq.firstHomeDeduct > 0 ? [{ label: '생애최초 감면', value: '−' + fmt.won(acq.firstHomeDeduct), sub: true }] : []),
        { label: '농어촌특별세', value: acq.ruralTax, sub: true },
        { label: '지방교육세', value: acq.localEduTax, sub: true },
        { label: '중개수수료(VAT 포함)', value: broker, color: '#ef4444' },
        { label: '법무사·등기 (추정)', value: legal, color: '#a855f7' },
        { divider: true, label: '총 매수 비용 (대출 포함)', value: grandTotal },
      ]);
      renderDSR(monthly * 12);
    }

    function calcTransfer() {
      const sellPrice = getN('sellPrice');
      const buyPrice = getN('buyPrice');
      const cost = getN('cost');
      const holdYears = getNum('holdYears');
      const liveYears = getNum('liveYears');
      const homes = Number(getRadio('homes') || 1);
      const onlyHome = getCheck('onlyHome');

      const rawGain = Math.max(0, sellPrice - buyPrice - cost);
      const isOne = homes === 1 && onlyHome && holdYears >= 2;
      let exempted = false, ratio = 1;
      if (isOne) {
        if (sellPrice <= 1200000000) { exempted = true; ratio = 0; }
        else { ratio = (sellPrice - 1200000000) / sellPrice; }
      }
      const taxableGain = rawGain * ratio;

      let ltRate = 0;
      if (holdYears >= 3) {
        if (isOne && sellPrice > 1200000000) {
          const h = Math.min(holdYears, 10);
          const l = Math.min(liveYears, 10);
          const hr = h >= 3 ? Math.min(0.40, 0.12 + (h-3)*0.04) : 0;
          const lr = l >= 3 ? Math.min(0.40, 0.12 + (l-3)*0.04) : 0;
          ltRate = Math.min(0.80, hr + lr);
        } else {
          const y = Math.min(holdYears, 15);
          ltRate = Math.min(0.30, Math.max(0, (y-2) * 0.02));
        }
      }
      const ltDeduct = taxableGain * ltRate;
      const income = Math.max(0, taxableGain - ltDeduct);
      const basicDeduct = Math.min(2500000, income);
      const taxBase = Math.max(0, income - basicDeduct);
      let incomeTax;
      if (holdYears < 1) incomeTax = taxBase * 0.70;
      else if (holdYears < 2) incomeTax = taxBase * 0.60;
      else incomeTax = progressiveTax(taxBase);
      const localTax = incomeTax * 0.10;
      const total = incomeTax + localTax;

      if (resultTitle) resultTitle.textContent = exempted ? '1세대1주택 비과세 (양도세 0원)' : '예상 양도소득세';
      setText('primaryTotal', fmt.won(total));
      setLabel('data-quick-label1', '양도차익');
      setText('quick1', fmt.won(rawGain));
      setLabel('data-quick-label2', '과세표준');
      setText('quick2', fmt.won(taxBase));
      setLabel('data-quick-label3', '실효세율 (양도가 대비)');
      setText('quick3', sellPrice > 0 ? (total / sellPrice * 100).toFixed(2) + '%' : '—');

      renderChart([
        { label: '국세 양도소득세', value: incomeTax, color: '#1e3a8a' },
        { label: '지방소득세 (10%)', value: localTax, color: '#3b82f6' },
        { label: '장기보유 공제분', value: ltDeduct, color: '#047857' },
      ]);
      renderDetail([
        { label: '양도가액', value: sellPrice, sub: true },
        { label: '취득가액 + 필요경비', value: buyPrice + cost, sub: true },
        { label: '양도차익', value: rawGain, color: '#1e3a8a' },
        ...(ratio < 1 && ratio > 0 ? [{ label: '과세 비율 (12억 초과)', value: (ratio*100).toFixed(1)+'%', sub: true }] : []),
        { label: '장기보유특별공제 (' + (ltRate*100).toFixed(0) + '%)', value: '−' + fmt.won(ltDeduct), sub: true },
        { label: '기본공제', value: '−' + fmt.won(basicDeduct), sub: true },
        { label: '과세표준', value: taxBase },
        { label: '산출세액 (국세)', value: incomeTax, color: '#1e3a8a' },
        { label: '지방소득세', value: localTax, color: '#3b82f6' },
        { divider: true, label: '총 부담세액', value: total },
      ]);
      renderDSR(0);
    }

    function calcLease() {
      const deposit = getN('leaseDeposit');
      const loan = getN('leaseLoan');
      const rate = getNum('leaseRate');
      const term = getNum('leaseTerm') || 2;
      const broker = brokerFee(deposit, 'lease');
      const monthly = monthlyPayment(loan, rate, term);
      const totalInterest = monthly * term * 12 - loan;
      const equity = Math.max(0, deposit - loan);

      if (resultTitle) resultTitle.textContent = '전세 임차 — 실제 투입 자기자본';
      setText('primaryTotal', fmt.won(equity + broker));
      setLabel('data-quick-label1', '월 이자 부담');
      setText('quick1', fmt.won(monthly));
      setLabel('data-quick-label2', '총 이자 (계약 기간)');
      setText('quick2', fmt.won(totalInterest));
      setLabel('data-quick-label3', '중개수수료');
      setText('quick3', fmt.won(broker));

      renderChart([
        { label: '자기자본', value: equity, color: '#1e3a8a' },
        { label: '전세자금대출', value: loan, color: '#3b82f6' },
        { label: '중개수수료', value: broker, color: '#ef4444' },
      ]);
      renderDetail([
        { label: '자기자본', value: equity, color: '#1e3a8a' },
        { label: '전세자금대출', value: loan, color: '#3b82f6' },
        { label: '중개수수료(VAT 포함)', value: broker, color: '#ef4444' },
        { divider: true, label: '총 임차 비용 (보증금 + 부대)', value: deposit + broker },
      ]);
      renderDSR(monthly * 12);
    }

    function calcRent() {
      const monthlyRent = getN('monthlyRent');
      const deposit = getN('rentDeposit');
      const propPrice = getN('propPrice');
      const homes = Number(getRadio('homes') || 1);

      let imputedRent = 0;
      if (homes >= 3 && deposit > 300000000) imputedRent = (deposit - 300000000) * 0.029;
      const annualRent = monthlyRent * 12;
      const taxableRent = annualRent + imputedRent;
      const separateTax = taxableRent * 0.14;
      const necessary = taxableRent * 0.5;
      const taxBase = Math.max(0, taxableRent - necessary);
      const compositeTax = progressiveTax(taxBase);
      const propertyTax = propPrice * 0.0025;
      const annualNet = annualRent - separateTax;

      if (resultTitle) resultTitle.textContent = '연간 임대 수입 (분리과세 후)';
      setText('primaryTotal', fmt.won(annualNet));
      setLabel('data-quick-label1', '연간 임대 수입');
      setText('quick1', fmt.won(annualRent));
      setLabel('data-quick-label2', '간주임대료 (3주택+)');
      setText('quick2', fmt.won(imputedRent));
      setLabel('data-quick-label3', '예상 재산세');
      setText('quick3', fmt.won(propertyTax));

      renderChart([
        { label: '연 임대 수입', value: annualRent, color: '#1e3a8a' },
        { label: '간주임대료', value: imputedRent, color: '#3b82f6' },
        { label: '재산세', value: propertyTax, color: '#f59e0b' },
        { label: '분리과세 14%', value: separateTax, color: '#ef4444' },
      ]);
      renderDetail([
        { label: '월세 × 12', value: annualRent, color: '#1e3a8a' },
        { label: '간주임대료 (3주택+ 보증금 3억 초과분)', value: imputedRent, sub: true },
        { label: '분리과세 (14%, 수입 2천만 이하 가능)', value: separateTax, color: '#ef4444' },
        { label: '종합과세 추정 (필요경비 50% 가정)', value: compositeTax, sub: true },
        { label: '재산세 (공시가격 × 0.25% 추정)', value: propertyTax, color: '#f59e0b' },
        { divider: true, label: '연간 수입 (분리과세 후)', value: annualNet },
      ]);
      renderDSR(0);
    }

    function calcInherit() {
      const propValue = getN('inheritValue');
      const other = getN('otherInherit');
      const debt = getN('debt');
      const hasSpouse = getCheck('hasSpouse');
      const children = getNum('children');
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

      if (resultTitle) resultTitle.textContent = '예상 상속세';
      setText('primaryTotal', fmt.won(tax));
      setLabel('data-quick-label1', '총 상속재산');
      setText('quick1', fmt.won(grossAssets));
      setLabel('data-quick-label2', '공제 합계');
      setText('quick2', fmt.won(totalDeduct));
      setLabel('data-quick-label3', '과세표준');
      setText('quick3', fmt.won(taxBase));

      renderChart([
        { label: '순 상속재산', value: netAssets, color: '#1e3a8a' },
        { label: '공제 합계', value: totalDeduct, color: '#047857' },
        { label: '상속세', value: tax, color: '#ef4444' },
      ]);
      renderDetail([
        { label: '부동산 평가액', value: propValue, sub: true },
        { label: '기타 상속재산', value: other, sub: true },
        { label: '채무·장례비', value: '−' + fmt.won(debt), sub: true },
        { label: '순 상속재산', value: netAssets },
        { label: '기초공제 + 인적공제', value: '−' + fmt.won(totalBasic), sub: true },
        { label: '일괄공제 5억 (max 적용)', value: '−' + fmt.won(publicDeduct), sub: true },
        ...(hasSpouse ? [{ label: '배우자 공제 (추정)', value: '−' + fmt.won(spouseDeduct), sub: true }] : []),
        { label: '과세표준', value: taxBase },
        { divider: true, label: '예상 상속세', value: tax },
      ]);
      renderDSR(0);
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
      const acqOnGift = value * 0.035 + value * 0.003;

      if (resultTitle) resultTitle.textContent = '예상 증여세';
      setText('primaryTotal', fmt.won(tax));
      setLabel('data-quick-label1', '공제 한도 (10년)');
      setText('quick1', fmt.won(baseDeduct));
      setLabel('data-quick-label2', '잔여 공제');
      setText('quick2', fmt.won(remainingDeduct));
      setLabel('data-quick-label3', '과세표준');
      setText('quick3', fmt.won(taxBase));

      renderChart([
        { label: '증여 평가액', value: value, color: '#1e3a8a' },
        { label: '공제 한도', value: remainingDeduct, color: '#047857' },
        { label: '증여세', value: tax, color: '#ef4444' },
        { label: '취득세 (부동산)', value: acqOnGift, color: '#f59e0b' },
      ]);
      renderDetail([
        { label: '증여 평가액', value: value, sub: true },
        { label: '과거 10년 증여액', value: prev, sub: true },
        { label: '잔여 공제', value: '−' + fmt.won(remainingDeduct), sub: true },
        { label: '과세표준', value: taxBase },
        { label: '증여세 (누진)', value: tax, color: '#ef4444' },
        { label: '부동산 취득세 (별도, 3.8% 추정)', value: acqOnGift, color: '#f59e0b' },
        { divider: true, label: '예상 총 부담 (증여세 + 취득세)', value: tax + acqOnGift },
      ]);
      renderDSR(0);
    }

    function switchScn(name) {
      currentScn = name;
      document.querySelectorAll('[data-scn]').forEach((t) => {
        const on = t.dataset.scn === name;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      panels.forEach((p) => { p.hidden = p.dataset.scnPanel !== name; });
      const showDSR = ['sale', 'lease'].includes(name);
      root.querySelectorAll('[data-dsr-section]').forEach((el) => { el.style.opacity = showDSR ? '1' : '0.65'; });
      if (dsrBox) dsrBox.style.opacity = showDSR ? '1' : '0.45';
      recalc();
    }
    document.querySelectorAll('[data-scn]').forEach((t) => t.addEventListener('click', () => switchScn(t.dataset.scn)));

    function recalc() {
      if (currentScn === 'sale') calcSale();
      else if (currentScn === 'transfer') calcTransfer();
      else if (currentScn === 'lease') calcLease();
      else if (currentScn === 'rent') calcRent();
      else if (currentScn === 'inherit') calcInherit();
      else if (currentScn === 'gift') calcGift();
    }

    root.querySelectorAll('input').forEach((el) => {
      el.addEventListener('input', recalc);
      el.addEventListener('change', recalc);
    });
    recalc();
  }
})();

// ===== Property Rating Radar (임장 점수 레이더 차트) =====
(function () {
  const root = document.querySelector('[data-calc="property-rating"]');
  if (!root) return;
  const canvas = document.getElementById('radarChart');
  let chart = null;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const KEYS = ['traffic', 'school', 'commerce', 'condition', 'amenity'];
  const LABELS = ['교통', '학군', '상권', '노후도(신축감)', '단지 쾌적성'];

  function makeRadar(values) {
    if (!canvas || typeof Chart === 'undefined') return;
    const opts = {
      type: 'radar',
      data: {
        labels: LABELS,
        datasets: [{
          label: '평가 점수',
          data: values,
          fill: true,
          backgroundColor: 'rgba(30, 58, 138, 0.18)',
          borderColor: '#1e3a8a',
          borderWidth: 2,
          pointBackgroundColor: '#1e3a8a',
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        scales: {
          r: {
            beginAtZero: true, min: 0, max: 5, ticks: { stepSize: 1, display: false },
            pointLabels: { font: { size: 13, family: 'Pretendard Variable', weight: '600' } },
            grid: { color: 'rgba(0,0,0,0.06)' },
            angleLines: { color: 'rgba(0,0,0,0.08)' },
          },
        },
        plugins: { legend: { display: false } },
      },
    };
    if (chart) {
      chart.data.datasets[0].data = values;
      chart.update();
    } else {
      chart = new Chart(canvas.getContext('2d'), opts);
    }
  }

  function verdict(scores, address) {
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = sum / scores.length;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const maxKey = LABELS[scores.indexOf(max)];
    const minKey = LABELS[scores.indexOf(min)];
    const tag = address ? `‘${address}’` : '해당 매물';
    if (avg >= 4.2) return `${tag}은 전반적으로 매우 우수합니다. 특히 ${maxKey} 항목이 강점.`;
    if (avg >= 3.4) return `${tag}은 무난한 선택. 강점은 ${maxKey}, 다만 ${minKey}는 개선 여지가 있습니다.`;
    if (avg >= 2.6) return `${tag}은 평균 이하 항목이 다수입니다. 특히 ${minKey}가 약점 — 가격 협상 카드로 활용 가능.`;
    return `${tag}은 종합 점수가 낮습니다. 입지·환경의 결정적 단점이 있는지 재확인하세요.`;
  }

  const recalc = () => {
    const scores = KEYS.map((k) => Number(root.querySelector('[name="'+k+'"]').value || 0));
    const address = root.querySelector('[name="address"]').value.trim();
    const total = scores.reduce((a, b) => a + b, 0);
    const avg = (total / scores.length) || 0;
    setText('totalScore', total + ' / 25');
    setText('avgScore', avg.toFixed(2) + ' / 5');
    setText('verdict', verdict(scores, address));
    // 항목별 점수 표시
    KEYS.forEach((k, i) => {
      const out = root.querySelector('[data-out="score-'+k+'"]');
      if (out) out.textContent = scores[i] + '점';
    });
    makeRadar(scores);
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  if (typeof Chart === 'undefined') {
    const wait = setInterval(() => {
      if (typeof Chart !== 'undefined') { clearInterval(wait); recalc(); }
    }, 100);
  } else {
    recalc();
  }
})();

// ===== D-Day Scheduler =====
// 계약일·잔금일을 기준으로 거래 단계별 일정을 자동 생성
(function () {
  const root = document.querySelector('[data-calc="dday-scheduler"]');
  if (!root) return;
  const setText = (sel, txt) => { const el = root.querySelector('[data-out="'+sel+'"]'); if (el) el.textContent = txt; };
  const timelineOut = root.querySelector('[data-out="timeline"]');

  const FMT_DATE = (d) => {
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
  };
  const dayDiff = (a, b) => Math.round((b - a) / 86400000);
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  function dDayLabel(today, target) {
    if (!target) return '—';
    const diff = dayDiff(today, target);
    if (diff === 0) return 'D-day';
    if (diff > 0) return 'D-' + diff;
    return 'D+' + Math.abs(diff);
  }

  // 매매 일정 템플릿 (계약일=C, 잔금일=B 기준)
  function buildSaleSteps({ contract, balance, useLoan, needMove, needFunding }) {
    const steps = [];
    if (contract) {
      steps.push({ date: addDays(contract, -7), title: '권리관계 최종 점검', desc: '등기부등본 발급 → 근저당·가압류·신탁 확인', tag: '필수' });
      steps.push({ date: contract, title: '매매계약 체결 · 계약금 지급', desc: '계약금 5~10% 매도인 본인 명의 계좌로 송금', tag: 'D-day' });
      steps.push({ date: addDays(contract, 30), title: '실거래가 신고 (30일 내)', desc: '계약일로부터 30일 내 시·군·구 신고 (부동산 거래신고법)', tag: '의무' });
      if (needFunding) steps.push({ date: addDays(contract, 30), title: '자금조달계획서 제출', desc: '6억 이상 매매 또는 조정대상지역 매매 시 신고 (30일 내)', tag: '의무' });
    }
    if (useLoan && balance) {
      steps.push({ date: addDays(balance, -30), title: '대출 사전심사 (은행 2~3곳)', desc: '소득증빙·신용점수 준비 → 한도·금리 비교', tag: '대출' });
      steps.push({ date: addDays(balance, -14), title: '대출 본심사 · 감정평가', desc: '담보물 감정평가 진행', tag: '대출' });
      steps.push({ date: addDays(balance, -3), title: '대출 약정 체결', desc: '근저당 설정 동의서 등 서명', tag: '대출' });
    }
    if (needMove && balance) {
      steps.push({ date: addDays(balance, -30), title: '이사업체 방문견적 (3~5사)', desc: '허가 업체·표준약관·적재물배상보험 확인', tag: '이사' });
      steps.push({ date: addDays(balance, -14), title: '이사 계약 · 계약금 지급', desc: '업체 확정 · 계약금 10%', tag: '이사' });
      steps.push({ date: addDays(balance, -7), title: '사다리차·엘리베이터 예약', desc: '양 단지 관리실에 신청', tag: '이사' });
    }
    if (balance) {
      steps.push({ date: balance, title: '잔금일 · 등기 · 정산', desc: '잔금 지급 · 소유권 이전등기 · 근저당 말소 · 관리비/공과금 정산 · 열쇠 인수', tag: 'D-day' });
      steps.push({ date: addDays(balance, 14), title: '전입신고 (14일 내)', desc: '관할 동주민센터 또는 정부24. 미신고 시 과태료 5만 원', tag: '의무' });
      steps.push({ date: addDays(balance, 60), title: '취득세 납부 (60일 내)', desc: '위택스에서 신고·납부. 미납 시 가산세', tag: '세금' });
      steps.push({ date: addDays(balance, 60), title: '소유권이전등기 (60일 내)', desc: '법무사 위임 또는 직접 신청', tag: '등기' });
    }
    return steps;
  }

  function buildLeaseSteps({ contract, balance, useLoan, needMove }) {
    const steps = [];
    if (contract) {
      steps.push({ date: addDays(contract, -14), title: '시세·전세가율 확인', desc: '국토부 실거래가 + KB부동산. 전세가율 80% 이상은 위험', tag: '준비' });
      steps.push({ date: addDays(contract, -7), title: '등기부·전입세대 확인', desc: '근저당·가압류·신탁 + 선순위 임차인 점검', tag: '필수' });
      steps.push({ date: contract, title: '임대차계약 체결 · 계약금 지급', desc: '계약금 5~10% 임대인 본인 명의 계좌로', tag: 'D-day' });
      steps.push({ date: addDays(contract, 30), title: '주택임대차 신고 (30일 내)', desc: '보증금 6천만 원 또는 월세 30만 원 초과 시 신고 의무', tag: '의무' });
    }
    if (useLoan && balance) {
      steps.push({ date: addDays(balance, -30), title: '전세자금대출 신청', desc: 'HUG·HF·SGI 보증 상품 검토. 잔금 지급일 기준 입금 가능 시점 확인', tag: '대출' });
      steps.push({ date: addDays(balance, -7), title: '대출 승인 · 자금 입금 일정 확정', desc: '은행과 잔금일 자금 이체 시간 협의', tag: '대출' });
    }
    if (needMove && balance) {
      steps.push({ date: addDays(balance, -21), title: '이사업체 견적·계약', desc: '방문견적 3사 이상', tag: '이사' });
      steps.push({ date: addDays(balance, -7), title: '관리실 사다리차·엘리베이터 예약', desc: '양 단지 모두', tag: '이사' });
    }
    if (balance) {
      steps.push({ date: balance, title: '잔금일 · 전입 · 확정 · 보증보험', desc: '잔금 지급 후 즉시 ① 점유(이사) ② 전입신고 ③ 확정일자 ④ 보증보험 신청', tag: 'D-day' });
      steps.push({ date: addDays(balance, 14), title: '전입신고 완료 확인 (14일 내)', desc: '미완료 시 과태료. 외국인은 외국인등록 변경', tag: '의무' });
      steps.push({ date: addDays(balance, 30), title: '전세보증금 반환보증 가입', desc: 'HUG/HF/SGI 중 선택. 잔금일 가까울수록 가산 보험료 발생', tag: '필수' });
    }
    return steps;
  }

  const recalc = () => {
    const dealType = root.querySelector('[name="dealType"]:checked')?.value || 'sale';
    const contractStr = root.querySelector('[name="contractDate"]').value;
    const balanceStr = root.querySelector('[name="balanceDate"]').value;
    const useLoan = root.querySelector('[name="useLoan"]')?.checked || false;
    const needMove = root.querySelector('[name="needMove"]')?.checked || false;
    const amount = fmt.parseWon(root.querySelector('[name="amount"]').value);

    const contract = contractStr ? new Date(contractStr + 'T00:00:00') : null;
    const balance = balanceStr ? new Date(balanceStr + 'T00:00:00') : null;
    const today = new Date(); today.setHours(0,0,0,0);

    setText('today', FMT_DATE(today));
    setText('dDayContract', dDayLabel(today, contract));
    setText('dDayBalance', dDayLabel(today, balance));
    if (contract && balance) {
      setText('totalSpan', dayDiff(contract, balance) + '일');
    } else {
      setText('totalSpan', '—');
    }

    const needFunding = amount >= 600000000;
    let steps;
    if (dealType === 'sale') {
      steps = buildSaleSteps({ contract, balance, useLoan, needMove, needFunding });
    } else {
      steps = buildLeaseSteps({ contract, balance, useLoan, needMove });
    }
    steps.sort((a, b) => a.date - b.date);

    if (!timelineOut) return;
    if (!steps.length) {
      timelineOut.innerHTML = '<li class="dt-empty">계약일과 잔금일을 입력하면 타임라인이 생성됩니다.</li>';
      return;
    }
    timelineOut.innerHTML = '';
    steps.forEach((s) => {
      const dDay = dDayLabel(today, s.date);
      const past = s.date < today;
      const li = document.createElement('li');
      li.className = 'dt-item' + (past ? ' dt-past' : '');
      li.innerHTML = `
        <div class="dt-dot"></div>
        <div class="dt-meta">
          <span class="dt-dday">${dDay}</span>
          <span class="dt-date">${FMT_DATE(s.date)}</span>
        </div>
        <div class="dt-body">
          <div class="dt-title"><span class="dt-tag">${s.tag}</span>${s.title}</div>
          <div class="dt-desc">${s.desc}</div>
        </div>
      `;
      timelineOut.appendChild(li);
    });
  };
  root.querySelectorAll('input').forEach((el) => { el.addEventListener('input', recalc); el.addEventListener('change', recalc); });
  recalc();
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

