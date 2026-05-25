// ===== Common =====
(function () {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (toggle && menu) {
    toggle.addEventListener('click', () => menu.classList.toggle('open'));
  }

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
const fmt = {
  won: (n) => {
    if (n === null || n === undefined || isNaN(n)) return '0원';
    return Math.round(n).toLocaleString('ko-KR') + '원';
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

// Live-format any input with data-format="won"
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.dataset.format !== 'won') return;
  const cursor = t.selectionStart;
  const raw = t.value.replace(/[^0-9]/g, '');
  t.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
  // Best-effort cursor preservation
  try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) {}
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
// 단순화 모델: 일반 주거용 매매 기준.
// - 1주택: 6억 이하 1.0%, 6~9억 (가격×2/3억-3)%, 9억 초과 3.0%
// - 2주택: 조정대상지역 8.0% / 비조정 1~3% (1주택 동일 누진)
// - 3주택: 조정 12.0% / 비조정 8.0%
// - 4주택+: 12.0%
// 부가: 농어촌특별세(국민주택규모 초과 시 0.2%), 지방교육세 = 취득세율 × 1/2 × 20% 등 단순화
function calcAcquisitionTax(input) {
  const { price, homes, regulated, areaOver85 } = input;
  if (!price || price <= 0) return null;
  const eok = price / 100000000; // 억 단위
  let baseRate;
  if (homes === 1) {
    if (eok <= 6) baseRate = 0.01;
    else if (eok <= 9) baseRate = ((eok * 2 / 3) - 3) / 100;
    else baseRate = 0.03;
  } else if (homes === 2) {
    baseRate = regulated ? 0.08 : (eok <= 6 ? 0.01 : eok <= 9 ? ((eok * 2 / 3) - 3) / 100 : 0.03);
  } else if (homes === 3) {
    baseRate = regulated ? 0.12 : 0.08;
  } else {
    baseRate = 0.12;
  }
  baseRate = Math.max(baseRate, 0.01);

  const acquisition = price * baseRate;
  // 농어촌특별세: 전용 85㎡ 초과 시 0.2% (단순화)
  const ruralTax = areaOver85 ? price * 0.002 : 0;
  // 지방교육세: 취득세율의 50% × 20% (= 취득세의 10%) 단순화
  const localEduTax = acquisition * 0.10;
  const total = acquisition + ruralTax + localEduTax;

  return {
    baseRate,
    acquisition,
    ruralTax,
    localEduTax,
    total,
  };
}

(function () {
  const root = document.querySelector('[data-calc="acquisition-tax"]');
  if (!root) return;
  const inputs = root.querySelectorAll('input, select');
  const out = {
    rate: root.querySelector('[data-out="rate"]'),
    acquisition: root.querySelector('[data-out="acquisition"]'),
    ruralTax: root.querySelector('[data-out="ruralTax"]'),
    localEduTax: root.querySelector('[data-out="localEduTax"]'),
    total: root.querySelector('[data-out="total"]'),
  };
  const recalc = () => {
    const price = fmt.parseWon(root.querySelector('[name="price"]').value);
    const homes = Number(root.querySelector('[name="homes"]:checked')?.value || 1);
    const regulated = root.querySelector('[name="regulated"]')?.checked || false;
    const areaOver85 = root.querySelector('[name="areaOver85"]')?.checked || false;
    const r = calcAcquisitionTax({ price, homes, regulated, areaOver85 });
    if (!r) {
      if (out.total) out.total.textContent = '0원';
      ['acquisition','ruralTax','localEduTax','rate'].forEach(k => { if (out[k]) out[k].textContent = k === 'rate' ? '—' : '0원'; });
      return;
    }
    if (out.rate) out.rate.textContent = (r.baseRate * 100).toFixed(2) + '%';
    if (out.acquisition) out.acquisition.textContent = fmt.won(r.acquisition);
    if (out.ruralTax) out.ruralTax.textContent = fmt.won(r.ruralTax);
    if (out.localEduTax) out.localEduTax.textContent = fmt.won(r.localEduTax);
    if (out.total) out.total.textContent = fmt.won(r.total);
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
    setText('[data-out="cap"]', r.max ? fmt.won(r.max) : '상한 없음(협의)');
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
