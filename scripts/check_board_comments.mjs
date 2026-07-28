import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
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
    assert.match(html, new RegExp(`data-comment-key="${type}:${basename(filename, '.html')}"`));
    assert.equal((html.match(/assets\/comments\.js/g) || []).length, 1);
    assert.equal((html.match(/assets\/supabase-client\.js/g) || []).length, 1);
    assert.ok(html.indexOf('data-comments') < html.indexOf('<footer'), '댓글은 footer 앞에 있어야 합니다.');
    commentPages.push(join(directory, filename).replaceAll('\\', '/'));
  }
}
assert.equal(commentPages.length, 68);

const dashboard = read('site/calculators/total-cost-dashboard.html');
assert.match(dashboard, /data-comment-type="page"/);
assert.match(dashboard, /data-comment-key="calculator:total-cost-dashboard"/);
assert.match(dashboard, /data-comment-title="부동산 종합 계산 대시보드"/);

for (const filename of readdirSync(resolve(root, 'site/en'), { recursive: true })) {
  if (!String(filename).endsWith('.html')) continue;
  assert.doesNotMatch(read(join('site/en', String(filename))), /data-comments/);
}

assert.match(styles, /@media \(max-width: 420px\)/);
assert.match(styles, /@media \(max-width: 767px\)/);
assert.match(styles, /overflow-x: hidden/);
assert.match(styles, /\.fb-item-preview[\s\S]*-webkit-line-clamp: 2/);
assert.match(styles, /\.board-editor textarea[\s\S]*min-height: 320px/);

const numstat = execFileSync('git', ['diff', '--numstat', '--', ...commentPages], {
  cwd: root,
  encoding: 'utf8',
});
for (const line of numstat.trim().split(/\r?\n/).filter(Boolean)) {
  const [added, deleted] = line.split(/\s+/);
  assert.equal(Number(added), 4, `${line}: 댓글 페이지에는 마운트 4줄만 추가되어야 합니다.`);
  assert.equal(Number(deleted), 0, `${line}: 기존 콘텐츠/계산 로직이 삭제되면 안 됩니다.`);
}

console.log(`게시판·댓글 계약 검사 통과 (댓글 상세 페이지 ${commentPages.length}개)`);
