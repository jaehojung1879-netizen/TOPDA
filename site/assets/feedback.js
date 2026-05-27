// ===== Feedback board (client-side only) =====
// 데이터 저장 위치
//  - 공개글: localStorage 'fb:public' (해당 기기 내 모든 방문자에게 노출)
//  - 비밀글: localStorage 'fb:secret' (작성한 브라우저에서만 노출)
// 운영자에게 직접 전달은 mailto 링크 사용.
(function () {
  const root = document.querySelector('[data-fb-app]');
  if (!root) return;

  const OWNER_EMAIL = 'jaeho.jung1879@gmail.com';
  const KEY_PUB = 'fb:public';
  const KEY_SEC = 'fb:secret';

  const form = root.querySelector('[data-fb-form]');
  const listPub = root.querySelector('[data-fb-list-public]');
  const listMine = root.querySelector('[data-fb-list-mine]');
  const emptyEl = root.querySelector('[data-fb-empty]');
  const tabs = root.querySelectorAll('[data-fb-tab]');
  const secretCountEl = root.querySelector('[data-fb-secret-count]');
  const emailBtns = root.querySelectorAll('[data-fb-email]');

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

  function buildMailto(data) {
    const subject = (data.secret ? '[비밀] ' : '') + '[톺다 수정요청] ' + (data.title || '제목없음');
    const lines = [
      '제목: ' + (data.title || ''),
      '이름: ' + (data.author || '익명'),
      '관련 페이지: ' + (data.page || ''),
      '비밀글 요청: ' + (data.secret ? '예' : '아니오'),
      '',
      '----- 내용 -----',
      data.body || '',
    ];
    return `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  let lastDraft = { title: '', author: '', page: '', body: '', secret: false };
  function readForm() {
    return {
      title: form.title.value.trim(),
      author: form.author.value.trim(),
      page: form.page.value.trim(),
      body: form.body.value.trim(),
      secret: form.secret.checked,
    };
  }
  function refreshMailLinks() {
    const d = lastDraft.title || lastDraft.body ? lastDraft : readForm();
    const href = buildMailto(d);
    emailBtns.forEach((a) => a.setAttribute('href', href));
  }

  form.addEventListener('input', () => {
    lastDraft = readForm();
    refreshMailLinks();
  });
  refreshMailLinks();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = readForm();
    if (!data.title || !data.body) return;
    const entry = { id: uid(), ts: Date.now(), ...data };
    const key = data.secret ? KEY_SEC : KEY_PUB;
    const arr = read(key);
    arr.push(entry);
    write(key, arr);
    form.reset();
    lastDraft = { title: '', author: '', page: '', body: '', secret: false };
    refreshMailLinks();
    // 비밀글이면 자동으로 내 비밀글 탭으로
    if (data.secret) switchTab('mine');
    render();
  });

  // 삭제
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

  // 탭
  function switchTab(name) {
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.fbTab === name));
    if (listPub) listPub.hidden = name !== 'public';
    if (listMine) listMine.hidden = name !== 'mine';
    render();
  }
  tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.fbTab)));

  render();
})();
