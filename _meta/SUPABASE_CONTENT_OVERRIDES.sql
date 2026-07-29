-- 톺다 가이드 본문 직접 수정 — 저장소(content_overrides)
-- Supabase SQL Editor에 이 파일 전체를 붙여넣고 한 번 실행한다.
-- 여러 번 실행해도 안전하게 작성했다(idempotent).
--
-- 흐름
--   브라우저(/admin/edit.html)에서 문단 수정
--     → admin_save_override() 로 저장 (운영자 키 필요)
--     → 배포 워크플로의 _meta/apply_overrides.py 가 HTML 파일에 실제로 써 넣고 커밋
--     → admin_mark_override_applied() 로 applied 표시
--   방문자 페이지는 이 테이블을 조회하지 않는다(운영자 브라우저만 미리 얹어 본다).
--
-- 보안 경계
--   · 익명 INSERT/UPDATE/SELECT 정책을 만들지 않는다. 전부 운영자 키 RPC를 통해서만.
--   · 운영자 키는 기존 Vault Secret(board_admin_key)을 그대로 재사용한다.

create table if not exists public.content_overrides (
  id uuid primary key default gen_random_uuid(),
  page text not null,                      -- 'interior/lighting.html'
  block text not null,                     -- 'ch1.lead'  (data-edit 값)
  html text not null,                      -- 정제된 조각 HTML
  prev_html text,                          -- 직전 값 1단계 (되돌리기용)
  note text,                               -- 수정 메모(선택)
  updated_at timestamptz not null default now(),
  applied_at timestamptz,                  -- 빌드가 HTML에 구운 시각
  constraint content_overrides_page_len  check (char_length(page) between 1 and 200),
  constraint content_overrides_block_len check (char_length(block) between 1 and 80),
  constraint content_overrides_html_len  check (char_length(html) between 1 and 20000),
  constraint content_overrides_page_shape
    check (page ~ '^[A-Za-z0-9._/-]+\.html$' and page !~ '\.\.'),
  unique (page, block)
);

alter table public.content_overrides enable row level security;

-- 정책을 하나도 만들지 않는다 = 익명·인증 사용자 모두 직접 접근 불가.
revoke all on table public.content_overrides from anon, authenticated;

create index if not exists content_overrides_pending_idx
  on public.content_overrides (page) where applied_at is null;

-- ---------------------------------------------------------------------------
-- 공통: 운영자 키 검증 (틀리면 예외)
-- ---------------------------------------------------------------------------
create or replace function public.assert_admin_key(admin_key text)
returns void
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
end;
$$;

revoke all on function public.assert_admin_key(text) from public;
-- 이 함수는 다른 SECURITY DEFINER 함수 안에서만 쓴다. 직접 실행 권한은 주지 않는다.

-- ---------------------------------------------------------------------------
-- 저장 — 같은 (page, block) 이면 덮어쓰고, 직전 값을 prev_html 로 남긴다.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_override(
  admin_key text,
  in_page text,
  in_block text,
  in_html text,
  in_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_html text;
  result_id uuid;
begin
  perform public.assert_admin_key(admin_key);

  if in_html is null or btrim(in_html) = '' then
    raise exception 'empty html';
  end if;

  select html into existing_html
  from public.content_overrides
  where page = in_page and block = in_block;

  insert into public.content_overrides (page, block, html, prev_html, note, updated_at, applied_at)
  values (in_page, in_block, in_html, existing_html, in_note, now(), null)
  on conflict (page, block) do update
    set html       = excluded.html,
        prev_html  = content_overrides.html,
        note       = excluded.note,
        updated_at = now(),
        applied_at = null            -- 다시 구워야 한다
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.admin_save_override(text, text, text, text, text) from public;
grant execute on function public.admin_save_override(text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 조회 — 편집 화면과 배포 스크립트가 함께 쓴다.
--   only_pending = true  → 아직 HTML 에 굽지 않은 것만 (배포 스크립트용)
--   in_page 지정         → 그 페이지 것만 (편집 화면·운영자 미리보기용)
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_overrides(
  admin_key text,
  in_page text default null,
  only_pending boolean default false
)
returns table (
  id uuid,
  page text,
  block text,
  html text,
  prev_html text,
  note text,
  updated_at timestamptz,
  applied_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_admin_key(admin_key);

  return query
    select o.id, o.page, o.block, o.html, o.prev_html, o.note, o.updated_at, o.applied_at
    from public.content_overrides o
    where (in_page is null or o.page = in_page)
      and (not only_pending or o.applied_at is null)
    order by o.page, o.block;
end;
$$;

revoke all on function public.admin_list_overrides(text, text, boolean) from public;
grant execute on function public.admin_list_overrides(text, text, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 구운 뒤 표시 — 배포 스크립트가 커밋에 성공한 항목만 호출한다.
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_override_applied(
  admin_key text,
  in_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  perform public.assert_admin_key(admin_key);

  update public.content_overrides
     set applied_at = now()
   where id = in_id and applied_at is null;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.admin_mark_override_applied(text, uuid) from public;
grant execute on function public.admin_mark_override_applied(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 되돌리기 — 직전 값(prev_html)으로 한 단계 되돌린다.
-- 더 이전으로 가려면 git 이력을 쓴다(HTML 이 저장소에 커밋돼 있다).
-- ---------------------------------------------------------------------------
create or replace function public.admin_revert_override(
  admin_key text,
  in_page text,
  in_block text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  perform public.assert_admin_key(admin_key);

  update public.content_overrides
     set html       = prev_html,
         prev_html  = html,
         updated_at = now(),
         applied_at = null
   where page = in_page
     and block = in_block
     and prev_html is not null;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

revoke all on function public.admin_revert_override(text, text, text) from public;
grant execute on function public.admin_revert_override(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 설치 확인 — 아래를 실행해 모두 채워져 있으면 성공이다.
-- ---------------------------------------------------------------------------
select
  to_regclass('public.content_overrides') as overrides_table,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'content_overrides') as policy_count_should_be_0,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('assert_admin_key', 'admin_save_override', 'admin_list_overrides',
                        'admin_mark_override_applied', 'admin_revert_override')) as rpc_count_should_be_5;
