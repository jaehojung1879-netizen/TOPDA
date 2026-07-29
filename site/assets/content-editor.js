// 톺다 가이드 본문 편집기 (/admin/edit.html 전용)
//
// 동작: 대상 페이지를 fetch 로 읽어 [data-edit] 문단만 골라 contenteditable 로 연다.
// 저장하면 Supabase content_overrides 에 들어가고, 다음 배포 때 apply_overrides.py 가
// 실제 HTML 파일에 써 넣는다. 운영자 브라우저에서는 저장 즉시 미리 보인다.
//
// 안전장치: 저장 전에 반드시 sanitize() 를 통과한다. 허용 태그 밖은 글자로 풀어낸다.
(function () {
  'use strict';

  const api = window.TopdaSupabase;
  const KEY_ADMIN = 'board:admin_key';

  // ── 허용 태그 화이트리스트 ────────────────────────────────────────────────
  // 문단 안에서 쓸 만한 것만 남긴다. 표·이미지·스크립트는 코드로만 넣는다.
  const KEEP = { STRONG: 'strong', EM: 'em', A: 'a', CODE: 'code', BR: 'br' };
  const ALIAS = { B: 'STRONG', I: 'EM' };
  // 껍데기만 벗기면 안 되는 것들 — 내용까지 통째로 버린다.
  const DROP = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, NOSCRIPT: 1 };

  function safeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/(?!\/)[^<>"']*$/.test(raw)) return raw;
    if (/^(?:\.\/|\.\.\/)[^<>"']+$/.test(raw)) return raw;
    if (/^#[^<>"']*$/.test(raw)) return raw;
    return '';
  }

  // 노드 트리를 훑어 허용 태그만 남긴 새 조각을 만든다. 원본은 건드리지 않는다.
  function sanitizeInto(source, target, doc) {
    for (const node of Array.from(source.childNodes)) {
      if (node.nodeType === 3) {
        target.appendChild(doc.createTextNode(node.nodeValue));
        continue;
      }
      if (node.nodeType !== 1) continue;

      const tag = ALIAS[node.tagName] || node.tagName;
      if (DROP[tag]) continue;
      const keep = KEEP[tag];

      if (!keep) {
        // 허용 밖 태그(div, span, script…)는 껍데기만 벗기고 내용은 살린다.
        sanitizeInto(node, target, doc);
        continue;
      }
      if (keep === 'br') {
        target.appendChild(doc.createElement('br'));
        continue;
      }

      const el = doc.createElement(keep);
      if (keep === 'a') {
        const href = safeUrl(node.getAttribute('href'));
        if (!href) {           // 위험한 주소면 링크를 만들지 않고 글자만 남긴다
          sanitizeInto(node, target, doc);
          continue;
        }
        el.setAttribute('href', href);
        if (/^https?:\/\//i.test(href)) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener');
        }
      }
      sanitizeInto(node, el, doc);
      target.appendChild(el);
    }
  }

  function sanitizeToHtml(element) {
    const doc = document.implementation.createHTMLDocument('');
    const box = doc.createElement('div');
    sanitizeInto(element, box, doc);
    return box.innerHTML.trim();
  }

  // 저장된 HTML 조각을 화면에 붙일 때도 같은 필터를 통과시킨다.
  function renderInto(html, container) {
    const doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    const box = document.createElement('div');
    sanitizeInto(doc.getElementById('r'), box, document);
    container.replaceChildren(...Array.from(box.childNodes));
  }

  // ── 편집 도구 ─────────────────────────────────────────────────────────────

  function wrapSelection(tagName) {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const wrapper = document.createElement(tagName);
    try {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      selection.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(wrapper);
      selection.addRange(after);
    } catch (error) {
      // 선택이 여러 요소에 걸쳐 있으면 실패할 수 있다. 조용히 넘어간다.
    }
  }

  function unwrapSelection(tagNames) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    let node = selection.getRangeAt(0).commonAncestorContainer;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && tagNames.includes(node.tagName)) {
        const parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }
      node = node.parentNode;
    }
  }

  function makeToolbar(field) {
    const bar = document.createElement('div');
    bar.className = 'ce-toolbar';
    const tools = [
      { label: '굵게', className: 'is-bold', run: () => wrapSelection('strong') },
      { label: '기울임', className: 'is-italic', run: () => wrapSelection('em') },
      { label: '코드', run: () => wrapSelection('code') },
      {
        label: '링크',
        run: () => {
          const url = window.prompt('링크 주소 (https://… 또는 /경로)', 'https://');
          if (!url || !safeUrl(url)) return;
          const selection = window.getSelection();
          if (!selection.rangeCount || selection.isCollapsed) return;
          const range = selection.getRangeAt(0);
          const anchor = document.createElement('a');
          anchor.href = safeUrl(url);
          anchor.appendChild(range.extractContents());
          range.insertNode(anchor);
        },
      },
      { label: '서식 지우기', run: () => unwrapSelection(['STRONG', 'B', 'EM', 'I', 'CODE', 'A']) },
    ];
    tools.forEach((tool) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ce-tool' + (tool.className ? ' ' + tool.className : '');
      button.textContent = tool.label;
      button.addEventListener('mousedown', (event) => event.preventDefault()); // 선택 유지
      button.addEventListener('click', () => {
        field.focus();
        tool.run();
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
      bar.appendChild(button);
    });
    return bar;
  }

  // ── 화면 ──────────────────────────────────────────────────────────────────

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function boot() {
    const root = document.querySelector('[data-content-editor]');
    if (!root) return;

    const gate = root.querySelector('[data-ce-gate]');
    const gateInput = root.querySelector('[data-ce-key]');
    const gateSave = root.querySelector('[data-ce-key-save]');
    const gateMsg = root.querySelector('[data-ce-key-msg]');
    const app = root.querySelector('[data-ce-app]');
    const picker = root.querySelector('[data-ce-page]');
    const blocks = root.querySelector('[data-ce-blocks]');
    const status = root.querySelector('[data-ce-status]');
    const openLink = root.querySelector('[data-ce-open]');

    function setStatus(message, kind) {
      status.textContent = message || '';
      status.className = 'ce-status' + (kind ? ' is-' + kind : '');
      status.hidden = !message;
    }

    let client = null;
    let key = localStorage.getItem(KEY_ADMIN) || '';

    async function ensureClient() {
      if (client) return client;
      if (!api || !api.isConfigured()) return null;
      client = await api.getClient();
      return client;
    }

    // 1) 운영자 키 확인
    async function checkKey(candidate) {
      const supabase = await ensureClient();
      if (!supabase) return false;
      const result = await supabase.rpc('admin_list_overrides', {
        admin_key: candidate, in_page: null, only_pending: false,
      });
      return !result.error;
    }

    gateSave.addEventListener('click', async () => {
      const candidate = gateInput.value.trim();
      if (!candidate) return;
      gateSave.disabled = true;
      gateMsg.textContent = '확인 중…';
      if (await checkKey(candidate)) {
        localStorage.setItem(KEY_ADMIN, candidate);
        key = candidate;
        gateMsg.textContent = '';
        start();
      } else {
        gateMsg.textContent = '키가 올바르지 않거나 서버에 연결하지 못했습니다.';
      }
      gateSave.disabled = false;
    });

    // 2) 편집 대상 페이지 목록
    async function loadPages() {
      try {
        const response = await fetch('../assets/editable-pages.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('no manifest');
        return await response.json();
      } catch (error) {
        return [];
      }
    }

    // 3) 페이지 하나를 열어 [data-edit] 문단을 편집기로 만든다
    async function openPage(path) {
      blocks.replaceChildren();
      setStatus('페이지를 불러오는 중…', '');
      openLink.href = '../' + path;

      let doc;
      try {
        const response = await fetch('../' + path, { cache: 'no-store' });
        doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      } catch (error) {
        setStatus('페이지를 불러오지 못했습니다: ' + path, 'error');
        return;
      }

      const supabase = await ensureClient();
      const saved = {};
      if (supabase) {
        const result = await supabase.rpc('admin_list_overrides', {
          admin_key: key, in_page: path, only_pending: false,
        });
        if (!result.error) (result.data || []).forEach((row) => { saved[row.block] = row; });
      }

      const targets = Array.from(doc.querySelectorAll('[data-edit]'));
      if (!targets.length) {
        setStatus('이 페이지에는 편집 가능한 문단이 없습니다.', 'warn');
        return;
      }

      targets.forEach((source) => {
        const blockId = source.getAttribute('data-edit');
        const row = saved[blockId];
        const card = element('section', 'ce-block');

        const head = element('div', 'ce-block-head');
        head.append(element('code', 'ce-block-id', blockId));
        if (row && !row.applied_at) head.append(element('span', 'ce-badge is-pending', '반영 대기'));
        else if (row) head.append(element('span', 'ce-badge', '반영됨'));
        card.appendChild(head);

        const field = element('div', 'ce-field');
        field.contentEditable = 'true';
        field.spellcheck = false;
        // 저장본이 있으면 그것을, 없으면 페이지의 현재 내용을 넣는다.
        renderInto(row ? row.html : source.innerHTML, field);
        const original = sanitizeToHtml(field);

        card.appendChild(makeToolbar(field));
        card.appendChild(field);

        const foot = element('div', 'ce-block-foot');
        const save = element('button', 'btn btn-primary ce-save', '저장');
        save.type = 'button';
        const reset = element('button', 'ce-linkbtn', '되돌리기');
        reset.type = 'button';
        const note = element('span', 'ce-note');
        foot.append(save, reset, note);
        card.appendChild(foot);

        reset.addEventListener('click', () => {
          renderInto(original, field);
          note.textContent = '';
        });

        save.addEventListener('click', async () => {
          const html = sanitizeToHtml(field);
          if (!html) { note.textContent = '내용이 비었습니다.'; return; }
          save.disabled = true;
          note.textContent = '저장 중…';
          const supabaseClient = await ensureClient();
          const result = await supabaseClient.rpc('admin_save_override', {
            admin_key: key, in_page: path, in_block: blockId, in_html: html, in_note: null,
          });
          if (result.error) {
            note.textContent = '저장하지 못했습니다.';
            if (window.console) console.warn('[편집기] 저장 실패:', result.error);
          } else {
            note.textContent = '저장됨 — 다음 배포 때 페이지에 반영됩니다(약 3~5분).';
            const badge = head.querySelector('.ce-badge');
            if (badge) { badge.textContent = '반영 대기'; badge.className = 'ce-badge is-pending'; }
            else head.append(element('span', 'ce-badge is-pending', '반영 대기'));
          }
          save.disabled = false;
        });

        blocks.appendChild(card);
      });

      setStatus(targets.length + '개 문단을 열었습니다. 글자를 드래그하고 위 버튼으로 서식을 넣으세요.', 'ok');
    }

    // 4) 시작
    async function start() {
      gate.hidden = true;
      app.hidden = false;
      const pages = await loadPages();
      picker.replaceChildren();
      if (!pages.length) {
        setStatus('편집 대상 목록(assets/editable-pages.json)을 찾지 못했습니다.', 'error');
        return;
      }
      pages.forEach((page) => {
        const option = document.createElement('option');
        option.value = page.path;
        option.textContent = page.title + '  —  ' + page.path + ' (' + page.blocks + '개)';
        picker.appendChild(option);
      });
      picker.addEventListener('change', () => openPage(picker.value));

      let initial = pages[0].path;
      try {
        const wanted = new URLSearchParams(location.search).get('page');
        if (wanted && pages.some((page) => page.path === wanted)) initial = wanted;
      } catch (error) {}
      picker.value = initial;
      await openPage(initial);
    }

    if (key && await checkKey(key)) start();
    else { gate.hidden = false; app.hidden = true; }
  }

  window.TopdaContentEditor = { sanitizeToHtml, renderInto, safeUrl };
  boot();
})();
