-- 톺다 게시판 — 글 수정·삭제 기능 + 운영자 키 확인
-- Supabase SQL Editor에 이 파일 전체를 붙여넣고 한 번 실행한다.
-- 여러 번 실행해도 안전하게 작성했다(idempotent).
--
-- 이 스크립트가 하는 일
--   1) board_posts 에 updated_at 컬럼 추가 (수정 시각)
--   2) board_posts_public 뷰를 updated_at 포함해 재생성
--   3) update_board_post()        — 작성자 토큰으로 본인 글 수정
--   4) admin_update_board_post()  — Vault 운영자 키로 수정
--   5) admin_delete_board_post()  — Vault 운영자 키로 삭제
--   6) verify_admin_key()         — 운영자 키가 맞는지만 확인(목록을 받아오지 않음)
--
-- 하지 않는 일 (기존 운영 데이터 보호)
--   · board_posts 테이블은 절대 drop/재생성하지 않는다. 컬럼만 추가한다.
--   · get_posts_by_tokens(), admin_list_secret_posts(), delete_board_post() 는
--     손대지 않는다. 반환 타입을 바꾸려면 drop 이 필요한데, 그럴 이유가 없다.
--     (그래서 비밀글 목록에는 '수정됨' 표시가 뜨지 않는다 — 상세 화면에서는 보인다.)

-- ---------------------------------------------------------------------------
-- 1) 수정 시각 컬럼
-- ---------------------------------------------------------------------------
alter table public.board_posts
  add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) 공개 조회 뷰 재생성
--
-- create or replace view 는 컬럼을 '뒤에 덧붙이는' 것만 허용해서, 기존 뷰의
-- 컬럼 순서가 조금이라도 다르면 실패한다. 뷰에는 의존 객체가 없으므로
-- (프론트엔드가 PostgREST 로 직접 조회한다) drop 후 다시 만드는 편이 확실하다.
-- owner_token 과 비밀글을 제외하는 기존 경계는 그대로 유지한다.
-- ---------------------------------------------------------------------------
drop view if exists public.board_posts_public;

create view public.board_posts_public
with (security_invoker = false) as
  select id, created_at, category, title, author, page, body, updated_at
  from public.board_posts
  where not secret;

revoke all on table public.board_posts_public from anon, authenticated;
grant select on table public.board_posts_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) 작성자 수정 — 브라우저가 가진 owner_token 이 일치할 때만
--
-- delete_board_post() 와 같은 규칙이다. 원본 테이블에는 UPDATE 정책을 두지 않고
-- 이 SECURITY DEFINER 함수만 통과시킨다. secret(공개 범위)은 여기서 바꾸지
-- 않는다 — 공개글을 비밀글로 되돌리면 이미 본 사람이 있는데도 숨겨진 것처럼
-- 보이고, 반대 방향은 사고가 크다. 공개 범위를 바꾸려면 지우고 다시 쓴다.
-- ---------------------------------------------------------------------------
create or replace function public.update_board_post(
  post_id uuid,
  token uuid,
  new_category text,
  new_title text,
  new_author text,
  new_page text,
  new_body text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if post_id is null or token is null then
    return false;
  end if;

  if new_title is null or btrim(new_title) = '' or char_length(new_title) > 80 then
    raise exception 'invalid title';
  end if;
  if new_body is null or btrim(new_body) = '' or char_length(new_body) > 4000 then
    raise exception 'invalid body';
  end if;
  if new_author is not null and char_length(new_author) > 20 then
    raise exception 'invalid author';
  end if;
  if new_page is not null and char_length(new_page) > 120 then
    raise exception 'invalid page';
  end if;
  if new_category is null or char_length(new_category) > 20 then
    raise exception 'invalid category';
  end if;

  update public.board_posts
     set category   = new_category,
         title      = btrim(new_title),
         author     = nullif(btrim(coalesce(new_author, '')), ''),
         page       = nullif(btrim(coalesce(new_page, '')), ''),
         body       = btrim(new_body),
         updated_at = now()
   where id = post_id
     and owner_token = token;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.update_board_post(uuid, uuid, text, text, text, text, text) from public;
grant execute on function public.update_board_post(uuid, uuid, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) 운영자 수정 — Vault 의 board_admin_key 와 일치할 때만
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_board_post(
  post_id uuid,
  admin_key text,
  new_category text,
  new_title text,
  new_author text,
  new_page text,
  new_body text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_key text;
  affected integer;
begin
  select decrypted_secret
    into expected_key
  from vault.decrypted_secrets
  where name = 'board_admin_key'
  order by created_at desc
  limit 1;

  if expected_key is null
     or admin_key is null
     or admin_key = ''
     or admin_key is distinct from expected_key then
    raise exception 'invalid admin key';
  end if;

  if new_title is null or btrim(new_title) = '' or char_length(new_title) > 80 then
    raise exception 'invalid title';
  end if;
  if new_body is null or btrim(new_body) = '' or char_length(new_body) > 4000 then
    raise exception 'invalid body';
  end if;

  update public.board_posts
     set category   = new_category,
         title      = btrim(new_title),
         author     = nullif(btrim(coalesce(new_author, '')), ''),
         page       = nullif(btrim(coalesce(new_page, '')), ''),
         body       = btrim(new_body),
         updated_at = now()
   where id = post_id;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.admin_update_board_post(uuid, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_board_post(uuid, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) 운영자 삭제 — Vault 의 board_admin_key 와 일치할 때만
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_board_post(
  post_id uuid,
  admin_key text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_key text;
  affected integer;
begin
  select decrypted_secret
    into expected_key
  from vault.decrypted_secrets
  where name = 'board_admin_key'
  order by created_at desc
  limit 1;

  if expected_key is null
     or admin_key is null
     or admin_key = ''
     or admin_key is distinct from expected_key then
    raise exception 'invalid admin key';
  end if;

  delete from public.board_posts where id = post_id;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.admin_delete_board_post(uuid, text) from public;
grant execute on function public.admin_delete_board_post(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) 운영자 키 확인만 — 맞으면 true, 틀리면 예외
--
-- 지금까지는 키가 맞는지 확인하려면 admin_list_secret_posts() 로 비밀글을
-- 통째로 받아오는 수밖에 없었다. 운영자 모드 UI 가 "키가 맞는지"만 묻고 싶을 때
-- 쓰는 가벼운 함수다.
-- ---------------------------------------------------------------------------
create or replace function public.verify_admin_key(admin_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_key text;
begin
  select decrypted_secret
    into expected_key
  from vault.decrypted_secrets
  where name = 'board_admin_key'
  order by created_at desc
  limit 1;

  if expected_key is null
     or admin_key is null
     or admin_key = ''
     or admin_key is distinct from expected_key then
    raise exception 'invalid admin key';
  end if;

  return true;
end;
$$;

revoke all on function public.verify_admin_key(text) from public;
grant execute on function public.verify_admin_key(text) to anon, authenticated;

-- PostgREST 스키마 캐시 갱신 (새 함수·뷰가 즉시 API 에 뜨도록)
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 설치 확인 — 아래 한 줄을 실행해 모두 채워져 있으면 성공이다.
-- ---------------------------------------------------------------------------
select
  to_regclass('public.board_posts')            as board_table,
  to_regclass('public.board_posts_public')     as board_public_view,
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_posts'
      and column_name = 'updated_at')          as updated_at_column,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('update_board_post', 'admin_update_board_post',
                        'admin_delete_board_post', 'verify_admin_key'))
                                               as new_rpc_count;
