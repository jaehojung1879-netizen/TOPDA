# 게시판 공유 백엔드 (Supabase)

게시판 글을 Supabase에 저장해 공유합니다.

- **공개글**: 모든 방문자에게 보입니다.
- **비밀글**: ① 작성자 본인(작성한 브라우저의 토큰 기준)과 ② 운영자(관리 키 보유)만 볼 수 있습니다.
- Supabase 미설정 시(시크릿 미등록) 게시판은 자동으로 로컬(localStorage) 전용으로 폴백합니다.

## 1) Supabase 프로젝트 생성
1. https://supabase.com → 무료(Free) 플랜으로 새 프로젝트 생성
2. 프로젝트 설정 → API 메뉴에서 **Project URL**과 **anon public key**를 복사
   (anon 키는 공개 노출을 전제로 설계된 키입니다 — 실제 접근 제어는 아래 RLS·RPC가 담당)

## 2) 테이블·정책 생성 (SQL Editor에서 실행)

> 이전 버전(secret 컬럼 없는 스키마)을 이미 실행했다면 맨 아래 '기존 스키마 마이그레이션'만 실행하세요.

```sql
-- 게시글 테이블. 공개글·비밀글 모두 저장하며 secret 플래그로 구분한다.
-- owner_token은 작성자만 아는 값 — 본인 글 조회(비밀글)·삭제 인증에 쓰인다.
create table board_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null default 'etc',
  title text not null,
  author text,
  page text,
  body text not null,
  secret boolean not null default false,
  owner_token uuid not null
);

alter table board_posts enable row level security;

-- 누구나 새 글을 쓸 수 있다(게시판 취지상 로그인 없이 작성 가능해야 함).
create policy "anyone can insert" on board_posts
  for insert to anon
  with check (true);

-- 테이블 자체에는 select/delete 정책을 만들지 않는다 — 아래 뷰·RPC로만 노출한다.
-- (owner_token·비밀글이 select로 그대로 노출되면 안 되므로)

-- 공개 목록 조회용 뷰: 비밀글과 owner_token 컬럼을 제외한다.
create view board_posts_public
  with (security_invoker = false) as
  select id, created_at, category, title, author, page, body
  from board_posts
  where not secret
  order by created_at desc;

grant select on board_posts_public to anon;

-- 작성자 본인 글 조회(비밀글 포함): 브라우저에 저장된 owner_token 목록으로 조회.
create or replace function get_posts_by_tokens(tokens uuid[])
returns table (id uuid, created_at timestamptz, category text, title text,
               author text, page text, body text, secret boolean)
language sql
security definer
set search_path = public
as $$
  select id, created_at, category, title, author, page, body, secret
  from board_posts
  where owner_token = any(tokens)
  order by created_at;
$$;

grant execute on function get_posts_by_tokens(uuid[]) to anon;

-- 운영자 관리 키 등록: 아래 '원하는-긴-비밀값'을 본인만 아는 값으로 바꿔 실행.
-- (이 값이 곧 운영자 열람 비밀번호가 된다 — 게시판 URL에 ?admin=값 으로 입력)
alter database postgres set app.board_admin_key = '원하는-긴-비밀값';

-- 운영자 전용: 모든 비밀글 조회 (관리 키 일치 시에만).
create or replace function admin_list_secret_posts(admin_key text)
returns table (id uuid, created_at timestamptz, category text, title text,
               author text, page text, body text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if admin_key is null or admin_key = ''
     or admin_key is distinct from current_setting('app.board_admin_key', true) then
    raise exception 'invalid admin key';
  end if;
  return query
    select p.id, p.created_at, p.category, p.title, p.author, p.page, p.body
    from board_posts p where p.secret order by p.created_at desc;
end;
$$;

grant execute on function admin_list_secret_posts(text) to anon;

-- 본인 글 삭제: owner_token이 일치할 때만 삭제되는 RPC.
create or replace function delete_board_post(post_id uuid, token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  delete from board_posts where id = post_id and owner_token = token;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

grant execute on function delete_board_post(uuid, uuid) to anon;
```

### 기존 스키마 마이그레이션 (이전 버전 SQL을 이미 실행한 경우만)

```sql
alter table board_posts add column secret boolean not null default false;
drop view board_posts_public;
create view board_posts_public with (security_invoker = false) as
  select id, created_at, category, title, author, page, body
  from board_posts where not secret order by created_at desc;
grant select on board_posts_public to anon;
-- 위 본문 SQL에서 get_posts_by_tokens / admin_list_secret_posts /
-- alter database ... app.board_admin_key 부분을 이어서 실행
```

## 3) GitHub Secrets 등록
`Settings → Secrets and variables → Actions → New repository secret`

| Secret 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 1)에서 복사한 Project URL |
| `SUPABASE_ANON_KEY` | 1)에서 복사한 anon public key |

`deploy-pages.yml`이 배포 시 `site/` 전체에서 `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__`
플레이스홀더를 이 값으로 치환합니다.

## 4) 운영자 비밀글 열람 방법
1. 위 SQL에서 `app.board_admin_key`로 등록한 값을 기억해 둡니다.
2. 게시판에 `https://topda.kr/board.html?admin=등록한값` 으로 한 번 접속하면
   그 브라우저에 관리 키가 저장되고, '내 비밀글' 탭에서 **모든 사용자의 비밀글**이 보입니다.
3. 해제하려면 `?admin=off` 로 접속합니다.

## 5) 스팸 방지 — 알려진 한계
현재 설계는 로그인 없이 누구나 글을 쓸 수 있어(기존 UX 유지), 서버 쪽 스팸 필터링은 없습니다.
악용이 심해지면 Supabase 대시보드에서 개별 글 삭제, 또는 `anyone can insert` 정책에
Cloudflare Turnstile 검증 등을 추가하는 방안을 검토하세요.
