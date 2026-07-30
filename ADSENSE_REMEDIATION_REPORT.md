# AdSense 콘텐츠 품질 정비 보고서

**대상**: jaehojung1879-netizen/TOPDA · 배포 루트 `site/` · 서비스 도메인 topda.kr
**작업 브랜치**: `claude/adsense-content-quality-x7vuvv`
**작성일**: 2026-07-30

> 지시서에는 작업 브랜치를 `fix/adsense-content-quality`로 적었으나, 이 세션에 지정된
> 개발 브랜치는 `claude/adsense-content-quality-x7vuvv`입니다. 지정 브랜치 외에 푸시하지
> 않는다는 규칙에 따라 후자에 작업했습니다. 브랜치명을 바꿔야 하면 알려주세요.

---

## 0. 무엇을 문제로 봤는가

AdSense가 “가치가 별로 없는 콘텐츠”로 판정한 원인은 **문장이 부족해서가 아니라, 사이트의
93%가 같은 템플릿에 숫자만 바꿔 넣은 자동생성 페이지이고 그것이 전부 색인 대상이었기
때문**입니다. 감사 결과 공개 URL 5,168개 중 4,816개(93.2%)가 단지 실거래 페이지였고(같은 날 오후 데이터 갱신 후 5,600개 중 5,242개),
공통 문구를 걷어낸 고유 본문은 평균 1,458자 — 그중 대부분이 표 데이터였습니다.

여기에 두 가지 정책 불일치가 겹쳐 있었습니다.

1. **개인정보처리방침이 실제 동작과 달랐습니다.** 방침은 “별도 서버·데이터베이스를
   운영하지 않는다”, “광고 식별자를 사용하지 않는다”, “향후 Google Analytics를 도입할
   경우”라고 적혀 있었지만, 실제로는 GA4(`G-7NE57E1KLH`)·네이버 애널리틱스
   (`25db1b1d375e68`)·AdSense(`ca-pub-6725359021570843`)·Supabase가 모두 가동 중이었습니다.
2. **홈 상단이 구글 뉴스 RSS 기사 제목 5건을 매일 자동 나열**하고 있었습니다.

그래서 이 작업은 문장을 늘리는 방향이 아니라, **페이지 접근성은 유지한 채 색인 품질을
통제하고, 문서와 실제 동작을 일치시키는 방향**으로 했습니다. 기존 계산기·데이터 기능은
하나도 삭제하지 않았습니다.

---

## 1. 변경 전 / 변경 후 수치

> 두 열은 **같은 데이터 스냅샷**(2026-07-30 최신 `main`) 기준입니다. 단지 페이지 수는
> 매일 데이터 갱신에 따라 변하므로, 최초 감사 시점(같은 날 오전, 단지 4,816개)과
> 아래 숫자가 다릅니다. 변경 전 열은 “이 데이터에 기존 정책을 적용했다면”의 값입니다.

| 항목 | 변경 전 | 변경 후 |
|---|---:|---:|
| 공개 HTML URL 총수 | 5,594 | 5,600 (신뢰 페이지 6개 추가) |
| **색인 허용 URL** | **5,589** | **386** |
| noindex URL | 5 | 5,214 |
| 공개 sitemap 등재 URL | 5,493 | 293 |
| AdSense 스크립트가 있는 페이지 | 175 | 106 |
| 화면에 작성자·날짜가 표시된 글 | 3 | 49 |

### 공개 sitemap 파일별

| 파일 | 변경 전 | 변경 후 |
|---|---:|---:|
| `sitemap-pages.xml` | 58 | 32 |
| `sitemap-calculators.xml` | 55 | 27 |
| `sitemap-guides.xml` | 58 | 54 |
| `sitemap-apt-regions.xml` | 80 | 80 |
| `sitemap-apt-complexes.xml` | 5,242 | 100 |
| 합계 | 5,493 | 293 |

**sitemap에서 제거된 URL: 5,206개 / 추가된 URL: 6개**
(추가분은 `/authors/jaeho-jung.html`, `/editorial-policy.html`, `/data-methodology.html`,
`/corrections.html`, `/contact.html`, `/en/privacy.html`)

### 언어별 색인 허용 URL

| 언어 | 변경 전 | 변경 후 | 비고 |
|---|---:|---:|---|
| ko | 5,487 | 345 | 핵심 색인 언어 |
| en | 46 | 41 | 게이트 통과분만 |
| zh-Hans | 15 | 0 | noindex,follow — 접근·링크 유지 |
| zh-Hant | 15 | 0 | 동일 |
| vi | 13 | 0 | 동일 |
| th | 13 | 0 | 동일 |

### 아파트 단지 페이지

| 항목 | 값 |
|---|---:|
| 생성된 단지 페이지 (전체) | 5,242 |
| 색인 품질 게이트 통과 | 1,149 |
| **실제 색인 허용 (상한 100 적용)** | **100** |
| noindex,follow (접근·내부검색·계산기 연결 유지) | 5,142 |

---

## 2. 콘텐츠 인벤토리 감사 (1단계)

`reports/content-inventory.csv` · `reports/content-inventory.json` — URL 5,600행.
생성기: `_meta/audit_content.py`

URL마다 path · page_type · language · title · canonical · robots · sitemap 등재 여부 ·
hreflang · 본문 글자 수 · **템플릿 제외 고유 글자 수** · 외부/내부 링크 수 · 뉴스 집계 여부 ·
작성자/게시일/수정일/출처/기준일 표시 여부 · 도구 여부 · 데이터 완성도 · AdSense ·
GA4/Naver/Supabase 사용 · 등급(A/B/C) · 조치 사유를 담았습니다.

**고유 글자 수 산정 방식**: 같은 page_type 안에서 절반 이상의 페이지에 똑같이 등장하는
텍스트 블록을 템플릿으로 보고 본문에서 제외합니다. 표 셀은 셀 단위로 끊지 않고 행 단위로
이어 붙여 세므로, 실거래 표의 실제 데이터가 고유 콘텐츠로 계산됩니다.

### 등급 분포 (변경 후)

| page_type | 수 | 색인 | A | B | C | 평균 고유자 |
|---|---:|---:|---:|---:|---:|---:|
| apt-complex | 5,242 | 100 | 1,240 | 4,002 | 0 | 1,659 |
| apt-region | 158 | 158 | 158 | 0 | 0 | 15,429 |
| post | 50 | 50 | 46 | 4 | 0 | 2,884 |
| calculator | 44 | 26 | 26 | 18 | 0 | 1,804 |
| hub | 33 | 6 | 11 | 22 | 0 | 2,379 |
| interior | 21 | 17 | 17 | 4 | 0 | 5,999 |
| policy | 6 | 6 | 5 | 1 | 0 | 3,793 |
| checklist | 7 | 7 | 7 | 0 | 0 | 963 |
| internal-search | 7 | 0 | 0 | 7 | 0 | 1,581 |
| board | 3 | 0 | 0 | 3 | 0 | 269 |
| 그 외 | 29 | 16 | 16 | 12 | 1 | — |

> A 등급 수가 색인 허용 수보다 큰 구간(apt-complex 1,240 vs 100)은 **품질 기준은 통과했지만
> 초기 상한 때문에 아직 색인을 열지 않은 페이지**입니다. 상한을 올릴 때 쓸 후보 목록입니다.

### C 등급 (1개)

- `/feedback.html` — 고유 본문 144자. `board.html?cat=fix`로 즉시 이동하는 껍데기입니다.
  GitHub Pages는 301을 낼 수 없으므로 삭제 대신 **canonical을 `board.html`로 두고
  noindex + meta refresh를 유지**했습니다. sitemap에서 제거했습니다.

---

## 3. 개인정보처리방침 (2단계)

`site/privacy.html`을 **실제 구현 기준으로 전면 재작성**했고, `site/en/privacy.html`을
신설했습니다.

### 변경 내역

| 이전 서술 | 실제 | 조치 |
|---|---|---|
| “별도 서버나 데이터베이스를 운영하지 않습니다” | 게시판·댓글이 Supabase에 저장됨 | 6항 신설 — 테이블(`board_posts`·`content_comments`), 공개 뷰, RLS, 저장 항목 명시 |
| “광고 식별자나 교차 사이트 추적은 사용하지 않습니다” | AdSense가 175개 페이지에서 가동 | 5항 신설 — 게재 사실, 쿠키·광고 식별자, 거부 방법, 광고를 넣지 않는 페이지 목록 |
| “향후 분석 도구(예: GA4)를 도입할 경우” | GA4·네이버 애널리틱스가 전 페이지에서 가동 | 3·4항 신설 — 측정 ID, `anonymize_ip`, 수집 이벤트 8종, 담지 않는 값 명시 |
| localStorage 언급 3줄 | 실제 키 13종 | 7항 신설 — 키별 표 |
| 게시판 “같은 기기에 표시” | 공개글은 전 방문자에게 보임 | 8항 신설 — 공개글/비밀글/소유자 토큰 동작 정확히 기술 |
| 제3자 제공 “현재 없음” | Google·네이버·Supabase·GitHub·jsDelivr로 전달 | 10항 신설 — 사업자별 역할·전달 항목·국외 처리 가능성 |
| 쿠키 거부 방법 없음 | — | 11항 신설 — 브라우저별 설정, Google 광고 설정, GA 차단 부가기능 |

**임의로 만들지 않은 항목**: Supabase 데이터 리전·백업 보관 기간, GA4 데이터 보관 기간.
저장소 코드로 확인할 수 없어 구체적 국가명·기간을 적지 않고, 6·9항에 “각 서비스의 정책과
프로젝트 설정에 따른다”고만 적었습니다. 공개 페이지에 “운영자가 확인해야 하는 항목” 같은
TODO 문구를 남기지 않습니다 — 사실 서술로는 충분하고, TODO는 미완성 신호가 됩니다.

**연락 창구**: 전자우편 주소를 두지 않고 **게시판을 유일한 창구**로 명시했습니다(13항).
회원가입 없이 쓸 수 있고 비밀글이 되므로 개인정보 삭제 요청 창구로 기능합니다.
운영자 개인 이메일은 공개하지 않습니다.

`privacy.html`과 `en/privacy.html`에는 **AdSense 스크립트를 넣지 않았습니다.**

---

## 4. 색인 정책 (3단계)

생성기: `_meta/apply_index_policy.py` (여러 번 실행해도 결과 동일)

`noindex,follow`를 적용한 72개(단지 페이지 5,142개는 별도):

| 사유 | 수 |
|---|---:|
| 게시판·내부검색·오류·운영자·소유확인 화면 | 21 |
| zh-Hans 여정 미완성 | 13 |
| zh-Hant 여정 미완성 | 13 |
| th 여정 미완성 | 11 |
| vi 여정 미완성 | 11 |
| EN 색인 게이트 미달 | 3 |

**원칙 준수 사항**

- `robots.txt`에 `Disallow`를 추가하지 않았습니다. 크롤을 막으면 검색엔진이 noindex 태그
  자체를 읽지 못합니다. 기존 `Disallow: /admin/`만 유지했습니다.
- noindex 페이지는 sitemap에서 전부 제거했습니다(검증 #3이 강제).
- **noindex 페이지도 사이트 내부 검색·지역 허브·계산기 연결에서 그대로 동작합니다.**
  `find.html`·`calculators/search.html`의 인덱스(`site/assets/finder_index.json`,
  `search-index.json`)는 건드리지 않았습니다.

### 플레이스홀더 제거

`site/index.html`의 `NAVER_SITE_VERIFICATION_PLACEHOLDER`,
`GOOGLE_SITE_VERIFICATION_PLACEHOLDER`를 **제거**했습니다. 실제 토큰을 주입하는 빌드
단계가 없었기 때문입니다. 네이버 소유확인은 파일 방식
(`site/naverad49c771a0767deb237476d745c1ee22.html`)으로 이미 동작합니다.
구글은 Search Console에서 DNS TXT 또는 HTML 파일 방식으로 확인할 수 있습니다.
다만 **애드센스 심사는 Search Console 확인과 무관**합니다 — 애드센스는 `<head>`의 광고 코드와
`ads.txt`로 사이트를 확인하며 둘 다 이미 있습니다. 제거한 플레이스홀더는 실제 토큰이 아니라
문자열 그대로였으므로, 두었더라도 확인에 실패했을 값입니다.

### 부수 수정

- `sitemap-all.xml`은 생성기들이 공유하는 **내부 평면 목록**인데 noindex URL까지 담고
  있으면서 배포본에 그대로 올라가 있었습니다. 저장소에는 남기고 **배포 산출물에서만
  제거**하도록 `deploy-pages.yml`에 스텝을 추가했습니다.
- `deploy-pages.yml`에 `build_sitemaps.py` 실행을 추가했습니다. 단지 페이지를 배포 때마다
  다시 만드는데 sitemap은 커밋 당시 목록을 쓰고 있어, 데이터가 바뀌면 noindex 페이지가
  sitemap에 남는 모순이 생길 수 있었습니다.
- `build_sitemaps.py`의 noindex 판정이 파일 앞 4KB만 읽고 있어, head에 큰 `<style>`
  블록이 있는 단지 페이지의 robots 메타를 놓쳤습니다. head 전체를 읽도록 고쳤습니다.
- canonical 태그를 찾는 정규식이 `rel` → `href` 순서만 가정해, 순서가 반대인 13개 EN
  페이지에 canonical을 중복 삽입했습니다. 속성 순서와 무관하게 잡고 중복을 정리합니다.

---

## 5. 아파트 자동생성 페이지 (4단계)

`_meta/build_complex_pages.py` — **페이지 생성과 검색 색인 허용을 분리**했습니다.

```
① 생성(커버리지) 기준  — 기존 그대로: 거래 5건 · 세대수 100 · 최근 거래 확인
   → 5,242개 전부 생성, 기본값 noindex,follow
② 색인 품질 게이트     — 신설
   거래 30건 이상 AND 거래 분기 4개 이상 AND 면적 유형 2개 이상
   AND 세대수·준공연도·최근 거래일·거래가격 확인 AND 해제 거래 집계 제외
   AND 출처·데이터 기준일 표시
   → 1,149개 통과 → 상한 100개만 색인 허용 (거래량 상위, 시군구 분산)
```

### 설정값 (환경변수로 조정 가능)

| 이름 | 기본값 | 의미 |
|---|---:|---|
| `APT_INDEX_MIN_DEALS` | 30 | 최근 12개월 유효(비해제) 거래 최소 건수 |
| `APT_INDEX_MIN_QUARTERS` | 4 | 거래가 존재하는 최소 분기 수(보간 없이 추이 차트 가능) |
| `APT_INDEX_MIN_AREA_TYPES` | 2 | 최소 면적 유형 수(면적별 비교 성립) |
| `APT_INDEX_MAX_PAGES` | 100 | 초기 색인 허용 상한 (0이면 상한 없음) |

기준별 통과 수는 `python build_complex_pages.py --count`로 확인할 수 있습니다
(감사 시점 스냅샷: 거래 10건 3,083개 / 20건 1,765개 / 30건 947개 / 40건 485개 / 60건 150개).

### 색인 허용 페이지가 실제로 담는 것

면적별 최근가·㎡당 평균 / 면적별 가격 범위와 표본 수 / 분기별 거래량 / 분기별 ㎡당 가격 추이 /
해제 거래 표시 / 표본 수 주의사항 / 해당 가격을 취득세·대출한도·잔금 계산기로 넘기는 동선.
검증 #12가 색인 허용 단지마다 거래 행 수·면적 유형 수·분기 차트 존재·데이터 기준일 표시를
실제 HTML에서 확인합니다.

색인에서 제외한 페이지에는 **그 사실과 사유를 화면에도 표시**했습니다
(“이 단지는 표본이 아직 얇아 검색 색인에서 제외했습니다 (유효 거래 7건 < 30건 …)”).
숫자는 신고 자료 그대로이며 추정치가 아니라는 점을 함께 적었습니다.

품질 기준은 코드와 `site/data-methodology.html` 5절에 같은 내용으로 공개했습니다.

---

## 6. 그 외 변경

### 홈 뉴스 집계 정리 (5단계)

- `site/index.html`에서 구글 뉴스 RSS 헤드라인 5건 목록과 관련 마크업(3,697자)을 제거했습니다.
- 대체 구조: `_meta/home_issues.json`(운영자 작성) → `_meta/build_home_issues.py` →
  `index.html`의 `home:issues` 마커 구간. 항목마다 **무엇이 바뀌었나 / 영향을 받는 사람 /
  톺다에 반영한 내용 / 공식 원문 출처 / 검토일**이 필수이며, 하나라도 비면 그 항목은
  노출되지 않고 빌드가 경고합니다. `source_url`이 언론사 도메인이면 거부합니다.
  최대 3개까지 노출합니다.
- **현재 `issues`는 비어 있어 홈에서 이 섹션 자체가 렌더링되지 않습니다.** 운영자가 쓰지
  않은 이슈를 만들어 넣지 않는다는 원칙에 따른 것이며, 빈 껍데기도 남기지 않습니다.
- `collect_news.py`는 그대로 두었습니다. `index.html`에 마커가 없으므로 홈에 아무것도 쓰지
  않으며, `news.json` 수집은 운영자가 “무엇이 바뀌었는지” 단서를 찾는 데 계속 쓸 수
  있습니다. `refresh-news.yml`의 커밋 대상에서 `site/index.html`을 뺐습니다.

### 신뢰 페이지 (6단계)

| 파일 | 내용 |
|---|---|
| `site/authors/jaeho-jung.html` | 운영자가 담당하는 분야, 작성·검토 절차, 자동 수집 데이터와 직접 작성 콘텐츠의 구분. Person JSON-LD |
| `site/editorial-policy.html` | 운영 목적(5단계 사용자 흐름), 공식 출처 우선순위, 작성·검증·정정 절차, 하지 않는 것, 데이터 갱신 주기, 계산기 버전 관리, 광고와 편집의 분리 |
| `site/data-methodology.html` | 원자료 7종과 제공 기관, 집계 방법, 하지 않는 처리, 데이터의 한계 6가지, **단지 페이지 색인 품질 기준 전문**, 갱신 주기 |
| `site/corrections.html` | 오류 제보 방법, 5단계 처리 절차, 정정 기준, 정정 내역 표(현재 비어 있음), 정정 대상이 아닌 것 |
| `site/contact.html` | 접수 창구, 문의 유형별 안내, 답변하지 않는 문의, 응답 시간에 대한 설명 |

**창작하지 않은 것**: 보유하지 않은 자격·경력, 외부 감수자, 응답 시간 약속(SLA),
정정 내역(페이지 신설 시점부터 쌓기 시작한다고 명시).

`about.html`은 “누가 만드나 / 어떤 원칙으로 만드나” 절을 추가해 위 5개 페이지로 연결하고,
계산기 입력값이 서버로 가지 않는다는 문장에 “게시판·댓글만 예외”를 덧붙였습니다.

### 작성자·날짜·구조화 데이터 (7단계)

생성기: `_meta/add_bylines.py` — 대상 49개(posts 34 · interior 9 · checklists 5 · loan 1)

- 화면: `작성 정재호 · 게시 2026-05-27 · 최근 수정 2026-07-30` + 주요 공식 출처 링크 +
  “이 글의 내용은 YYYY-MM-DD 기준으로 작성·수정되었습니다” 문장.
- 날짜 출처: **git 이력.** 게시일 = 파일을 추가한 커밋 날짜, 수정일 = 마지막 사람 커밋
  날짜(`topda-bot` 자동 데이터 갱신 커밋 제외). **49개 전부 확정했고 추정한 날짜는 없습니다.**
- “검토일”이라고 쓰지 않고 “최근 수정”으로만 씁니다. 실제 재검토 기록이 없기 때문입니다.
- Article JSON-LD: `author`(Person + url)·`datePublished`·`dateModified`·`publisher`
  (Organization inline)·`mainEntityOfPage`를 화면과 같은 값으로 채웠습니다.
  기존에는 `author`가 `{"@id": "https://topda.kr/#organization"}` 뿐이었는데, 그 `@id`는
  `index.html`에만 정의돼 있어 다른 페이지에서는 해석되지 않았습니다.
- `reviewedBy`는 넣지 않았고, 남아 있으면 제거합니다(검증 #9가 강제).
- Article JSON-LD가 없던 17개 페이지(interior·checklists·loan)에는 새로 추가했습니다.

### 계산기 강화 (8단계)

생성기: `_meta/build_calc_meta.py` — 계산기 15개에 “이 계산기 정보” 블록 추가

`site/assets/rates.js`는 이미 계산기별 출처(`sources`)·최종 검토일(`lastReviewed`)·
변경 이력(`changelog` 8건)을 관리하고 있었고 주석에는 “계산기 하단에 표기됨”이라고 적혀
있었지만, **어느 페이지도 그 값을 렌더링하지 않았습니다.** 그래서 새 문장을 만들어 붙이는
대신 유지되고 있던 데이터를 화면으로 끌어냈습니다. SEO용으로 정적 HTML로 넣습니다
(JS 렌더링은 네이버 Yeti가 읽지 못합니다).

- rates.js에서: **적용 기준일**(2026-07-30) · **주요 근거** · **변경 이력**(최근 6건)
- `_meta/calc_meta.json`(직접 작성, 핵심 10종): 어떤 경우에 쓰는가 / 미리 준비할 값 /
  적용 공식과 가정 / 예시 / 결과가 달라질 수 있는 조건 / 함께 보기
  — acquisition-tax, total-cost-dashboard, loan-limit, dsr, balance-settlement,
  brokerage-fee, transfer-tax, registration-cost, jeonse-monthly, loan-compare
- 나머지 5종(auction-bid, commercial-rent, housing-subscription, interior-estimate,
  rti-calculator)은 rates.js 기반 정보(기준일·근거·변경 이력)만 받았습니다.
  → 8절 ‘남은 수동 작업’
- 도구 성격이 다른 4종(search, transactions, market-trends, jeonse-ratio)은 제외했습니다.
- **기존 계산기 로직과 입력 필드는 하나도 건드리지 않았습니다.**

### 다국어 정리 (9단계)

- **ko** 핵심 색인 언어 유지.
- **en** 게이트: 영어판 개인정보처리방침·안내 페이지 존재 AND 한국어 대응 페이지 존재 AND
  본문 한국어 40자 이하 AND canonical 정상 AND hreflang 상호 연결 AND 본문 링크가 표시 없이
  한국어로 이동하지 않음 → **41개 통과, 3개 미달.**
  - 미달: `/en/glossary.html`, `/en/foreigner-loan.html`, `/en/foreigner-tax.html` —
    한국어 대응 페이지가 없는 EN 전용 콘텐츠입니다. 게이트 조건을 그대로 적용했으며,
    한국어판을 만들면 색인 대상이 됩니다(8절 참고).
  - `/en/privacy.html`을 신설해 게이트 전제 조건을 충족시켰습니다.
  - EN 본문 링크 3개를 영어판으로 교정하고, 영어판이 없는 목적지 13개에 `(KO)` 표시를
    붙였습니다. EN 헤더 내비게이션의 한국어 목적지 155곳에도 `(KO)`를 표시했습니다
    (언어 전환용 “Korean” 링크는 제외).
- **zh-Hans · zh-Hant · vi · th**: 전 페이지 `noindex,follow`, sitemap·hreflang에서 제외.
  **페이지·링크·언어 선택 UX는 그대로입니다.** `topda-language` localStorage 기반 언어 유지
  동작(`app.js`)은 건드리지 않았습니다.
- hreflang은 **색인 허용된 실제 파일끼리만** ko↔en 상호 연결로 재구성했습니다(82개 페이지).
  이전에는 46개 쌍이 한쪽만 선언한 상태였고, noindex 예정 언어까지 가리키고 있었습니다.

### 광고 스크립트 범위 (10단계)

175개 → 106개. 제거한 69개:

- 정책·안내: `privacy.html`, `en/privacy.html`, `contact.html`, `editorial-policy.html`,
  `corrections.html`, `data-methodology.html`, `authors/jaeho-jung.html`, `about.html`, `en/about.html`
- 게시판·수정 요청: `board.html`, `board-write.html`, `board-post.html`, `feedback.html`, `en/feedback.html`
- 내부 검색 결과: `find.html`, `calculators/search.html` 및 각 언어판
- 오류 페이지: `404.html`, `en/404.html`
- noindex 콘텐츠: zh-Hans·zh-Hant·vi·th 전체, `market.html` 및 각 언어판, EN 게이트 미달 3개

단지 페이지 5,242개에는 원래부터 광고 스크립트가 없어 그대로 두었습니다.
광고 단위 배치는 변경하지 않았습니다(본문보다 먼저 보이거나 탐색을 방해하는 위치에
새로 넣지 않았습니다).

---

## 7. 테스트 결과

### 자동 검증 — `_meta/check_index_policy.py`

**15개 검사 전부 통과 (실패 0건, 경고 15건)**

| # | 검사 | 결과 |
|---|---|---|
| 1 | placeholder 토큰 미존재 | 통과 |
| 2 | privacy 페이지에 GA4·네이버·AdSense·Supabase·localStorage 설명 존재 (ko·en) | 통과 |
| 3 | noindex URL이 sitemap에 없음 | 통과 |
| 4 | sitemap URL의 실제 파일 존재 | 통과 |
| 5 | canonical 정상 (자기 URL, 또는 목적지 존재 + sitemap 미등재) | 통과 |
| 6 | hreflang 목적지 존재 + 상호 연결 + noindex 미참조 | 통과 |
| 7 | noindex·정책 페이지에 AdSense 없음 | 통과 |
| 8 | 본문 350자 미만 페이지가 색인 허용 아님 | 통과 |
| 9 | Article 페이지에 작성자·게시일·수정일 (화면 + JSON-LD) | 통과 |
| 10 | 작성자 URL 실제 존재 | 통과 |
| 11 | 깨진 내부 링크 없음 | 통과 |
| 12 | 아파트 색인 품질 게이트 (색인 허용 100개 전부 기준 충족) | 통과 |
| 13 | robots.txt와 sitemap 정책 일치 (noindex를 Disallow로 막지 않음) | 통과 |
| 14 | 중복 title·description 보고 | 경고 79종 |
| 15 | 템플릿 대비 고유 콘텐츠 비율 보고 | 경고 3건 |

### 경고 내용과 판단

- **중복 title/description 79종** — 전부 레거시 한글 지역 URL(`/apt/서울-중구.html`)과
  슬러그 허브(`/apt/seoul-junggu/`)의 쌍입니다. 한글 URL은 canonical이 허브를 가리키고
  sitemap에 없으므로 검색엔진이 통합 처리합니다. 여기에 noindex까지 붙이는 것은
  canonical과 신호가 충돌하는 안티패턴이라 하지 않았습니다. 기존 URL을 삭제하지 않는다는
  원칙도 함께 지켰습니다.
- **고유 콘텐츠 비율** — post 평균 93%(최저 88%), apt-complex 평균 80%(최저 66%),
  calculator 평균 66%(최저 30%: `rti-calculator.html`, 고유 537자). 계산기 최저값은
  8절 개선 대상으로 기록했습니다.

### 구조 무결성

- HTML 5,599개 전수 파싱: **구조 이상 0건**, canonical·robots·main 태그 중복 0건.
- `apply_index_policy.py`·`build_home_issues.py`·`add_bylines.py`·`build_calc_meta.py`
  모두 재실행 시 변경 0건(idempotent) 확인.
- 계산기 로직·입력 필드·`app.js`·`rates.js` 계산 코드는 변경하지 않았습니다.

### 작업 중 발견해 고친 버그 2건

1. `apply_index_policy.py`가 단지 페이지의 robots 메타까지 관리하면서, 품질 게이트가 붙인
   noindex 4,716개(당시 스냅샷)를 지웠습니다. 소유권을 분리해(`NOT_OURS_GLOBS`) 두 생성기가 서로의
   태그를 건드리지 않게 했습니다.
2. hreflang 블록을 “첫 블록 교체 후 나머지 삭제” 순서로 처리해, 방금 넣은 블록이 두 번째
   삭제에 걸려 없어졌습니다(재실행마다 hreflang이 붙었다 떨어졌다 함). 지우고 넣는 순서로
   바꿨습니다.

---

## 8. 남은 수동 작업

운영자가 직접 해야 하는 일입니다. 이 PR에서는 값을 만들어 넣지 않았습니다.

### 배포 전 반드시 필요 — 없음

초안에서는 아래 세 건을 ‘반드시 필요’로 적었으나, 검토 결과 모두 배포를 막는 항목이
아니어서 페이지를 완결된 상태로 고쳤습니다.

- **연락처 전자우편 — 두지 않기로 확정.** 애드센스가 요구하는 것은 “방문자가 운영자에게
  연락할 수 있는 수단”이지 전자우편 주소가 아닙니다. 회원가입 없이 쓸 수 있고 비밀글까지
  되는 게시판이 그 요건을 충족합니다. 운영자 개인 이메일은 공개하지 않습니다.
  `contact.html`·`privacy.html`·`en/privacy.html`에 남아 있던 “운영자 확인 후 게시 예정”
  문구를 전부 없애고, **게시판이 유일한 창구**라고 명시했습니다. 미완성으로 읽히던 빈 칸이
  사라졌습니다.
- **구글 Search Console 소유확인 — 애드센스 심사와 무관.** 애드센스는 `<head>`의 광고
  코드와 `ads.txt`로 사이트를 확인하며 둘 다 이미 있습니다. 제거한 플레이스홀더는 실제
  토큰이 아니라 문자열 그대로였으므로 두었더라도 확인에 실패했을 값이고, 제거로 잃은 기능은
  없습니다. Search Console을 쓰고 싶다면 DNS TXT 또는 HTML 파일 방식으로 확인하면 됩니다
  (9절 재제출 절차 참고) — 심사와는 별개의 선택 사항입니다.
- **Supabase 리전·GA4 보관 기간 — 화면에서 TODO 문구 제거.** 공개 페이지에 “운영자가
  확인해야 하는 항목” 경고 박스를 두는 것 자체가 미완성 신호라, “각 서비스의 정책과 프로젝트
  설정에 따른다”는 사실 서술로 바꿨습니다. 없는 숫자를 만들어 넣지 않는다는 원칙은 그대로이며,
  운영자가 나중에 실제 설정값을 확인해 문단을 구체화하는 것은 언제든 가능합니다(선택).

### 권장 (색인 품질 개선)

4. **핵심 이슈 첫 항목 작성** — `_meta/home_issues.json`의 `issues`에 항목을 넣고
   `python _meta/build_home_issues.py` 실행. 지금은 홈에서 섹션이 보이지 않습니다.
5. **계산기 5종에 설명 추가** — `_meta/calc_meta.json`에 auction-bid,
   commercial-rent, housing-subscription, interior-estimate, rti-calculator 항목 작성 후
   `python _meta/build_calc_meta.py` 재실행.
6. **출처가 없는 페이지 16개** — 페이지에 공공기관 링크가 하나도 없어 “주요 공식 출처”를
   표기하지 못했습니다. 없는 출처를 만들어 붙이지 않았습니다.
   `posts/moving-types.html`, `posts/storage-moving.html`, `interior/*.html`(8개),
   `checklists/*.html`(5개), `loan/mortgage.html`
7. **`calculators/jeonse-ratio.html`·`market-trends.html`에 데이터 기준일 표기** —
   도구 성격상 calc-meta 블록에서 제외했으나 데이터 기준일은 필요합니다.
8. **`rti-calculator.html` 보강** — 고유 콘텐츠 비율 30%(537자)로 색인 허용 페이지 중 최저입니다.
9. **EN 전용 3개 페이지 처리 결정** — `en/glossary.html`, `en/foreigner-loan.html`,
   `en/foreigner-tax.html`. 한국어판을 만들면 색인 대상이 됩니다. 또는
   `apply_index_policy.py`의 EN 게이트에서 “한국어 대응 페이지 존재” 조건을 EN 전용
   콘텐츠에 대해 완화할 수 있습니다(코드 한 줄).
10. **아파트 색인 상한 단계적 확대** — 게이트 통과 1,149개 중 100개만 열었습니다.
    색인율과 검색 성과를 2~4주 확인한 뒤 `APT_INDEX_MAX_PAGES`를 200 → 400 순으로 올리고,
    올릴 때마다 `site/data-methodology.html` 5절의 “상위 100개 이하” 문장도 함께 고쳐야
    합니다(코드와 공개 문서가 어긋나면 안 됩니다).
11. **저장소 루트 잔재** — `/sitemap.xml`(95개 URL)·`/robots.txt`·`/naverad….html`은
    배포되지 않습니다(GitHub Pages는 `site/`만 업로드). 다만 `/sitemap.xml`은
    `scripts/check_recent_issue_posts.mjs`가 참조하므로 삭제하면 그 스크립트가 깨집니다.
    이 PR에서는 건드리지 않았습니다.

---

## 9. Search Console 재제출 절차

1. **sitemap 재제출** — Search Console → Sitemaps → `https://topda.kr/sitemap.xml`
   재제출(이미 등록돼 있으면 “다시 크롤링 요청”). 하위 5개 파일이 자동으로 읽힙니다.
2. **핵심 페이지 개별 색인 요청** — URL 검사 → 색인 생성 요청:
   `/`, `/privacy.html`, `/about.html`, `/editorial-policy.html`,
   `/data-methodology.html`, `/corrections.html`, `/contact.html`,
   `/authors/jaeho-jung.html`, `/calculators/index.html`,
   `/calculators/acquisition-tax.html`, `/calculators/total-cost-dashboard.html`
3. **색인 삭제는 요청하지 않습니다.** noindex 태그를 붙였고 크롤을 허용했으므로,
   재크롤 시 자동으로 색인에서 빠집니다. “URL 삭제” 도구는 임시 조치(약 6개월)이므로
   4,700여 개에 쓸 방법이 아닙니다.
4. **2~4주 후 확인** — 페이지 → “색인이 생성되지 않음” 사유에 **“noindex 태그에 의해
   제외됨”**이 4,700여 개로 늘어나야 정상입니다. “중복, 사용자가 표준으로 지정하지 않음”이
   줄어드는지도 함께 봅니다.
5. **네이버 서치어드바이저** — 사이트맵 재제출 + 웹페이지 수집 요청(핵심 페이지 위와 동일).

---

## 10. AdSense 재심사 전 운영자 확인 체크리스트

> 재심사 요청은 이 PR에서 수행하지 않았습니다. 아래를 직접 확인한 뒤 판단하세요.
> 이 체크리스트를 통과해도 심사 결과를 보장하지는 않습니다.

**배포 후 실제 URL로 확인**

- [ ] `https://topda.kr/` — 홈에 외부 기사 제목 목록이 없는지, ‘핵심 이슈’ 섹션이
      (비어 있으면) 아예 보이지 않는지
- [ ] `https://topda.kr/privacy.html` — GA4·네이버 애널리틱스·AdSense·Supabase·localStorage
      설명이 있고, **광고가 노출되지 않는지**
- [ ] `https://topda.kr/authors/jaeho-jung.html` — 열리는지, 자격을 주장하는 문장이 없는지
- [ ] `https://topda.kr/editorial-policy.html` · `/data-methodology.html` ·
      `/corrections.html` · `/contact.html` — 열리고 광고가 없는지
- [ ] `https://topda.kr/posts/dsr-explain.html` — 상단에 `작성 정재호 · 게시 … · 최근 수정 …`이
      보이는지
- [ ] `https://topda.kr/calculators/acquisition-tax.html` — 하단 ‘이 계산기 정보’에
      적용 기준일·근거·변경 이력이 보이는지
- [ ] `https://topda.kr/apt/gyeonggi-hwaseong/dongtanyeok-sibeomunampeoseuteubilapateu/`
      (색인 허용 단지 예시 — 최신 목록은 `python _meta/build_complex_pages.py --all` 출력 참고)
      — robots 메타에 noindex가 **없는지**
- [ ] `https://topda.kr/apt/seoul-jongro/changsinisu/` (색인 보류 단지) —
      `noindex,follow`가 있고, 화면에 색인 제외 사유가 보이고, 계산기 링크가 동작하는지
- [ ] `https://topda.kr/sitemap.xml` — 하위 5개 파일 URL 합계가 293개인지
- [ ] `https://topda.kr/sitemap-all.xml` — **404가 나는지** (배포 산출물에서 제거됨)
- [ ] `https://topda.kr/board.html` — 게시판이 정상 동작하고 광고가 없는지
- [ ] `https://topda.kr/find.html?q=취득세` — 내부 검색이 동작하는지 (noindex이지만 기능 유지)
- [ ] `https://topda.kr/th/` 등 — 페이지가 열리고 언어 선택이 유지되는지 (noindex이지만 접근 유지)

**정책 정합성**

- [ ] `contact.html`에 “운영자 확인 후 게시” 같은 미완성 문구가 남아 있지 않은지
- [ ] 게시판 글쓰기에서 **비밀글**이 실제로 동작하는지 (유일한 연락 창구이므로)
- [ ] `robots.txt`에 noindex 페이지를 막는 `Disallow`를 추가하지 않았는지
- [ ] 광고 단위가 본문보다 먼저 보이거나 탐색을 방해하지 않는지 (실제 화면에서 확인)
- [ ] 새로 추가한 페이지에 사실과 다른 서술이 없는지 (특히 `privacy.html`의 처리 내역)

---

## 11. 변경 파일 목록

### 신규 (16)

```
ADSENSE_REMEDIATION_REPORT.md
reports/content-inventory.csv
reports/content-inventory.json
site/authors/jaeho-jung.html
site/editorial-policy.html
site/data-methodology.html
site/corrections.html
site/contact.html
site/en/privacy.html
_meta/audit_content.py            콘텐츠 인벤토리 감사
_meta/apply_index_policy.py       robots·AdSense·canonical·hreflang 일괄 적용
_meta/add_bylines.py              작성자·날짜·출처 + Article JSON-LD
_meta/build_calc_meta.py          계산기 '이 계산기 정보' 블록
_meta/calc_meta.json              계산기 설명 원본(직접 작성)
_meta/build_home_issues.py        홈 핵심 이슈 생성
_meta/home_issues.json            홈 핵심 이슈 원본(운영자 작성)
_meta/check_index_policy.py       15개 정책 검증
.github/workflows/check-index-policy.yml
```

### 수정 (주요)

```
site/privacy.html                 전면 재작성 (실제 구현 기준)
site/index.html                   뉴스 집계 제거 · 플레이스홀더 제거 · 핵심 이슈 마커 · 푸터
site/about.html                   운영자·원칙 절 추가 · 링크 정정
site/assets/styles.css            .byline · .calc-meta · .issue-* 스타일 추가
_meta/build_complex_pages.py      색인 품질 게이트 신설
_meta/build_sitemaps.py           noindex 판정을 head 전체로 확대
_meta/collect_news.py             홈 주입 중단 사유 문서화
.github/workflows/deploy-pages.yml   sitemap 재생성 + 내부 평면 목록 제거
.github/workflows/refresh-news.yml   index.html 커밋 대상에서 제외
site/calculators/*.html (15)      '이 계산기 정보' 블록
site/posts/*.html (34) · site/interior/*.html (9)
site/checklists/*.html (5) · site/loan/*.html (1)   byline + Article JSON-LD
site/{en,zh-Hans,zh-Hant,vi,th}/**  robots · canonical · hreflang · AdSense 범위
site/board*.html · site/feedback.html · site/find.html · site/404.html · site/market.html
site/apt/**/index.html            (커밋되지 않음 — 배포 때 생성)
```

---

## 12. 검증 명령어

```bash
# 1) 단지 페이지 생성 (커밋되지 않으므로 검증 전에 필요, 약 4분)
cd _meta && python build_complex_pages.py --all

# 2) 색인 정책 적용 (재실행 안전)
python apply_index_policy.py           # --dry-run 으로 미리 확인 가능

# 3) sitemap 재생성 (색인 허용 URL만)
python build_sitemaps.py

# 4) 정책 검증 — 15개 검사. 실패 시 exit 1
python check_index_policy.py

# 5) 콘텐츠 인벤토리 갱신
python audit_content.py                # reports/ 에 csv·json 생성
python audit_content.py --summary      # 요약만

# 6) 홈 핵심 이슈 데이터 검증
python build_home_issues.py --check

# 7) 게이트 기준별 통과 수 확인 (기준 조정 시)
python build_complex_pages.py --count

# 참고: 기준값은 환경변수로 조정
APT_INDEX_MAX_PAGES=200 python build_complex_pages.py --all
```

GitHub Actions `check-index-policy.yml`은 `main` push와 `site/**`·`_meta/**` 변경 PR에서
**1 → 6 → 4번(생성 → 이슈 데이터 검증 → 정책 검증)** 을 실행하고, 마지막에 5번 요약을 로그에
남깁니다. 2·3번(적용·재생성)은 CI에서 돌리지 않습니다 — CI는 파일을 고치는 곳이 아니고,
커밋된 sitemap과 방금 생성한 페이지가 어긋나면 4번이 실패해 알려주는 것이 목적입니다.
그때는 로컬에서 2·3번을 실행하고 결과를 커밋하면 됩니다.

배포(`deploy-pages.yml`)는 1 → 3번을 실행하고, 내부 평면 목록(`sitemap-all.xml`)을 산출물에서
제거한 뒤 업로드합니다.
