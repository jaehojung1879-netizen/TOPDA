/* 단지 검색으로 공시가격(공동주택가격) 입력란 채우기.
 *
 * 계산기마다 복사하면 갈라지므로 공용 모듈로 둔다. 사용:
 *   TopdaOfficialPrice.attach({ input: document.getElementById('td-regStd'), label: '...' });
 *
 * ■ 반드시 지킬 것
 *
 * 1) 실거래가를 이 칸에 채우지 않는다.
 *    2026-07-19에 시가표준액 칸을 실거래가로 채우는 검색 기능을 걷어낸 적이 있다 —
 *    실거래가와 공시가격은 서로 다른 값이라 섞어 보여주면 오해를 준다. 이 모듈은
 *    official_price.json(건축물대장 주택가격)만 읽는다.
 *
 * 2) 공시기준일을 값과 함께 보여준다.
 *    건축물대장의 주택가격은 공시가격을 전재한 값이라 갱신이 늦을 수 있다. 몇 해 전
 *    가격을 최신인 양 보여주면 안 된다.
 *
 * 3) 데이터가 없으면 검색 UI를 만들지 않는다.
 *    수집 전에는 map이 비어 있다. 검색되지 않는 입력창을 띄우면 고장으로 보인다.
 *    데이터 파일이 1MB대라 페이지 로드 시가 아니라 첫 포커스에서 받는다.
 */
window.TopdaOfficialPrice = (function () {
  'use strict';

  var DATA_URL = '../assets/official_price.json';
  var MAX_RESULTS = 8;
  var cache = null;      // {map, as_of} — 한 번만 받는다
  var loading = null;

  // 수록 단지가 전국의 일부라 '검색이 고장났다'로 읽히기 쉽다 — 못 찾았을 때 갈 곳(정본)을
  // 늘 함께 준다. 평형별 추정값 안내에서도 같은 링크를 쓴다.
  var OFFICIAL_LINK = '<a href="https://www.realtyprice.kr/notice/main/main.do" ' +
    'target="_blank" rel="noopener">부동산공시가격알리미 ↗</a>';

  function won(n) {
    if (!(n > 0)) return '-';
    var eok = Math.floor(n / 100000000);
    var man = Math.round((n % 100000000) / 10000);
    if (eok > 0) return eok + '억' + (man > 0 ? ' ' + man.toLocaleString() + '만' : '');
    return Math.round(n / 10000).toLocaleString() + '만';
  }

  function stdDayText(s) {
    s = String(s || '');
    if (s.length < 8) return '';
    return s.slice(0, 4) + '.' + s.slice(4, 6) + '.' + s.slice(6, 8);
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;
    loading = fetch(DATA_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        cache = { map: (j && j.map) || {}, as_of: (j && j.as_of) || '' };
        return cache;
      })
      .catch(function () { cache = { map: {}, as_of: '' }; return cache; });
    return loading;
  }

  function normalized(s) {
    return String(s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  }

  // "헬리오시티 84"처럼 단지명 뒤에 전용면적을 함께 입력할 수 있다. 숫자를 단지명의
  // 일부로 취급하면 검색이 0건이 되므로, 10~300㎡ 숫자는 면적 힌트로 떼어 낸다.
  function parseQuery(q) {
    var raw = String(q || '').trim();
    var m = raw.match(/(?:^|\s)(\d{2,3})(?:\s*(㎡|m2|평))?\s*$/i);
    var n = m ? +m[1] : 0;
    var area = n >= 10 && n <= 300 ? (m[2] === '평' ? Math.round(n * 3.3058) : n) : 0;
    var text = area ? raw.slice(0, m.index).trim() : raw;
    return { text: normalized(text), area: area };
  }

  // 단지명 정확 일치 → 단지명 시작 → 단지명 포함 → 지역 포함 순으로 둔다. 앞에서부터
  // 8개를 그냥 끊으면 '자이'를 쳤을 때 지역명에 걸린 엉뚱한 단지가 먼저 나오는 문제를
  // 막고, 띄어쓰기·괄호 차이도 검색에 영향을 주지 않게 한다.
  function search(map, q) {
    var parsed = parseQuery(q);
    q = parsed.text;
    if (q.length < 2) return [];
    var hits = [];
    for (var key in map) {
      var flat = normalized(key);
      if (flat.indexOf(q) < 0) continue;
      var parts = key.split('|');
      var name = parts[1] || '';
      var flatName = normalized(name);
      var at = flatName.indexOf(q);
      hits.push({
        key: key, region: parts[0], name: name, rec: map[key],
        area: parsed.area,
        rank: flatName === q ? 0 : (at === 0 ? 1 : (at > 0 ? 2 : 3)),
      });
    }
    hits.sort(function (a, b) {
      return a.rank - b.rank || a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko');
    });
    return hits.slice(0, MAX_RESULTS);
  }

  /* ── 평형별 추정 시가표준액 ─────────────────────────────────────────────
   *
   * 저장값 med 는 단지 전체 호의 중앙값이라, 39㎡~111㎡ 가 섞인 단지에서 34평
   * 소유자에게 주면 크게 어긋난다(그 값으로 계산하는 국민주택채권 매입액과 증여
   * 취득세 3억 중과 판정까지 함께 틀어진다). 사용자가 직접 지적한 문제다.
   *
   * 레코드의 u 는 [[전용㎡, 평, 추정 공시가격(원)], ...] 이고 _meta/build_official_price_units.py
   * 가 만든다 — 단지 자신의 (공시 중앙값 ÷ 실거래 중앙값) 비율을 평형별 실거래
   * 중앙값에 다시 곱한 값이다. 실측이 아니라 **추정**이므로 화면에서 반드시 그렇게
   * 부르고 산식과 정본 링크를 함께 준다. 정확한 값은 본인 호의 공시가격이다.
   */
  function units(rec) {
    var u = rec && rec.u;
    return (Object.prototype.toString.call(u) === '[object Array]') ? u : [];
  }

  // 목록 중 중앙값(med)에 가장 가까운 평형 — '지금 칸에 들어 있는 값'이 어느 평형인지
  // 표시해 주기 위한 것이다. 사용자가 아무것도 고르지 않아도 기준점이 보여야 한다.
  function nearestUnit(list, value) {
    var best = -1, gap = Infinity;
    for (var i = 0; i < list.length; i++) {
      var g = Math.abs(list[i][2] - value);
      if (g < gap) { gap = g; best = i; }
    }
    return best;
  }

  function nearestArea(list, area) {
    if (!(area > 0)) return -1;
    var best = -1, gap = Infinity;
    for (var i = 0; i < list.length; i++) {
      var g = Math.abs(list[i][0] - area);
      if (g < gap) { gap = g; best = i; }
    }
    return best;
  }

  function unitLabel(u) {
    return u[0] + '㎡(' + u[1] + '평)';
  }

  // 검색 UI를 어디에 끼울지. 입력칸의 부모가 아니라 **단위 표시 래퍼 바깥**이어야 한다.
  //
  // `.input-suffix` 는 `position: relative` 에 `::after { top: 50% }` 로 '원'·'%' 를
  // 세로 가운데에 그린다. 그 안에 검색 UI를 넣으면 래퍼가 400px 넘게 늘어나면서 '원'
  // 글자가 래퍼 한가운데 — 즉 평형 선택 버튼들 위 — 로 내려와 겹쳐 찍힌다. 평형줄이
  // 깨져 보이는 원인이었다. 래퍼를 건너뛰고 그 다음 형제로 붙인다.
  function mountAfter(input) {
    var node = input;
    while (node.parentNode && node.parentNode.classList &&
           node.parentNode.classList.contains('input-suffix')) {
      node = node.parentNode;
    }
    return node;
  }

  function attach(opts) {
    var input = opts && opts.input;
    if (!input || input.dataset.opAttached) return;
    input.dataset.opAttached = '1';

    var wrap = document.createElement('div');
    wrap.className = 'op-picker';
    // 컨테이너를 처음부터 만들어 둔다 — 예전에는 평형줄과 안내문을 그때그때
    // appendChild 해서, 첫 선택 때는 '평형줄 → 안내문', 다시 고를 때는 '안내문 →
    // 평형줄' 로 순서가 뒤집혔다.
    wrap.innerHTML =
      '<button type="button" class="op-toggle">🔎 단지 검색으로 공시가격 넣기</button>' +
      '<div class="op-panel" hidden>' +
      '  <input type="search" class="op-q" autocomplete="off" placeholder="단지명 또는 단지명 + 전용면적 (예: 헬리오시티 84)" />' +
      '  <div class="op-list"></div>' +
      '</div>' +
      '<div class="op-units-box" hidden></div>' +
      '<span class="op-picked-warn data-stale" hidden></span>';
    var anchor = mountAfter(input);
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);

    var toggle = wrap.querySelector('.op-toggle');
    var panel = wrap.querySelector('.op-panel');
    var q = wrap.querySelector('.op-q');
    var list = wrap.querySelector('.op-list');
    var unitsBox = wrap.querySelector('.op-units-box');
    var warn = wrap.querySelector('.op-picked-warn');

    function note(html) { list.innerHTML = '<p class="op-note">' + html + '</p>'; }

    function coverageNote(d) {
      return '수록 단지 ' + Object.keys(d.map).length.toLocaleString() + '개' +
             (d.as_of ? ' · ' + d.as_of + ' 기준' : '') +
             ' — 거래가 많은 단지부터 채우는 중입니다. 없으면 ' + OFFICIAL_LINK + '에서 확인하세요.';
    }

    toggle.addEventListener('click', function () {
      if (!panel.hidden) { panel.hidden = true; return; }
      panel.hidden = false;
      q.focus();
      note('불러오는 중…');
      load().then(function (d) {
        if (!Object.keys(d.map).length) {
          // 아직 수집 전 — 검색 흉내를 내지 않고 정본 링크로 보낸다.
          note('공시가격 데이터를 준비 중입니다. ' + OFFICIAL_LINK + '에서 직접 확인해 주세요.');
          q.disabled = true;
          return;
        }
        note('단지명을 2글자 이상 입력하세요.<br>' + coverageNote(d));
      });
    });

    q.addEventListener('input', function () {
      load().then(function (d) {
        if (!Object.keys(d.map).length) return;
        var hits = search(d.map, q.value);
        if (!hits.length) {
          note(q.value.trim().length < 2
               ? '단지명을 2글자 이상 입력하세요.<br>' + coverageNote(d)
               : '아직 수록되지 않은 단지입니다.<br>' + coverageNote(d));
          return;
        }
        // 기준일과 선택 가능한 전용면적을 결과 줄에 바로 보여준다. 단지 중앙값은 아예
        // 입력하지 않는다 — 평형을 고르지 않은 중앙값은 채권·보유세 계산에 쓸 수 없다.
        list.innerHTML = hits.map(function (h, i) {
          var r = h.rec;
          var std = stdDayText(r.std_day);
          var us = units(r);
          var areaText = us.length
            ? us.slice(0, 6).map(function (u) { return u[0] + '㎡'; }).join(' · ')
              + (us.length > 6 ? ' · 외 ' + (us.length - 6) + '개' : '')
            : '평형별 자료 없음';
          return '<button type="button" class="op-hit" data-i="' + i + '">' +
                 '<span class="op-name">' + h.name + '</span>' +
                 '<span class="op-region">' + h.region +
                 (std ? ' · ' + std + ' 기준' : '') + '</span>' +
                 '<span class="op-price">' + (us.length ? '평형 선택' : '직접 확인') + '</span>' +
                 '<span class="op-range">전용면적 ' + areaText + '</span>' +
                 '</button>';
        }).join('');
        list._hits = hits;
      });
    });

    function spreadText(rec) {
      return (rec.min && rec.max && rec.max > rec.min)
        ? ' (이 단지는 ' + won(rec.min) + '~' + won(rec.max) + ' 분포)' : '';
    }

    // 전용면적을 고른 뒤에만 값을 채운다. 단지만 선택한 상태에서 중앙값을 자동 입력하면
    // 사용자가 평형 선택을 건너뛴 채 채권·보유세 계산에 쓰게 된다.
    function fill(h, unitIdx) {
      var rec = h.rec, list2 = units(rec);
      var u = (unitIdx >= 0 && list2[unitIdx]) || null;
      if (!u) return;
      var value = u[2];
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      var std = stdDayText(rec.std_day);
      toggle.innerHTML = '🔎 다시 검색 <span class="op-filled">' + h.name +
        ' ' + unitLabel(u) + ' · ' + won(value) +
        (std ? ' · ' + std + ' 기준' : '') + '</span>';

      warn.hidden = false;
      warn.innerHTML = '이 값은 <strong>' + unitLabel(u) + ' 평형별 추정치</strong>입니다 — 단지 공시가격 '
        + '중앙값에 이 평형의 실거래 비율을 적용해 계산했습니다(호별 실측값 아님). '
        + '동·층·호에 따른 정확한 공시가격은 ' + OFFICIAL_LINK + '에서 확인할 수 있습니다.';

      var btns = unitsBox.querySelectorAll('.op-unit');
      for (var i = 0; i < btns.length; i++) {
        btns[i].setAttribute('aria-pressed', String(+btns[i].dataset.u === unitIdx));
      }
      if (opts.onPick) opts.onPick(h, u);
    }

    // 평형 선택줄. 평형별 추정이 없는 단지에서는 버튼 대신 **왜 없는지**를 적는다 —
    // 예전에는 줄 자체를 만들지 않아서, 사용자 입장에서는 평형 구분이 원래 없는
    // 기능인지 이 단지만 없는 것인지 구분할 수가 없었다.
    function renderUnits(h) {
      var list2 = units(h.rec);
      var nearArea = nearestArea(list2, h.area);
      unitsBox.hidden = false;
      if (!list2.length) {
        unitsBox.innerHTML = '<p class="op-note">이 단지는 실거래 표본이 얕아 평형별 ' +
          '추정을 만들지 않았습니다. 단지 중앙값은 계산기에 넣지 않습니다. 본인 호의 값은 ' +
          OFFICIAL_LINK + '에서 확인하세요.</p>';
        return;
      }
      unitsBox.innerHTML =
        '<div class="op-units"><span class="op-units-label">전용면적을 선택하세요 — 선택 후 계산기에 반영됩니다</span>' +
        list2.map(function (u, i) {
          return '<button type="button" class="op-unit" data-u="' + i + '" ' +
                 'aria-pressed="false">' + unitLabel(u) +
                 '<small>' + won(u[2]) + (i === nearArea ? ' · 입력 면적과 가장 가까움' : '') +
                 '</small></button>';
        }).join('') + '</div>';
    }

    unitsBox.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.op-unit') : null;
      if (b && unitsBox._h) fill(unitsBox._h, +b.dataset.u);
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.op-hit') : null;
      if (!btn || !list._hits) return;
      var h = list._hits[+btn.dataset.i];
      if (!h) return;
      panel.hidden = true;
      unitsBox._h = h;
      renderUnits(h);
      toggle.innerHTML = '🔎 다시 검색 <span class="op-filled">' + h.name + ' · 평형 선택 필요</span>';
      warn.hidden = false;
      warn.innerHTML = units(h.rec).length
        ? '<strong>아직 값이 입력되지 않았습니다.</strong> 아래에서 전용면적을 선택하세요.'
        : '<strong>평형별 값을 만들 수 없는 단지입니다.</strong> ' + OFFICIAL_LINK +
          '에서 동·층·호를 선택해 확인하세요.';
    });

    return {
      show: function () { wrap.hidden = false; },
      hide: function () { wrap.hidden = true; panel.hidden = true; },
    };
  }

  return {
    attach: attach, load: load, search: search, won: won,
    units: units, nearestUnit: nearestUnit, nearestArea: nearestArea, unitLabel: unitLabel,
  };
})();
