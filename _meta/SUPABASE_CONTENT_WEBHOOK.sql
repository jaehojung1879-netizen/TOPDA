-- 톺다 본문 편집기 — 저장하면 즉시 배포되게 하는 웹훅 (SQL 판)
--
-- 이걸 설치하면: 편집기에서 저장 → 약 2분 뒤 방문자 화면 반영
-- 설치하지 않으면: 정해진 시각의 보정 실행 때까지 기다린다(최대 몇 시간)
--
-- ⚠ 왜 대시보드가 아니라 SQL 인가
--   Supabase 대시보드의 Database → Webhooks 메뉴는 버전에 따라 위치가 바뀌고,
--   pg_net 확장이 꺼져 있으면 아예 보이지 않는다. 그 메뉴가 하는 일이 결국 아래
--   트리거를 만드는 것이므로, SQL 로 직접 만드는 편이 확실하고 재현도 쉽다.
--
-- ── 실행 전 준비 ────────────────────────────────────────────────────────────
-- GitHub 토큰이 필요하다. 발급 방법:
--   https://github.com/settings/personal-access-tokens/new
--   · Repository access : Only select repositories → jaehojung1879-netizen/TOPDA
--   · Permissions       : Repository permissions → Contents = Read and write
--   · 발급 후 나오는 값을 복사해 둔다 (화면을 벗어나면 다시 못 본다)
--
-- 토큰 발급·사용은 **무료**다. public 저장소라 Actions 실행 시간도 무제한 무료다.

-- ---------------------------------------------------------------------------
-- 1) pg_net 확장 켜기 — Postgres 가 HTTP 요청을 보낼 수 있게 한다
--
-- 스키마를 지정하지 않는다. pg_net 은 이름 충돌을 피하려고 설치할 때 자기 스키마(net)를
-- 직접 만들기 때문에, `with schema extensions` 를 붙이면 오히려 실패한다.
-- 그래서 아래 함수들은 net.http_post 처럼 net. 을 붙여 부른다.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 2) 토큰을 Vault 에 넣는다
--
-- 아래 'ghp_여기에_토큰을_붙여넣으세요' 를 실제 토큰으로 바꾼 뒤 실행한다.
-- 트리거 함수 본문에 토큰을 직접 쓰지 않는 이유: 함수 정의는 DB 를 볼 수 있는
-- 사람에게 그대로 노출된다. Vault 에 넣으면 board_admin_key 와 같은 취급을 받는다.
--
-- 이미 한 번 넣었다면 이 블록은 건너뛴다(같은 이름으로 또 넣으면 최신 것이 쓰인다).
-- ---------------------------------------------------------------------------
select vault.create_secret(
  'ghp_여기에_토큰을_붙여넣으세요',
  'github_dispatch_token',
  '본문 수정본 반영 워크플로를 깨우는 GitHub 토큰'
);

-- ---------------------------------------------------------------------------
-- 3) 트리거 함수 — content_overrides 가 바뀌면 GitHub 워크플로를 깨운다
-- ---------------------------------------------------------------------------
create or replace function public.notify_content_edit()
returns trigger
language plpgsql
security definer
set search_path = public, net, pg_temp
as $$
declare
  token text;
begin
  select decrypted_secret
    into token
  from vault.decrypted_secrets
  where name = 'github_dispatch_token'
  order by created_at desc
  limit 1;

  -- 토큰이 없으면 아무 일도 하지 않는다. 저장 자체를 실패시키면 안 된다.
  if token is null or token = '' or token like 'ghp_여기에%' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/jaehojung1879-netizen/TOPDA/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'topda-supabase-webhook'
    ),
    body := jsonb_build_object('event_type', 'content-edit')
  );

  return new;
exception when others then
  -- 네트워크·권한 문제로 알림이 실패해도 편집 저장은 그대로 성공해야 한다.
  -- 놓친 건은 보정 실행이 주워 간다.
  return new;
end;
$$;

revoke all on function public.notify_content_edit() from public;

-- ---------------------------------------------------------------------------
-- 4) 트리거 걸기
-- ---------------------------------------------------------------------------
drop trigger if exists content_overrides_notify on public.content_overrides;

create trigger content_overrides_notify
  after insert or update on public.content_overrides
  for each row
  execute function public.notify_content_edit();

-- ---------------------------------------------------------------------------
-- 설치 확인 — 세 칸이 모두 채워지면 성공
-- ---------------------------------------------------------------------------
select
  (select count(*) from pg_extension where extname = 'pg_net')            as pg_net_should_be_1,
  (select count(*) from vault.secrets where name = 'github_dispatch_token') as token_should_be_1,
  (select count(*) from pg_trigger
    where tgname = 'content_overrides_notify' and not tgisinternal)       as trigger_should_be_1;

-- ---------------------------------------------------------------------------
-- 잘 되는지 실제로 시험해 보기
--
-- 아래를 실행하면 가짜 수정본이 하나 들어가면서 워크플로가 깨어난다.
-- GitHub → Actions 탭에 "Apply content edits" 실행이 뜨는지 확인하면 된다.
-- (page 가 실제 파일이 아니므로 워크플로는 "블록 없음"으로 건너뛴다 — 안전하다.)
--
--   select public.admin_save_override(
--     '<운영자 키>', '__webhook_test__.html', 'test', '<p>test</p>', '연결 시험'
--   );
--
-- 확인이 끝나면 시험용 행을 지운다.
--
--   delete from public.content_overrides where page = '__webhook_test__.html';
-- ---------------------------------------------------------------------------
