// 톺다 게시판: 목록(board.html) · 작성(board-write.html) · 상세(board-post.html)
(function () {
  'use strict';

  const api = window.TopdaSupabase;
  if (!api) return;

  const KEY_PUBLIC = 'board:public';
  const KEY_SECRET = 'board:secret';
  const KEY_DRAFT = 'board:draft';
  const KEY_AUTHOR = 'board:author';
  const KEY_TOKENS = 'board:owner_tokens';
  const KEY_MIGRATED = 'board:migrated_to_supabase';
  const KEY_ADMIN = 'board:admin_key';

  const CATEGORIES = [
    { id: 'free', label: '자유' },
    { id: 'question', label: '질문' },
    { id: 'review', label: '후기' },
    { id: 'tip', label: '정보 공유' },
    { id: 'fix', label: '수정 요청' },
    { id: 'etc', label: '기타' },
  ];
  const CATEGORY_LABELS = CATEGORIES.reduce((map, item) => {
    map[item.id] = item.label;
    return map;
  }, {});

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '');
      return parsed === null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readPosts(key) {
    const posts = readJson(key, []);
    return Array.isArray(posts) ? posts : [];
  }

  function readTokens() {
    const tokens = readJson(KEY_TOKENS, {});
    return tokens && typeof tokens === 'object' && !Array.isArray(tokens) ? tokens : {};
  }

  function saveToken(id, token) {
    const tokens = readTokens();
    tokens[id] = token;
    writeJson(KEY_TOKENS, tokens);
  }

  function removeToken(id) {
    const tokens = readTokens();
    delete tokens[id];
    writeJson(KEY_TOKENS, tokens);
  }

  function upsertLocal(key, post) {
    const posts = readPosts(key);
    const index = posts.findIndex((item) => item.id === post.id);
    if (index >= 0) posts[index] = post;
    else posts.push(post);
    writeJson(key, posts);
  }

  function removeLocal(key, id) {
    writeJson(key, readPosts(key).filter((post) => post.id !== id));
  }

  function migrateLegacyKeys() {
    [
      { from: 'fb:public', to: KEY_PUBLIC },
      { from: 'fb:secret', to: KEY_SECRET },
    ].forEach(({ from, to }) => {
      const oldPosts = readPosts(from);
      if (!oldPosts.length) {
        if (localStorage.getItem(from)) localStorage.removeItem(from);
        return;
      }
      const current = readPosts(to);
      const seen = new Set(current.map((post) => post.id));
      oldPosts.forEach((post) => {
        if (!post || seen.has(post.id)) return;
        current.push({ ...post, category: post.category || 'fix' });
      });
      current.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      writeJson(to, current);
      localStorage.removeItem(from);
    });
  }

  function captureAdminKey() {
    try {
      const params = new URLSearchParams(location.search);
      const admin = params.get('admin');
      if (admin === 'off') localStorage.removeItem(KEY_ADMIN);
      else if (admin) localStorage.setItem(KEY_ADMIN, admin);
      if (admin !== null && window.history && window.history.replaceState) {
        params.delete('admin');
        const query = params.toString();
        window.history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
      }
    } catch (error) {
      // 오래된 브라우저에서는 기존 저장값만 사용한다.
    }
  }

  function rowToPost(row, secret) {
    return {
      id: row.id,
      ts: new Date(row.created_at).getTime(),
      category: row.category || 'etc',
      title: row.title || '',
      author: row.author || '',
      page: row.page || '',
      body: row.body || '',
      secret: secret === undefined ? !!row.secret : secret,
      localOnly: false,
    };
  }

  function localToPost(post, secret) {
    return {
      ...post,
      ts: Number(post.ts || Date.now()),
      category: post.category || 'etc',
      secret,
      localOnly: true,
    };
  }

  async function insertServerPost(client, post, secret) {
    const id = api.isUuid(post.server_id || post.id) ? (post.server_id || post.id) : api.uuid();
    const token = api.isUuid(post.owner_token) ? post.owner_token : api.uuid();
    const { error } = await client.from('board_posts').insert({
      id,
      category: post.category || 'etc',
      title: post.title,
      author: post.author || null,
      page: post.page || null,
      body: post.body,
      secret: !!secret,
      owner_token: token,
    });

    // 동일 UUID가 이미 있으면 응답 유실 뒤 재시도한 것으로 보고 토큰을 보존한다.
    if (error && error.code !== '23505') return { ok: false, error, id, token };
    saveToken(id, token);
    return { ok: true, id, token };
  }

  async function migrateLocalPosts() {
    if (localStorage.getItem(KEY_MIGRATED) || !api.isConfigured()) return;
    const client = await api.getClient();
    if (!client) return;

    let allMoved = true;
    for (const [key, secret] of [[KEY_PUBLIC, false], [KEY_SECRET, true]]) {
      const localPosts = readPosts(key);
      if (!localPosts.length) continue;
      const failed = [];
      for (const post of localPosts) {
        const result = await insertServerPost(client, post, secret);
        if (!result.ok) {
          failed.push({
            ...post,
            server_id: result.id,
            owner_token: result.token,
          });
        }
      }
      if (failed.length) {
        writeJson(key, failed);
        allMoved = false;
        if (window.console) {
          console.warn('[게시판] 로컬 글 이전 실패 — 원문을 로컬에 보관합니다.', failed.length);
        }
      } else {
        localStorage.removeItem(key);
      }
    }
    if (allMoved) localStorage.setItem(KEY_MIGRATED, '1');
  }

  function appendCategoryOptions(select, includeAll) {
    if (!select || select.options.length) return;
    if (includeAll) {
      const option = document.createElement('option');
      option.value = 'all';
      option.textContent = '전체 카테고리';
      select.appendChild(option);
    }
    CATEGORIES.forEach((category) => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      select.appendChild(option);
    });
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
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

  function setStatus(element, message, kind) {
    if (!element) return;
    element.hidden = !message;
    element.textContent = message || '';
    element.className = 'fb-status' + (kind ? ' fb-status-' + kind : '');
  }

  function mergeRemoteAndLocal(remote, local) {
    const seen = new Set(remote.map((post) => post.id));
    return remote.concat(local.filter((post) => !seen.has(post.id)))
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  }

  function makeBadge(category) {
    const badge = document.createElement('span');
    badge.className = 'badge badge-cat';
    badge.dataset.cat = category || 'etc';
    badge.textContent = CATEGORY_LABELS[category] || '기타';
    return badge;
  }

  function makeBoardItem(post, secret) {
    const item = document.createElement('li');
    item.className = 'fb-item board-list-item';

    const link = document.createElement('a');
    link.className = 'board-list-link';
    link.href = 'board-post.html?id=' + encodeURIComponent(post.id);

    const top = document.createElement('div');
    top.className = 'fb-item-head';
    top.appendChild(makeBadge(post.category));
    if (secret) {
      const secretBadge = document.createElement('span');
      secretBadge.className = 'badge badge-warn';
      secretBadge.textContent = '비밀';
      top.appendChild(secretBadge);
    }

    const title = document.createElement('strong');
    title.className = 'fb-item-title';
    title.textContent = post.title || '제목 없음';
    top.appendChild(title);

    const preview = document.createElement('p');
    preview.className = 'fb-item-preview';
    preview.textContent = String(post.body || '').replace(/\s+/g, ' ').trim();

    const meta = document.createElement('div');
    meta.className = 'fb-item-meta';
    const author = document.createElement('span');
    author.textContent = post.author || '익명';
    const date = document.createElement('time');
    date.textContent = formatDate(post.ts);
    meta.append(author, document.createTextNode(' · '), date);

    link.append(top, preview, meta);
    item.appendChild(link);
    return item;
  }

  async function initList() {
    const root = document.querySelector('[data-board-list]');
    if (!root) return;

    const status = root.querySelector('[data-fb-status]');
    const publicList = root.querySelector('[data-fb-list-public]');
    const mineList = root.querySelector('[data-fb-list-mine]');
    const empty = root.querySelector('[data-fb-empty]');
    const count = root.querySelector('[data-fb-secret-count]');
    const filter = root.querySelector('[data-fb-cat-filter]');
    const tabs = root.querySelectorAll('[data-fb-tab]');
    let activeTab = 'public';
    let publicPosts = [];
    let minePosts = [];

    appendCategoryOptions(filter, true);
    try {
      const category = new URLSearchParams(location.search).get('cat');
      if (category && CATEGORIES.some((item) => item.id === category)) filter.value = category;
    } catch (error) {}

    function filtered(posts) {
      return !filter || filter.value === 'all'
        ? posts
        : posts.filter((post) => post.category === filter.value);
    }

    function render() {
      const visiblePublic = filtered(publicPosts);
      const visibleMine = filtered(minePosts);
      publicList.replaceChildren(...visiblePublic.map((post) => makeBoardItem(post, false)));
      mineList.replaceChildren(...visibleMine.map((post) => makeBoardItem(post, true)));
      count.textContent = String(visibleMine.length);
      const current = activeTab === 'mine' ? visibleMine : visiblePublic;
      empty.hidden = current.length > 0;
      publicList.hidden = activeTab !== 'public';
      mineList.hidden = activeTab !== 'mine';
      tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.fbTab === activeTab));
    }

    tabs.forEach((tab) => tab.addEventListener('click', () => {
      activeTab = tab.dataset.fbTab;
      render();
    }));
    filter.addEventListener('change', render);

    const localPublic = readPosts(KEY_PUBLIC).map((post) => localToPost(post, false));
    const localSecret = readPosts(KEY_SECRET).map((post) => localToPost(post, true));
    publicPosts = localPublic.slice().sort((a, b) => b.ts - a.ts);
    minePosts = localSecret.slice().sort((a, b) => b.ts - a.ts);
    render();

    if (!api.isConfigured()) {
      setStatus(status, '공유 저장소가 연결되지 않아 로컬 글만 표시됩니다. 이 글은 다른 브라우저에 보이지 않습니다.', 'warn');
      return;
    }

    const client = await api.getClient();
    if (!client) {
      setStatus(status, '게시판 서버에 연결하지 못했습니다. 네트워크를 확인하고 새로고침해 주세요.', 'error');
      return;
    }

    const publicResult = await client.from('board_posts_public').select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    if (publicResult.error) {
      setStatus(status, '공개글 목록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.', 'error');
    } else {
      publicPosts = mergeRemoteAndLocal(
        (publicResult.data || []).map((row) => rowToPost(row, false)),
        readPosts(KEY_PUBLIC).map((post) => localToPost(post, false)),
      );
    }

    let remoteMine = [];
    const tokenValues = Object.values(readTokens()).filter(api.isUuid);
    if (tokenValues.length) {
      const mineResult = await client.rpc('get_posts_by_tokens', { tokens: tokenValues });
      if (!mineResult.error) {
        remoteMine = (mineResult.data || [])
          .filter((row) => row.secret)
          .map((row) => rowToPost(row, true));
      }
    }

    const adminKey = localStorage.getItem(KEY_ADMIN);
    if (adminKey) {
      const adminResult = await client.rpc('admin_list_secret_posts', { admin_key: adminKey });
      if (!adminResult.error) {
        const seen = new Set(remoteMine.map((post) => post.id));
        (adminResult.data || []).forEach((row) => {
          if (!seen.has(row.id)) remoteMine.push(rowToPost(row, true));
        });
      } else {
        setStatus(status, '저장된 운영자 키가 유효하지 않습니다. board.html?admin=off로 해제할 수 있습니다.', 'error');
      }
    }

    minePosts = mergeRemoteAndLocal(
      remoteMine,
      readPosts(KEY_SECRET).map((post) => localToPost(post, true)),
    );
    render();
  }

  function initWrite() {
    const form = document.querySelector('[data-board-write]');
    if (!form) return;

    const category = form.elements.category;
    const body = form.elements.body;
    const author = form.elements.author;
    const page = form.elements.page;
    const status = document.querySelector('[data-board-write-status]');
    const submit = form.querySelector('[type="submit"]');
    const counter = form.querySelector('[data-body-count]');
    let identity = {};
    let saving = false;

    appendCategoryOptions(category, false);

    const draft = readJson(KEY_DRAFT, null);
    if (draft && typeof draft === 'object') {
      ['title', 'author', 'page', 'body', 'category'].forEach((name) => {
        if (form.elements[name] && draft[name] !== undefined) form.elements[name].value = draft[name] || '';
      });
      form.elements.secret.checked = !!draft.secret;
      identity = {
        id: draft.id,
        owner_token: draft.owner_token,
      };
    } else {
      author.value = localStorage.getItem(KEY_AUTHOR) || '';
    }

    try {
      const params = new URLSearchParams(location.search);
      const queryCategory = params.get('category');
      const queryPage = params.get('page');
      if (queryCategory && CATEGORIES.some((item) => item.id === queryCategory)) category.value = queryCategory;
      if (queryPage) page.value = queryPage.slice(0, 120);
    } catch (error) {}

    function resizeBody() {
      body.style.height = 'auto';
      body.style.height = Math.max(body.scrollHeight, 320) + 'px';
      counter.textContent = body.value.length.toLocaleString('ko-KR') + ' / 2,000';
    }

    function saveDraft() {
      const data = {
        id: identity.id,
        owner_token: identity.owner_token,
        title: form.elements.title.value,
        author: author.value,
        page: page.value,
        body: body.value,
        category: category.value,
        secret: form.elements.secret.checked,
      };
      if (!data.title && !data.body && !data.author && !data.page) localStorage.removeItem(KEY_DRAFT);
      else writeJson(KEY_DRAFT, data);
    }

    form.addEventListener('input', () => {
      saveDraft();
      resizeBody();
    });
    form.addEventListener('change', saveDraft);
    resizeBody();
    saveDraft();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return;

      const post = {
        id: api.isUuid(identity.id) ? identity.id : api.uuid(),
        owner_token: api.isUuid(identity.owner_token) ? identity.owner_token : api.uuid(),
        ts: Date.now(),
        category: category.value || 'free',
        title: form.elements.title.value.trim(),
        author: author.value.trim(),
        page: page.value.trim(),
        body: body.value.trim(),
        secret: form.elements.secret.checked,
      };
      if (!post.title || !post.body) {
        setStatus(status, '제목과 내용을 모두 입력해 주세요.', 'error');
        return;
      }

      identity = { id: post.id, owner_token: post.owner_token };
      saveDraft();
      saving = true;
      submit.disabled = true;
      submit.textContent = '게시 중…';
      setStatus(status, '', '');

      const localKey = post.secret ? KEY_SECRET : KEY_PUBLIC;
      if (api.isConfigured()) {
        const client = await api.getClient();
        if (client) {
          const result = await insertServerPost(client, post, post.secret);
          if (result.ok) {
            removeLocal(localKey, post.id);
            localStorage.removeItem(KEY_DRAFT);
            if (post.author) localStorage.setItem(KEY_AUTHOR, post.author);
            location.href = 'board-post.html?id=' + encodeURIComponent(result.id);
            return;
          }
          if (window.console) console.warn('[게시판] 글 저장 실패:', result.error);
        }

        // 서버 저장에 실패한 원문은 로컬 글과 임시저장 양쪽에 남기되 성공 이동은 하지 않는다.
        upsertLocal(localKey, post);
        setStatus(status, '서버에 글을 저장하지 못했습니다. 원문은 이 브라우저에 보관했습니다. 네트워크를 확인한 뒤 다시 게시해 주세요.', 'error');
      } else {
        upsertLocal(localKey, post);
        saveToken(post.id, post.owner_token);
        localStorage.removeItem(KEY_DRAFT);
        if (post.author) localStorage.setItem(KEY_AUTHOR, post.author);
        location.href = 'board-post.html?id=' + encodeURIComponent(post.id);
        return;
      }

      saving = false;
      submit.disabled = false;
      submit.textContent = '게시';
    });
  }

  function safeRelatedHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/(?!\/)[^<>"']*$/.test(raw) || /^(?:\.\/|\.\.\/)[^<>"']+$/.test(raw)) return raw;
    return '';
  }

  async function initPost() {
    const root = document.querySelector('[data-board-post]');
    if (!root) return;

    const status = root.querySelector('[data-board-post-status]');
    const content = root.querySelector('[data-board-post-content]');
    const deleteButton = root.querySelector('[data-board-delete]');
    const commentsSlot = document.querySelector('[data-board-comments-slot]');
    let id = '';
    try { id = new URLSearchParams(location.search).get('id') || ''; } catch (error) {}
    if (!id) {
      setStatus(status, '게시글 주소에 id가 없습니다.', 'error');
      return;
    }

    const localPublic = readPosts(KEY_PUBLIC).find((post) => post.id === id);
    const localSecret = readPosts(KEY_SECRET).find((post) => post.id === id);
    let post = localPublic ? localToPost(localPublic, false)
      : (localSecret ? localToPost(localSecret, true) : null);
    let client = null;

    if (api.isConfigured()) {
      client = await api.getClient();
      if (client && api.isUuid(id)) {
        const publicResult = await client.from('board_posts_public').select('*').eq('id', id).maybeSingle();
        if (!publicResult.error && publicResult.data) {
          post = rowToPost(publicResult.data, false);
        } else if (!post) {
          const tokenValues = Object.values(readTokens()).filter(api.isUuid);
          if (tokenValues.length) {
            const mineResult = await client.rpc('get_posts_by_tokens', { tokens: tokenValues });
            if (!mineResult.error) {
              const row = (mineResult.data || []).find((item) => item.id === id);
              if (row) post = rowToPost(row, !!row.secret);
            }
          }
          if (!post) {
            const adminKey = localStorage.getItem(KEY_ADMIN);
            if (adminKey) {
              const adminResult = await client.rpc('admin_list_secret_posts', { admin_key: adminKey });
              if (!adminResult.error) {
                const row = (adminResult.data || []).find((item) => item.id === id);
                if (row) post = rowToPost(row, true);
              } else {
                setStatus(status, '운영자 키가 올바르지 않아 비밀글을 열람할 수 없습니다.', 'error');
              }
            }
          }
        }
      }
    }

    if (!post) {
      setStatus(status, '게시글을 찾을 수 없거나 이 비밀글을 볼 권한이 없습니다.', 'error');
      return;
    }

    root.querySelector('[data-post-category]').replaceChildren(makeBadge(post.category));
    root.querySelector('[data-post-title]').textContent = post.title || '제목 없음';
    root.querySelector('[data-post-author]').textContent = post.author || '익명';
    root.querySelector('[data-post-date]').textContent = formatDate(post.ts);
    root.querySelector('[data-post-body]').textContent = post.body || '';

    const visibility = root.querySelector('[data-post-visibility]');
    visibility.textContent = post.secret ? '비밀글' : '공개글';
    visibility.className = 'badge ' + (post.secret ? 'badge-warn' : 'badge-accent');

    const related = root.querySelector('[data-post-page]');
    const href = safeRelatedHref(post.page);
    if (href) {
      related.href = href;
      related.textContent = post.page;
      if (/^https?:\/\//i.test(href)) {
        related.target = '_blank';
        related.rel = 'noopener';
      }
    } else {
      related.closest('[data-post-page-row]').hidden = true;
    }

    content.hidden = false;
    status.hidden = true;

    const tokens = readTokens();
    const canDelete = !!localPublic || !!localSecret || !!tokens[id];
    deleteButton.hidden = !canDelete;

    deleteButton.addEventListener('click', async () => {
      if (!canDelete || !window.confirm('이 글을 삭제할까요?')) return;
      deleteButton.disabled = true;

      if (post.localOnly) {
        removeLocal(post.secret ? KEY_SECRET : KEY_PUBLIC, id);
        removeToken(id);
        location.href = 'board.html';
        return;
      }

      const token = readTokens()[id];
      if (!client || !token) {
        setStatus(status, '삭제 권한을 확인할 수 없습니다.', 'error');
        deleteButton.disabled = false;
        return;
      }
      const result = await client.rpc('delete_board_post', { post_id: id, token });
      if (!result.error && result.data) {
        removeToken(id);
        location.href = 'board.html';
        return;
      }
      setStatus(status, '글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      deleteButton.disabled = false;
    });

    if (!post.secret && commentsSlot) {
      const section = document.createElement('section');
      section.className = 'content-comments';
      section.dataset.comments = '';
      section.dataset.commentType = 'board_post';
      section.dataset.commentKey = post.id;
      section.dataset.commentTitle = post.title || '게시판 글';
      section.dataset.commentPage = '/board-post.html?id=' + encodeURIComponent(post.id);
      section.dataset.commentWriteHref = 'board-write.html';
      commentsSlot.replaceChildren(section);
      if (window.TopdaComments) window.TopdaComments.mount(section);
    }
  }

  migrateLegacyKeys();
  captureAdminKey();
  migrateLocalPosts().finally(() => {
    initList();
    initWrite();
    initPost();
  });
})();
