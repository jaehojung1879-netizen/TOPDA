-- 톺다 공통 콘텐츠 댓글
-- Supabase SQL Editor에서 한 번에 실행할 수 있으며, 다시 실행해도 안전하게 작성했다.
-- 실제 관리 키는 이 파일에 넣지 않는다. Vault의 board_admin_key를 재사용한다.

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  target_type text not null,
  target_key text not null,
  target_title text,
  author text,
  body text not null,
  owner_token uuid not null,
  constraint content_comments_target_type_length
    check (char_length(target_type) between 1 and 40),
  constraint content_comments_target_key_length
    check (char_length(target_key) between 1 and 200),
  constraint content_comments_target_title_length
    check (target_title is null or char_length(target_title) <= 160),
  constraint content_comments_author_length
    check (author is null or char_length(author) <= 20),
  constraint content_comments_body_length
    check (char_length(btrim(body)) between 1 and 1000)
);

alter table public.content_comments enable row level security;

drop policy if exists "content comments anyone can insert" on public.content_comments;
create policy "content comments anyone can insert"
  on public.content_comments
  for insert
  to anon, authenticated
  with check (
    char_length(target_type) between 1 and 40
    and char_length(target_key) between 1 and 200
    and (target_title is null or char_length(target_title) <= 160)
    and (author is null or char_length(author) <= 20)
    and char_length(btrim(body)) between 1 and 1000
  );

-- 원본 테이블에는 SELECT/DELETE 정책을 두지 않는다.
-- owner_token은 공개 뷰에서 제외하고, 삭제는 아래 SECURITY DEFINER RPC만 사용한다.
revoke all on table public.content_comments from anon, authenticated;
grant insert on table public.content_comments to anon, authenticated;

create or replace view public.content_comments_public
with (security_invoker = false) as
  select id, created_at, target_type, target_key, target_title, author, body
  from public.content_comments;

revoke all on table public.content_comments_public from anon, authenticated;
grant select on table public.content_comments_public to anon, authenticated;

create index if not exists content_comments_target_created_idx
  on public.content_comments (target_type, target_key, created_at);

create index if not exists content_comments_created_idx
  on public.content_comments (created_at desc);

-- 작성자 삭제: 브라우저가 보유한 owner_token이 일치할 때만 삭제한다.
create or replace function public.delete_content_comment(
  comment_id uuid,
  token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if comment_id is null or token is null then
    return false;
  end if;

  delete from public.content_comments
  where id = comment_id and owner_token = token;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.delete_content_comment(uuid, uuid) from public;
grant execute on function public.delete_content_comment(uuid, uuid) to anon, authenticated;

-- 운영자 삭제: Supabase Vault에 name=board_admin_key로 저장된 값과 비교한다.
create or replace function public.admin_delete_content_comment(
  comment_id uuid,
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

  delete from public.content_comments where id = comment_id;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.admin_delete_content_comment(uuid, text) from public;
grant execute on function public.admin_delete_content_comment(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 설치 확인
select
  to_regclass('public.content_comments') as comments_table,
  to_regclass('public.content_comments_public') as comments_public_view,
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'content_comments') as policy_count,
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('delete_content_comment', 'admin_delete_content_comment')) as rpc_count;
