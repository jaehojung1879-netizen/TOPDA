# 게시판 공개글 공유 (Supabase)

게시판의 **비밀글은 그대로 브라우저(localStorage)에만 저장**됩니다. **공개글만** Supabase에
저장해 모든 방문자가 같은 글 목록을 보게 합니다. 아래는 최초 1회 설정입니다.

## 1) Supabase 프로젝트 생성
1. https://supabase.com → 무료(Free) 플랜으로 새 프로젝트 생성
2. 프로젝트 설정 → API 메뉴에서 **Project URL**과 **anon public key**를 복사
   (anon 키는 공개 노출을 전제로 설계된 키입니다 — 실제 접근 제어는 아래 RLS가 담당)

## 2) 테이블·정책 생성 (SQL Editor에서 실행)

```sql
-- 공개글 테이블. owner_token은 작성자만 아는 값으로, 본인 글 삭제 인증에만 쓰인다.
create table board_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null default 'etc',
  title text not null,
  author text,
  page text,
  body text not null,
  owner_token uuid not null
);

alter table board_posts enable row level security;

-- 누구나 새 글을 쓸 수 있다(게시판 취지상 로그인 없이 작성 가능해야 함).
create policy "anyone can insert" on board_posts
  for insert to anon
  with check (true);

-- 테이블 자체에는 select/delete 정책을 만들지 않는다 — 아래 뷰·RPC로만 노출한다.
-- (owner_token 컬럼이 select로 그대로 노출되면 아무나 남의 글을 지울 수 있게 되므로)

-- 공개 목록 조회용 뷰: owner_token 컬럼을 제외해 노출을 막는다.
create view board_posts_public
  with (security_invoker = false) as
  select id, created_at, category, title, author, page, body
  from board_posts
  order by created_at desc;

grant select on board_posts_public to anon;

-- 본인 글 삭제: owner_token이 일치할 때만 삭제되는 RPC.
-- security definer로 실행되어, 위에서 만든 RLS(select/delete 정책 없음)를 이 함수 안에서만 우회한다.
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

## 3) GitHub Secrets 등록
`Settings → Secrets and variables → Actions → New repository secret`

| Secret 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 1)에서 복사한 Project URL |
| `SUPABASE_ANON_KEY` | 1)에서 복사한 anon public key |

`deploy-pages.yml`이 배포 시 `site/` 전체에서 `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__`
플레이스홀더를 이 값으로 치환합니다. 미설정 시 게시판은 자동으로 로컬(localStorage) 전용
동작으로 폴백합니다(기존과 동일하게 계속 작동).

## 4) 스팸 방지 — 알려진 한계
현재 설계는 로그인 없이 누구나 글을 쓸 수 있어(기존 UX 유지), 서버 쪽 스팸 필터링은 없습니다.
악용이 심해지면 Supabase 대시보드에서 개별 글 삭제, 또는 `anyone can insert` 정책에
Cloudflare Turnstile 검증 등을 추가하는 방안을 검토하세요.
