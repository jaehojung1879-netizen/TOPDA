# 톺다 실데이터 파이프라인

공공 API로 `site/assets/apartments.json`(맞춤 내집 찾기)과 `site/assets/market.json`
(지역 시세 대시보드)을 자동 갱신합니다. GitHub Actions에서 **Secrets**로 키를 주입하며,
키는 코드·로그·정적 사이트 어디에도 노출되지 않습니다.

## 1) 등록할 GitHub Secrets
`Settings → Secrets and variables → Actions → New repository secret`

| Secret 이름 | 용도 | 발급처 |
|---|---|---|
| `DATA_GO_KR_KEY` | 국토부 실거래·K-apt·학교알리미 | 공공데이터포털(data.go.kr) — **일반 인증키(Decoding)** |
| `DATA_GO_APT_PRICE` | 실거래 상세 + 건축HUB 건축물대장(세대수·공시가격) | 위와 같은 data.go.kr 계정 키. 건축HUB는 **별도 활용신청·승인 필요** |
| `KAKAO_REST_API_KEY` | 주소→좌표, 지하철·초등학교 거리 | Kakao Developers → 앱 → REST API 키 |
| `REB_RONE_KEY` | 매매·전세 가격지수, 전세가율 | 한국부동산원 R-ONE(reb.or.kr/r-one) |
| `NAVER_MAP_CLIENT_ID` / `_SECRET` | (선택) Kakao 대체 지도 | 네이버클라우드 Maps |
| `JUSO_API_KEY` | (선택) 주소→좌표 대체 | juso.go.kr |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 게시판 공개글 공유(모든 방문자에게 노출) | Supabase 프로젝트 — 설정은 `_meta/SUPABASE_SETUP.md` 참고 |

## 2) 실행
- 자동: 매일 04:00 KST (`.github/workflows/refresh-data.yml`)
- 수동: Actions 탭 → **Refresh real-estate data** → Run workflow
- 로컬: `cd _meta && DATA_GO_KR_KEY=... KAKAO_REST_API_KEY=... python collect_apartments.py`

## 3) 수집기
| 파일 | 입력 | 출력 |
|---|---|---|
| `collect_apartments.py` | 국토부 실거래 + Kakao | `apartments.json`(단지·평형·실거래가·좌표·역/학교 거리) |
| `collect_households.py` | K-apt | `apartments.json` 세대수·준공 + `households.json`(실거래 전용 단지 세대수) |
| `collect_building_ledger.py` | 건축HUB 건축물대장(총괄표제부·표제부) + `complex_addr.json` 조회키 | `households.json` 세대수·준공연도 — **K-apt가 못 덮는 몫**. K-apt는 의무관리대상만 수록해 수록률 71%가 천장인데, 대장은 모든 건축물이 등재돼 그 천장이 없다. 단지명을 대조하지 않고 지번으로 부르므로 이름 표기 차이 문제도 없다. 대장에 없는 지번은 `data/ledger_misses.json`에 적어 45일간 다시 부르지 않는다 |
| `build_apt_pages.py` | 위 JSON 3종(키 불필요) | `site/apt/*.html` 지역별 정적 단지 페이지(네이버·구글 SEO) + `site/sitemap.xml` |
| `collect_market.py` | R-ONE | `market.json`(지역별 매매·전세 지수·전세가율) |
| `collect_news.py` | 구글 뉴스 RSS(키 불필요) | `news.json`(홈 "이번 주 핵심 이슈" + "섹터별 부동산 뉴스") |
| `collect_bond_rate.py` | 주택도시기금 포털 페이지 파싱(키 불필요·**공식 API 아님**) | `bond_rate.json`(제1종국민주택채권 당일 고객부담률) — 등기비용·종합계산기 할인율 입력란 자동 채움 |
| `collect_official_price.py` | 건축HUB 건축물대장 주택가격(`getBrHsprcInfo`) + `complex_addr.json` 조회키 | `official_price.json`(단지별 공동주택가격 = 아파트의 시가표준액) — 종합계산기·취득세 계산기의 '단지 검색으로 공시가격 넣기' 위젯. 매일 자동 실행(`refresh-official-price.yml`), 거래가 많은 단지부터 채운다(아래 6번) |
| `lib_pdata.py` | 공용 유틸 | — |

## 6) 공동주택 공시가격 (시가표준액 검색)

**출처**: 국토교통부 건축HUB 건축물대장정보 서비스 `getBrHsprcInfo`(apis.data.go.kr).
`DATA_GO_APT_PRICE` 키로 부르되, data.go.kr에서 **'국토교통부_건축HUB_건축물대장정보 서비스'를
활용신청·승인**해야 한다(미승인이면 수집기가 권한 오류를 남기고 중단한다).

V-World 경로(Kakao 주소→PNU→`getApartHousingPriceAttr`)는 2026-07-27에 걷어냈다.
`api.vworld.kr`이 GitHub Actions의 클라우드 IP를 차단해 한 건도 못 모았고(브라우저·가정용
네트워크에서는 같은 키로 정상 응답), data.go.kr의 같은 데이터는 API 유형이 `LINK`라
vworld.kr로 리다이렉트될 뿐이어서 우회가 안 됐다. `VWORLD_*` 시크릿은 더 이상 쓰이지 않는다.

### 응답 항목은 '호 × 공시연도'다 — 섞으면 안 된다

이 API가 돌려주는 항목 하나는 전유부(호) 하나가 아니라 **호 하나의 공시연도 하나**다.
1,000세대 단지에 10년치 이력이 있으면 10,000건이 나온다. 2026-08-01 이전 구현은 이걸 모르고
전량을 한 통에 담아 요약해, 2013년 가격과 2026년 가격이 섞인 중앙값을 시가표준액으로 내보냈다
(수집된 28개 중 18개가 페이지 상한 6,000건에 걸려 잘리기까지 했다). 지금은 `stdDay`별로
나눠 담고 **가장 최근 공시기준일의 가격만** 요약한다. 레코드의 `v`가 형식 판이고,
판이 낮은 레코드는 기준연도와 무관하게 다시 부른다.

### 페이지 표본

첫 페이지의 `totalCount`로 전체 페이지 수를 구한 뒤 그 범위에 고르게 흩어 `SAMPLE_PAGES`(6)개만
읽는다. 항목이 동·호 순서라 앞쪽만 읽으면 저층 편향이 생기지만, 고르게 흩으면 그 편향이 없다 —
중앙값을 내는 데 전수가 필요하지는 않다. 단지당 호출이 최대 60회에서 6회로 줄었다.

### 처리 순서

`finder_index.json`의 유효거래수 내림차순으로 채운다. 전국 16,000여 개를 다 채우는 데 며칠이
걸리는데, 그동안 검색되는 단지가 사람들이 실제로 찾는 단지여야 위젯이 쓸모 있다.
아직 안 채워진 단지는 위젯이 "아직 수록되지 않은 단지입니다"와 함께 부동산공시가격알리미
링크를 보여준다.

로컬에서 한 번에 다 채우려면(`TIME_BUDGET_MIN=0`이 무제한):

```bash
cd _meta
DATA_GO_APT_PRICE=... TIME_BUDGET_MIN=0 python collect_official_price.py
```

이미 올해 기준일로 채운 단지는 건너뛰므로 재실행해도 안전하다.

## 4) R-ONE (지역 시세 대시보드)
`collect_market.py`는 통계표를 **STATBL_ID로 호출하고 지역코드는 지정하지 않아**,
R-ONE이 돌려주는 **전 지역(전국·시도·시군구)** 을 자동 수집합니다(→ 구 단위까지).
- 매매가격지수(아파트): `A_2024_00045`
- 전세가격지수(아파트): `A_2024_00050` — **이 ID가 죽으면 수집기가 자동 발견**을 시도한다:
  ① 통계표 목록 API(SttsApiTbl.do)에서 이름("아파트 전세가격지수")으로 검색 →
  ② 실패 시 A_2024_00040~00070 후보를 탐색해 지수형 표를 채택.
  채택된 ID는 CI 로그와 `market.json`의 `_meta.auto_discovered`에 남으니 확인 후 여기 고정할 것.
- 전세가율(매매가격대비 전세가격비율): `METRICS["jeonse_ratio"]` 비어 있음 →
  R-ONE easyStat에서 해당 통계표를 찾아 URL의 `A_2024_xxxxx`를 넣으면 자동 반영됩니다.
- 매매가격지수 수집 실패 시 기존 `market.json` 보존.
- **전세가율**: 평균가격 역산(AVG A_2024_00188/00190)은 추정 ID라 비는 경우가 있다.
  R-ONE easyStat에서 **아파트 매매가격대비 전세가격비율(월간)** 통계표의 `A_2024_xxxxx`를 찾아
  GitHub 변수/시크릿 **`RONE_RATIO_STATBL_ID`** 로 넣으면 그 표를 직접 사용한다(권장·정확).

### 오피스·상가 임대 지표
`collect_commercial.py`는 임대료·공실률·투자수익률의 최신 진행 통계표를 자동 탐색합니다.
`RONE_COMM_TABLES` 변수를 설정하면 지정한 통계표 ID를 우선 사용합니다.
- 분기 조회는 R-ONE 규격인 `DTACYCLE_CD=QY`와 단일 `WRTTIME_IDTFR_ID=YYYY0Q`를 사용합니다.
- 지역별 임대료의 `천원/㎡` 값은 화면 표시 단위인 `원/㎡`로 변환합니다.
- API 오류, 빈 응답 또는 최소 품질 기준 미달 시 기존 `site/assets/commercial.json`을 덮어쓰지 않습니다.

## 5) 부동산 뉴스 (홈 핵심 이슈·섹터별 뉴스)
`collect_news.py`는 **구글 뉴스 RSS(한국어)** 를 섹터별(주택 매매·집값 / 전세·월세 /
청약·분양 / 대출·금융 / 오피스·상업용 / 정책·세제)로 검색해 `news.json`을 만든다(섹터당 핵심
2~3건, 가로형 노출). 주간 "한눈에"는 그 주 가장 많이 다뤄진 기사 한 줄. **API 키가 필요 없다.**
- 자동: 매일 00:10 KST (`.github/workflows/refresh-news.yml`) — 섹터별 뉴스는 매일,
  주간 요약/카드는 한 주간 헤드라인을 매일 다시 집계(주차 라벨은 매주 자동 변경).
- 수동: Actions 탭 → **Refresh real-estate news** → Run workflow
- 로컬: `cd _meta && python collect_news.py`
- 프런트: `site/assets/app.js`가 `assets/news.json`을 fetch해 홈을 채우고, 없으면 정적 HTML로 폴백.
- 격리 샌드박스에서는 `news.google.com` 접근이 막혀 0건일 수 있으나, CI 러너에서는 정상 동작한다.

## 안전장치
- 모든 수집기는 **실패·빈 결과 시 기존 JSON을 덮어쓰지 않습니다**(`save_json_safe`).
- `apartments.json` 병합은 큐레이션 값(세대수·노선 등)을 보존하고 가격·좌표만 갱신합니다.
- 외부 파이썬 의존성 없음(표준 라이브러리만) — CI에서 `pip install` 불필요.

## 문제해결 (2026-06 갱신)
- **첫 실행 시 `환경변수 ... 가 없습니다` 오류** → Secret 이름 불일치입니다. 아래 **표준 이름**으로 등록하세요(Kakao는 이미 정상):
  - 국토부: `DATA_GO_KR_KEY` · 한국부동산원: `REB_RONE_KEY`
  - 코드가 별칭도 인식합니다 — 국토부: `DATA_GO_KR_SERVICE_KEY/DATA_GO_KR/PUBLIC_DATA_KEY/MOLIT_KEY`, R-ONE: `R_ONE_KEY/R_ONE/RONE_KEY/REB_KEY`
- **국토부 엔드포인트**: 활용신청한 상세자료(`RTMSDataSvcAptTradeDev`)에 맞춰 호출합니다. 키는 **Decoding(일반 인증키)** 사용.
- `DATA_GO_KR_KEY`는 hex 형태(특수문자 없음)라 인코딩 이슈가 없습니다.
- **`collect_bond_rate.py`는 공식 오픈API가 아니라 페이지 파싱**입니다(국민주택채권 할인율은 공공데이터포털에 깨끗한 API가 없음). 배포 후 첫 실행에서 Actions 로그의 `[bond_rate]` 라인을 꼭 확인하세요 — 정규식이 실제 페이지 구조와 안 맞으면 "파싱 실패" 메시지만 남고 기존 값을 유지합니다(사이트는 안 깨지지만 값이 안 바뀜). 실패 시 로그에 찍히는 "부담률/할인율 주변 텍스트"를 보고 `PATTERNS` 정규식을 조정하세요.
