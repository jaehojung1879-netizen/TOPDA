// ===== Feedback board (client-side only) =====
// 데이터 저장:
//  - 공개글: localStorage 'fb:public' (해당 기기 내 표시)
//  - 비밀글: localStorage 'fb:secret' (작성한 브라우저에서만 표시)
// UI: 게시판 목록을 먼저 보여주고, 우측 하단 FAB로 작성 모달을 호출합니다.
(function () {
  const root = document.querySelector('[data-fb-app]');
  if (!root) return;

  const KEY_PUB = 'fb:public';
  const KEY_SEC = 'fb:secret';

  const form = document.querySelector('[data-fb-form]');
  const listPub = root.querySelector('[data-fb-list-public]');
  const listMine = root.querySelector('[data-fb-list-mine]');
  const emptyEl = root.querySelector('[data-fb-empty]');
  const tabs = root.querySelectorAll('[data-fb-tab]');
  const secretCountEl = root.querySelector('[data-fb-secret-count]');
  const modal = document.querySelector('[data-fb-modal]');
  const openBtns = document.querySelectorAll('[data-fb-open]');
  const closeBtns = document.querySelectorAll('[data-fb-close]');

  const read = (key) => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  };
  const write = (key, arr) => localStorage.setItem(key, JSON.stringify(arr));

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

  function render() {
    const pub = read(KEY_PUB);
    const sec = read(KEY_SEC);
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
    items.slice().reverse().forEach((p) => {
      const li = document.createElement('li');
      li.className = 'fb-item';
      const author = p.author ? escapeHtml(p.author) : '익명';
      const page = p.page ? `<span class="fb-page">${escapeHtml(p.page)}</span>` : '';
      const badge = isMine ? '<span class="badge badge-warn">비밀</span>' : '<span class="badge">공개</span>';
      li.innerHTML = `
        <div class="fb-item-head">
          ${badge}
          <strong class="fb-item-title">${escapeHtml(p.title)}</strong>
        </div>
        <div class="fb-item-meta">${author} · ${fmtDate(p.ts)}${page ? ' · ' + page : ''}</div>
        <div class="fb-item-body">${escapeHtml(p.body).replace(/\n/g, '<br/>')}</div>
        <div class="fb-item-foot">
          <button class="fb-del" data-id="${p.id}" data-mine="${isMine ? '1' : '0'}">삭제</button>
        </div>
      `;
      list.appendChild(li);
    });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ----- 모달 열기/닫기 -----
  function openModal() {
    if (!modal) return;
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
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = {
        title: form.title.value.trim(),
        author: form.author.value.trim(),
        page: form.page.value.trim(),
        body: form.body.value.trim(),
        secret: form.secret.checked,
      };
      if (!data.title || !data.body) return;
      const entry = { id: uid(), ts: Date.now(), ...data };
      const key = data.secret ? KEY_SEC : KEY_PUB;
      const arr = read(key);
      arr.push(entry);
      write(key, arr);
      form.reset();
      if (data.secret) switchTab('mine');
      else switchTab('public');
      closeModal();
      render();
    });
  }

  // ----- 삭제 -----
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.fb-del');
    if (!btn) return;
    const id = btn.dataset.id;
    const isMine = btn.dataset.mine === '1';
    if (!confirm('이 글을 삭제할까요?')) return;
    const key = isMine ? KEY_SEC : KEY_PUB;
    const arr = read(key).filter((p) => p.id !== id);
    write(key, arr);
    render();
  });

  // ----- 탭 -----
  function switchTab(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.fbTab === name));
    if (listPub) listPub.hidden = name !== 'public';
    if (listMine) listMine.hidden = name !== 'mine';
    render();
  }
  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.fbTab)));

  render();
})();
