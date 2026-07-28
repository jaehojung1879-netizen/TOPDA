// 톺다 공통 댓글. 커뮤니티 댓글창처럼 한 줄 입력 + 목록만 둔다.
// 사용자 입력은 모두 textContent로만 출력한다(innerHTML 사용 금지).
(function () {
  'use strict';

  const api = window.TopdaSupabase;
  const KEY_AUTHOR = 'comments:author';
  const KEY_TOKENS = 'comments:owner_tokens';
  const KEY_ADMIN = 'board:admin_key';
  const mounted = new WeakSet();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function readTokens() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY_TOKENS) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      return {};
    }
  }

  function saveToken(id, token) {
    const tokens = readTokens();
    tokens[id] = token;
    localStorage.setItem(KEY_TOKENS, JSON.stringify(tokens));
  }

  function removeToken(id) {
    const tokens = readTokens();
    delete tokens[id];
    localStorage.setItem(KEY_TOKENS, JSON.stringify(tokens));
  }

  // 커뮤니티식 짧은 날짜 — 올해면 "07.28 14:22", 아니면 "25.12.31"
  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    if (date.getFullYear() !== now.getFullYear()) {
      return String(date.getFullYear()).slice(2) + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate());
    }
    return pad(date.getMonth() + 1) + '.' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function setMessage(node, message, kind) {
    node.textContent = message || '';
    node.className = 'cmt-msg' + (kind ? ' is-' + kind : '');
    node.hidden = !message;
  }

  function buildRow(comment, options) {
    const row = element('li', 'cmt-item');
    row.append(
      element('span', 'cmt-nick', comment.author || '익명'),
      element('span', 'cmt-text', comment.body || ''),
    );

    const meta = element('span', 'cmt-meta');
    meta.appendChild(element('time', 'cmt-time', formatDate(comment.created_at)));

    const ownerToken = options.tokens[comment.id];
    if (ownerToken || options.adminKey) {
      const remove = element('button', 'cmt-del', ownerToken ? '삭제' : '운영자 삭제');
      remove.type = 'button';
      remove.addEventListener('click', () => options.onDelete(comment.id, ownerToken, remove));
      meta.appendChild(remove);
    }
    row.appendChild(meta);
    return row;
  }

  async function mount(root) {
    if (!root || mounted.has(root)) return;
    mounted.add(root);

    const type = String(root.dataset.commentType || '').trim();
    const key = String(root.dataset.commentKey || '').trim();
    const title = String(root.dataset.commentTitle || document.title).trim();
    if (!type || !key) return;

    const wrap = element('div', 'cmt');

    const head = element('div', 'cmt-head');
    const count = element('span', 'cmt-count', '댓글 0');
    head.appendChild(count);

    const list = element('ul', 'cmt-list');
    const empty = element('p', 'cmt-empty', '첫 댓글을 남겨보세요.');
    const message = element('p', 'cmt-msg');
    message.hidden = true;

    const form = element('form', 'cmt-form');
    const nick = document.createElement('input');
    nick.type = 'text';
    nick.className = 'cmt-nick-input';
    nick.name = 'author';
    nick.maxLength = 20;
    nick.placeholder = '닉네임';
    nick.autocomplete = 'nickname';
    nick.setAttribute('aria-label', '닉네임 (선택)');
    nick.value = localStorage.getItem(KEY_AUTHOR) || '';

    const body = document.createElement('textarea');
    body.className = 'cmt-input';
    body.name = 'body';
    body.rows = 1;
    body.maxLength = 1000;
    body.required = true;
    body.placeholder = '댓글을 남겨보세요';
    body.setAttribute('aria-label', '댓글 내용');

    const submit = element('button', 'cmt-submit', '등록');
    submit.type = 'submit';

    form.append(nick, body, submit);
    wrap.append(head, list, empty, message, form);
    root.appendChild(wrap);

    function autoGrow() {
      body.style.height = 'auto';
      body.style.height = Math.min(Math.max(body.scrollHeight, 38), 160) + 'px';
    }
    body.addEventListener('input', autoGrow);

    // Enter 등록 / Shift+Enter 줄바꿈 — 커뮤니티 댓글창의 기본 동작
    body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    nick.addEventListener('change', () => {
      localStorage.setItem(KEY_AUTHOR, nick.value.trim());
    });

    let client = null;
    let comments = [];
    let loading = false;

    function render() {
      const tokens = readTokens();
      const adminKey = localStorage.getItem(KEY_ADMIN) || '';
      list.replaceChildren(...comments.map((comment) => buildRow(comment, {
        tokens,
        adminKey,
        onDelete: deleteComment,
      })));
      count.textContent = '댓글 ' + comments.length.toLocaleString('ko-KR');
      empty.hidden = comments.length > 0;
    }

    async function refresh() {
      if (!client) return;
      const result = await client.from('content_comments_public').select('*')
        .eq('target_type', type)
        .eq('target_key', key)
        .order('created_at', { ascending: true })
        .limit(50);
      if (result.error) {
        if (window.console) console.warn('[댓글] 목록 조회 실패:', result.error);
        setMessage(message, '댓글을 불러오지 못했습니다.', 'error');
        return;
      }
      comments = result.data || [];
      render();
    }

    async function deleteComment(id, ownerToken, button) {
      if (!window.confirm('이 댓글을 삭제할까요?')) return;
      button.disabled = true;
      setMessage(message, '', '');

      let result;
      if (ownerToken) {
        result = await client.rpc('delete_content_comment', {
          comment_id: id,
          token: ownerToken,
        });
      } else {
        const adminKey = localStorage.getItem(KEY_ADMIN) || '';
        result = await client.rpc('admin_delete_content_comment', {
          comment_id: id,
          admin_key: adminKey,
        });
      }

      if (result.error || !result.data) {
        setMessage(message, ownerToken ? '삭제하지 못했습니다.' : '운영자 키가 올바르지 않습니다.', 'error');
        button.disabled = false;
        return;
      }
      removeToken(id);
      await refresh();
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (loading || !client) return;
      const text = body.value.trim();
      if (!text) {
        body.focus();
        return;
      }

      loading = true;
      submit.disabled = true;
      submit.textContent = '등록 중';
      setMessage(message, '', '');

      const id = api.uuid();
      const token = api.uuid();
      const result = await client.from('content_comments').insert({
        id,
        target_type: type,
        target_key: key,
        target_title: title || null,
        author: nick.value.trim() || null,
        body: text,
        owner_token: token,
      });

      if (result.error) {
        if (window.console) console.warn('[댓글] 등록 실패:', result.error);
        setMessage(message, '등록하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      } else {
        saveToken(id, token);
        localStorage.setItem(KEY_AUTHOR, nick.value.trim());
        body.value = '';
        autoGrow();
        await refresh();
      }

      loading = false;
      submit.disabled = false;
      submit.textContent = '등록';
    });

    render();
    if (!api || !api.isConfigured()) {
      submit.disabled = true;
      body.disabled = true;
      setMessage(message, '댓글 서버가 연결되지 않았습니다.', 'warn');
      return;
    }
    client = await api.getClient();
    if (!client) {
      submit.disabled = true;
      body.disabled = true;
      setMessage(message, '댓글 서버에 연결하지 못했습니다.', 'error');
      return;
    }
    await refresh();
  }

  window.TopdaComments = { mount };
  document.querySelectorAll('[data-comments]').forEach((root) => mount(root));
})();
