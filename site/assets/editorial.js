(function () {
  'use strict';
  var grid = document.getElementById('postGrid');
  if (!grid) return;
  var cards = Array.from(grid.querySelectorAll('.card'));
  var search = document.getElementById('postSearch');
  var chips = Array.from(document.querySelectorAll('.post-chip'));
  var seriesButtons = Array.from(document.querySelectorAll('.editorial-series button'));
  var count = document.getElementById('postCount');
  var empty = document.getElementById('postEmpty');
  var category = 'all';
  var series = 'all';

  function apply(updateUrl) {
    var query = search.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var visible = (category === 'all' || card.dataset.cat === category) &&
        (series === 'all' || (card.dataset.series || 'guide') === series) &&
        (!query || card.textContent.toLowerCase().includes(query));
      card.hidden = !visible;
      if (visible) shown++;
    });
    chips.forEach(function (button) {
      var active = button.dataset.cat === category;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    seriesButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.series === series));
    });
    count.textContent = shown + '편 · 최신 발행순' + (category !== 'all' ? ' · ' + category : '');
    empty.style.display = shown ? 'none' : '';
    empty.textContent = series === 'market' && !cards.some(function (c) { return c.dataset.series === 'market'; })
      ? '주간 시장 리포트는 첫 발행을 준비하고 있습니다. 위의 시세 대시보드와 실거래가 조회를 먼저 살펴보세요.'
      : '검색 결과가 없습니다. 다른 주제나 검색어로 찾아보세요.';
    if (updateUrl) {
      var url = new URL(location.href);
      [['cat', category], ['series', series], ['q', search.value.trim()]].forEach(function (pair) {
        if (!pair[1] || pair[1] === 'all') url.searchParams.delete(pair[0]);
        else url.searchParams.set(pair[0], pair[1]);
      });
      history.replaceState(null, '', url);
    }
  }
  function fromUrl() {
    var params = new URLSearchParams(location.search);
    category = chips.some(function (b) { return b.dataset.cat === params.get('cat'); }) ? params.get('cat') : 'all';
    series = ['guide', 'market'].includes(params.get('series')) ? params.get('series') : 'all';
    search.value = params.get('q') || '';
    apply(false);
  }
  chips.forEach(function (b) { b.addEventListener('click', function () { category = b.dataset.cat; apply(true); }); });
  seriesButtons.forEach(function (b) { b.addEventListener('click', function () { series = b.dataset.series; apply(true); }); });
  search.addEventListener('input', function () { apply(true); });
  window.addEventListener('popstate', fromUrl);
  fromUrl();
})();
