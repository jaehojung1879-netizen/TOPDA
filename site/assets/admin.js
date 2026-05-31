// ===== TOPDA 관리자 편집 도구 (admin.js) =====
// 정적 사이트용 시각 편집기. app.js의 조건부 로더가 관리자에게만 내려준다.
//
// 보안 메모:
//  - 이 게이트는 "진짜 인증"이 아니라 편의용 잠금이다(정적 호스팅 한계).
//  - 방문자가 편집 모드를 켜도 변경은 본인 브라우저(localStorage)에만 저장되며
//    실제 배포 사이트는 절대 바뀌지 않는다.
//  - 편집 결과를 모두에게 반영하려면 '내보내기'로 받은 CSS를 저장소에 커밋해야 한다.
//  - 향후 로그인 백엔드가 생기면 ensureAuth()만 교체하면 된다.
(function () {
  'use strict';
  if (window.__topdaAdminLoaded) return;
  window.__topdaAdminLoaded = true;

  var LS_AUTH = 'topda_admin';
  var LS_OVR = 'topda_overrides_v1';
  var LS_TEXT = 'topda_text_v1';
  var LS_IMG = 'topda_img_v1';
  // 패스코드(향후 로그인으로 대체). 기본값은 운영자가 변경하세요.
  var PASSCODE = 'topda';
  var PAGE = location.pathname;

  document.documentElement.setAttribute('data-topda-page', PAGE);

  // ---------- 저장소 ----------
  function readAll() { try { return JSON.parse(localStorage.getItem(LS_OVR) || '{}'); } catch (e) { return {}; } }
  function writeAll(o) { try { localStorage.setItem(LS_OVR, JSON.stringify(o)); } catch (e) {} }
  function pageOvr() { var a = readAll(); return a[PAGE] || {}; }
  function savePageOvr(o) { var a = readAll(); a[PAGE] = o; writeAll(a); }
  // 텍스트/이미지 오버라이드(스타일과 별도 저장소)
  function _read(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
  function getText() { var a = _read(LS_TEXT); return a[PAGE] || {}; }
  function setTextStore(o) { var a = _read(LS_TEXT); a[PAGE] = o; try { localStorage.setItem(LS_TEXT, JSON.stringify(a)); } catch (e) {} }
  function getImg() { var a = _read(LS_IMG); return a[PAGE] || {}; }
  function setImgStore(o) { var a = _read(LS_IMG); a[PAGE] = o; try { localStorage.setItem(LS_IMG, JSON.stringify(a)); } catch (e) { return false; } return true; }

  // ---------- 선택자 경로 ----------
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + cssEscape(el.id);
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (el.id) { parts.unshift('#' + cssEscape(el.id)); break; }
      var sel = el.tagName.toLowerCase();
      var parent = el.parentNode;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName; });
        if (same.length > 1) sel += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      }
      parts.unshift(sel);
      el = el.parentNode;
    }
    return parts.join(' > ');
  }
  function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }

  // ---------- 오버라이드 적용 ----------
  function applyAll() {
    var ovr = pageOvr();
    Object.keys(ovr).forEach(function (sel) {
      var props = ovr[sel];
      var nodes;
      try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
      nodes.forEach(function (el) {
        Object.keys(props).forEach(function (p) { el.style.setProperty(p, props[p], 'important'); });
      });
    });
  }
  function applyText() {
    var t = getText();
    Object.keys(t).forEach(function (sel) {
      var nodes; try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
      nodes.forEach(function (el) { el.innerHTML = t[sel]; });
    });
  }
  function applyImages() {
    var im = getImg();
    Object.keys(im).forEach(function (sel) {
      var nodes; try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
      nodes.forEach(function (el) { if (el.tagName === 'IMG') { el.onerror = null; el.src = im[sel]; } });
    });
  }

  // ---------- 텍스트 직접 편집 (더블클릭) ----------
  function editText(el) {
    if (!el || isAdminUI(el) || el.tagName === 'IMG') return;
    el.setAttribute('contenteditable', 'plaintext-only');
    el.style.outline = '2px dashed #2563eb';
    el.focus();
    var done = function () {
      el.removeEventListener('blur', done);
      el.removeAttribute('contenteditable');
      el.style.outline = '';
      var sel = cssPath(el);
      var t = getText(); t[sel] = el.innerHTML; setTextStore(t);
      updateLiveDot();
      toast('텍스트 저장됨 (게시하려면 내보내기 → HTML 반영)');
    };
    el.addEventListener('blur', done);
  }

  // ---------- 이미지 드래그&드롭 ----------
  function handleDrop(img, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data = reader.result;
      img.onerror = null; img.src = data;            // 즉시 미리보기
      var sel = cssPath(img);
      var ok = true;
      try { var im = getImg(); im[sel] = data; ok = setImgStore(im); } catch (e) { ok = false; }
      select(img);
      updateLiveDot();
      toast(ok ? '이미지 적용됨 — 게시하려면 내보내기에서 내려받아 커밋' : '미리보기만 적용(용량이 커서 저장 안 됨)');
    };
    reader.readAsDataURL(file);
  }
  function imgDownload(dataURL, i) {
    try {
      var m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataURL);
      var ext = m ? m[1].split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg') : 'png';
      var bin = atob(m[2]); var arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      var blob = new Blob([arr], { type: m[1] });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'image-' + (i + 1) + '.' + ext; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('이미지 내려받음 — 저장소 경로에 커밋하세요');
    } catch (e) { toast('내려받기 실패'); }
  }

  // ---------- 상태 ----------
  var editMode = false;
  var selected = null;
  var undoStack = [];
  var clip = null;

  // ---------- 스타일 주입 ----------
  function injectStyle() {
    if (document.getElementById('topda-admin-style')) return;
    var css = ''
      + '#topda-admin-bar{position:fixed;left:12px;bottom:12px;z-index:99999;display:flex;gap:6px;align-items:center;'
      + 'background:#0f172a;color:#fff;border-radius:12px;padding:8px 10px;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);'
      + 'font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Pretendard Variable",Pretendard,sans-serif;}'
      + '#topda-admin-bar .tb{display:flex;gap:6px;align-items:center}'
      + '#topda-admin-bar button{border:0;border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer;background:#1e293b;color:#cbd5e1}'
      + '#topda-admin-bar button:hover{background:#334155;color:#fff}'
      + '#topda-admin-bar button.on{background:#2563eb;color:#fff}'
      + '#topda-admin-bar .dot{width:8px;height:8px;border-radius:50%;background:#64748b;margin:0 2px}'
      + '#topda-admin-bar .dot.live{background:#22c55e}'
      + '#topda-admin-bar .ttl{font-weight:800;letter-spacing:-.01em;margin-right:4px}'
      + 'body.topda-editing *{cursor:crosshair!important}'
      + 'body.topda-editing #topda-admin-bar *,body.topda-editing #topda-admin-panel *{cursor:default!important}'
      + '#topda-hl{position:fixed;z-index:99990;pointer-events:none;border:2px solid #2563eb;border-radius:3px;'
      + 'background:rgba(37,99,235,.08);transition:all .04s;display:none}'
      + '#topda-sel{position:fixed;z-index:99991;pointer-events:none;border:2px solid #f59e0b;border-radius:3px;display:none}'
      + '#topda-admin-panel{position:fixed;right:12px;top:12px;bottom:64px;width:300px;z-index:99999;overflow-y:auto;'
      + 'background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 20px 50px -20px rgba(15,23,42,.4);'
      + 'font:13px/1.45 -apple-system,BlinkMacSystemFont,"Pretendard Variable",Pretendard,sans-serif;color:#0f172a;display:none}'
      + '#topda-admin-panel.show{display:block}'
      + '#topda-admin-panel .ph{position:sticky;top:0;background:#fff;border-bottom:1px solid #eef2f7;padding:12px 14px;z-index:2}'
      + '#topda-admin-panel .ph .tag{font:700 11px/1.4 monospace;color:#2563eb;word-break:break-all}'
      + '#topda-admin-panel .ph .nav{display:flex;gap:6px;margin-top:8px}'
      + '#topda-admin-panel .ph .nav button{flex:1;border:1px solid #e2e8f0;background:#f8fafc;border-radius:7px;padding:5px;cursor:pointer;font:600 12px sans-serif;color:#475569}'
      + '#topda-admin-panel .ph .nav button:hover{background:#eef2f7}'
      + '#topda-admin-panel .grp{padding:12px 14px;border-bottom:1px solid #f1f5f9}'
      + '#topda-admin-panel .grp h4{margin:0 0 10px;font:800 11px/1 sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}'
      + '#topda-admin-panel .row{display:flex;align-items:center;gap:8px;margin-bottom:9px}'
      + '#topda-admin-panel .row label{width:62px;color:#64748b;font-weight:600;flex-shrink:0}'
      + '#topda-admin-panel input[type=number],#topda-admin-panel select{flex:1;min-width:0;border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;font:inherit}'
      + '#topda-admin-panel input[type=color]{width:38px;height:30px;border:1px solid #cbd5e1;border-radius:7px;padding:0;background:#fff;cursor:pointer}'
      + '#topda-admin-panel .step{display:flex;align-items:center;gap:4px}'
      + '#topda-admin-panel .step button{width:28px;height:30px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:7px;cursor:pointer;font:700 15px sans-serif;color:#334155}'
      + '#topda-admin-panel .step button:hover{background:#eef2f7}'
      + '#topda-admin-panel .seg{display:flex;border:1px solid #cbd5e1;border-radius:7px;overflow:hidden;flex:1}'
      + '#topda-admin-panel .seg button{flex:1;border:0;border-left:1px solid #e2e8f0;background:#fff;padding:6px 0;cursor:pointer;font:600 12px sans-serif;color:#475569}'
      + '#topda-admin-panel .seg button:first-child{border-left:0}'
      + '#topda-admin-panel .seg button.on{background:#2563eb;color:#fff}'
      + '#topda-admin-panel .four{display:grid;grid-template-columns:1fr 1fr;gap:6px}'
      + '#topda-admin-panel .four input{width:100%}'
      + '#topda-admin-panel .mini{font-size:11px;color:#94a3b8;margin:-4px 0 8px 70px}'
      + '#topda-admin-panel .danger{width:100%;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;padding:8px;cursor:pointer;font:700 12px sans-serif}'
      + '#topda-admin-panel .danger:hover{background:#fee2e2}'
      + '#topda-modal-bg{position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px}'
      + '#topda-modal{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:80vh;overflow:auto;padding:20px;font:14px/1.5 sans-serif;color:#0f172a}'
      + '#topda-modal h3{margin:0 0 8px}#topda-modal p{color:#475569;margin:0 0 12px;font-size:13px}'
      + '#topda-modal textarea{width:100%;height:200px;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:12px/1.5 monospace;resize:vertical}'
      + '#topda-modal .ma{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}'
      + '#topda-modal button{border:0;border-radius:8px;padding:9px 14px;font:700 13px sans-serif;cursor:pointer}'
      + '#topda-modal .pri{background:#2563eb;color:#fff}#topda-modal .sec{background:#f1f5f9;color:#334155}'
      + '#topda-toast{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:100001;background:#0f172a;color:#fff;'
      + 'padding:10px 16px;border-radius:999px;font:600 13px sans-serif;box-shadow:0 8px 20px -6px rgba(0,0,0,.4);opacity:0;transition:opacity .2s;pointer-events:none}'
      + '#topda-toast.show{opacity:1}';
    var st = document.createElement('style');
    st.id = 'topda-admin-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- 토스트 ----------
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'topda-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  // ---------- 게이트 ----------
  function ensureAuth(cb) {
    if (localStorage.getItem(LS_AUTH) === '1') { cb(); return; }
    var code = window.prompt('관리자 패스코드를 입력하세요\n(정적 사이트의 편의용 잠금이며 향후 로그인으로 대체됩니다)');
    if (code === null) return;
    if (code === PASSCODE) { try { localStorage.setItem(LS_AUTH, '1'); } catch (e) {} cb(); }
    else window.alert('패스코드가 올바르지 않습니다.');
  }

  // ---------- 하이라이트/선택 박스 ----------
  var hlEl, selEl;
  function rectTo(box, el) {
    var r = el.getBoundingClientRect();
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    box.style.display = 'block';
  }
  function isAdminUI(el) { return !!(el.closest && el.closest('#topda-admin-bar,#topda-admin-panel,#topda-modal-bg,#topda-toast,#topda-hl,#topda-sel,.topda-rz')); }

  function onMove(e) {
    if (!editMode) return;
    var el = e.target;
    if (!el || isAdminUI(el) || el === document.body || el === document.documentElement) { if (hlEl) hlEl.style.display = 'none'; return; }
    rectTo(hlEl, el);
  }
  function onClickCapture(e) {
    if (!editMode) return;
    var el = e.target;
    if (isAdminUI(el)) return;       // 패널/바 클릭은 통과
    if (el.isContentEditable) return; // 텍스트 편집 중인 요소 클릭은 통과(캐럿 이동)
    e.preventDefault(); e.stopPropagation();
    select(el);
  }

  function select(el) {
    selected = el;
    rectTo(selEl, el);
    buildPanel();
    syncSelBox();
  }
  function syncSelBox() {
    if (selected) { rectTo(selEl, selected); positionHandles(); }
    else { selEl.style.display = 'none'; hideHandles(); }
  }

  // ---------- 리사이즈 핸들 (드래그로 셀 크기 조정) ----------
  var handles = {};
  function makeHandles() {
    ['e', 's', 'se'].forEach(function (dir) {
      var h = document.createElement('div');
      h.className = 'topda-rz topda-rz-' + dir;
      h.style.cssText = 'position:fixed;z-index:99992;width:12px;height:12px;border:2px solid #f59e0b;'
        + 'background:#fff;border-radius:3px;display:none;'
        + 'cursor:' + (dir === 'e' ? 'ew-resize' : dir === 's' ? 'ns-resize' : 'nwse-resize') + ';';
      h.addEventListener('mousedown', function (e) { startResize(e, dir); });
      document.body.appendChild(h);
      handles[dir] = h;
    });
  }
  function positionHandles() {
    if (!selected || !editMode) { hideHandles(); return; }
    var r = selected.getBoundingClientRect();
    place(handles.e, r.right - 6, r.top + r.height / 2 - 6);
    place(handles.s, r.left + r.width / 2 - 6, r.bottom - 6);
    place(handles.se, r.right - 6, r.bottom - 6);
  }
  function place(h, x, y) { if (h) { h.style.left = x + 'px'; h.style.top = y + 'px'; h.style.display = 'block'; } }
  function hideHandles() { ['e', 's', 'se'].forEach(function (d) { if (handles[d]) handles[d].style.display = 'none'; }); }
  var rz = null;
  function startResize(e, dir) {
    if (!selected) return;
    e.preventDefault(); e.stopPropagation();
    var r = selected.getBoundingClientRect();
    rz = { dir: dir, x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onResize, true);
    document.addEventListener('mouseup', endResize, true);
  }
  function onResize(e) {
    if (!rz) return;
    if (rz.dir === 'e' || rz.dir === 'se') setProp('width', Math.max(20, Math.round(rz.w + (e.clientX - rz.x))) + 'px', false);
    if (rz.dir === 's' || rz.dir === 'se') setProp('height', Math.max(20, Math.round(rz.h + (e.clientY - rz.y))) + 'px', false);
  }
  function endResize() {
    rz = null; document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onResize, true);
    document.removeEventListener('mouseup', endResize, true);
    if (selected) buildPanel();
    updateLiveDot();
  }

  // ---------- 속성 변경 ----------
  function setProp(prop, value, record) {
    if (!selected) return;
    var sel = cssPath(selected);
    var ovr = pageOvr();
    var prev = (ovr[sel] && ovr[sel][prop] !== undefined) ? ovr[sel][prop] : null;
    if (record !== false) undoStack.push({ sel: sel, prop: prop, prev: prev });
    if (value === null || value === '') {
      selected.style.removeProperty(prop);
      if (ovr[sel]) { delete ovr[sel][prop]; if (!Object.keys(ovr[sel]).length) delete ovr[sel]; }
    } else {
      selected.style.setProperty(prop, value, 'important');
      ovr[sel] = ovr[sel] || {};
      ovr[sel][prop] = value;
    }
    savePageOvr(ovr);
    syncSelBox();
    updateLiveDot();
  }
  function undo() {
    var last = undoStack.pop();
    if (!last) { toast('되돌릴 변경이 없습니다'); return; }
    var ovr = pageOvr();
    var nodes; try { nodes = document.querySelectorAll(last.sel); } catch (e) { nodes = []; }
    nodes.forEach(function (el) {
      if (last.prev === null) el.style.removeProperty(last.prop);
      else el.style.setProperty(last.prop, last.prev, 'important');
    });
    ovr[last.sel] = ovr[last.sel] || {};
    if (last.prev === null) { delete ovr[last.sel][last.prop]; if (!Object.keys(ovr[last.sel]).length) delete ovr[last.sel]; }
    else ovr[last.sel][last.prop] = last.prev;
    savePageOvr(ovr);
    if (selected) buildPanel();
    syncSelBox();
    updateLiveDot();
    toast('되돌림');
  }

  function cur(prop) { return selected ? getComputedStyle(selected)[prop] : ''; }
  function px(v) { return parseFloat(v) || 0; }

  // ---------- 패널 ----------
  var panel;
  function buildPanel() {
    if (!panel) { panel = document.createElement('div'); panel.id = 'topda-admin-panel'; document.body.appendChild(panel); }
    panel.classList.add('show');
    if (!selected) { panel.innerHTML = '<div class="grp">요소를 클릭해 선택하세요.</div>'; return; }

    var tag = cssPath(selected);
    panel.innerHTML = ''
      + '<div class="ph"><div class="tag">' + tag.replace(/</g, '&lt;') + '</div>'
      + '<div class="nav"><button data-act="parent">▲ 상위</button><button data-act="edittext">✎ 글자</button><button data-act="deselect">해제</button></div></div>'

      + '<div class="grp"><h4>글자</h4>'
      + row('크기', stepCtrl('font-size', px(cur('fontSize')), 1, 'px'))
      + row('굵기', selectCtrl('font-weight', cur('fontWeight'), ['300', '400', '500', '600', '700', '800']))
      + row('행간', numCtrl('line-height', round(parseFloat(cur('lineHeight')) / px(cur('fontSize')), 2) || 1.5, 0.05, ''))
      + row('자간', numCtrl('letter-spacing', px(cur('letterSpacing')), 0.1, 'px'))
      + row('정렬', segCtrl('text-align', cur('textAlign'), [['left', '좌'], ['center', '중'], ['right', '우'], ['justify', '양끝']]))
      + row('색', colorCtrl('color', rgbToHex(cur('color'))))
      + '</div>'

      + '<div class="grp"><h4>박스 · cell</h4>'
      + row('안 여백', stepCtrl('padding', px(cur('paddingTop')), 2, 'px'))
      + '<div class="four">' + fourInput('padding') + '</div>'
      + '<div class="mini" style="margin-left:0">↑ 상·우·하·좌 개별 (비우면 무시)</div>'
      + row('밖 여백', stepCtrl('margin', px(cur('marginTop')), 2, 'px'))
      + row('너비', widthCtrl())
      + row('모서리', stepCtrl('border-radius', px(cur('borderRadius')), 1, 'px'))
      + row('배경', colorCtrl('background-color', rgbToHex(cur('backgroundColor')), true))
      + '</div>'

      + '<div class="grp"><button class="danger" data-act="reset">이 요소 변경 초기화</button></div>';

    wirePanel();
  }

  function row(label, ctrl) { return '<div class="row"><label>' + label + '</label>' + ctrl + '</div>'; }
  function stepCtrl(prop, val, step, unit) {
    return '<div class="step"><button data-step="' + prop + '|' + (-step) + '|' + unit + '">−</button>'
      + '<input type="number" data-prop="' + prop + '" data-unit="' + unit + '" step="' + step + '" value="' + round(val, 2) + '">'
      + '<button data-step="' + prop + '|' + step + '|' + unit + '">+</button></div>';
  }
  function numCtrl(prop, val, step, unit) {
    return '<input type="number" data-prop="' + prop + '" data-unit="' + unit + '" step="' + step + '" value="' + round(val, 2) + '">';
  }
  function selectCtrl(prop, val, opts) {
    var v = String(parseInt(val, 10) || val);
    return '<select data-prop="' + prop + '">' + opts.map(function (o) {
      return '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + o + '</option>';
    }).join('') + '</select>';
  }
  function segCtrl(prop, val, opts) {
    return '<div class="seg" data-seg="' + prop + '">' + opts.map(function (o) {
      return '<button data-val="' + o[0] + '"' + (o[0] === val ? ' class="on"' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function colorCtrl(prop, val, clearable) {
    return '<input type="color" data-prop="' + prop + '" value="' + (val || '#000000') + '">'
      + (clearable ? '<button class="step" data-clear="' + prop + '" style="border:1px solid #cbd5e1;background:#f8fafc;border-radius:7px;padding:6px 8px;cursor:pointer">지움</button>' : '');
  }
  function fourInput(prop) {
    var sides = ['top', 'right', 'bottom', 'left'];
    return sides.map(function (s) {
      return '<input type="number" data-prop="' + prop + '-' + s + '" data-unit="px" placeholder="' + s[0].toUpperCase() + '">';
    }).join('');
  }
  function widthCtrl() {
    var w = selected.style.width || '';
    var n = px(w); var unit = /%/.test(w) ? '%' : 'px';
    return '<input type="number" data-prop="width" data-unit="' + unit + '" value="' + (n || '') + '" style="flex:2">'
      + '<select data-wunit style="flex:1"><option value="px"' + (unit === 'px' ? ' selected' : '') + '>px</option>'
      + '<option value="%"' + (unit === '%' ? ' selected' : '') + '>%</option>'
      + '<option value="">자동</option></select>';
  }

  function wirePanel() {
    panel.querySelectorAll('[data-prop]').forEach(function (inp) {
      var ev = inp.type === 'color' ? 'input' : 'input';
      inp.addEventListener(ev, function () {
        var prop = inp.getAttribute('data-prop');
        var unit = inp.getAttribute('data-unit') || '';
        var val = inp.value;
        if (val === '' && inp.type === 'number') { setProp(prop, null); return; }
        setProp(prop, unit ? (val + unit) : val);
      });
    });
    panel.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.getAttribute('data-step').split('|');
        var prop = parts[0], delta = parseFloat(parts[1]), unit = parts[2] || '';
        var input = panel.querySelector('input[data-prop="' + prop + '"]');
        var nv = round((parseFloat(input.value) || 0) + delta, 2);
        if (nv < 0 && (prop === 'padding' || prop === 'border-radius' || prop === 'font-size' || prop === 'width')) nv = 0;
        input.value = nv;
        setProp(prop, unit ? (nv + unit) : String(nv));
      });
    });
    panel.querySelectorAll('[data-seg]').forEach(function (seg) {
      seg.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          setProp(seg.getAttribute('data-seg'), b.getAttribute('data-val'));
        });
      });
    });
    panel.querySelectorAll('[data-clear]').forEach(function (b) {
      b.addEventListener('click', function () { setProp(b.getAttribute('data-clear'), null); buildPanel(); });
    });
    var wunit = panel.querySelector('[data-wunit]');
    if (wunit) wunit.addEventListener('change', function () {
      var input = panel.querySelector('input[data-prop="width"]');
      if (wunit.value === '') { setProp('width', null); input.value = ''; }
      else if (input.value !== '') setProp('width', input.value + wunit.value);
    });
    panel.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.getAttribute('data-act');
        if (act === 'parent') { if (selected && selected.parentElement && selected.parentElement !== document.body) select(selected.parentElement); }
        else if (act === 'deselect') { selected = null; selEl.style.display = 'none'; panel.classList.remove('show'); }
        else if (act === 'edittext') { if (selected) editText(selected); }
        else if (act === 'reset') { resetSelected(); }
      });
    });
  }

  function resetSelected() {
    if (!selected) return;
    var sel = cssPath(selected);
    var ovr = pageOvr();
    if (ovr[sel]) { Object.keys(ovr[sel]).forEach(function (p) { selected.style.removeProperty(p); }); delete ovr[sel]; savePageOvr(ovr); }
    buildPanel(); syncSelBox(); updateLiveDot();
    toast('이 요소 변경을 초기화했습니다');
  }

  // ---------- 유틸 ----------
  function round(n, d) { var m = Math.pow(10, d || 0); return Math.round((n + Number.EPSILON) * m) / m; }
  function rgbToHex(rgb) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + parseInt(x, 10).toString(16)).slice(-2); }).join('');
  }

  // ---------- 내보내기/가져오기 ----------
  function exportCSS() {
    var ovr = pageOvr();
    var sels = Object.keys(ovr);
    if (!sels.length) return '/* 이 페이지에 저장된 변경이 없습니다. */';
    var css = '/* TOPDA 편집 오버라이드 — ' + PAGE + ' */\n';
    sels.forEach(function (sel) {
      css += 'html[data-topda-page="' + PAGE + '"] ' + sel + ' {\n';
      Object.keys(ovr[sel]).forEach(function (p) { css += '  ' + p + ': ' + ovr[sel][p] + ' !important;\n'; });
      css += '}\n';
    });
    return css;
  }
  function showModal(title, desc, content, extraBtns) {
    closeModal();
    var bg = document.createElement('div'); bg.id = 'topda-modal-bg';
    var btns = (extraBtns || []).map(function (b) { return '<button class="' + (b.cls || 'sec') + '" data-mb="' + b.id + '">' + b.label + '</button>'; }).join('');
    bg.innerHTML = '<div id="topda-modal"><h3>' + title + '</h3><p>' + desc + '</p>'
      + '<textarea spellcheck="false">' + content.replace(/</g, '&lt;') + '</textarea>'
      + '<div class="ma">' + btns + '<button class="sec" data-mb="close">닫기</button></div></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', function (e) { if (e.target === bg) closeModal(); });
    bg.querySelector('[data-mb="close"]').addEventListener('click', closeModal);
    return bg;
  }
  function closeModal() { var m = document.getElementById('topda-modal-bg'); if (m) m.remove(); }

  function doExport() {
    var css = exportCSS();
    var text = getText(), img = getImg();
    var tKeys = Object.keys(text), iKeys = Object.keys(img);
    closeModal();
    var bg = document.createElement('div'); bg.id = 'topda-modal-bg';
    var h = '<div id="topda-modal"><h3>변경분 내보내기</h3>';
    h += '<p><b>① 스타일</b>(글자·여백·정렬 등) — 아래 CSS를 <b>site/assets/styles.css</b> 맨 아래에 붙여넣고 커밋하면 모든 방문자에 반영됩니다.</p>';
    h += '<textarea spellcheck="false">' + css.replace(/</g, '&lt;') + '</textarea>';
    h += '<div class="ma"><button class="pri" data-mb="copy">CSS 복사</button><button class="sec" data-mb="dl">.css 내려받기</button></div>';
    if (tKeys.length) {
      var tlist = tKeys.map(function (s) { return s + '\n  → ' + String(text[s]).replace(/<[^>]+>/g, '').trim(); }).join('\n\n');
      h += '<p style="margin-top:14px"><b>② 텍스트 변경</b> — 텍스트는 HTML 본문을 직접 고쳐야 게시됩니다. 아래 목록 참고(또는 저에게 “이 텍스트로 바꿔줘” 하셔도 됩니다).</p>';
      h += '<textarea spellcheck="false" style="height:120px">' + tlist.replace(/</g, '&lt;') + '</textarea>';
    }
    if (iKeys.length) {
      h += '<p style="margin-top:14px"><b>③ 이미지</b> — 내려받아 저장소의 이미지 경로에 같은 파일명으로 커밋하세요.</p><div>'
        + iKeys.map(function (s, i) { return '<button class="sec" data-img="' + i + '" style="margin:2px">이미지 ' + (i + 1) + ' 내려받기</button>'; }).join('') + '</div>';
    }
    h += '<div class="ma"><button class="sec" data-mb="close">닫기</button></div></div>';
    bg.innerHTML = h;
    document.body.appendChild(bg);
    bg.addEventListener('click', function (e) { if (e.target === bg) closeModal(); });
    bg.querySelector('[data-mb="close"]').addEventListener('click', closeModal);
    bg.querySelector('[data-mb="copy"]').addEventListener('click', function () { copy(css); toast('CSS 복사됨'); });
    bg.querySelector('[data-mb="dl"]').addEventListener('click', function () { download('topda-overrides' + PAGE.replace(/[\/.]/g, '-') + '.css', css); });
    iKeys.forEach(function (s, i) { var b = bg.querySelector('[data-img="' + i + '"]'); if (b) b.addEventListener('click', function () { imgDownload(img[s], i); }); });
  }
  function copy(t) {
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () { legacyCopy(t); });
    else legacyCopy(t);
  }
  function legacyCopy(t) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/css' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function resetPage() {
    if (!window.confirm('이 페이지에 저장한 모든 편집(스타일·텍스트·이미지)을 지울까요? (커밋한 CSS는 영향 없음)')) return;
    var a = readAll(); delete a[PAGE]; writeAll(a);
    var t = _read(LS_TEXT); delete t[PAGE]; try { localStorage.setItem(LS_TEXT, JSON.stringify(t)); } catch (e) {}
    var im = _read(LS_IMG); delete im[PAGE]; try { localStorage.setItem(LS_IMG, JSON.stringify(im)); } catch (e) {}
    location.reload();
  }

  // ---------- 편집 모드 ----------
  function setEdit(on) {
    editMode = on;
    document.body.classList.toggle('topda-editing', on);
    btnEdit.classList.toggle('on', on);
    btnEdit.textContent = on ? '■ 편집 중' : '✎ 편집 모드';
    hlEl.style.display = 'none';
    if (on) { buildPanel(); } else { panel && panel.classList.remove('show'); selEl.style.display = 'none'; hideHandles(); }
  }

  // ---------- 바 ----------
  var btnEdit;
  function buildBar() {
    var bar = document.createElement('div'); bar.id = 'topda-admin-bar';
    bar.innerHTML = '<span class="ttl">톺다 편집</span><span class="dot" id="topda-livedot" title="이 페이지 저장된 변경"></span>'
      + '<div class="tb">'
      + '<button id="topda-edit">✎ 편집 모드</button>'
      + '<button id="topda-export">⤓ 내보내기</button>'
      + '<button id="topda-reset">↺ 페이지 초기화</button>'
      + '<button id="topda-logout">⏻ 로그아웃</button>'
      + '</div>';
    document.body.appendChild(bar);
    btnEdit = bar.querySelector('#topda-edit');
    btnEdit.addEventListener('click', function () { setEdit(!editMode); });
    bar.querySelector('#topda-export').addEventListener('click', doExport);
    bar.querySelector('#topda-reset').addEventListener('click', resetPage);
    bar.querySelector('#topda-logout').addEventListener('click', function () {
      try { localStorage.removeItem(LS_AUTH); } catch (e) {}
      toast('로그아웃됨 — 새로고침합니다'); setTimeout(function () { location.reload(); }, 700);
    });
    updateLiveDot();
  }
  function updateLiveDot() {
    var d = document.getElementById('topda-livedot'); if (!d) return;
    var n = Object.keys(pageOvr()).length + Object.keys(getText()).length + Object.keys(getImg()).length;
    d.classList.toggle('live', n > 0);
    d.title = n > 0 ? (n + '개 변경 저장됨') : '저장된 변경 없음';
  }

  // ---------- 부팅 ----------
  function boot() {
    injectStyle();
    hlEl = document.createElement('div'); hlEl.id = 'topda-hl'; document.body.appendChild(hlEl);
    selEl = document.createElement('div'); selEl.id = 'topda-sel'; document.body.appendChild(selEl);
    makeHandles();
    applyAll();
    applyText();
    applyImages();
    buildBar();

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClickCapture, true);
    // 더블클릭: 텍스트 직접 편집
    document.addEventListener('dblclick', function (e) {
      if (!editMode) return;
      var el = e.target;
      if (isAdminUI(el) || el.tagName === 'IMG') return;
      e.preventDefault(); e.stopPropagation();
      editText(el);
    }, true);
    // 이미지 드래그&드롭
    document.addEventListener('dragover', function (e) {
      if (!editMode) return;
      var img = e.target.closest && e.target.closest('img');
      if (img && !isAdminUI(img)) { e.preventDefault(); rectTo(hlEl, img); }
    }, true);
    document.addEventListener('drop', function (e) {
      if (!editMode) return;
      var img = e.target.closest && e.target.closest('img');
      if (!img || isAdminUI(img)) return;
      e.preventDefault(); e.stopPropagation();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) handleDrop(img, f);
    }, true);
    window.addEventListener('scroll', syncSelBox, true);
    window.addEventListener('resize', syncSelBox);

    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { if (editMode) { e.preventDefault(); undo(); } return; }
      // 요소 복사/붙여넣기 (PPT식): Ctrl+C / Ctrl+V
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C') && editMode && selected && !typing) {
        e.preventDefault(); clip = selected.cloneNode(true); toast('요소 복사됨 — Ctrl+V로 붙여넣기'); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V') && editMode && clip && selected && !typing) {
        e.preventDefault();
        var node = clip.cloneNode(true);
        if (selected.parentNode) {
          selected.parentNode.insertBefore(node, selected.nextSibling);
          select(node);
          updateLiveDot();
          toast('붙여넣음 — 구조 변경은 HTML에 직접 반영해야 게시됩니다');
        }
        return;
      }
      if (typing) return;
      if (e.key === 'Escape') { if (editMode) setEdit(false); return; }
      if (e.key === 'e' || e.key === 'E') { setEdit(!editMode); return; }
      // 선택 요소 미세조정: ↑/↓ 글자크기, Shift+↑/↓ 안쪽 여백
      if (editMode && selected && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        var dir = e.key === 'ArrowUp' ? 1 : -1;
        if (e.shiftKey) { var p = Math.max(0, px(getComputedStyle(selected).paddingTop) + dir * 2); setProp('padding', p + 'px'); }
        else { var f = Math.max(1, px(getComputedStyle(selected).fontSize) + dir); setProp('font-size', f + 'px'); }
        buildPanel();
      }
    });
    toast('클릭=선택 · 더블클릭=글자수정 · 모서리 드래그=크기 · Ctrl+C/V=복사·붙여넣기 · 이미지엔 사진 드롭');
  }

  // 인증 후 부팅
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { ensureAuth(boot); });
  else ensureAuth(boot);
})();
