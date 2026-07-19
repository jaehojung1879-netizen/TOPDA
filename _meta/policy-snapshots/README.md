# policy-snapshots

`policy-watch` 워크플로(`scripts/policy_watch.mjs`)가 외국인 대출·부동산 정책 페이지의
정규화 텍스트 해시를 `snapshots.json` 에 저장하고, 다음 실행 때 비교해 **변경을 감지**한다.

- 최초 실행에서 각 대상의 baseline 해시가 채워진다(`{}` 는 초기 상태).
- 변경 감지 시 워크플로가 **GitHub Issue 를 생성**하며, 콘텐츠 자동 반영은 하지 않는다
  (오판 방지 — 재호님이 공식 페이지 확인 후 수동 반영).
- 대상 목록은 `scripts/policy_watch.mjs` 의 `TARGETS` 에서 관리.
