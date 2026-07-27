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
  if git pull --rebase --autostash origin "${BRANCH}"; then
    continue
  fi

  # 여기까지 오면 rebase 충돌이다. 이 스크립트가 다루는 파일은 전부 수집기가 통째로
  # 다시 쓰는 생성물(transactions.json 등)이라, 텍스트 병합이 성립하지 않는다.
  # 실제로 2026-07-26 실행 #72가 59MB짜리 transactions.json에서 충돌해 5회 재시도를
  # 모두 소진하고 그날 수집분을 통째로 잃었다.
  #
  # 생성물의 옳은 해소는 '이번 실행이 방금 만든 값'을 쓰는 것이다. rebase 중에는
  # --theirs 가 재적용 중인 우리 커밋을 가리킨다(--ours 는 원격). 헷갈리기 쉬운 지점이라
  # 아래 테스트(_meta/test_git_commit_push.sh)로 방향을 고정해 두었다.
  #
  # 이렇게 하면 상대 실행이 같은 파일에 넣은 최신분을 일시적으로 덮을 수 있지만,
  # 수집기는 증분 병합이라 다음 실행이 다시 채운다. 푸시를 통째로 실패시켜 그날 수집분을
  # 전부 잃는 것보다 낫다. 다른 파일(뉴스·시세 등)의 원격 변경은 그대로 유지된다.
  CONFLICTED="$(git diff --name-only --diff-filter=U || true)"
  if [ -n "$CONFLICTED" ]; then
    echo "생성물 충돌 — 이번 실행 결과로 확정: $(echo "$CONFLICTED" | tr '\n' ' ')"
    echo "$CONFLICTED" | while IFS= read -r f; do
      [ -n "$f" ] || continue
      git checkout --theirs -- "$f" 2>/dev/null || true
      git add -- "$f"
    done
    if GIT_EDITOR=true git rebase --continue; then
      continue
    fi
  fi
  git rebase --abort 2>/dev/null || true
done

echo "::error::push 실패: $*"
exit 1
