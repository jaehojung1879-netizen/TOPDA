// ===== 톺다 게시판 =====
// - 비밀글: localStorage 'board:secret' — 이 브라우저에서만 보임(그대로 유지).
// - 공개글: Supabase(board_posts)에 저장 — 모든 방문자에게 공유됨.
//   SUPABASE_URL/ANON_KEY가 배포 시 주입되지 않은 경우(로컬·PR)는
//   localStorage 'board:public'로 자동 폴백해 기존처럼 동작한다.
// - 글 작성 시 카테고리 선택(자유·질문·후기·정보·수정요청·기타).
// - 입력 폼은 localStorage 'board:draft'에 자동 임시저장 → 모달 다시 열어도 복원.
// - 작성자 정보(닉네임)도 localStorage 'board:author'로 기억 → 다음 글에서 자동 채움.
(function () {
  const root = document.querySelector('[data-fb-app]');
  if (!root) return;

  // ----- 저장 키 -----
  const KEY_PUB = root.dataset.keyPublic || 'board:public';
  const KEY_SEC = root.dataset.keySecret || 'board:secret';
  const KEY_DRAFT = 'board:draft';
  const KEY_AUTHOR = 'board:author';
  const KEY_TOKENS = 'board:owner_tokens';   // {postId: ownerToken} — 내가 쓴 공개글 삭제 인증용
  const KEY_MIGRATED = 'board:migrated_to_supabase';

  // ----- Supabase 백엔드 (공개글 전용) -----
  const SUPABASE_URL = '__SUPABASE_URL__';
  const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';
  const supabaseConfigured = !/^__.*__$/.test(SUPABASE_URL) && !/^__.*__$/.test(SUPABASE_ANON_KEY)
    && SUPABASE_URL.length > 8 && SUPABASE_ANON_KEY.length > 8;
  let supabasePromise = null;
  function getSupabase() {
    if (!supabaseConfigured) return Promise.resolve(null);
    if (supabasePromise) return supabasePromise;
    supabasePromise = import('https://esm.sh/@supabase/supabase-js@2.110.7')
      .then((mod) => mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
      .catch(() => null);
    return supabasePromise;
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  function readTokens() {
    try { return JSON.parse(localStorage.getItem(KEY_TOKENS) || '{}'); } catch (e) { return {}; }
  }
  function saveToken(id, token) {
    const t = readTokens(); t[id] = token; localStorage.setItem(KEY_TOKENS, JSON.stringify(t));
  }
  function removeToken(id) {
    const t = readTokens(); delete t[id]; localStorage.setItem(KEY_TOKENS, JSON.stringify(t));
  }

  // 기존에 로컬에만 쌓여있던 공개글을 Supabase로 최초 1회 옮긴다(공유가 소급 적용되도록).
  async function migrateLocalPublicPosts() {
    if (localStorage.getItem(KEY_MIGRATED)) return;
    const sb = await getSupabase();
    if (!sb) return;
    const local = read(KEY_PUB);
    if (local.length) {
      for (const p of local) {
        const token = uuid();
        const { data, error } = await sb.from('board_posts').insert({
          category: p.category || 'etc', title: p.title, author: p.author || null,
          page: p.page || null, body: p.body, owner_token: token,
        }).select('id').single();
        if (!error && data) saveToken(data.id, token);
      }
      localStorage.removeItem(KEY_PUB);
    }
    localStorage.setItem(KEY_MIGRATED, '1');
  }

  // ----- 카테고리 정의 -----
  const CATS = [
    { id: 'free',     label: '자유' },
    { id: 'question', label: '질문' },
    { id: 'review',   label: '후기' },
    { id: 'tip',      label: '정보 공유' },
    { id: 'fix',      label: '수정 요청' },
    { id: 'etc',      label: '기타' },
  ];
  const CAT_MAP = CATS.reduce((m, c) => (m[c.id] = c.label, m), {});

  // ----- 레거시 마이그레이션: fb:* → board:*, feedback 글에 'fix' 카테고리 자동 할당 -----
  function migrate() {
    const moves = [
      { from: 'fb:public', to: KEY_PUB, defaultCat: 'fix' },
      { from: 'fb:secret', to: KEY_SEC, defaultCat: 'fix' },
    ];
    moves.forEach(({ from, to, defaultCat }) => {
      try {
        const oldRaw = localStorage.getItem(from);
        if (!oldRaw) return;
        const oldArr = JSON.parse(oldRaw);
        if (!Array.isArray(oldArr) || !oldArr.length) { localStorage.removeItem(from); return; }
        const cur = JSON.parse(localStorage.getItem(to) || '[]');
        const seen = new Set(cur.map((p) => p.id));
        oldArr.forEach((p) => {
          if (!p || seen.has(p.id)) return;
          if (!p.category) p.category = defaultCat;
          cur.push(p);
        });
        cur.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        localStorage.setItem(to, JSON.stringify(cur));
        localStorage.removeItem(from);
      } catch (e) { /* 빈 키 무시 */ }
    });
  }
  migrate();

  const form = document.querySelector('[data-fb-form]');
  const listPub = root.querySelector('[data-fb-list-public]');
  const listMine = root.querySelector('[data-fb-list-mine]');
  const emptyEl = root.querySelector('[data-fb-empty]');
  const tabs = root.querySelectorAll('[data-fb-tab]');
  const secretCountEl = root.querySelector('[data-fb-secret-count]');
  const catFilter = root.querySelector('[data-fb-cat-filter]');
  const modal = document.querySelector('[data-fb-modal]');
  const openBtns = document.querySelectorAll('[data-fb-open]');
  const closeBtns = document.querySelectorAll('[data-fb-close]');
  const catSelect = form?.querySelector('select[name="category"]');

  // 카테고리 드롭다운(작성 폼·필터) 채움
  if (catSelect && !catSelect.options.length) {
    CATS.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.label;
      catSelect.appendChild(o);
    });
  }
  if (catFilter && !catFilter.options.length) {
    const all = document.createElement('option');
    all.value = 'all'; all.textContent = '전체 카테고리';
    catFilter.appendChild(all);
    CATS.forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.label;
      catFilter.appendChild(o);
    });
  }

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  };
  const write = (key, arr) => localStorage.setItem(key, JSON.stringify(arr));

  // 공개글 캐시 — Supabase 사용 시 이 배열이 진실 소스. null이면 아직 첫 조회 전(로컬로 폴백).
  let publicCache = null;
  async function refreshPublicPosts() {
    const sb = await getSupabase();
    if (sb) {
      const { data, error } = await sb.from('board_posts_public').select('*')
        .order('created_at', { ascending: true }).limit(300);
      if (!error && data) {
        publicCache = data.map((r) => ({
          id: r.id, ts: new Date(r.created_at).getTime(), category: r.category,
          title: r.title, author: r.author, page: r.page, body: r.body,
        }));
      }
    } else {
      publicCache = read(KEY_PUB);
    }
    render();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function currentCatFilter() { return catFilter ? catFilter.value : 'all'; }
  function applyCat(items) {
    const c = currentCatFilter();
    return c === 'all' ? items : items.filter((p) => (p.category || 'etc') === c);
  }

  function render() {
    const pubSource = publicCache !== null ? publicCache : read(KEY_PUB);
    const pub = applyCat(pubSource);
    const sec = applyCat(read(KEY_SEC));
    if (secretCountEl) secretCountEl.textContent = sec.length;
    renderList(listPub, pub, false);
    renderList(listMine, sec, true);
    const activeTab = root.querySelector('.fb-tab.active')?.dataset.fbTab;
    const showingList = activeTab === 'mine' ? sec : pub;
    if (emptyEl) emptyEl.style.display = showingList.length ? 'none' : '';
  }

  function renderList(list, items, isMine) {
    if (!list) return;
    list.innerHTML = '';
    const tokens = readTokens();
    items.slice().reverse().forEach((p) => {
      const li = document.createElement('li');
      li.className = 'fb-item';
      const author = p.author ? escapeHtml(p.author) : '익명';
      const page = p.page ? `<span class="fb-page">${escapeHtml(p.page)}</span>` : '';
      const catLabel = CAT_MAP[p.category] || '기타';
      const catBadge = `<span class="badge badge-cat" data-cat="${p.category || 'etc'}">${catLabel}</span>`;
      const visBadge = isMine ? '<span class="badge badge-warn">비밀</span>' : '';
      // 공개글이 Supabase에서 왔으면(다른 사람 글일 수 있음) 내가 쓴 글(토큰 보유)만 삭제 버튼 노출.
      // 로컬 전용(비밀글, 또는 Supabase 미설정 폴백)은 기존처럼 항상 삭제 가능.
      const canDelete = isMine || !supabaseConfigured || !!tokens[p.id];
      const delBtn = canDelete
        ? `<button class="fb-del" data-id="${p.id}" data-mine="${isMine ? '1' : '0'}">삭제</button>` : '';
      li.innerHTML = `
        <div class="fb-item-head">
          ${catBadge}${visBadge}
          <strong class="fb-item-title">${escapeHtml(p.title)}</strong>
        </div>
        <div class="fb-item-meta">${author} · ${fmtDate(p.ts)}${page ? ' · ' + page : ''}</div>
        <div class="fb-item-body">${escapeHtml(p.body).replace(/\n/g, '<br/>')}</div>
        <div class="fb-item-foot">${delBtn}</div>
      `;
      list.appendChild(li);
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ----- 작성 폼 자동저장(임시) -----
  function saveDraft() {
    if (!form) return;
    const d = {
      title: form.title?.value || '',
      author: form.author?.value || '',
      page: form.page?.value || '',
      body: form.body?.value || '',
      category: form.category?.value || '',
      secret: !!form.secret?.checked,
    };
    if (!d.title && !d.body && !d.author) {
      localStorage.removeItem(KEY_DRAFT);
    } else {
      localStorage.setItem(KEY_DRAFT, JSON.stringify(d));
    }
  }
  function loadDraft() {
    if (!form) return;
    try {
      const d = JSON.parse(localStorage.getItem(KEY_DRAFT) || 'null');
      if (d) {
        if (form.title) form.title.value = d.title || '';
        if (form.author) form.author.value = d.author || '';
        if (form.page) form.page.value = d.page || '';
        if (form.body) form.body.value = d.body || '';
        if (form.category && d.category) form.category.value = d.category;
        if (form.secret) form.secret.checked = !!d.secret;
      } else {
        // 임시저장 없음 → 닉네임만이라도 채워준다
        const author = localStorage.getItem(KEY_AUTHOR) || '';
        if (form.author && !form.author.value) form.author.value = author;
      }
    } catch (e) {}
  }
  form?.addEventListener('input', saveDraft);
  form?.addEventListener('change', saveDraft);

  // ----- 모달 열기/닫기 -----
  function openModal() {
    if (!modal) return;
    loadDraft();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => form?.querySelector('input[name="title"]')?.focus(), 60);
  }
  function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  openBtns.forEach((b) => b.addEventListener('click', openModal));
  closeBtns.forEach((b) => b.addEventListener('click', closeModal));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) closeModal();
  });

  // ----- 글 작성 -----
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        title: form.title.value.trim(),
        author: form.author.value.trim(),
        page: form.page.value.trim(),
        body: form.body.value.trim(),
        category: form.category?.value || 'free',
        secret: form.secret.checked,
      };
      if (!data.title || !data.body) return;

      if (data.secret) {
        // 비밀글은 그대로 로컬 전용
        const entry = { id: uid(), ts: Date.now(), ...data };
        const arr = read(KEY_SEC); arr.push(entry); write(KEY_SEC, arr);
      } else {
        const sb = await getSupabase();
        let saved = false;
        if (sb) {
          const { data: row, error } = await sb.from('board_posts').insert({
            category: data.category, title: data.title, author: data.author || null,
            page: data.page || null, body: data.body, owner_token: uuid(),
          }).select('id').single();
          if (!error && row) {
            saved = true;
            await refreshPublicPosts();
          } else if (window.console) {
            console.warn('[게시판] 공개글 저장 실패 — 로컬에만 임시 저장합니다:', error);
          }
        }
        if (!saved) {
          // Supabase 미설정이거나 저장 실패 — 기존처럼 로컬에만 남긴다(오프라인 폴백)
          const entry = { id: uid(), ts: Date.now(), ...data };
          const arr = read(KEY_PUB); arr.push(entry); write(KEY_PUB, arr);
          publicCache = read(KEY_PUB);
        }
      }

      // 닉네임 기억(다음 글 자동 채움)
      if (data.author) localStorage.setItem(KEY_AUTHOR, data.author);
      // 임시저장 비움
      localStorage.removeItem(KEY_DRAFT);
      form.reset();
      // 카테고리 필터를 작성 카테고리로 맞춰서 바로 보이게
      if (catFilter) catFilter.value = data.category;
      if (data.secret) switchTab('mine');
      else switchTab('public');
      closeModal();
      render();
    });
  }

  // ----- 삭제 -----
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('.fb-del');
    if (!btn) return;
    const id = btn.dataset.id;
    const isMine = btn.dataset.mine === '1';
    if (!confirm('이 글을 삭제할까요?')) return;

    if (isMine) {
      const arr = read(KEY_SEC).filter((p) => p.id !== id);
      write(KEY_SEC, arr);
      render();
      return;
    }

    const sb = await getSupabase();
    if (sb) {
      const token = readTokens()[id];
      if (!token) return;   // 삭제 버튼이 애초에 안 보였겠지만 방어적으로 한 번 더 확인
      const { data: ok } = await sb.rpc('delete_board_post', { post_id: id, token });
      if (ok) { removeToken(id); await refreshPublicPosts(); }
    } else {
      const arr = read(KEY_PUB).filter((p) => p.id !== id);
      write(KEY_PUB, arr);
      publicCache = arr;
      render();
    }
  });

  // ----- 탭 -----
  function switchTab(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.fbTab === name));
    if (listPub) listPub.hidden = name !== 'public';
    if (listMine) listMine.hidden = name !== 'mine';
    render();
  }
  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.fbTab)));

  // ----- 카테고리 필터 -----
  catFilter?.addEventListener('change', render);

  // URL ?cat=xxx 로 초기 카테고리 필터 지정 (예: feedback.html → board.html?cat=fix)
  try {
    const params = new URLSearchParams(location.search);
    const c = params.get('cat');
    if (c && catFilter && CATS.some((x) => x.id === c)) catFilter.value = c;
  } catch (e) {}

  render();   // 즉시 1차 렌더(로컬 폴백 기준) — Supabase 조회 완료 전에도 화면이 비지 않게
  migrateLocalPublicPosts().then(refreshPublicPosts);
})();
