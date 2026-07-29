// 운영자 즉시 미리보기.
//
// 저장한 수정본은 다음 배포 때 HTML 파일에 구워진다(방문자 기준 3~5분). 그 사이에
// 운영자 본인은 결과를 바로 보고 싶으므로, 이 스크립트가 아직 굽지 않은 override 를
// 페이지에 얹는다.
//
// 방문자에게는 아무 일도 일어나지 않는다 — app.js 가 운영자 키가 있을 때만 이 파일을
// 불러오므로, 일반 방문자 페이지에는 요청이 한 건도 늘지 않는다.
(function () {
  'use strict';

  const api = window.TopdaSupabase;
  const key = localStorage.getItem('board:admin_key') || '';
  if (!api || !api.isConfigured() || !key) return;

  const targets = document.querySelectorAll('[data-edit]');
  if (!targets.length) return;

  // 현재 페이지 경로 → 'interior/lighting.html' 형태 (editable-pages.json 과 같은 표기)
  function pagePath() {
    let path = location.pathname.replace(/^\/+/, '');
    if (!path || path.endsWith('/')) path += 'index.html';
    return path;
  }

  // content-editor.js 와 같은 화이트리스트. 저장 경로에서 이미 걸렀지만 렌더에서도 거른다.
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

  function sanitizeInto(source, target) {
    for (const node of Array.from(source.childNodes)) {
      if (node.nodeType === 3) { target.appendChild(document.createTextNode(node.nodeValue)); continue; }
      if (node.nodeType !== 1) continue;
      const tag = ALIAS[node.tagName] || node.tagName;
      if (DROP[tag]) continue;
      const keep = KEEP[tag];
      if (!keep) { sanitizeInto(node, target); continue; }
      if (keep === 'br') { target.appendChild(document.createElement('br')); continue; }
      const el = document.createElement(keep);
      if (keep === 'a') {
        const href = safeUrl(node.getAttribute('href'));
        if (!href) { sanitizeInto(node, target); continue; }
        el.setAttribute('href', href);
        if (/^https?:\/\//i.test(href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
      }
      sanitizeInto(node, el);
      target.appendChild(el);
    }
  }

  function banner(count) {
    const bar = document.createElement('div');
    bar.className = 'ce-preview-bar';
    bar.append(
      Object.assign(document.createElement('span'), { className: 'ce-preview-dot' }),
      Object.assign(document.createElement('span'), {
        textContent: '운영자 미리보기 — 아직 배포되지 않은 수정 ' + count + '곳이 반영돼 보입니다. 방문자에게는 다음 배포 후 보입니다.',
      }),
    );
    const link = document.createElement('a');
    link.href = '/admin/edit.html?page=' + encodeURIComponent(pagePath());
    link.textContent = '편집기 열기';
    bar.appendChild(link);
    document.body.appendChild(bar);
  }

  (async function run() {
    const client = await api.getClient();
    if (!client) return;

    const result = await client.rpc('admin_list_overrides', {
      admin_key: key, in_page: pagePath(), only_pending: true,
    });
    if (result.error || !result.data || !result.data.length) return;

    const byBlock = {};
    result.data.forEach((row) => { byBlock[row.block] = row.html; });

    let applied = 0;
    targets.forEach((element) => {
      const html = byBlock[element.getAttribute('data-edit')];
      if (!html) return;
      const doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
      const box = document.createElement('div');
      sanitizeInto(doc.getElementById('r'), box);
      element.replaceChildren(...Array.from(box.childNodes));
      element.classList.add('ce-preview-applied');
      applied += 1;
    });

    if (applied) banner(applied);
  })();
})();
