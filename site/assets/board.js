// 톺다 게시판: 목록(board.html) · 작성/수정(board-write.html) · 상세(board-post.html)
//
// 보안 원칙 — 사용자 입력은 절대 innerHTML 로 넣지 않는다. 본문 서식은
// renderRichText() 가 마크다운 비슷한 문법을 읽어 DOM 노드를 직접 만들고,
// 글자는 전부 textContent 로만 들어간다. 그래서 <script> 를 써도 글자로 보인다.
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

  const BODY_MAX = 2000;
  const PAGE_SIZE = 20;

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

  // ── 저장소 -----------------------------------------------------------------

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

  function adminKey() {
    return localStorage.getItem(KEY_ADMIN) || '';
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

  // ── 모델 -------------------------------------------------------------------

  function rowToPost(row, secret) {
    return {
      id: row.id,
      ts: new Date(row.created_at).getTime(),
      editedTs: row.updated_at ? new Date(row.updated_at).getTime() : 0,
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
      editedTs: Number(post.editedTs || 0),
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

  // ── 공용 UI ----------------------------------------------------------------

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function appendCategoryOptions(select, includeAll) {
    if (!select || select.options.length) return;
    if (includeAll) {
      const option = document.createElement('option');
      option.value = 'all';
      option.textContent = '전체';
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

  // 목록용 짧은 날짜 — 오늘 글은 시각만, 그 외에는 월.일
  function formatListDate(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
    const pad = (n) => String(n).padStart(2, '0');
    if (sameDay) return pad(date.getHours()) + ':' + pad(date.getMinutes());
    if (date.getFullYear() === now.getFullYear()) return pad(date.getMonth() + 1) + '.' + pad(date.getDate());
    return String(date.getFullYear()).slice(2) + '.' + pad(date.getMonth() + 1) + '.' + pad(date.getDate());
  }

  function setStatus(element_, message, kind) {
    if (!element_) return;
    element_.hidden = !message;
    element_.textContent = message || '';
    element_.className = 'fb-status' + (kind ? ' fb-status-' + kind : '');
  }

  function mergeRemoteAndLocal(remote, local) {
    const seen = new Set(remote.map((post) => post.id));
    return remote.concat(local.filter((post) => !seen.has(post.id)))
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  }

  function makeBadge(category) {
    const badge = element('span', 'badge badge-cat', CATEGORY_LABELS[category] || '기타');
    badge.dataset.cat = category || 'etc';
    return badge;
  }

  // ── 본문 렌더러 -------------------------------------------------------------
  //
  // 지원 문법 (에디터 툴바가 넣어 주므로 외울 필요는 없다)
  //   ## 제목        ### 작은 제목
  //   **굵게**  *기울임*  `코드`
  //   - 목록         1. 번호 목록
  //   > 인용
  //   [글자](주소)   ![설명](이미지주소)
  //   ---           구분선

  function safeUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/(?!\/)[^<>"']*$/.test(raw)) return raw;
    if (/^(?:\.\/|\.\.\/)[^<>"']+$/.test(raw)) return raw;
    return '';
  }

  const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\][\n]+\]\([^()\s]+\))/;

  // 한 줄 안의 굵게/기울임/코드/링크를 DOM 노드 배열로 바꾼다.
  function renderInline(text) {
    const nodes = [];
    let rest = String(text);

    while (rest) {
      const match = INLINE_PATTERN.exec(rest);
      if (!match) {
        nodes.push(document.createTextNode(rest));
        break;
      }
      if (match.index > 0) nodes.push(document.createTextNode(rest.slice(0, match.index)));

      const token = match[0];
      if (token.startsWith('**')) {
        nodes.push(element('strong', '', token.slice(2, -2)));
      } else if (token.startsWith('`')) {
        nodes.push(element('code', '', token.slice(1, -1)));
      } else if (token.startsWith('[')) {
        const split = token.indexOf('](');
        const label = token.slice(1, split);
        const href = safeUrl(token.slice(split + 2, -1));
        if (href) {
          const link = element('a', '', label);
          link.href = href;
          if (/^https?:\/\//i.test(href)) {
            link.target = '_blank';
            link.rel = 'noopener nofollow ugc';
          }
          nodes.push(link);
        } else {
          // 허용되지 않는 주소(javascript: 등)는 링크로 만들지 않고 글자로 남긴다.
          nodes.push(document.createTextNode(label));
        }
      } else {
        nodes.push(element('em', '', token.slice(1, -1)));
      }
      rest = rest.slice(match.index + token.length);
    }
    return nodes;
  }

  // 블록 단위 파싱. container 를 비우고 새로 채운다.
  function renderRichText(text, container) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let list = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      const p = element('p', 'rt-p');
      paragraph.forEach((line, index) => {
        if (index) p.appendChild(document.createElement('br'));
        renderInline(line).forEach((node) => p.appendChild(node));
      });
      blocks.push(p);
      paragraph = [];
    }

    function flushList() {
      if (list) blocks.push(list.node);
      list = null;
    }

    function flushAll() {
      flushParagraph();
      flushList();
    }

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) { flushAll(); continue; }

      // 구분선
      if (/^-{3,}$/.test(trimmed)) {
        flushAll();
        blocks.push(element('hr', 'rt-hr'));
        continue;
      }

      // 이미지 (한 줄 전체가 이미지일 때만)
      const image = /^!\[([^\][]*)\]\(([^()\s]+)\)$/.exec(trimmed);
      if (image) {
        flushAll();
        const src = safeUrl(image[2]);
        if (src && /^https?:\/\//i.test(src)) {
          const figure = element('figure', 'rt-figure');
          const img = document.createElement('img');
          img.src = src;
          img.alt = image[1] || '';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          figure.appendChild(img);
          if (image[1]) figure.appendChild(element('figcaption', '', image[1]));
          blocks.push(figure);
        } else {
          blocks.push(element('p', 'rt-p', trimmed));
        }
        continue;
      }

      // 제목
      const heading = /^(#{2,3})\s+(.*)$/.exec(trimmed);
      if (heading) {
        flushAll();
        const node = element(heading[1].length === 2 ? 'h3' : 'h4', 'rt-h');
        renderInline(heading[2]).forEach((child) => node.appendChild(child));
        blocks.push(node);
        continue;
      }

      // 인용
      const quote = /^>\s?(.*)$/.exec(trimmed);
      if (quote) {
        flushParagraph();
        flushList();
        const last = blocks[blocks.length - 1];
        if (last && last.classList && last.classList.contains('rt-quote')) {
          last.appendChild(document.createElement('br'));
          renderInline(quote[1]).forEach((child) => last.appendChild(child));
        } else {
          const node = element('blockquote', 'rt-quote');
          renderInline(quote[1]).forEach((child) => node.appendChild(child));
          blocks.push(node);
        }
        continue;
      }

      // 목록
      const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
      const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
      if (bullet || numbered) {
        flushParagraph();
        const wanted = bullet ? 'ul' : 'ol';
        if (!list || list.type !== wanted) {
          flushList();
          list = { type: wanted, node: element(wanted, 'rt-list') };
        }
        const item = element('li');
        renderInline((bullet || numbered)[1]).forEach((child) => item.appendChild(child));
        list.node.appendChild(item);
        continue;
      }

      flushList();
      paragraph.push(trimmed);
    }
    flushAll();

    container.replaceChildren(...blocks);
  }

  // 목록 미리보기용 — 서식 기호를 걷어낸 순수 텍스트
  function plainPreview(text) {
    return String(text || '')
      .replace(/!\[[^\][]*\]\([^()\s]+\)/g, ' ')
      .replace(/\[([^\][]+)\]\([^()\s]+\)/g, '$1')
      .replace(/[#>*`]/g, '')
      .replace(/^\s*\d+\.\s*/gm, '')
      .replace(/^\s*-\s*/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── 운영자 모드 -------------------------------------------------------------

  function initAdminBar() {
    const bar = document.querySelector('[data-admin-bar]');
    if (!bar) return;

    const state = bar.querySelector('[data-admin-state]');
    const openButton = bar.querySelector('[data-admin-open]');
    const panel = bar.querySelector('[data-admin-panel]');
    const input = bar.querySelector('[data-admin-input]');
    const save = bar.querySelector('[data-admin-save]');
    const clear = bar.querySelector('[data-admin-clear]');
    const message = bar.querySelector('[data-admin-message]');

    function paint() {
      const on = !!adminKey();
      bar.classList.toggle('is-on', on);
      state.textContent = on ? '운영자 모드 켜짐 — 비밀글이 모두 보입니다' : '운영자 모드 꺼짐';
      clear.hidden = !on;
      openButton.textContent = on ? '키 변경' : '운영자 키 입력';
    }

    openButton.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) input.focus();
    });

    clear.addEventListener('click', () => {
      localStorage.removeItem(KEY_ADMIN);
      message.textContent = '';
      panel.hidden = true;
      paint();
      location.reload();
    });

    save.addEventListener('click', async () => {
      const value = input.value.trim();
      if (!value) {
        message.textContent = '키를 입력해 주세요.';
        return;
      }
      save.disabled = true;
      message.textContent = '확인 중…';

      const client = api.isConfigured() ? await api.getClient() : null;
      if (!client) {
        message.textContent = '서버에 연결하지 못했습니다.';
        save.disabled = false;
        return;
      }

      // verify_admin_key 가 아직 없는 프로젝트에서도 동작하도록,
      // 실패하면 기존 admin_list_secret_posts 로 한 번 더 확인한다.
      let ok = false;
      const verify = await client.rpc('verify_admin_key', { admin_key: value });
      if (!verify.error) ok = true;
      else {
        const fallback = await client.rpc('admin_list_secret_posts', { admin_key: value });
        ok = !fallback.error;
      }

      if (!ok) {
        message.textContent = '키가 올바르지 않습니다.';
        save.disabled = false;
        return;
      }

      localStorage.setItem(KEY_ADMIN, value);
      input.value = '';
      message.textContent = '';
      panel.hidden = true;
      save.disabled = false;
      paint();
      location.reload();
    });

    paint();
  }

  // ── 목록 -------------------------------------------------------------------

  function makeRow(post, index, options) {
    const row = element('tr', 'bl-row');
    if (post.secret) row.classList.add('is-secret');

    const num = element('td', 'bl-num', String(index));

    const catCell = element('td', 'bl-cat');
    catCell.appendChild(makeBadge(post.category));

    const titleCell = element('td', 'bl-title');
    const link = element('a', 'bl-link');
    link.href = 'board-post.html?id=' + encodeURIComponent(post.id);
    link.appendChild(element('span', 'bl-subject', post.title || '제목 없음'));

    if (post.secret) {
      const lock = element('span', 'bl-lock', '🔒');
      lock.title = '비밀글';
      link.insertBefore(lock, link.firstChild);
    }
    const commentCount = options.commentCounts[post.id] || 0;
    if (commentCount) link.appendChild(element('span', 'bl-comments', '[' + commentCount + ']'));
    if (post.editedTs) link.appendChild(element('span', 'bl-edited', '수정됨'));
    if (post.localOnly) link.appendChild(element('span', 'bl-local', '내 기기'));

    titleCell.appendChild(link);
    const excerpt = plainPreview(post.body);
    if (excerpt) titleCell.appendChild(element('span', 'bl-excerpt', excerpt));

    const authorCell = element('td', 'bl-author', post.author || '익명');
    const dateCell = element('td', 'bl-date', formatListDate(post.ts));

    row.append(num, catCell, titleCell, authorCell, dateCell);
    return row;
  }

  async function initList() {
    const root = document.querySelector('[data-board-list]');
    if (!root) return;

    const status = root.querySelector('[data-fb-status]');
    const tbody = root.querySelector('[data-bl-body]');
    const empty = root.querySelector('[data-fb-empty]');
    const count = root.querySelector('[data-fb-secret-count]');
    const filter = root.querySelector('[data-fb-cat-filter]');
    const search = root.querySelector('[data-bl-search]');
    const tabs = root.querySelectorAll('[data-fb-tab]');
    const pager = root.querySelector('[data-bl-pager]');

    let activeTab = 'public';
    let publicPosts = [];
    let minePosts = [];
    let commentCounts = {};
    let page = 1;

    appendCategoryOptions(filter, true);
    try {
      const category = new URLSearchParams(location.search).get('cat');
      if (category && CATEGORIES.some((item) => item.id === category)) filter.value = category;
    } catch (error) {}

    function visible() {
      const source = activeTab === 'mine' ? minePosts : publicPosts;
      const cat = filter && filter.value !== 'all' ? filter.value : '';
      const query = (search.value || '').trim().toLowerCase();
      return source.filter((post) => {
        if (cat && post.category !== cat) return false;
        if (!query) return true;
        return (post.title + ' ' + post.body + ' ' + (post.author || '')).toLowerCase().includes(query);
      });
    }

    function renderPager(total) {
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > pages) page = pages;
      pager.replaceChildren();
      if (pages <= 1) return;
      for (let n = 1; n <= pages; n += 1) {
        const button = element('button', 'bl-page' + (n === page ? ' is-current' : ''), String(n));
        button.type = 'button';
        const target = n;
        button.addEventListener('click', () => {
          page = target;
          render();
          root.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        pager.appendChild(button);
      }
    }

    function render() {
      const rows = visible();
      const start = (page - 1) * PAGE_SIZE;
      const slice = rows.slice(start, start + PAGE_SIZE);
      tbody.replaceChildren(...slice.map((post, i) => makeRow(post, rows.length - start - i, { commentCounts })));
      count.textContent = String(minePosts.length);
      empty.hidden = rows.length > 0;
      tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.fbTab === activeTab));
      renderPager(rows.length);
    }

    tabs.forEach((tab) => tab.addEventListener('click', () => {
      activeTab = tab.dataset.fbTab;
      page = 1;
      render();
    }));
    filter.addEventListener('change', () => { page = 1; render(); });
    search.addEventListener('input', () => { page = 1; render(); });

    publicPosts = readPosts(KEY_PUBLIC).map((post) => localToPost(post, false)).sort((a, b) => b.ts - a.ts);
    minePosts = readPosts(KEY_SECRET).map((post) => localToPost(post, true)).sort((a, b) => b.ts - a.ts);
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

    const key = adminKey();
    if (key) {
      const adminResult = await client.rpc('admin_list_secret_posts', { admin_key: key });
      if (!adminResult.error) {
        const seen = new Set(remoteMine.map((post) => post.id));
        (adminResult.data || []).forEach((row) => {
          if (!seen.has(row.id)) remoteMine.push(rowToPost(row, true));
        });
      } else {
        setStatus(status, '저장된 운영자 키가 유효하지 않습니다. 상단에서 키를 다시 입력해 주세요.', 'error');
      }
    }

    minePosts = mergeRemoteAndLocal(
      remoteMine,
      readPosts(KEY_SECRET).map((post) => localToPost(post, true)),
    );

    // 제목 옆 댓글 수 — 게시글 댓글만 한 번에 받아 클라이언트에서 센다.
    const countResult = await client.from('content_comments_public').select('target_key')
      .eq('target_type', 'board_post')
      .limit(1000);
    if (!countResult.error) {
      commentCounts = (countResult.data || []).reduce((map, row) => {
        map[row.target_key] = (map[row.target_key] || 0) + 1;
        return map;
      }, {});
    }

    render();
  }

  // ── 에디터 -----------------------------------------------------------------

  // 툴바 버튼 정의. wrap 은 선택 영역을 감싸고, prefix 는 줄 앞에 붙인다.
  const TOOLS = [
    { id: 'bold', label: '가', title: '굵게 (Ctrl+B)', wrap: ['**', '**'], sample: '굵은 글씨', className: 'is-bold' },
    { id: 'italic', label: '가', title: '기울임 (Ctrl+I)', wrap: ['*', '*'], sample: '기울인 글씨', className: 'is-italic' },
    { id: 'h2', label: '제목', title: '제목', prefix: '## ', sample: '제목' },
    { id: 'h3', label: '소제목', title: '작은 제목', prefix: '### ', sample: '작은 제목' },
    { id: 'ul', label: '• 목록', title: '글머리 목록', prefix: '- ', sample: '항목' },
    { id: 'ol', label: '1. 목록', title: '번호 목록', prefix: '1. ', sample: '항목' },
    { id: 'quote', label: '인용', title: '인용문', prefix: '> ', sample: '인용할 내용' },
    { id: 'code', label: '코드', title: '코드', wrap: ['`', '`'], sample: '코드' },
    { id: 'link', label: '링크', title: '링크 넣기', kind: 'link' },
    { id: 'image', label: '사진', title: '이미지 주소 넣기', kind: 'image' },
    { id: 'hr', label: '구분선', title: '구분선', kind: 'hr' },
  ];

  function applyTool(textarea, tool) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);

    if (tool.kind === 'hr') {
      const insert = (start > 0 && value[start - 1] !== '\n' ? '\n' : '') + '---\n';
      textarea.value = value.slice(0, start) + insert + value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + insert.length;
      return;
    }

    if (tool.kind === 'link' || tool.kind === 'image') {
      const url = window.prompt(tool.kind === 'image' ? '이미지 주소(https://…)' : '링크 주소(https://…)', 'https://');
      if (!url || !safeUrl(url)) return;
      const label = selected || (tool.kind === 'image' ? '사진 설명' : '링크 글자');
      const insert = (tool.kind === 'image' ? '!' : '') + '[' + label + '](' + url.trim() + ')';
      textarea.value = value.slice(0, start) + insert + value.slice(end);
      textarea.selectionStart = start + (tool.kind === 'image' ? 2 : 1);
      textarea.selectionEnd = textarea.selectionStart + label.length;
      return;
    }

    if (tool.wrap) {
      const text = selected || tool.sample;
      const insert = tool.wrap[0] + text + tool.wrap[1];
      textarea.value = value.slice(0, start) + insert + value.slice(end);
      textarea.selectionStart = start + tool.wrap[0].length;
      textarea.selectionEnd = textarea.selectionStart + text.length;
      return;
    }

    // prefix — 선택된 줄 전체(없으면 커서가 있는 줄)의 앞에 붙인다.
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;
    const block = value.slice(lineStart, lineEnd) || tool.sample;
    const prefixed = block.split('\n').map((line, index) => {
      const mark = tool.prefix === '1. ' ? (index + 1) + '. ' : tool.prefix;
      return line.startsWith(mark) ? line.slice(mark.length) : mark + line;
    }).join('\n');

    textarea.value = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
    textarea.selectionStart = lineStart;
    textarea.selectionEnd = lineStart + prefixed.length;
  }

  function buildToolbar(textarea, onChange) {
    const bar = element('div', 'ed-toolbar');
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', '글 서식');

    TOOLS.forEach((tool) => {
      const button = element('button', 'ed-tool' + (tool.className ? ' ' + tool.className : ''), tool.label);
      button.type = 'button';
      button.title = tool.title;
      button.addEventListener('click', () => {
        applyTool(textarea, tool);
        textarea.focus();
        onChange();
      });
      bar.appendChild(button);
    });
    return bar;
  }

  async function loadPostForEdit(client, id) {
    const localPublic = readPosts(KEY_PUBLIC).find((post) => post.id === id);
    if (localPublic) return localToPost(localPublic, false);
    const localSecret = readPosts(KEY_SECRET).find((post) => post.id === id);
    if (localSecret) return localToPost(localSecret, true);
    if (!client || !api.isUuid(id)) return null;

    const publicResult = await client.from('board_posts_public').select('*').eq('id', id).maybeSingle();
    if (!publicResult.error && publicResult.data) return rowToPost(publicResult.data, false);

    const tokenValues = Object.values(readTokens()).filter(api.isUuid);
    if (tokenValues.length) {
      const mineResult = await client.rpc('get_posts_by_tokens', { tokens: tokenValues });
      if (!mineResult.error) {
        const row = (mineResult.data || []).find((item) => item.id === id);
        if (row) return rowToPost(row, !!row.secret);
      }
    }
    const key = adminKey();
    if (key) {
      const adminResult = await client.rpc('admin_list_secret_posts', { admin_key: key });
      if (!adminResult.error) {
        const row = (adminResult.data || []).find((item) => item.id === id);
        if (row) return rowToPost(row, true);
      }
    }
    return null;
  }

  async function initWrite() {
    const form = document.querySelector('[data-board-write]');
    if (!form) return;

    const category = form.elements.category;
    const body = form.elements.body;
    const author = form.elements.author;
    const page = form.elements.page;
    const secretField = form.elements.secret;
    const secretRow = form.querySelector('[data-secret-row]');
    const status = document.querySelector('[data-board-write-status]');
    const submit = form.querySelector('[type="submit"]');
    const counter = form.querySelector('[data-body-count]');
    const heading = document.querySelector('[data-write-heading]');
    const editorHost = form.querySelector('[data-editor-host]');
    const preview = form.querySelector('[data-editor-preview]');
    const previewToggle = form.querySelector('[data-editor-preview-toggle]');
    const draftNote = form.querySelector('[data-draft-note]');

    let identity = {};
    let saving = false;
    let editId = '';
    let editingPost = null;

    appendCategoryOptions(category, false);

    try {
      editId = new URLSearchParams(location.search).get('edit') || '';
    } catch (error) {}

    // 툴바 + 미리보기 배선
    const toolbar = buildToolbar(body, refreshEditor);
    editorHost.insertBefore(toolbar, editorHost.firstChild);

    body.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const map = { b: 'bold', i: 'italic' };
      const id = map[event.key.toLowerCase()];
      if (!id) return;
      event.preventDefault();
      applyTool(body, TOOLS.find((tool) => tool.id === id));
      refreshEditor();
    });

    previewToggle.addEventListener('click', () => {
      const on = preview.hidden;
      preview.hidden = !on;
      previewToggle.textContent = on ? '미리보기 닫기' : '미리보기';
      previewToggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) renderRichText(body.value, preview);
    });

    function resizeBody() {
      body.style.height = 'auto';
      body.style.height = Math.max(body.scrollHeight, 320) + 'px';
    }

    function refreshEditor() {
      resizeBody();
      counter.textContent = body.value.length.toLocaleString('ko-KR') + ' / ' + BODY_MAX.toLocaleString('ko-KR');
      if (!preview.hidden) renderRichText(body.value, preview);
      saveDraft();
    }

    function saveDraft() {
      if (editId) return; // 수정 중에는 새 글 임시저장을 덮어쓰지 않는다.
      const data = {
        id: identity.id,
        owner_token: identity.owner_token,
        title: form.elements.title.value,
        author: author.value,
        page: page.value,
        body: body.value,
        category: category.value,
        secret: secretField.checked,
      };
      if (!data.title && !data.body && !data.author && !data.page) {
        localStorage.removeItem(KEY_DRAFT);
        draftNote.hidden = true;
      } else {
        writeJson(KEY_DRAFT, data);
        draftNote.hidden = false;
        draftNote.textContent = '임시저장됨 · ' + formatDate(Date.now());
      }
    }

    form.addEventListener('input', refreshEditor);
    form.addEventListener('change', saveDraft);

    // ── 수정 모드 --------------------------------------------------------
    if (editId) {
      heading.textContent = '글 수정';
      submit.textContent = '수정 완료';
      submit.disabled = true;   // 원문을 불러오기 전에 빈 내용으로 덮어쓰지 않도록
      secretRow.hidden = true;
      setStatus(status, '글을 불러오는 중…', '');

      const client = api.isConfigured() ? await api.getClient() : null;
      editingPost = await loadPostForEdit(client, editId);

      if (!editingPost) {
        setStatus(status, '수정할 글을 찾지 못했습니다. 목록에서 다시 시도해 주세요.', 'error');
        submit.disabled = true;
        return;
      }
      const canEdit = editingPost.localOnly || !!readTokens()[editId] || !!adminKey();
      if (!canEdit) {
        setStatus(status, '이 글을 수정할 권한이 없습니다. 글을 작성한 브라우저에서만 수정할 수 있습니다.', 'error');
        submit.disabled = true;
        return;
      }

      category.value = editingPost.category;
      form.elements.title.value = editingPost.title;
      author.value = editingPost.author;
      page.value = editingPost.page;
      body.value = editingPost.body;
      secretField.checked = editingPost.secret;
      setStatus(status, '', '');
      submit.disabled = false;
      refreshEditor();
    } else {
      const draft = readJson(KEY_DRAFT, null);
      if (draft && typeof draft === 'object') {
        ['title', 'author', 'page', 'body', 'category'].forEach((name) => {
          if (form.elements[name] && draft[name] !== undefined) form.elements[name].value = draft[name] || '';
        });
        secretField.checked = !!draft.secret;
        identity = { id: draft.id, owner_token: draft.owner_token };
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
      refreshEditor();
    }

    // ── 저장 --------------------------------------------------------------
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return;

      const title = form.elements.title.value.trim();
      const text = body.value.trim();
      if (!title || !text) {
        setStatus(status, '제목과 내용을 모두 입력해 주세요.', 'error');
        return;
      }

      saving = true;
      submit.disabled = true;
      setStatus(status, '', '');

      // 수정
      if (editId && editingPost) {
        submit.textContent = '수정 중…';
        if (editingPost.localOnly) {
          const key = editingPost.secret ? KEY_SECRET : KEY_PUBLIC;
          upsertLocal(key, {
            ...editingPost,
            category: category.value,
            title,
            author: author.value.trim(),
            page: page.value.trim(),
            body: text,
            editedTs: Date.now(),
          });
          location.href = 'board-post.html?id=' + encodeURIComponent(editId);
          return;
        }

        const client = await api.getClient();
        const token = readTokens()[editId];
        let result;
        if (token) {
          result = await client.rpc('update_board_post', {
            post_id: editId,
            token,
            new_category: category.value,
            new_title: title,
            new_author: author.value.trim() || null,
            new_page: page.value.trim() || null,
            new_body: text,
          });
        } else {
          result = await client.rpc('admin_update_board_post', {
            post_id: editId,
            admin_key: adminKey(),
            new_category: category.value,
            new_title: title,
            new_author: author.value.trim() || null,
            new_page: page.value.trim() || null,
            new_body: text,
          });
        }

        if (!result.error && result.data) {
          location.href = 'board-post.html?id=' + encodeURIComponent(editId);
          return;
        }
        if (window.console) console.warn('[게시판] 글 수정 실패:', result.error);
        setStatus(status, '글을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
        saving = false;
        submit.disabled = false;
        submit.textContent = '수정 완료';
        return;
      }

      // 새 글
      const post = {
        id: api.isUuid(identity.id) ? identity.id : api.uuid(),
        owner_token: api.isUuid(identity.owner_token) ? identity.owner_token : api.uuid(),
        ts: Date.now(),
        editedTs: 0,
        category: category.value || 'free',
        title,
        author: author.value.trim(),
        page: page.value.trim(),
        body: text,
        secret: secretField.checked,
      };

      identity = { id: post.id, owner_token: post.owner_token };
      saveDraft();
      submit.textContent = '게시 중…';

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

  // ── 상세 -------------------------------------------------------------------

  async function initPost() {
    const root = document.querySelector('[data-board-post]');
    if (!root) return;

    const status = root.querySelector('[data-board-post-status]');
    const content = root.querySelector('[data-board-post-content]');
    const deleteButton = root.querySelector('[data-board-delete]');
    const editButton = root.querySelector('[data-board-edit]');
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
            const key = adminKey();
            if (key) {
              const adminResult = await client.rpc('admin_list_secret_posts', { admin_key: key });
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
      setStatus(status, '게시글을 찾을 수 없거나 이 비밀글을 볼 권한이 없습니다. 비밀글은 작성한 브라우저 또는 운영자 모드에서만 열립니다.', 'error');
      return;
    }

    root.querySelector('[data-post-category]').replaceChildren(makeBadge(post.category));
    root.querySelector('[data-post-title]').textContent = post.title || '제목 없음';
    root.querySelector('[data-post-author]').textContent = post.author || '익명';
    root.querySelector('[data-post-date]').textContent = formatDate(post.ts);

    const edited = root.querySelector('[data-post-edited]');
    if (post.editedTs) {
      edited.hidden = false;
      edited.textContent = '수정됨 ' + formatDate(post.editedTs);
    } else {
      edited.hidden = true;
    }

    renderRichText(post.body, root.querySelector('[data-post-body]'));

    const visibility = root.querySelector('[data-post-visibility]');
    visibility.textContent = post.secret ? '비밀글' : '공개글';
    visibility.className = 'badge ' + (post.secret ? 'badge-warn' : 'badge-accent');

    const related = root.querySelector('[data-post-page]');
    const href = safeUrl(post.page);
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
    const ownerToken = tokens[id] || '';
    const isOwner = post.localOnly ? (!!localPublic || !!localSecret) : !!ownerToken;
    const canManage = isOwner || !!adminKey();

    editButton.hidden = !canManage;
    deleteButton.hidden = !canManage;
    deleteButton.textContent = isOwner ? '삭제' : '운영자 삭제';
    editButton.href = 'board-write.html?edit=' + encodeURIComponent(id);

    deleteButton.addEventListener('click', async () => {
      if (!canManage || !window.confirm('이 글을 삭제할까요? 삭제한 글은 복구할 수 없습니다.')) return;
      deleteButton.disabled = true;

      if (post.localOnly) {
        removeLocal(post.secret ? KEY_SECRET : KEY_PUBLIC, id);
        removeToken(id);
        location.href = 'board.html';
        return;
      }

      if (!client) {
        setStatus(status, '삭제 권한을 확인할 수 없습니다.', 'error');
        deleteButton.disabled = false;
        return;
      }

      const result = ownerToken
        ? await client.rpc('delete_board_post', { post_id: id, token: ownerToken })
        : await client.rpc('admin_delete_board_post', { post_id: id, admin_key: adminKey() });
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
    initAdminBar();
    initList();
    initWrite();
    initPost();
  });
})();
