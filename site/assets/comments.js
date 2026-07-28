// 톺다 공통 댓글 컴포넌트. 사용자 입력은 모두 textContent로만 출력한다.
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

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date).replace(/\. /g, '.').replace(/\.$/, '');
  }

  function setMessage(node, message, kind) {
    node.textContent = message || '';
    node.className = 'comments-message' + (kind ? ' is-' + kind : '');
    node.hidden = !message;
  }

  function buildCommentRow(comment, options) {
    const row = element('li', 'comment-item');
    const head = element('div', 'comment-head');
    const author = element('strong', 'comment-author', comment.author || '익명');
    const date = element('time', 'comment-date', formatDate(comment.created_at));
    head.append(author, date);

    const body = element('p', 'comment-body', comment.body || '');
    row.append(head, body);

    const ownerToken = options.tokens[comment.id];
    if (ownerToken || options.adminKey) {
      const actions = element('div', 'comment-actions');
      const remove = element(
        'button',
        'comment-delete',
        ownerToken ? '삭제' : '운영자 삭제',
      );
      remove.type = 'button';
      remove.addEventListener('click', () => options.onDelete(comment.id, ownerToken, remove));
      actions.appendChild(remove);
      row.appendChild(actions);
    }
    return row;
  }

  async function mount(root) {
    if (!root || mounted.has(root)) return;
    mounted.add(root);

    const type = String(root.dataset.commentType || '').trim();
    const key = String(root.dataset.commentKey || '').trim();
    const title = String(root.dataset.commentTitle || document.title).trim();
    const page = String(root.dataset.commentPage || '').trim();
    const writeHref = String(root.dataset.commentWriteHref || '../board-write.html').trim();
    if (!type || !key) return;

    const wrap = element('div', 'comments-inner');
    const heading = element('div', 'comments-heading');
    heading.append(
      element('h2', '', '이 페이지에 한마디'),
      element('p', '', '계산 결과나 이용 경험, 보완이 필요한 내용을 남겨주세요.'),
    );

    const form = element('form', 'comments-form');
    const authorLabel = element('label', 'comments-field');
    authorLabel.appendChild(element('span', '', '닉네임 (선택)'));
    const author = element('input');
    author.type = 'text';
    author.name = 'author';
    author.maxLength = 20;
    author.placeholder = '익명';
    author.autocomplete = 'nickname';
    author.value = localStorage.getItem(KEY_AUTHOR) || '';
    authorLabel.appendChild(author);

    const bodyLabel = element('label', 'comments-field comments-body-field');
    bodyLabel.appendChild(element('span', '', '댓글'));
    const body = element('textarea');
    body.name = 'body';
    body.rows = 4;
    body.maxLength = 1000;
    body.required = true;
    body.placeholder = '이 페이지에 대한 경험이나 의견을 남겨주세요.';
    bodyLabel.appendChild(body);

    const formFooter = element('div', 'comments-form-footer');
    const counter = element('span', 'comments-counter', '0 / 1,000');
    const submit = element('button', 'btn btn-primary', '등록');
    submit.type = 'submit';
    formFooter.append(counter, submit);
    form.append(authorLabel, bodyLabel, formFooter);

    const message = element('p', 'comments-message');
    message.hidden = true;
    const listHead = element('div', 'comments-list-head');
    const count = element('strong', '', '댓글 0개');
    listHead.appendChild(count);
    const list = element('ul', 'comments-list');
    const empty = element('p', 'comments-empty', '아직 댓글이 없습니다. 첫 의견을 남겨주세요.');

    const boardLink = element('a', 'comments-board-link', '긴 질문이나 경험은 게시판에 자세히 작성하기 →');
    const writeParams = new URLSearchParams({ category: 'question' });
    if (page) writeParams.set('page', page);
    boardLink.href = writeHref + '?' + writeParams.toString();

    wrap.append(heading, form, message, listHead, list, empty, boardLink);
    root.appendChild(wrap);

    body.addEventListener('input', () => {
      counter.textContent = body.value.length.toLocaleString('ko-KR') + ' / 1,000';
    });
    author.addEventListener('change', () => {
      localStorage.setItem(KEY_AUTHOR, author.value.trim());
    });

    let client = null;
    let comments = [];
    let loading = false;

    function render() {
      const tokens = readTokens();
      const adminKey = localStorage.getItem(KEY_ADMIN) || '';
      list.replaceChildren(...comments.map((comment) => buildCommentRow(comment, {
        tokens,
        adminKey,
        onDelete: deleteComment,
      })));
      count.textContent = '댓글 ' + comments.length.toLocaleString('ko-KR') + '개';
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
        setMessage(message, '댓글을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.', 'error');
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
        setMessage(message, ownerToken
          ? '댓글을 삭제하지 못했습니다.'
          : '운영자 키가 올바르지 않거나 댓글을 삭제할 수 없습니다.', 'error');
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
        setMessage(message, '댓글 내용을 입력해 주세요.', 'error');
        body.focus();
        return;
      }

      loading = true;
      submit.disabled = true;
      submit.textContent = '등록 중…';
      setMessage(message, '', '');

      const id = api.uuid();
      const token = api.uuid();
      const result = await client.from('content_comments').insert({
        id,
        target_type: type,
        target_key: key,
        target_title: title || null,
        author: author.value.trim() || null,
        body: text,
        owner_token: token,
      });

      if (result.error) {
        if (window.console) console.warn('[댓글] 등록 실패:', result.error);
        setMessage(message, '댓글을 서버에 저장하지 못했습니다. 등록되지 않았으니 잠시 후 다시 시도해 주세요.', 'error');
      } else {
        saveToken(id, token);
        localStorage.setItem(KEY_AUTHOR, author.value.trim());
        body.value = '';
        counter.textContent = '0 / 1,000';
        await refresh();
      }

      loading = false;
      submit.disabled = false;
      submit.textContent = '등록';
    });

    render();
    if (!api || !api.isConfigured()) {
      submit.disabled = true;
      setMessage(message, '댓글 서버 설정이 아직 연결되지 않았습니다.', 'warn');
      return;
    }
    client = await api.getClient();
    if (!client) {
      submit.disabled = true;
      setMessage(message, '댓글 서버에 연결하지 못했습니다. 네트워크를 확인해 주세요.', 'error');
      return;
    }
    await refresh();
  }

  window.TopdaComments = { mount };
  document.querySelectorAll('[data-comments]').forEach((root) => mount(root));
})();
