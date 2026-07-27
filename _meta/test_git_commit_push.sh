#!/usr/bin/env bash
# git_commit_push.sh 의 경합·충돌 처리 검증.
#
# 2026-07-26 실행 #72가 이 경로에서 실패했다: 스케줄 런과 수동 런이 겹쳐 push가 거절됐고,
# 59MB짜리 transactions.json을 rebase로 텍스트 병합하려다 충돌해 5회 재시도를 모두
# 소진하고 그날 수집분을 통째로 잃었다.
#
# 검증하는 것
#   1) 다른 실행이 '다른 파일'을 먼저 푸시한 경우 — 충돌 없이 rebase 되어 양쪽 다 남는다
#   2) 다른 실행이 '같은 생성물'을 먼저 푸시한 경우 — 이번 실행 결과로 확정되고,
#      그 실행이 함께 넣은 다른 파일 변경은 보존된다
#      (rebase 중 --theirs 가 재적용 중인 우리 커밋이라는 방향을 여기서 고정한다)
set -euo pipefail

SCRIPT="$(cd "$(dirname "$0")" && pwd)/git_commit_push.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export GIT_CONFIG_GLOBAL="$TMP/gitconfig"
git config --file "$GIT_CONFIG_GLOBAL" init.defaultBranch main
git config --file "$GIT_CONFIG_GLOBAL" user.name t
git config --file "$GIT_CONFIG_GLOBAL" user.email t@t

fail() { echo "❌ $1"; exit 1; }

git init -q --bare "$TMP/remote.git"
git clone -q "$TMP/remote.git" "$TMP/seed"
(
  cd "$TMP/seed"
  mkdir -p site/assets
  echo '{"deals":["base"]}' > site/assets/transactions.json
  echo '{"news":["base"]}' > site/assets/news.json
  git add -A && git commit -qm base && git push -q origin main
)

# ── 케이스 1: 다른 파일 경합 (충돌 없음) ────────────────────────────────
git clone -q "$TMP/remote.git" "$TMP/a"
git clone -q "$TMP/remote.git" "$TMP/b"
(cd "$TMP/b" && echo '{"news":["b가 먼저"]}' > site/assets/news.json \
   && git add -A && git commit -qm news && git push -q origin main)
(
  cd "$TMP/a"
  echo '{"deals":["a가 수집"]}' > site/assets/transactions.json
  bash "$SCRIPT" "실거래 갱신" site/assets/transactions.json >/dev/null 2>&1 \
    || fail "케이스1: 스크립트가 실패했다"
)
git clone -q "$TMP/remote.git" "$TMP/v1"
grep -q 'a가 수집' "$TMP/v1/site/assets/transactions.json" || fail "케이스1: 내 변경이 유실됐다"
grep -q 'b가 먼저' "$TMP/v1/site/assets/news.json"         || fail "케이스1: 상대 변경이 유실됐다"
echo "✅ 케이스1 — 다른 파일 경합: 양쪽 변경 모두 보존"

# ── 케이스 2: 같은 생성물 충돌 (#72 재현) ───────────────────────────────
git clone -q "$TMP/remote.git" "$TMP/c"
git clone -q "$TMP/remote.git" "$TMP/d"
(
  cd "$TMP/d"
  echo '{"deals":["d가 먼저 수집"]}' > site/assets/transactions.json
  echo '{"news":["d의 뉴스"]}' > site/assets/news.json
  git add -A && git commit -qm 'd 수집' && git push -q origin main
)
(
  cd "$TMP/c"
  echo '{"deals":["c가 방금 수집"]}' > site/assets/transactions.json
  bash "$SCRIPT" "실거래 갱신" site/assets/transactions.json >/dev/null 2>&1 \
    || fail "케이스2: 충돌을 해소하지 못하고 실패했다(#72와 동일한 증상)"
)
git clone -q "$TMP/remote.git" "$TMP/v2"
grep -q 'c가 방금 수집' "$TMP/v2/site/assets/transactions.json" \
  || fail "케이스2: 이번 실행 결과가 아니라 상대 값이 남았다(--theirs/--ours 방향 오류)"
grep -q 'd의 뉴스' "$TMP/v2/site/assets/news.json" \
  || fail "케이스2: 상대가 함께 넣은 다른 파일이 유실됐다"
echo "✅ 케이스2 — 같은 생성물 충돌: 이번 실행 결과로 확정 + 상대의 다른 파일 보존"

echo
echo "모든 검증 통과"
