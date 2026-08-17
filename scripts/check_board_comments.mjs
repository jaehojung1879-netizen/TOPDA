import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const board = read('site/board.html');
const boardWrite = read('site/board-write.html');
const boardPost = read('site/board-post.html');
const boardJs = read('site/assets/board.js');
const commentsJs = read('site/assets/comments.js');
const supabaseJs = read('site/assets/supabase-client.js');
const styles = read('site/assets/styles.css');

assert.doesNotMatch(board, /data-fb-modal|fb-modal-panel|data-fb-open/);
assert.match(board, /href="board-write\.html"/);
assert.match(board, /data-board-list/);
assert.match(boardWrite, /data-board-write/);
assert.match(boardWrite, /rows="14"/);
assert.match(boardWrite, /maxlength="2000"/);
assert.match(boardPost, /data-board-post/);
assert.match(boardPost, /data-board-comments-slot/);
assert.match(read('site/feedback.html'), /board\.html\?cat=fix/);

for (const source of [boardJs, commentsJs]) {
  assert.doesNotMatch(source, /\.insert\([\s\S]{0,500}?\.select\(/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /\.textContent\s*=/);
}
assert.match(boardJs, /board:migrated_to_supabase/);
assert.match(boardJs, /if \(allMoved\) localStorage\.setItem\(KEY_MIGRATED/);
assert.match(boardJs, /서버에 글을 저장하지 못했습니다/);
assert.match(commentsJs, /\.eq\('target_type', type\)/);
assert.match(commentsJs, /\.eq\('target_key', key\)/);
assert.match(commentsJs, /\.limit\(50\)/);
assert.match(commentsJs, /comments:owner_tokens/);
assert.doesNotMatch(commentsJs, /comments:(?:public|local|cache)/);
assert.match(supabaseJs, /__SUPABASE_URL__/);
assert.match(supabaseJs, /__SUPABASE_ANON_KEY__/);
assert.doesNotMatch(supabaseJs, /service_role|sb_secret/i);

const groups = [
  ['site/calculators', 'calculator', ['index.html']],
  ['site/checklists', 'checklist', ['index.html']],
  ['site/interior', 'interior', ['index.html']],
  ['site/posts', 'guide', ['index.html']],
  ['site/loan', 'loan', []],
];
const commentPages = [];
for (const [directory, type, excluded] of groups) {
  for (const filename of readdirSync(resolve(root, directory)).filter((name) => name.endsWith('.html'))) {
    const html = read(join(directory, filename));
    if (excluded.includes(filename)) {
      assert.doesNotMatch(html, /data-comments/);
      continue;
    }
    assert.match(html, /data-comments/, `${directory}/${filename} 댓글 마운트 누락`);
    const expectedKey = directory === 'site/loan' && filename === 'bank-limits.html'
      ? 'guide:loan-bank-limits'
      : `${type}:${basename(filename, '.html')}`;
    assert.match(html, new RegExp(`data-comment-key="${expectedKey}"`));
    assert.equal((html.match(/assets\/comments\.js/g) || []).length, 1);
    assert.equal((html.match(/assets\/supabase-client\.js/g) || []).length, 1);
    assert.ok(html.indexOf('data-comments') < html.indexOf('<footer'), '댓글은 footer 앞에 있어야 합니다.');
    commentPages.push(join(directory, filename).replaceAll('\\', '/'));
  }
}
assert.ok(commentPages.length >= 68, '댓글 상세 페이지가 예상보다 줄었습니다.');

const dashboard = read('site/calculators/total-cost-dashboard.html');
assert.match(dashboard, /data-comment-type="page"/);
assert.match(dashboard, /data-comment-key="calculator:total-cost-dashboard"/);
assert.match(dashboard, /data-comment-title="부동산 종합 계산기"/);

for (const filename of readdirSync(resolve(root, 'site/en'), { recursive: true })) {
  if (!String(filename).endsWith('.html')) continue;
  assert.doesNotMatch(read(join('site/en', String(filename))), /data-comments/);
}

assert.match(styles, /@media \(max-width: 420px\)/);
assert.match(styles, /@media \(max-width: 767px\)/);
assert.match(styles, /overflow-x: hidden/);
assert.match(styles, /\.bl-excerpt[\s\S]*-webkit-line-clamp: 2/);
assert.match(styles, /\.board-editor textarea[\s\S]*min-height: 320px/);

// ── 2026-07 게시판 고도화 계약 ─────────────────────────────────────────────
// 글 수정: 작성자 토큰 경로와 운영자 경로가 모두 살아 있어야 한다.
assert.match(boardJs, /rpc\('update_board_post'/);
assert.match(boardJs, /rpc\('admin_update_board_post'/);
assert.match(boardJs, /rpc\('delete_board_post'/);
assert.match(boardJs, /rpc\('admin_delete_board_post'/);
assert.match(boardJs, /deleteButton\.hidden = !canManage/);
assert.match(read('site/board-post.html'), /data-board-edit/);
assert.match(read('site/board-post.html'), /data-board-delete/);
assert.match(boardWrite, /data-editor-host/);
assert.match(boardWrite, /data-editor-preview/);

// 본문 서식은 DOM 노드로만 만든다 — 링크 주소는 safeUrl을 통과해야 한다.
assert.match(boardJs, /function safeUrl/);
assert.match(boardJs, /function renderRichText/);
assert.doesNotMatch(boardJs, /insertAdjacentHTML|outerHTML\s*=|document\.write/);
assert.doesNotMatch(commentsJs, /insertAdjacentHTML|outerHTML\s*=|document\.write/);

// 운영자 모드: board.html에서 키를 넣고 뺄 수 있어야 한다(URL 파라미터 전용 금지).
assert.match(board, /data-admin-bar/);
assert.match(board, /data-admin-input/);
assert.match(boardJs, /rpc\('verify_admin_key'/);

// 비밀글은 여전히 공개 목록·공개 뷰로 새어 나가면 안 된다.
assert.match(boardJs, /board_posts_public/);
assert.doesNotMatch(boardJs, /\.from\('board_posts'\)\s*\.select/);

// 댓글은 한 줄 입력 UI — 옛 설명문 블록이 되살아나지 않았는지 본다.
assert.doesNotMatch(commentsJs, /이 페이지에 한마디|comments-heading/);
assert.match(commentsJs, /cmt-form/);
assert.match(commentsJs, /rpc\('delete_content_comment'/);
assert.match(commentsJs, /rpc\('admin_delete_content_comment'/);
assert.match(styles, /\.cmt-form/);

// 댓글 마운트는 '한 덩어리'여야 한다.
//
// 원래 이 자리에는 `git diff --numstat` 으로 "댓글 페이지는 정확히 4줄만 늘었는가"를
// 보는 검사가 있었다. 댓글을 전 페이지에 심던 그 커밋에서만 성립하는 조건이라,
// 이후 해당 페이지를 한 글자라도 고치면 무조건 실패했다(작업 중에는 항상 빨간불).
// 지키려던 것은 "마운트가 흩어지거나 중복되지 않는다" 였으므로, 파일 자체를 보고
// 그 조건을 확인하도록 바꾼다. 커밋 여부와 무관하게 언제나 성립한다.
for (const path of commentPages) {
  const html = read(path);
  const section = html.match(/<section[^>]*class="content-comments"[^>]*><\/section>/g) || [];
  assert.equal(section.length, 1, `${path}: 댓글 마운트 <section>은 정확히 1개여야 합니다.`);

  const sectionAt = html.indexOf(section[0]);
  const supabaseAt = html.indexOf('assets/supabase-client.js');
  const commentsAt = html.indexOf('assets/comments.js');
  const footerAt = html.indexOf('<footer');

  assert.ok(sectionAt < supabaseAt, `${path}: supabase-client.js는 댓글 마운트 뒤에 와야 합니다.`);
  assert.ok(supabaseAt < commentsAt, `${path}: comments.js는 supabase-client.js 뒤에 와야 합니다.`);
  assert.ok(commentsAt < footerAt, `${path}: 댓글 스크립트는 footer 앞에 있어야 합니다.`);

  // 마운트 3줄 사이에 다른 내용이 끼어들지 않았는지(=한 덩어리인지) 확인한다.
  const block = html.slice(sectionAt, commentsAt);
  assert.equal(
    block.split('\n').filter((line) => line.trim() && !/^<(?:section|script)/.test(line.trim())).length,
    0,
    `${path}: 댓글 마운트 블록 사이에 다른 마크업이 끼어 있습니다.`,
  );
}

console.log(`게시판·댓글 계약 검사 통과 (댓글 상세 페이지 ${commentPages.length}개)`);
