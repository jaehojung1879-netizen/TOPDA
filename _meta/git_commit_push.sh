#!/usr/bin/env bash
# 수집 산출물 커밋·푸시 공용 스크립트.
#
# 왜 필요한가: refresh-listings / refresh-news / refresh-market 워크플로가 스케줄 지연으로
# 겹쳐 돌면, 한쪽이 커밋·푸시하는 사이 다른 쪽이 main을 먼저 갱신해 push가
# non-fast-forward로 거절된다(2026-06-29~07-02 연속 실패 원인). 여기서는 푸시 거절 시
# rebase 후 지수 백오프로 재시도해 경합을 흡수한다.
#
# 사용: git_commit_push.sh "<커밋 메시지>" <파일...>
set -euo pipefail

MSG="$1"; shift

git config user.name "topda-bot"
git config user.email "actions@users.noreply.github.com"

if [ -z "$(git status --porcelain -- "$@")" ]; then
  echo "변경 없음 — 커밋 생략: $*"
  exit 0
fi

BRANCH="${GITHUB_REF_NAME:-main}"
git add -- "$@"
git commit -m "$MSG"

for i in 1 2 3 4 5; do
  if git push origin "HEAD:${BRANCH}"; then
    exit 0
  fi
  echo "push 거절(${i}/5) — 원격 변경 반영 후 재시도"
  sleep $((2 ** i))
  if ! git pull --rebase --autostash origin "${BRANCH}"; then
    git rebase --abort || true
  fi
done

echo "::error::push 실패: $*"
exit 1
