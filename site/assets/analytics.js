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

  var GA4_MEASUREMENT_ID = 'G-XXXXXXXXXX';     // TODO: 실제 GA4 측정 ID로 교체
  var NAVER_ANALYTICS_ID = 'NAVER_ANALYTICS_ID'; // TODO: 실제 네이버 애널리틱스 ID로 교체

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
})();
