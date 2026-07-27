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

  function search(map, q) {
    q = String(q || '').trim().replace(/\s+/g, '');
    if (q.length < 2) return [];
    var out = [];
    for (var key in map) {
      if (key.replace(/\s+/g, '').indexOf(q) < 0) continue;
      var parts = key.split('|');
      out.push({ key: key, region: parts[0], name: parts[1] || '', rec: map[key] });
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
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

    toggle.addEventListener('click', function () {
      if (!panel.hidden) { panel.hidden = true; return; }
      panel.hidden = false;
      q.focus();
      note('불러오는 중…');
      load().then(function (d) {
        if (!Object.keys(d.map).length) {
          // 아직 수집 전 — 검색 흉내를 내지 않고 정본 링크로 보낸다.
          note('공시가격 데이터를 준비 중입니다. ' +
               '<a href="https://www.realtyprice.kr/notice/main/main.do" target="_blank" ' +
               'rel="noopener">부동산공시가격알리미 ↗</a>에서 직접 확인해 주세요.');
          q.disabled = true;
          return;
        }
        note('단지명을 2글자 이상 입력하세요.');
      });
    });

    q.addEventListener('input', function () {
      load().then(function (d) {
        if (!Object.keys(d.map).length) return;
        var hits = search(d.map, q.value);
        if (!hits.length) {
          note(q.value.trim().length < 2 ? '단지명을 2글자 이상 입력하세요.'
                                         : '검색 결과가 없습니다.');
          return;
        }
        list.innerHTML = hits.map(function (h, i) {
          var r = h.rec;
          return '<button type="button" class="op-hit" data-i="' + i + '">' +
                 '<span class="op-name">' + h.name + '</span>' +
                 '<span class="op-region">' + h.region + '</span>' +
                 '<span class="op-price">' + won(r.med) + '</span>' +
                 '</button>';
        }).join('');
        list._hits = hits;
      });
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.op-hit') : null;
      if (!btn || !list._hits) return;
      var h = list._hits[+btn.dataset.i];
      if (!h) return;
      input.value = h.rec.med;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      panel.hidden = true;
      // 값만 넣고 끝내면 어느 단지의 언제 기준 가격인지 알 수 없다 — 반드시 함께 남긴다.
      var std = stdDayText(h.rec.std_day);
      toggle.innerHTML = '🔎 다시 검색 <span class="op-filled">' + h.name + ' · ' +
        won(h.rec.med) + (std ? ' · ' + std + ' 기준' : '') + '</span>';
      if (opts.onPick) opts.onPick(h);
    });

    return {
      show: function () { wrap.hidden = false; },
      hide: function () { wrap.hidden = true; panel.hidden = true; },
    };
  }

  return { attach: attach, load: load, search: search, won: won };
})();
