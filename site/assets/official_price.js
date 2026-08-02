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

  // 단지명으로 시작하는 항목을 앞에 둔다. 앞에서부터 8개를 그냥 끊으면 '자이'를 쳤을 때
  // 이름이 '○○자이'인 단지가 지역명에 걸린 엉뚱한 단지에 밀린다.
  function search(map, q) {
    q = String(q || '').trim().replace(/\s+/g, '');
    if (q.length < 2) return [];
    var hits = [];
    for (var key in map) {
      var flat = key.replace(/\s+/g, '');
      if (flat.indexOf(q) < 0) continue;
      var parts = key.split('|');
      var name = parts[1] || '';
      var at = name.replace(/\s+/g, '').indexOf(q);
      hits.push({
        key: key, region: parts[0], name: name, rec: map[key],
        rank: at === 0 ? 0 : (at > 0 ? 1 : 2),   // 이름 앞부분 > 이름 안 > 지역명만
      });
    }
    hits.sort(function (a, b) { return a.rank - b.rank; });
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

  function unitLabel(u) {
    return u[0] + '㎡(' + u[1] + '평)';
  }

  function attach(opts) {
    var input = opts && opts.input;
    if (!input || input.dataset.opAttached) return;
    input.dataset.opAttached = '1';

    var wrap = document.createElement('div');
    wrap.className = 'op-picker';
    wrap.innerHTML =
      '<button type="button" class="op-toggle">🔎 단지 검색으로 공시가격 넣기</button>' +
      '<div class="op-panel" hidden>' +
      '  <input type="search" class="op-q" autocomplete="off" placeholder="단지명 (예: 헬리오시티)" />' +
      '  <div class="op-list"></div>' +
      '</div>';
    input.parentNode.insertBefore(wrap, input.nextSibling);

    var toggle = wrap.querySelector('.op-toggle');
    var panel = wrap.querySelector('.op-panel');
    var q = wrap.querySelector('.op-q');
    var list = wrap.querySelector('.op-list');

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
        // 기준일을 결과 줄에도 적는다 — 고르기 전에 몇 년도 공시가격인지 보여야 한다.
        // ⚠ 저장된 값은 단지 전체 호의 **중앙값**이다. 공시가격은 평형마다 다르므로
        //   이 값이 곧 그 사람의 시가표준액은 아니다. 범위(min~max)를 함께 보여주고
        //   "평형별로 다르다"를 분명히 해야, 중앙값을 자기 값으로 오해하지 않는다.
        //   (평형별 값을 주려면 수집기가 호별 가격을 전유부 면적과 조인해야 한다 — 미구현.)
        list.innerHTML = hits.map(function (h, i) {
          var r = h.rec;
          var std = stdDayText(r.std_day);
          var spread = (r.min && r.max && r.max > r.min)
            ? '<span class="op-range">평형별 ' + won(r.min) + '~' + won(r.max) +
              (r.n ? ' · ' + r.n + '호' : '') + '</span>'
            : '';
          return '<button type="button" class="op-hit" data-i="' + i + '">' +
                 '<span class="op-name">' + h.name + '</span>' +
                 '<span class="op-region">' + h.region +
                 (std ? ' · ' + std + ' 기준' : '') + '</span>' +
                 '<span class="op-price">' + won(r.med) + ' <small>중앙값</small></span>' +
                 spread +
                 '</button>';
        }).join('');
        list._hits = hits;
      });
    });

    // 고른 단지의 평형 목록. 단지를 고를 때마다 다시 그린다.
    var unitRow = null;

    function warnBox() {
      var warn = wrap.querySelector('.op-picked-warn');
      if (!warn) {
        warn = document.createElement('span');
        warn.className = 'op-picked-warn data-stale';
        wrap.appendChild(warn);
      }
      return warn;
    }

    function spreadText(rec) {
      return (rec.min && rec.max && rec.max > rec.min)
        ? ' (이 단지는 ' + won(rec.min) + '~' + won(rec.max) + ' 분포)' : '';
    }

    // 값을 채우고, 그 값이 무엇인지(중앙값인가 평형별 추정인가) 함께 남긴다.
    // 숫자만 바꾸고 설명을 안 바꾸면 사용자는 여전히 중앙값을 보고 있다고 믿는다.
    function fill(h, unitIdx) {
      var rec = h.rec, list2 = units(rec);
      var u = (unitIdx >= 0 && list2[unitIdx]) || null;
      var value = u ? u[2] : rec.med;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      var std = stdDayText(rec.std_day);
      toggle.innerHTML = '🔎 다시 검색 <span class="op-filled">' + h.name +
        (u ? ' ' + unitLabel(u) : '') + ' · ' + won(value) +
        (std ? ' · ' + std + ' 기준' : '') + '</span>';

      warnBox().innerHTML = u
        ? '이 값은 <strong>' + unitLabel(u) + ' 추정치</strong>입니다 — 단지 공시가격 '
          + '중앙값에 이 평형의 실거래 비율을 적용해 계산했습니다(실측값이 아닙니다). '
          + '정확한 값은 본인 호의 공시가격이며 ' + OFFICIAL_LINK + '에서 확인할 수 있습니다.'
        : '이 값은 <strong>단지 전체 호의 중앙값</strong>입니다 — 공시가격은 평형마다 '
          + '다릅니다' + spreadText(rec) + '. 본인 호의 정확한 공시가격은 '
          + OFFICIAL_LINK + '에서 확인해 직접 입력하세요.';

      if (unitRow) {
        var btns = unitRow.querySelectorAll('.op-unit');
        for (var i = 0; i < btns.length; i++) {
          btns[i].setAttribute('aria-pressed', String(+btns[i].dataset.u === unitIdx));
        }
      }
      if (opts.onPick) opts.onPick(h, u);
    }

    // 평형 선택줄. 평형별 추정이 없는 단지(거래 표본이 얕은 곳)에서는 아예 만들지
    // 않는다 — 고를 게 없는 빈 줄은 고장으로 보인다.
    function renderUnits(h) {
      if (unitRow) { unitRow.remove(); unitRow = null; }
      var list2 = units(h.rec);
      if (!list2.length) return;
      unitRow = document.createElement('div');
      unitRow.className = 'op-units';
      unitRow.innerHTML = '<span class="op-units-label">평형 선택</span>' +
        list2.map(function (u, i) {
          return '<button type="button" class="op-unit" data-u="' + i + '" ' +
                 'aria-pressed="false">' + unitLabel(u) +
                 '<small>' + won(u[2]) + '</small></button>';
        }).join('');
      unitRow.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.op-unit') : null;
        if (b) fill(h, +b.dataset.u);
      });
      wrap.appendChild(unitRow);
    }

    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.op-hit') : null;
      if (!btn || !list._hits) return;
      var h = list._hits[+btn.dataset.i];
      if (!h) return;
      panel.hidden = true;
      renderUnits(h);
      // 처음에는 중앙값을 그대로 채운다(평형을 고르기 전 동작을 바꾸지 않는다).
      // 다만 그 값이 어느 평형쯤인지는 눌러서 보여 준다 — 기준점이 없으면 어느
      // 버튼을 눌러야 할지 알 수 없다.
      fill(h, -1);
      if (unitRow) {
        var near = nearestUnit(units(h.rec), h.rec.med);
        var btns = unitRow.querySelectorAll('.op-unit');
        if (near >= 0 && btns[near]) btns[near].classList.add('op-unit-median');
      }
    });

    return {
      show: function () { wrap.hidden = false; },
      hide: function () { wrap.hidden = true; panel.hidden = true; },
    };
  }

  return {
    attach: attach, load: load, search: search, won: won,
    units: units, nearestUnit: nearestUnit, unitLabel: unitLabel,
  };
})();
