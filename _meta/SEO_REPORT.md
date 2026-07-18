# TOPDA(톺다) SEO 정비 리포트

> 작성일: 2026-07-18 · 대상 브랜치: `claude/topda-seo-optimization-rlz0sn`
> 범위: 정적 사이트(GitHub Pages) 기술적 SEO 점검 · 갭 보완 · 수동 과제 정리

---

## 0. 한 줄 결론

**이 저장소는 이미 SPA가 아니라 "URL 단위로 분리된 다중 페이지 정적 사이트"이고, 기술적 SEO의 약 90%가 이미 구축돼 있었다.** 따라서 1단계 지시의 핵심 우려(“도구별 색인 URL이 없다”)는 해당되지 않는다. 이번 작업은 **대규모 리팩토링이 아니라, 남아 있던 콘텐츠·구조 갭을 최소 침습으로 보완**하는 방향으로 진행했다.

---

## 1. 현황 조사 결과

### 1-1. 페이지 구조 (가장 중요) — ✅ 이미 독립 URL

SPA가 아니다. 각 도구·문서가 **실제 경로 기반의 개별 HTML 파일**로 존재한다. 해시(#) 라우팅 아님.

| 구분 | 위치 | 개수 | 예시 URL |
|---|---|---|---|
| 계산기 | `site/calculators/*.html` | 20 | `/calculators/acquisition-tax.html` |
| 체크리스트 | `site/checklists/*.html` | 6 | `/checklists/lease-contract.html` |
| 지역별 시세 | `site/apt/*.html` | 80 | `/apt/서울-강남구.html` |
| 가이드(글) | `site/posts/*.html` | 32 | |
| 카테고리 | `site/categories/*.html` | 5 | |
| 인테리어 | `site/interior/*.html` | 8 | |
| 영문 | `site/en/**` | 6 | `/en/calculators/acquisition-tax.html` |

→ **URL 분리 작업 불필요.** 이번 작업의 “최우선 과제”로 지목됐던 부분이 이미 완료 상태였다.

### 1-2. 현재 SEO 자산 — 대부분 존재

| 자산 | 상태 | 비고 |
|---|---|---|
| `site/sitemap.xml` | ✅ 172 URL, apt 80개 포함 | `_meta/build_apt_pages.py`가 `/apt/` 항목 자동 재생성 |
| `site/robots.txt` | ✅ 전체 허용 + sitemap 명시 | |
| `site/CNAME` | ✅ `topda.kr` (커스텀 도메인 이미 연결) | |
| 페이지별 `<title>`/`description`/`<h1>` | ✅ 고유값 | inject_seo + 각 빌더가 관리 |
| `canonical` | ✅ 전 페이지 절대경로 | |
| Open Graph / Twitter Card | ✅ (apt 페이지는 Twitter 태그 일부 누락) | |
| `hreflang` (ko/en) | ✅ 1:1 대응 페이지에 부여 | |
| JSON-LD | ✅ Organization·WebSite·BreadcrumbList·WebApplication | FAQPage·SearchAction은 **없었음** → 이번에 추가 |
| 사이트 소유확인 | ⚠ placeholder 상태 | 아래 4-1, 4-2 참고 |

> 참고: 저장소 **루트**의 `sitemap.xml`, `robots.txt`, `naverad...html`은 **배포되지 않는 잔재**다. GitHub Pages는 `site/` 폴더만 업로드하므로(`.github/workflows/deploy-pages.yml`), 실제 서비스되는 파일은 `site/` 안의 것들이다. 혼동을 줄이려면 루트 사본을 정리하는 것을 권장(선택).

### 1-3. 기술 스택 · 빌드 방식

- **정적 HTML 직접 작성 + Python 빌드 스크립트**(`_meta/*.py`). Jekyll 아님.
- 공통 메타/OG/JSON-LD 주입: `_meta/inject_seo.py` — `<!-- seo:meta -->` 마커로 **멱등** 주입. (계산기·체크리스트·가이드 등 손으로 쓴 페이지 대상)
- 지역 페이지: `_meta/build_apt_pages.py`가 페이지 HTML + `/apt/` sitemap 항목을 **자체 생성**.
- 배포: `deploy-pages.yml`이 Kakao/Supabase 키를 주입한 뒤 `site/`를 Pages로 업로드. **`inject_seo.py`는 CI에 포함돼 있지 않고, 커밋 전에 수동 실행**하는 개발 도구다.
- → 메타태그는 각 페이지 `<head>`에 이미 인라인돼 있으므로, 전 페이지 반영을 위해 별도 include 레이어를 만들 필요가 없다.

---

## 2. 이번에 변경한 내용

모두 **기존 기능을 건드리지 않는 추가(additive)** 변경이며, 계산 로직·DOM 훅(`data-*`)·스크립트는 손대지 않았다.

| # | 파일 | 변경 | 이유 |
|---|---|---|---|
| 1 | `site/index.html` | WebSite JSON-LD에 `SearchAction`(`potentialAction`) 추가 → `/find.html?q=` | 구글 **sitelinks 검색창** 후보 등록 (2-3 지시) |
| 2 | `_meta/inject_seo.py` | `build_org_website()`에 동일 `SearchAction` 반영 | 스크립트 재실행 시에도 검색창 유지(일관성) |
| 3 | `site/calculators/acquisition-tax.html` | `자주 묻는 질문` 섹션(4문항) + `FAQPage` JSON-LD | 콘텐츠 구조(FAQ) + 리치결과 자격 (2-3, 3단계) |
| 4 | `site/calculators/brokerage-fee.html` | 위와 동일(4문항) | 〃 |
| 5 | `site/calculators/balance-settlement.html` | 위와 동일(4문항) | 〃 |
| 6 | `_meta/SEO_REPORT.md` | 본 리포트 | 산출물(4단계) |

### FAQ 콘텐츠 원칙
FAQ 답변은 **각 페이지가 이미 1차 출처와 대조해 명시하고 있는 사실만 재구성**했다(새로운 세법 주장 없음). 예: 취득세 세율표·생애최초 감면(지방세특례제한법 제36조의3)·85㎡ 농특세 면제 등은 모두 해당 페이지의 요율표/설명/출처에 존재하는 내용이다. 화면에 보이는 텍스트와 JSON-LD의 답변 텍스트를 **동일**하게 맞춰 구글의 FAQ 리치결과 정책(보이는 내용 = 마크업)을 만족시켰다.

---

## 3. 남은 갭 (이번 범위에서 의도적으로 제외 — 근거 포함)

바로 확정하지 않고 선택지/근거를 남긴다. (제약: 임의 확정 금지)

1. **나머지 17개 계산기 FAQ 확장** — 3종(P1)에 검증된 패턴을 심었다. 나머지는 각 도메인 사실을 정확히 답변해야 하므로(세무 정확성 = 사이트의 핵심 가치), 아래 5장 스니펫을 그대로 복사해 **페이지에 이미 적힌 사실만** 문답으로 옮기면 된다. 자동 대량 생성은 오답 리스크가 커서 지양했다.
2. **apt 80페이지 보강** — 현재 title/desc/canonical/OG는 있으나 Twitter 카드·`og:site_name`/`og:locale`·분석 스크립트·JSON-LD(BreadcrumbList/Dataset)가 없다. `build_apt_pages.py`의 `page_head()`에 한 번 추가하면 80페이지에 일괄 반영된다. (대량 파일 재생성이라 별도 논리 단위로 진행 권장)
3. **루트 잔재 파일 정리** — `/sitemap.xml`, `/robots.txt`(비배포)와 `site/` 사본의 이중 관리. 삭제 여부는 운영자 판단.
4. **OG 대표 이미지 제작** — 아래 4-4.

---

## 4. 내가(운영자) 수동으로 해야 할 일 체크리스트

### 4-1. 구글 서치콘솔 (Google Search Console)
1. https://search.google.com/search-console 접속 → **URL 접두어** 방식으로 `https://topda.kr/` 등록.
2. **소유확인**: 두 방법 중 택1.
   - (권장) **DNS TXT 레코드** — 도메인 등록처에서 구글이 준 `google-site-verification=...` TXT를 추가.
   - **HTML 태그** — `site/index.html`의 `<meta name="google-site-verification" content="GOOGLE_SITE_VERIFICATION_PLACEHOLDER" />`에서 placeholder를 실제 값으로 교체 후 커밋·배포.
3. 좌측 **Sitemaps** → `https://topda.kr/sitemap.xml` 제출.
4. 색인은 보통 수일~수주. **URL 검사 → 색인 요청**으로 주요 페이지 가속 가능.

### 4-2. 네이버 서치어드바이저 (Naver Search Advisor)
1. https://searchadvisor.naver.com → 사이트 등록 `https://topda.kr/`.
2. **소유확인**: 이미 `site/naverad49c771a0767deb237476d745c1ee22.html` 파일이 배포돼 있어 **HTML 파일 업로드 방식**이 준비된 상태로 보인다. 서치어드바이저의 확인 파일명이 이 파일과 일치하는지 확인하고 “확인” 클릭. (불일치 시 새 파일로 교체하거나, `site/index.html`의 `NAVER_SITE_VERIFICATION_PLACEHOLDER` 메타를 실제 값으로 교체.)
3. **요청 → 사이트맵 제출**에 `https://topda.kr/sitemap.xml` 등록, **robots.txt** 수집도 확인.
4. ⚠ **네이버는 색인·노출까지 통상 1~4주** 소요된다. 등록 직후 노출이 없어도 정상이다.

### 4-3. 커스텀 도메인 / DNS (이미 `topda.kr` 연결됨)
- `site/CNAME` = `topda.kr` 이미 존재. GitHub Pages Settings의 커스텀 도메인·**Enforce HTTPS** 체크 확인.
- DNS(도메인 등록처): 정점(apex) `topda.kr`은 GitHub Pages A레코드 4개(185.199.108~111.153), `www`는 CNAME `jaehojung1879-netizen.github.io`.
- **도메인을 바꾸게 되면 함께 수정할 파일**:
  - `site/CNAME`
  - `_meta/inject_seo.py`의 `BASE`, `_meta/build_apt_pages.py`의 `BASE`(canonical·og:url·sitemap loc 전부 여기서 파생) → 스크립트 재실행
  - `site/robots.txt`의 `Sitemap:` 경로
  - 소유확인/서치콘솔·서치어드바이저 재등록

### 4-4. Open Graph 대표 이미지 제작 (**이미지 제작 필요**)
- 현재 `og:image` = `/assets/images/brand/logo.png` (약 700KB, 정사각 로고). SNS 카드용으로 부적합.
- **1200×630px PNG/JPG** 대표 이미지 제작 후 `/assets/og-default.png` 등으로 배치하고, `inject_seo.py`의 `OG_IMAGE`(및 필요 시 `build_apt_pages.py`)를 그 경로로 교체 → 재주입.
- `site/assets/og-default.svg`가 있으나 **페이스북·카카오·네이버는 SVG OG 이미지를 신뢰성 있게 렌더링하지 않으므로** 래스터(PNG/JPG)로 만들어야 한다.

### 4-5. 콘텐츠·채널 운영 과제 (코드 범위 밖)
- **네이버 유입 채널**: 네이버는 외부 사이트 직접 노출이 구조적으로 제한적이다. **부동산 전문 네이버 블로그를 병행 운영**해 각 글에서 TOPDA 계산기/가이드로 유입을 유도하는 별도 채널 전략이 필요하다. (이번 코드 작업 밖의 지속 운영 과제)
- **롱테일 키워드**: 각 도구 페이지의 title/h1/FAQ에 “1주택 양도세”, “생애최초 취득세 감면”, “전세보증금 반환”, “리모델링 분담금” 등 구체 키워드를 계속 반영.

---

## 5. 나머지 계산기에 FAQ를 추가하는 재사용 스니펫

`<summary>출처</summary>` 섹션 **바로 앞**에 아래를 붙여넣고, 질문/답변을 그 페이지에 이미 적힌 사실로 채운다. **보이는 답변 텍스트와 JSON-LD `text`를 동일하게** 유지할 것.

```html
<section style="margin-top: 48px;" aria-labelledby="faq-heading">
  <h2 id="faq-heading" style="margin-bottom: 16px;">자주 묻는 질문</h2>
  <details class="explain">
    <summary>질문 1</summary>
    <div class="explain-body"><p>답변 1</p></div>
  </details>
  <!-- 문항 반복 -->
</section>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "질문 1",
      "acceptedAnswer": { "@type": "Answer", "text": "답변 1" } }
  ]
}
</script>
```

---

## 6. 자체 검증

- **JSON-LD 문법**: 변경한 4개 파일의 모든 `application/ld+json` 블록을 파서로 로드해 통과 확인.
  - `index.html` → Organization, WebSite(+SearchAction)
  - 3개 계산기 → BreadcrumbList, WebApplication, FAQPage
- **FAQ 정책**: 화면 노출 텍스트 = 마크업 텍스트 일치.
- **비파괴 확인**: 계산기 폼·결과·스크립트 영역 미변경(추가 섹션만 삽입). `data-*` 훅·`app.js`/`rates.js` 로드 그대로.
- **구글 Rich Results Test / 스키마 검증기**: 배포 후 `https://search.google.com/test/rich-results`에 대표 URL(취득세 계산기)로 FAQ·WebApplication 인식 여부 최종 확인 권장.
