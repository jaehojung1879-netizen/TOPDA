/*
 * 톺다 — 지도 어댑터 (kmap.js)
 * Kakao 지도 우선, 실패 시 Leaflet(OSM) 자동 폴백. 원형 마커 + 팝업 + 범례만 지원하는
 * 얇은 공용 레이어로, 전세가율(jeonse-ratio)·상가 임대(commercial-rent) 지도가 함께 쓴다.
 * (실거래 지도는 클러스터러가 필요해 페이지 자체 구현을 유지)
 *
 * 배포 시 deploy 워크플로가 __KAKAO_JS_KEY__ 를 secrets.KAKAO_JAVASCRIPT_KEY 로 치환한다.
 * 치환 전(로컬·PR)이나 SDK 로딩 실패(도메인 미등록 등) 시 Leaflet으로 내려간다.
 */
(function (root) {
  'use strict';
  var KAKAO_KEY = '__KAKAO_JS_KEY__';
  var keyValid = !/^__.*__$/.test(KAKAO_KEY) && KAKAO_KEY.length >= 16;
  var sdkState = 'idle';   // idle | loading | ready | failed
  var waiters = [];

  function loadSdk(cb) {
    if (root.kakao && root.kakao.maps && sdkState === 'ready') { cb(true); return; }
    waiters.push(cb);
    if (sdkState === 'loading') return;
    sdkState = 'loading';
    var s = document.createElement('script');
    s.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + KAKAO_KEY + '&autoload=false';
    s.onload = function () {
      root.kakao.maps.load(function () {
        sdkState = 'ready';
        waiters.splice(0).forEach(function (w) { w(true); });
      });
    };
    s.onerror = function () {
      sdkState = 'failed';
      // 키는 주입됐는데 SDK가 거부되면 대부분 카카오 콘솔의 Web 플랫폼 도메인 미등록.
      if (root.console && console.warn) {
        console.warn('[톺다 지도] Kakao SDK 로딩 실패 — developers.kakao.com > 내 애플리케이션 > 플랫폼 > Web에 '
          + location.origin + ' 등록 여부와 JavaScript 키인지 확인하세요. Leaflet 지도로 대체합니다.');
      }
      waiters.splice(0).forEach(function (w) { w(false); });
    };
    document.head.appendChild(s);
  }

  // SVG 원형 마커 이미지 (Kakao)
  function circleImage(color, r) {
    var d = r * 2;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + d + '" height="' + d + '">' +
      '<circle cx="' + r + '" cy="' + r + '" r="' + (r - 1) + '" fill="' + color + '" stroke="#fff" stroke-width="1.5"/></svg>';
    return new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
      new kakao.maps.Size(d, d), { offset: new kakao.maps.Point(r, r) });
  }

  function kakaoAdapter(el, opts) {
    var map = new kakao.maps.Map(el, {
      center: new kakao.maps.LatLng(opts.center[0], opts.center[1]),
      level: opts.level || 12,
    });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    var info = new kakao.maps.InfoWindow({ removable: true, zIndex: 3 });
    var markers = [];
    return {
      engine: 'kakao',
      clear: function () { markers.forEach(function (m) { m.setMap(null); }); markers = []; info.close(); },
      addCircle: function (lat, lng, o) {
        var m = new kakao.maps.Marker({
          map: map, position: new kakao.maps.LatLng(lat, lng),
          image: circleImage(o.fillColor || '#2563eb', o.radius || 9), title: o.title || '',
        });
        if (o.popupHtml) {
          kakao.maps.event.addListener(m, 'click', function () {
            info.setContent('<div style="padding:8px 10px;font-size:0.82rem;line-height:1.6;max-width:220px;">' + o.popupHtml + '</div>');
            info.open(map, m);
          });
        }
        markers.push(m);
      },
      fitBounds: function (pts) {
        if (!pts.length) return;
        var b = new kakao.maps.LatLngBounds();
        pts.forEach(function (p) { b.extend(new kakao.maps.LatLng(p[0], p[1])); });
        map.setBounds(b);
      },
      setLegend: setLegendFactory(el),
    };
  }

  function leafletAdapter(el, opts) {
    if (typeof L === 'undefined') return null;   // Leaflet도 없으면 지도 없이 동작
    var map = L.map(el, { scrollWheelZoom: false }).setView(opts.center, opts.zoom || 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    var layer = L.layerGroup().addTo(map);
    return {
      engine: 'leaflet',
      clear: function () { layer.clearLayers(); },
      addCircle: function (lat, lng, o) {
        var m = L.circleMarker([lat, lng], {
          radius: o.radius || 9, color: '#fff', weight: 1.5,
          fillColor: o.fillColor || '#2563eb', fillOpacity: 0.9,
        }).addTo(layer);
        if (o.popupHtml) m.bindPopup(o.popupHtml);
      },
      fitBounds: function (pts) {
        if (pts.length) { try { map.fitBounds(pts, { padding: [40, 40], maxZoom: opts.maxZoom || 11 }); } catch (e) {} }
      },
      setLegend: setLegendFactory(el),
    };
  }

  // 범례: 엔진 무관 HTML 오버레이 (지도 컨테이너 우하단)
  function setLegendFactory(el) {
    return function (html) {
      var box = el.querySelector('.kmap-legend');
      if (!box) {
        box = document.createElement('div');
        box.className = 'kmap-legend';
        box.style.cssText = 'position:absolute;right:10px;bottom:10px;z-index:1000;background:rgba(255,255,255,0.94);'
          + 'border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;font-size:0.72rem;line-height:1.7;box-shadow:0 1px 4px rgba(0,0,0,0.08);';
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.appendChild(box);
      }
      box.innerHTML = html;
    };
  }

  // 진입점: Kakao 시도 → 실패 시 Leaflet → 그것도 없으면 onReady(null)
  function init(elId, opts, onReady) {
    var el = document.getElementById(elId);
    if (!el) { onReady(null); return; }
    if (keyValid) {
      loadSdk(function (ok) {
        if (ok) { onReady(kakaoAdapter(el, opts)); }
        else { onReady(leafletAdapter(el, opts)); }
      });
    } else {
      onReady(leafletAdapter(el, opts));
    }
  }

  root.TopdaKMap = { init: init };
})(typeof self !== 'undefined' ? self : this);
