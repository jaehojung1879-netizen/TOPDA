/*
 * 톺다 — 측정 도구 스캐폴드 (GA4 + 네이버 애널리틱스)
 * --------------------------------------------------------------
 * 실제 운영 시 아래 두 ID만 발급받아 교체하면 전 페이지에 적용됩니다.
 *   - GA4_MEASUREMENT_ID : Google Analytics 4 측정 ID (예: G-XXXXXXXXXX)
 *   - NAVER_ANALYTICS_ID : 네이버 애널리틱스 ID (예: 1a2b3c4d5e6f)
 * ID가 플레이스홀더 그대로면 스크립트 로딩을 건너뛰므로(개발 중 오류 방지)
 * 빈 트래킹 호출이 발생하지 않습니다.
 *
 * 정의된 핵심 이벤트(GA4):
 *   calc_complete   — 계산기 결과 산출 완료
 *   share_click     — 결과 공유 버튼 클릭
 *   outbound_click  — 외부/제휴 링크 클릭
 *   checklist_check — 체크리스트 항목 체크
 */
(function () {
  'use strict';

  var GA4_MEASUREMENT_ID = 'G-7NE57E1KLH';     // TODO: 실제 GA4 측정 ID로 교체
  var NAVER_ANALYTICS_ID = '25db1b1d375e68'; // TODO: 실제 네이버 애널리틱스 ID로 교체

  var gaReady = /^G-[A-Z0-9]{6,}$/.test(GA4_MEASUREMENT_ID);
  var naverReady = NAVER_ANALYTICS_ID && NAVER_ANALYTICS_ID !== 'NAVER_ANALYTICS_ID';

  // ----- GA4 (gtag.js) -----
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  if (gaReady) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_MEASUREMENT_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID, { anonymize_ip: true });
  }

  // ----- 네이버 애널리틱스 (wcslog) -----
  if (naverReady) {
    var ns = document.createElement('script');
    ns.async = true;
    ns.src = '//wcs.naver.net/wcslog.js';
    ns.onload = function () {
      if (window.wcs) {
        window.wcs_add = window.wcs_add || {};
        window.wcs_add.wa = NAVER_ANALYTICS_ID;
        if (window.wcs.inflow) window.wcs.inflow();
        var pageView = {};
        if (window.wcs) window.wcs_do(pageView);
      }
    };
    document.head.appendChild(ns);
  }

  // ----- 공용 이벤트 헬퍼 -----
  function track(name, params) {
    if (gaReady && window.gtag) window.gtag('event', name, params || {});
    // 디버그: 콘솔에서 이벤트 흐름 확인 가능
    if (window.__TOPDA_DEBUG__) console.debug('[track]', name, params || {});
  }
  window.topdaTrack = track;

  // ----- 자동 위임: 외부/제휴 링크 클릭 추적 -----
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href) && a.host !== location.host) {
      track('outbound_click', { link_url: href, link_text: (a.textContent || '').trim().slice(0, 80) });
    }
  }, { passive: true });

  // ----- 자동 위임: 체크리스트 항목 체크 -----
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.matches && t.matches('.check-item input[type="checkbox"], .checklist input[type="checkbox"]')) {
      track('checklist_check', { checked: t.checked, page: location.pathname });
    }
  }, { passive: true });

  // =========================================================================
  // 실거래 단지 페이지 → 계산기 퍼널 (지시서 9단계)
  //   apt_page_view            단지·지역 페이지 조회
  //   apt_calculator_click     단지 페이지에서 계산기로 이동
  //   calculator_prefill_loaded 프리필된 계산기 진입 (app.js에서 발생)
  //   calculator_run           계산기 실제 실행
  //   guide_click              가이드·체크리스트로 이동
  // 공통 파라미터: region, complex, calculator_type, source_page, prefill_used
  // =========================================================================
  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return (el && el.getAttribute('content')) || '';
  }

  var aptRegion = meta('topda:region');
  var aptComplex = meta('topda:complex');
  var isApt = location.pathname.indexOf('/apt/') === 0;

  if (isApt) {
    track('apt_page_view', {
      region: aptRegion,
      complex: aptComplex,
      page_type: aptComplex ? 'complex' : 'region',
      source_page: location.pathname
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';

    // 단지 페이지의 계산기 CTA — data-apt-calc에 대상 계산기 파일명이 들어 있다.
    var calc = a.getAttribute('data-apt-calc');
    if (calc) {
      track('apt_calculator_click', {
        region: aptRegion,
        complex: aptComplex,
        calculator_type: calc.replace('.html', ''),
        source_page: location.pathname,
        prefill_used: href.indexOf('source=apt') !== -1
      });
      return;
    }
    if (/^\/(posts|checklists)\//.test(href) || /^\/guides\.html/.test(href)) {
      track('guide_click', {
        region: aptRegion,
        complex: aptComplex,
        link_url: href,
        source_page: location.pathname
      });
    }
  }, { passive: true });

  // calculator_run — '실행'의 정의: 페이지 진입 시 자동 계산이 아니라,
  // 사용자가 입력을 한 번이라도 바꿔 결과가 다시 산출된 시점. 페이지당 1회만 보낸다.
  // (모든 계산기가 로드 시 recalc()를 부르므로, 로드 시점에 세면 실행률이 100%로 부풀려진다.)
  var ranOnce = false;
  function onUserCalc(e) {
    if (ranOnce) return;
    var t = e.target;
    if (!t || !t.closest || !t.closest('.calc-form, [data-calc]')) return;
    ranOnce = true;
    var qs = new URLSearchParams(location.search);
    track('calculator_run', {
      calculator_type: location.pathname.split('/').pop().replace('.html', ''),
      source_page: qs.get('source') === 'apt' ? 'apt' : 'direct',
      prefill_used: qs.get('source') === 'apt',
      complex: qs.get('complex') || '',
      region: qs.get('region_name') || ''
    });
  }
  document.addEventListener('input', onUserCalc, { passive: true });
  document.addEventListener('change', onUserCalc, { passive: true });
})();
