# 게시판·콘텐츠 댓글 백엔드 (Supabase)

톺다의 공개 게시판, 비밀 게시글, 콘텐츠 댓글은 Supabase를 공유 저장소로 사용합니다.
프론트엔드에는 Supabase **Publishable key**만 주입합니다. `service_role`, Secret key
(`sb_secret_...`) 또는 Vault의 실제 관리 키를 코드·문서·GitHub 저장소에 넣으면 안 됩니다.

## 1. 배포 설정

GitHub 저장소의 `Settings → Secrets and variables → Actions`에 다음 이름으로 등록합니다.
기존 Secret 이름은 변경하지 않습니다.

| GitHub Secret | 값 |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase Publishable key (`sb_publishable_...`; 레거시 프로젝트는 anon public key) |

`.github/workflows/deploy-pages.yml`이 배포할 때 `site/`의 아래 플레이스홀더를 치환합니다.

- `__SUPABASE_URL__`
- `__SUPABASE_ANON_KEY__`

Publishable key는 브라우저 노출을 전제로 하며, 실제 접근 제한은 RLS·공개 뷰·RPC가
담당합니다. 로컬처럼 플레이스홀더가 치환되지 않은 환경에서는 게시판의 기존 로컬 글만
표시되고 댓글 등록은 비활성화됩니다.

## 2. 기존 게시판 객체

다음 객체는 운영 데이터와 호환성 때문에 그대로 유지합니다.

- `board_posts`
- `board_posts_public`
- `get_posts_by_tokens(uuid[])`
- `delete_board_post(uuid, uuid)`
- `admin_list_secret_posts(text)`

`board_posts`를 삭제하거나 재생성하지 마세요. 원본 테이블에는 `SELECT`/`DELETE` 정책을
추가하지 않고 다음 경계를 유지합니다.

- 익명 사용자는 `INSERT`만 가능
- 공개 조회는 `owner_token`과 비밀글을 제외한 `board_posts_public`만 사용
- 본인 글 조회는 브라우저의 `board:owner_tokens`를 `get_posts_by_tokens`에 전달
- 본인 삭제는 `delete_board_post`가 `owner_token` 일치를 확인
- 프론트엔드 `INSERT`에는 `.select()`를 붙이지 않음

게시판 클라이언트는 `id`와 `owner_token`을 먼저 만들고 저장합니다. 서버 저장이나 기존
로컬 글 이전이 실패하면 원문을 localStorage에 남기며, 공개·비밀 로컬 글이 모두 이전된
경우에만 `board:migrated_to_supabase`를 기록합니다.

## 3. 운영자 키: Supabase Vault

운영자 키는 PostgreSQL `ALTER DATABASE ... SET` 값이 아닙니다. Supabase Vault에 다음
이름으로 저장된 Secret을 사용합니다.

```text
board_admin_key
```

실제 값은 이 문서에 적지 않습니다. Supabase Dashboard의 Vault 화면에서 생성·교체하세요.
기존 `admin_list_secret_posts`가 아직 `current_setting('app.board_admin_key', ...)`을
사용한다면 SQL Editor에서 아래 함수만 교체합니다.

```sql
create or replace function public.admin_list_secret_posts(admin_key text)
returns table (
  id uuid,
  created_at timestamptz,
  category text,
  title text,
  author text,
  page text,
  body text
)
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

  return query
    select p.id, p.created_at, p.category, p.title, p.author, p.page, p.body
    from public.board_posts p
    where p.secret
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_secret_posts(text) from public;
grant execute on function public.admin_list_secret_posts(text) to anon, authenticated;
notify pgrst, 'reload schema';
```

운영자 브라우저 등록 방식은 기존과 같습니다.

- `board.html?admin=관리키`: 해당 브라우저의 `board:admin_key`에 저장
- `board.html?admin=off`: 저장된 관리 키 해제

클라이언트는 등록 직후 주소창에서 `admin` 파라미터를 제거해 불필요한 노출을 줄입니다.
다만 최초 요청 URL은 방문 기록·프록시 로그에 남을 수 있으므로 공유 PC에서는 사용 후
반드시 해제하고, 운영 키를 일반 링크처럼 전달하지 마세요.

## 4. 콘텐츠 댓글 설치

Supabase SQL Editor에서 다음 파일 전체를 실행합니다.

[`_meta/SUPABASE_COMMENTS_SETUP.sql`](SUPABASE_COMMENTS_SETUP.sql)

이 SQL은 다음 객체를 만듭니다.

- `content_comments`: `owner_token`을 포함한 원본 댓글
- `content_comments_public`: `owner_token`을 제외한 공개 조회 뷰
- 익명 댓글 작성용 RLS 정책
- `delete_content_comment(uuid, uuid)`: 작성자 토큰 삭제
- `admin_delete_content_comment(uuid, text)`: Vault 운영자 키 삭제
- 대상별 조회 인덱스

댓글 원본 테이블에도 직접 `SELECT`/`DELETE` 정책을 두지 않습니다. 댓글 UI는
`target_type`과 명시적인 안정적 `target_key`가 모두 같은 행만 최대 50개 조회합니다.

키 예:

- `calculator:total-cost-dashboard`
- `calculator:acquisition-tax`
- `guide:sale-contract-tips`
- `checklist:moving-day`
- `interior:windows`
- 게시글 댓글은 `target_type=board_post`, `target_key={게시글 UUID}`

## 5. 브라우저 호환 데이터

기존 localStorage 키는 모두 유지합니다.

- 게시판: `board:public`, `board:secret`, `board:draft`, `board:author`,
  `board:owner_tokens`, `board:migrated_to_supabase`, `board:admin_key`
- 댓글: `comments:author`, `comments:owner_tokens`
- 이전 피드백 키 `fb:public`, `fb:secret`은 게시판 진입 시 `board:*`로 합쳐집니다.

비밀글의 “본인”과 댓글의 “본인”은 로그인 계정이 아니라 작성 브라우저에 저장된
`owner_token`으로 판별합니다. localStorage를 삭제하거나 다른 브라우저를 쓰면 본인 권한을
복구할 수 없습니다.

## 6. 점검 방법

### 데이터베이스

```sql
select
  to_regclass('public.board_posts') as board_table,
  to_regclass('public.board_posts_public') as board_public_view,
  to_regclass('public.content_comments') as comments_table,
  to_regclass('public.content_comments_public') as comments_public_view;

select count(*) filter (where not secret) as public_posts,
       count(*) filter (where secret) as secret_posts
from public.board_posts;

select target_type, target_key, count(*)
from public.content_comments
group by target_type, target_key
order by count(*) desc;

select name, created_at
from vault.secrets
where name = 'board_admin_key';
```

마지막 쿼리는 Vault Secret의 존재와 생성 시각만 확인하며 복호화된 값은 출력하지 않습니다.

### 브라우저

1. 공개글 작성 후 `board-post.html?id=...`로 이동하고 다른 브라우저에서도 조회되는지 확인
2. 비밀글은 작성 브라우저에서만 열리고, 다른 브라우저에서는 내용이 숨겨지는지 확인
3. 작성 브라우저에만 게시글 삭제 버튼이 보이는지 확인
4. 종합 계산기에서 댓글 등록 후 새로고침·다른 브라우저 조회를 확인
5. 댓글 작성 브라우저에만 삭제 버튼이 보이는지 확인
6. 댓글에 `<script>alert(1)</script>`를 입력해도 텍스트로만 표시되는지 확인
7. 잘못된 운영자 키로 비밀글 조회·댓글 삭제가 거부되는지 확인

새 뷰나 함수를 만든 직후 API에서 `PGRST205`가 나오면 다음을 실행합니다.

```sql
notify pgrst, 'reload schema';
```

`PGRST116`과 함께 게시글 작성이 롤백되면 프론트엔드 `insert` 뒤에 `.select()`가 붙지
않았는지 먼저 확인합니다.

## 7. 알려진 보안·스팸 한계

로그인 없이 누구나 게시글과 댓글을 작성할 수 있어 자동화된 스팸, 도배, 욕설을 서버에서
완전히 막지는 못합니다. 운영량이 늘면 Edge Function과 Cloudflare Turnstile, IP별 속도
제한, 신고·숨김 큐를 추가하는 것이 좋습니다. Publishable key만으로 가능한 RLS 경계를
유지하고, 운영자 키나 `service_role` 키를 프론트엔드에 추가해서는 안 됩니다.
