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

## 5) 지금 상태 점검 (SQL Editor에 붙여넣기)

무엇이 빠졌는지 한 번에 확인합니다.

```sql
-- ① 무엇이 만들어져 있나 (테이블·뷰 not null, 정책 1개, 함수 3개가 정상)
select
  to_regclass('public.board_posts')        as 테이블,
  to_regclass('public.board_posts_public') as 공개뷰,
  (select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'board_posts') as 정책수,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in
       ('get_posts_by_tokens', 'admin_list_secret_posts', 'delete_board_post')) as 함수수;

-- ② anon 권한 (board_posts에 INSERT, board_posts_public에 SELECT가 있어야 함)
select table_name, string_agg(privilege_type, ',' order by privilege_type) as 권한
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('board_posts', 'board_posts_public')
group by table_name;

-- ③ 실제로 서버에 저장된 글
select count(*) filter (where not secret) as 공개글,
       count(*) filter (where secret)     as 비밀글,
       max(created_at)                    as 마지막_글
from board_posts;

-- ④ 운영자 관리 키
select coalesce(current_setting('app.board_admin_key', true), '(미설정)') as 관리키;
```

**뷰·함수를 방금 만들었다면 반드시 실행**하세요. PostgREST가 스키마를 캐시하고 있어,
새로 만든 뷰·함수가 API에서 404(`PGRST205`)로 보일 수 있습니다.

```sql
notify pgrst, 'reload schema';
```

④가 `(미설정)`인데 SQL은 실행했다면, `alter database ... set`은 **새 세션부터** 적용되기
때문입니다. 프로젝트를 재시작하거나 잠시 뒤 다시 확인하세요.

에러 코드로도 원인을 좁힐 수 있습니다 (Dashboard → Logs → API Gateway).

| 코드 | 뜻 | 조치 |
|---|---|---|
| `PGRST205` | 뷰·함수를 API가 아직 모름 | 위 `notify pgrst, 'reload schema'` |
| `PGRST116` | 0행인데 단일 행을 요구함 | insert에 `.select()`를 붙이지 말 것(아래 참고) |
| `42501` | 권한/RLS 거부 | 2)의 정책·grant 재실행 |

## 6) 글이 사라지거나 남의 글이 안 보일 때

증상별로 원인이 다릅니다. 게시판 상단 안내 문구가 어느 상태인지 알려줍니다.

| 게시판 상단 안내 | 뜻 | 할 일 |
|---|---|---|
| "공유 저장소가 아직 연결되지 않아…" | 배포에 시크릿이 주입되지 않음 → **브라우저 안에만 저장** | 위 3) 시크릿 등록 후 재배포 |
| "게시판 서버에 연결하지 못했습니다" | 시크릿은 있으나 Supabase 클라이언트 로딩 실패 | 네트워크·차단 확인 |
| "글 목록을 불러오지 못했습니다" | `board_posts_public` 뷰 조회 실패 | 2)의 뷰·grant가 실행됐는지 확인 |
| 안내 없음 | 서버 저장 정상 | — |

시크릿이 없으면 글은 `localStorage`에만 남습니다. 이때는 브라우저·기기가 다르면 서로
글이 보이지 않고(`topda.kr`와 `www.topda.kr`도 별개 저장소입니다), 브라우저 저장소를
비우면 글도 사라집니다. **공유 게시판으로 쓰려면 3)의 시크릿 등록이 필수입니다.**

배포 로그의 `Inject Supabase config` 스텝에서 어느 쪽인지 바로 확인할 수 있습니다
("Supabase 설정 주입됨" / "…미설정 — 게시판은 로컬(localStorage) 전용으로 동작").

### 스키마상 주의 — insert에 `.select()`를 붙이지 말 것
`board_posts`에는 의도적으로 select 정책이 없습니다(owner_token·비밀글 노출 방지).
그래서 저장 직후 행을 돌려받으려 하면(`.insert(...).select()`) PostgREST가 0행을
반환하면서 **요청 전체를 롤백** — 스키마는 정상인데 글쓰기가 전부 실패합니다.
`feedback.js`는 id를 클라이언트에서 만들어 넣어 읽기 자체를 없앴습니다.

## 7) 스팸 방지 — 알려진 한계
현재 설계는 로그인 없이 누구나 글을 쓸 수 있어(기존 UX 유지), 서버 쪽 스팸 필터링은 없습니다.
악용이 심해지면 Supabase 대시보드에서 개별 글 삭제, 또는 `anyone can insert` 정책에
Cloudflare Turnstile 검증 등을 추가하는 방안을 검토하세요.
