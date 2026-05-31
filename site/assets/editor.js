/**
 * 톺다 browser layout editor
 *
 * This is intentionally a client-side preview tool. It provides a lightweight
 * passcode gate, but production authentication and server-side persistence must
 * be added when the static site is connected to a backend.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'topda-layout-editor-v1';
  const SESSION_KEY = 'topda-layout-editor-session';
  const DEFAULT_PASSCODE = 'TOPDA-EDIT';
  const PAGE_KEY = location.pathname.replace(/\/index\.html$/, '/') || '/';
  const STYLE_FIELDS = [
    ['fontSize', '글씨 크기', 'px', 8, 96, 1],
    ['lineHeight', '줄 간격', '', 0.8, 3, 0.05],
    ['letterSpacing', '자간', 'px', -5, 20, 0.1],
    ['width', '너비', 'px', 0, 1600, 1],
    ['minHeight', '최소 높이', 'px', 0, 1000, 1],
    ['padding', '안쪽 여백', 'px', 0, 160, 1],
    ['margin', '바깥 여백', 'px', 0, 160, 1],
    ['borderRadius', '모서리', 'px', 0, 100, 1]
  ];
  const ALIGNMENTS = [
    ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽'], ['justify', '양쪽']
  ];
  const state = loadState();
  let selected = null;
  let selectedSelector = '';
  let history = [];
  let historyIndex = -1;
  let panel;
  let status;
  let inspector;
  let toolbar;

  applySavedChanges();
  addLauncher();
  if (new URLSearchParams(location.search).get('edit') === '1') requestAccess();

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"pages":{}}'); }
    catch (error) { return { pages: {} }; }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function currentPage() {
    state.pages ||= {};
    state.pages[PAGE_KEY] ||= {};
    return state.pages[PAGE_KEY];
  }

  function applySavedChanges() {
    const page = state.pages?.[PAGE_KEY];
    if (!page) return;
    Object.entries(page).forEach(([selector, properties]) => {
      let element;
      try { element = document.querySelector(selector); } catch (error) { return; }
      if (!element) return;
      Object.entries(properties).forEach(([property, value]) => {
        if (value === '') element.style.removeProperty(toKebab(property));
        else element.style[property] = value;
      });
    });
  }

  function addLauncher() {
    const launcher = document.createElement('button');
    launcher.className = 'topda-editor-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', '관리자 편집 모드 열기');
    launcher.title = '관리자 편집 모드';
    launcher.textContent = '✦';
    launcher.addEventListener('click', requestAccess);
    document.body.appendChild(launcher);

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e') requestAccess();
    });
  }

  function requestAccess() {
    if (sessionStorage.getItem(SESSION_KEY) === 'open') return openEditor();
    const passcode = window.prompt('관리자 편집 코드 입력');
    if (passcode === null) return;
    const expected = localStorage.getItem('topda-editor-passcode') || DEFAULT_PASSCODE;
    if (passcode !== expected) return window.alert('편집 코드가 일치하지 않습니다.');
    sessionStorage.setItem(SESSION_KEY, 'open');
    openEditor();
  }

  function openEditor() {
    if (document.body.classList.contains('topda-editor-active')) return;
    document.body.classList.add('topda-editor-active');
    createToolbar();
    createPanel();
    document.addEventListener('click', selectFromPage, true);
    document.addEventListener('mouseover', hoverFromPage, true);
    pushHistory();
  }

  function closeEditor() {
    document.body.classList.remove('topda-editor-active');
    document.removeEventListener('click', selectFromPage, true);
    document.removeEventListener('mouseover', hoverFromPage, true);
    selected?.classList.remove('topda-editor-selected');
    selected = null;
    toolbar?.remove();
    panel?.remove();
    document.querySelectorAll('.topda-editor-hover').forEach((element) => element.classList.remove('topda-editor-hover'));
  }

  function createToolbar() {
    toolbar = document.createElement('div');
    toolbar.className = 'topda-editor-toolbar topda-editor-ui';
    toolbar.innerHTML = `
      <div class="topda-editor-brand"><b>TOPDA</b><span>Layout Studio</span></div>
      <div class="topda-editor-toolbar-actions">
        <button type="button" data-action="undo" title="실행 취소">↶ <span>실행 취소</span></button>
        <button type="button" data-action="redo" title="다시 실행">↷ <span>다시 실행</span></button>
        <button type="button" data-action="export">내보내기</button>
        <button type="button" data-action="import">불러오기</button>
        <button type="button" data-action="save" class="primary">저장</button>
        <button type="button" data-action="close" aria-label="편집 모드 닫기">×</button>
      </div>`;
    toolbar.addEventListener('click', onAction);
    document.body.appendChild(toolbar);
  }

  function createPanel() {
    panel = document.createElement('aside');
    panel.className = 'topda-editor-panel topda-editor-ui';
    panel.innerHTML = `
      <div class="topda-editor-panel-head">
        <div><small>DESIGN INSPECTOR</small><h2>스타일 편집</h2></div>
        <button type="button" data-action="collapse" aria-label="패널 접기">›</button>
      </div>
      <div class="topda-editor-panel-body">
        <div class="topda-editor-empty">
          <i>✦</i><b>편집할 요소를 선택하세요</b>
          <p>화면의 글씨, 카드, 표 셀 등을 클릭하면 세부 속성을 조절할 수 있습니다.</p>
        </div>
        <div class="topda-editor-inspector" hidden></div>
      </div>
      <div class="topda-editor-panel-foot">
        <span class="topda-editor-status">이 페이지의 변경사항은 브라우저에 저장됩니다.</span>
      </div>`;
    panel.addEventListener('click', onAction);
    panel.addEventListener('input', onControlInput);
    panel.addEventListener('change', onControlChange);
    document.body.appendChild(panel);
    inspector = panel.querySelector('.topda-editor-inspector');
    status = panel.querySelector('.topda-editor-status');
  }

  function selectFromPage(event) {
    if (event.target.closest('.topda-editor-ui, .topda-editor-launcher')) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(event.target);
  }

  function hoverFromPage(event) {
    if (event.target.closest('.topda-editor-ui, .topda-editor-launcher')) return;
    document.querySelector('.topda-editor-hover')?.classList.remove('topda-editor-hover');
    if (event.target !== selected) event.target.classList.add('topda-editor-hover');
  }

  function selectElement(element) {
    selected?.classList.remove('topda-editor-selected');
    document.querySelector('.topda-editor-hover')?.classList.remove('topda-editor-hover');
    selected = element;
    selectedSelector = uniqueSelector(element);
    selected.classList.add('topda-editor-selected');
    renderInspector();
  }

  function renderInspector() {
    if (!selected) return;
    panel.querySelector('.topda-editor-empty').hidden = true;
    inspector.hidden = false;
    const computed = getComputedStyle(selected);
    const tag = selected.tagName.toLowerCase();
    const label = selected.textContent.trim().replace(/\s+/g, ' ').slice(0, 32) || tag;
    inspector.innerHTML = `
      <div class="topda-editor-selection">
        <small>SELECTED ELEMENT</small>
        <b>&lt;${tag}&gt; <em>${escapeHtml(label)}</em></b>
        <code>${escapeHtml(selectedSelector)}</code>
      </div>
      <section>
        <h3>텍스트</h3>
        ${control('fontSize', computed.fontSize)}
        ${control('lineHeight', computed.lineHeight === 'normal' ? '1.5' : computed.lineHeight)}
        ${control('letterSpacing', computed.letterSpacing === 'normal' ? '0' : computed.letterSpacing)}
        <label class="topda-editor-control"><span>정렬</span><div class="topda-editor-segments">${ALIGNMENTS.map(([value, text]) => `<button type="button" data-style="textAlign" data-value="${value}" class="${computed.textAlign === value ? 'active' : ''}">${text}</button>`).join('')}</div></label>
      </section>
      <section>
        <h3>크기 · 여백</h3>
        ${control('width', computed.width)}
        ${control('minHeight', computed.minHeight)}
        ${control('padding', computed.paddingTop)}
        ${control('margin', computed.marginTop)}
        ${control('borderRadius', computed.borderRadius)}
      </section>
      <section>
        <h3>빠른 작업</h3>
        <div class="topda-editor-quick-actions">
          <button type="button" data-action="toggle-bold">굵게</button>
          <button type="button" data-action="fit-width">너비 자동</button>
          <button type="button" data-action="reset-element">선택 초기화</button>
        </div>
      </section>`;
  }

  function control(property, value) {
    const field = STYLE_FIELDS.find(([name]) => name === property);
    const [, label, unit, min, max, step] = field;
    const numeric = parseFloat(value) || 0;
    return `<label class="topda-editor-control">
      <span>${label}</span>
      <div class="topda-editor-range"><input type="range" data-style="${property}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${numeric}"><input type="number" data-style="${property}" data-unit="${unit}" min="${min}" max="${max}" step="${step}" value="${numeric}"><small>${unit || '×'}</small></div>
    </label>`;
  }

  function onControlInput(event) {
    const control = event.target.closest('input[data-style]');
    if (!control || !selected) return;
    const peers = panel.querySelectorAll(`input[data-style="${control.dataset.style}"]`);
    peers.forEach((peer) => { if (peer !== control) peer.value = control.value; });
    setStyle(control.dataset.style, control.value + control.dataset.unit, false);
  }

  function onControlChange(event) {
    if (event.target.matches('input[data-style]')) pushHistory();
  }

  function onAction(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const { action, style, value } = button.dataset;
    if (style && selected) {
      setStyle(style, value);
      panel.querySelectorAll(`button[data-style="${style}"]`).forEach((item) => item.classList.toggle('active', item === button));
    } else if (action === 'close') closeEditor();
    else if (action === 'collapse') panel.classList.toggle('collapsed');
    else if (action === 'save') { saveState(); flash('저장되었습니다.'); }
    else if (action === 'undo') restoreHistory(historyIndex - 1);
    else if (action === 'redo') restoreHistory(historyIndex + 1);
    else if (action === 'reset-element' && selected) resetElement();
    else if (action === 'toggle-bold' && selected) setStyle('fontWeight', getComputedStyle(selected).fontWeight >= 600 ? '400' : '700');
    else if (action === 'fit-width' && selected) setStyle('width', 'auto');
    else if (action === 'export') exportStyles();
    else if (action === 'import') importStyles();
  }

  function setStyle(property, value, commit = true) {
    if (!selected) return;
    selected.style[property] = value;
    currentPage()[selectedSelector] ||= {};
    currentPage()[selectedSelector][property] = value;
    saveState();
    if (commit) pushHistory();
  }

  function resetElement() {
    const properties = currentPage()[selectedSelector] || {};
    Object.keys(properties).forEach((property) => selected.style.removeProperty(toKebab(property)));
    delete currentPage()[selectedSelector];
    saveState();
    pushHistory();
    renderInspector();
    flash('선택한 요소를 초기화했습니다.');
  }

  function pushHistory() {
    history = history.slice(0, historyIndex + 1);
    history.push(JSON.stringify(state.pages?.[PAGE_KEY] || {}));
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }

  function restoreHistory(index) {
    if (index < 0 || index >= history.length) return;
    const oldPage = currentPage();
    Object.entries(oldPage).forEach(([selector, properties]) => {
      const element = safeQuery(selector);
      if (element) Object.keys(properties).forEach((property) => element.style.removeProperty(toKebab(property)));
    });
    state.pages[PAGE_KEY] = JSON.parse(history[index]);
    historyIndex = index;
    applySavedChanges();
    saveState();
    updateHistoryButtons();
    if (selected) renderInspector();
  }

  function updateHistoryButtons() {
    toolbar?.querySelector('[data-action="undo"]')?.toggleAttribute('disabled', historyIndex <= 0);
    toolbar?.querySelector('[data-action="redo"]')?.toggleAttribute('disabled', historyIndex >= history.length - 1);
  }

  function exportStyles() {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `topda-layout-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash('JSON 파일을 내보냈습니다.');
  }

  function importStyles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!imported.pages || typeof imported.pages !== 'object') throw new Error('Invalid file');
          state.pages = imported.pages;
          saveState();
          location.reload();
        } catch (error) { window.alert('올바른 TOPDA 레이아웃 JSON 파일이 아닙니다.'); }
      });
      reader.readAsText(file);
    });
    input.click();
  }

  function uniqueSelector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let node = element;
    while (node && node !== document.body) {
      let part = node.tagName.toLowerCase();
      const classes = [...node.classList].filter((name) => !name.startsWith('topda-editor-'));
      if (classes.length) part += '.' + classes.map((name) => CSS.escape(name)).join('.');
      const siblings = [...node.parentElement.children].filter((item) => item.tagName === node.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      const selector = parts.join(' > ');
      if (document.querySelectorAll(selector).length === 1) return selector;
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function safeQuery(selector) {
    try { return document.querySelector(selector); } catch (error) { return null; }
  }

  function flash(message) {
    if (!status) return;
    status.textContent = message;
    status.classList.add('success');
    setTimeout(() => {
      status.textContent = '이 페이지의 변경사항은 브라우저에 저장됩니다.';
      status.classList.remove('success');
    }, 1800);
  }

  function toKebab(value) { return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`); }
  function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
})();
