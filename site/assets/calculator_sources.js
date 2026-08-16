/* 계산기에 외부 기준값을 안전하게 채우는 공용 모듈.
 *
 * 종합계산기와 개별 계산기가 각자 fetch·실패처리를 복사하면 한쪽만 고쳐지는 문제가
 * 반복된다. 화면별 코드는 입력칸과 안내문만 넘기고, 조회값/15% fallback 판정은 여기서
 * 한 번만 한다.
 */
window.TopdaCalculatorSources = (function () {
  'use strict';

  var BOND_FALLBACK_PCT = 15;

  function setInput(input, value) {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function resolveBondRate(json) {
    var res = typeof applyBondDiscountRate === 'function'
      ? applyBondDiscountRate(json)
      : { state: 'example', rate: BOND_FALLBACK_PCT };
    var fresh = res && res.state === 'fresh' && Number(res.rate) > 0;
    return {
      result: res,
      fresh: fresh,
      value: fresh ? Number(res.rate) : BOND_FALLBACK_PCT,
    };
  }

  function bindBondDiscountRate(opts) {
    opts = opts || {};
    var input = opts.input;
    var note = opts.note;
    if (!input || input.dataset.bondSourceAttached) return Promise.resolve(null);
    input.dataset.bondSourceAttached = '1';

    var touched = false;
    var applying = false;
    input.addEventListener('input', function () {
      if (!applying) touched = true;
    });

    function applyValue(value) {
      if (touched) return false;
      applying = true;
      setInput(input, value);
      applying = false;
      return true;
    }

    var url = opts.url || '../assets/bond_rate.json';
    return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (json) {
        var resolved = resolveBondRate(json);
        var res = resolved.result;
        var fresh = resolved.fresh;
        var applied = applyValue(resolved.value);

        input.dataset.bondRateState = fresh ? 'fresh' : 'fallback';
        input.title = fresh
          ? '자동 조회값' + (res.asOf ? ' · ' + res.asOf + ' 기준' : '')
          : '자동 조회 실패·지연 시 적용하는 안전 기본값';

        if (note) {
          if (fresh) {
            // 정상일에는 입력칸에 실제 값만 채운다. 사용자가 조치할 일이 없으므로 별도
            // 상태 문구를 계속 띄우지 않는다.
            note.hidden = true;
          } else {
            note.className = 'data-stale';
            note.textContent = applied
              ? '자동 조회에 실패했거나 최신 값이 아니어서 기본값 15%를 적용했습니다. '
                + '잔금일 당일 고객부담률은 은행 국민주택채권 포털에서 확인하세요.'
              : '자동 조회에 실패했거나 최신 값이 아닙니다. 직접 입력한 값은 유지했습니다. '
                + '잔금일 당일 고객부담률을 은행 국민주택채권 포털에서 확인하세요.';
            note.hidden = false;
          }
        }

        if (typeof opts.onApplied === 'function') opts.onApplied(res, fresh, applied);
        return { result: res, fresh: fresh, applied: applied };
      });
  }

  return {
    BOND_FALLBACK_PCT: BOND_FALLBACK_PCT,
    resolveBondRate: resolveBondRate,
    bindBondDiscountRate: bindBondDiscountRate,
  };
})();
