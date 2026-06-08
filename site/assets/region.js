/*
 * 톺다 — 지역(시·도) 공용 정렬·라벨 유틸 (region.js)
 * ------------------------------------------------------------------
 * 드롭다운·검색·차트 어디서든 사용자가 보는 시·도 순서를 통일하기 위해 만든다.
 * 정책: '전체' → 서울 → 경기 → 부산 → 인천 → 대구 → 광주 → 대전 → 울산 → 세종 → 그 외(가나다순).
 * 서울은 가장 관심도가 높아 항상 '전체' 바로 다음에 둔다.
 */
(function (root) {
  'use strict';

  // 핵심 시·도 우선순위 (낮을수록 위에 표시).
  var PRIORITY = {
    '전체': 0, 'all': 0,
    '서울': 1, '서울특별시': 1,
    '경기': 2, '경기도': 2,
    '부산': 3, '부산광역시': 3,
    '인천': 4, '인천광역시': 4,
    '대구': 5, '대구광역시': 5,
    '광주': 6, '광주광역시': 6,
    '대전': 7, '대전광역시': 7,
    '울산': 8, '울산광역시': 8,
    '세종': 9, '세종특별자치시': 9,
  };

  // 시·도 명 정규화: '서울특별시' → '서울'
  function normSido(s) {
    if (!s) return s;
    return String(s)
      .replace(/^서울특별시$/, '서울')
      .replace(/^부산광역시$/, '부산')
      .replace(/^대구광역시$/, '대구')
      .replace(/^인천광역시$/, '인천')
      .replace(/^광주광역시$/, '광주')
      .replace(/^대전광역시$/, '대전')
      .replace(/^울산광역시$/, '울산')
      .replace(/^세종특별자치시$/, '세종')
      .replace(/^경기도$/, '경기')
      .replace(/^강원특별자치도$|^강원도$/, '강원')
      .replace(/^충청북도$/, '충북')
      .replace(/^충청남도$/, '충남')
      .replace(/^전라북도$|^전북특별자치도$/, '전북')
      .replace(/^전라남도$/, '전남')
      .replace(/^경상북도$/, '경북')
      .replace(/^경상남도$/, '경남')
      .replace(/^제주특별자치도$/, '제주');
  }

  function priority(sido) {
    var k = normSido(sido);
    if (PRIORITY.hasOwnProperty(k)) return PRIORITY[k];
    return 100; // 기타는 100 + 가나다순
  }

  // 시·도 배열 정렬
  function sortSidos(arr) {
    return (arr || []).slice().sort(function (a, b) {
      var pa = priority(a), pb = priority(b);
      if (pa !== pb) return pa - pb;
      return String(a).localeCompare(String(b), 'ko');
    });
  }

  // 시·군·구 배열 정렬: 가나다순
  function sortSigungu(arr) {
    return (arr || []).slice().sort(function (a, b) {
      return String(a).localeCompare(String(b), 'ko');
    });
  }

  // <select> 채우기 — '전체' 옵션 포함, 정렬 적용
  function fillSidoSelect(sel, sidos, includeAll) {
    if (!sel) return;
    var opts = [];
    if (includeAll !== false) opts.push('<option value="all">전체</option>');
    sortSidos(sidos).forEach(function (s) {
      opts.push('<option value="' + s + '">' + s + '</option>');
    });
    sel.innerHTML = opts.join('');
  }

  function fillSigunguSelect(sel, list, includeAll) {
    if (!sel) return;
    var opts = [];
    if (includeAll !== false) opts.push('<option value="all">전체</option>');
    sortSigungu(list).forEach(function (g) {
      opts.push('<option value="' + g + '">' + g + '</option>');
    });
    sel.innerHTML = opts.join('');
  }

  // region_key("서울 강남구") → sido("서울") / sigungu("강남구")
  function splitRegionKey(key) {
    if (!key) return { sido: '', sigungu: '' };
    var parts = String(key).split(' ');
    var sido = normSido(parts[0] || '');
    var sigungu = parts.slice(1).join(' ');
    return { sido: sido, sigungu: sigungu };
  }

  var api = {
    PRIORITY: PRIORITY,
    normSido: normSido,
    priority: priority,
    sortSidos: sortSidos,
    sortSigungu: sortSigungu,
    fillSidoSelect: fillSidoSelect,
    fillSigunguSelect: fillSigunguSelect,
    splitRegionKey: splitRegionKey,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TopdaRegion = api;
})(typeof self !== 'undefined' ? self : this);
