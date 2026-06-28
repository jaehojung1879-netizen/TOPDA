# 톺다 실데이터 파이프라인

공공 API로 `site/assets/apartments.json`(맞춤 내집 찾기)과 `site/assets/market.json`
(지역 시세 대시보드)을 자동 갱신합니다. GitHub Actions에서 **Secrets**로 키를 주입하며,
키는 코드·로그·정적 사이트 어디에도 노출되지 않습니다.

## 1) 등록할 GitHub Secrets
`Settings → Secrets and variables → Actions → New repository secret`

| Secret 이름 | 용도 | 발급처 |
|---|---|---|
| `DATA_GO_KR_KEY` | 국토부 실거래·K-apt·학교알리미 | 공공데이터포털(data.go.kr) — **일반 인증키(Decoding)** |
| `KAKAO_REST_API_KEY` | 주소→좌표, 지하철·초등학교 거리 | Kakao Developers → 앱 → REST API 키 |
| `REB_RONE_KEY` | 매매·전세 가격지수, 전세가율 | 한국부동산원 R-ONE(reb.or.kr/r-one) |
| `NAVER_MAP_CLIENT_ID` / `_SECRET` | (선택) Kakao 대체 지도 | 네이버클라우드 Maps |
| `JUSO_API_KEY`, `VWORLD_KEY` | (선택) 주소→좌표 대체 | juso.go.kr / vworld.kr |

## 2) 실행
- 자동: 매일 04:00 KST (`.github/workflows/refresh-data.yml`)
- 수동: Actions 탭 → **Refresh real-estate data** → Run workflow
- 로컬: `cd _meta && DATA_GO_KR_KEY=... KAKAO_REST_API_KEY=... python collect_apartments.py`

## 3) 수집기
| 파일 | 입력 | 출력 |
|---|---|---|
| `collect_apartments.py` | 국토부 실거래 + Kakao | `apartments.json`(단지·평형·실거래가·좌표·역/학교 거리) |
| `collect_market.py` | R-ONE | `market.json`(지역별 매매·전세 지수·전세가율) |
| `collect_news.py` | 구글 뉴스 RSS(키 불필요) | `news.json`(홈 "이번 주 핵심 이슈" + "섹터별 부동산 뉴스") |
| `lib_pdata.py` | 공용 유틸 | — |

## 4) R-ONE (지역 시세 대시보드)
`collect_market.py`는 통계표를 **STATBL_ID로 호출하고 지역코드는 지정하지 않아**,
R-ONE이 돌려주는 **전 지역(전국·시도·시군구)** 을 자동 수집합니다(→ 구 단위까지).
- 매매가격지수(아파트): `A_2024_00045`
- 전세가격지수(아파트): `A_2024_00050`
- 전세가율(매매가격대비 전세가격비율): `METRICS["jeonse_ratio"]` 비어 있음 →
  R-ONE easyStat에서 해당 통계표를 찾아 URL의 `A_2024_xxxxx`를 넣으면 자동 반영됩니다.
- 매매가격지수 수집 실패 시 기존 `market.json` 보존.
- **전세가율**: 평균가격 역산(AVG A_2024_00188/00190)은 추정 ID라 비는 경우가 있다.
  R-ONE easyStat에서 **아파트 매매가격대비 전세가격비율(월간)** 통계표의 `A_2024_xxxxx`를 찾아
  GitHub 변수/시크릿 **`RONE_RATIO_STATBL_ID`** 로 넣으면 그 표를 직접 사용한다(권장·정확).

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
