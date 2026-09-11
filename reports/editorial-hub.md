# 읽을거리 운영 구조

## 이번 개편

- 홈의 매매 바로 다음에 `읽을거리` 타일. 데스크톱은 7열, 태블릿 4열, 모바일 2열.
- 카테고리 다음, 계산기 앞에 최신 발행 글 3편과 주간 시장분석 영역.
- 기존 `/posts/index.html` URL을 유지하면서 최신 글 / 주간 시장분석 / 전체 아카이브로 구성.
- 기존 등록 글을 유지하고 본문 `datePublished` 내림차순, 같은 날짜는 URL 순으로 정렬.
- `전체 / 실용 가이드 / 주간 시장분석`과 주제·텍스트 검색을 함께 적용.
- 기존 `?cat=전세·월세` 링크를 지원. `?series=market`, `?series=guide`, `?q=검색어`도 지원.
- 글은 정적 HTML로 제공하므로 JS 없이도 읽기 가능. 필터에만 JS 사용.
- 계산기, 본문, 기존 글 URL, RSS 발행 대상은 변경하지 않음. 예약 생성이나 실제 주간 포스트 작성도 이번 범위가 아님.

## 기존 실용 콘텐츠 발행

기존대로 본문을 작성하고 `site/posts/index.html`의 `postGrid`에 글 카드를 추가한다.
분류용 별도 JSON은 없다. 종류 미지정 시 `guide`로 처리한다.
본문의 발행일을 읽으므로 제목에 날짜를 넣거나 수정일을 발행일로 바꾸지 않는다.

`python _meta/build_editorial.py`를 실행하면 홈 최신 글, 허브 상단, 카드 날짜와 정렬을 갱신한다.
배포 워크플로도 같은 명령을 실행한다. 기존 콘텐츠 PR이 생성기를 호출하지 않아도 배포 때 반영된다.
생성 구간(`editorial:*` 마커 내부)을 손으로 수정하지 않는다.

## 주간 시장분석 발행

본문과 카드 등록은 동일하다. 본문의 `<head>`에 다음 메타를 추가한다.

```html
<meta name="topda-series" content="market" />
<meta name="topda-period" content="2026.09.07~2026.09.13" />
```

위 기간은 형식 예시이며 실제 분석 대상 기간으로 교체한다. 본문의 `datePublished`도 필수다.
주제(`data-cat`)와 연재 종류는 별개다. `시장·투자` 주제의 기존 가이드를 자동으로 주간 분석으로 취급하지 않는다.
분석 본문에는 자료 기준일·관찰 기간·공식 출처·사실과 해석·다음 관찰 지표를 명시한다.
이번 변경은 레이아웃만 제공하며 분석 내용의 타당성 검토를 대체하지 않는다.

첫 주간 글이 등록되면 홈/허브 우측에 최신 주간 글과 분석 기간이 자동 노출되고,
`주간 시장분석` 필터에서 과거 회차를 조회할 수 있다.
발행 전에는 가짜 글이나 빈 링크 대신 기존 시세 대시보드·실거래가 조회 링크를 제공한다.

## 검증

```sh
python -m unittest discover -s _meta -p 'test_build_editorial.py' -v
python _meta/build_editorial.py
python _meta/build_editorial.py --check
node --check site/assets/editorial.js
python _meta/check_index_policy.py
python _meta/build_feed.py --check
```

`.github/workflows/check-editorial.yml`은 PR에서 생성기와 필수 메타, 중복·깨진 글 링크,
noindex 제외, 발행일 정렬, 주간 회차 등장, 재생성 안정성을 검증한다.
브라우저 검사에서는 360/390/768/1440px 가로 넘침, 매매 옆 진입점, 필터 조합과 URL 유지,
모바일 메뉴, JavaScript 비활성 상태의 글 접근을 확인하고 화면 캡처를 Actions artifact로 남긴다.
