#!/usr/bin/env python3
"""편집기에서 저장한 본문 수정본을 실제 HTML 파일에 굽는다.

배포 워크플로가 **맨 앞에서** 실행한다. 여기서 파일을 고치고 커밋해야, GitHub Pages 가
서빙하는 HTML 안에 글자가 그대로 들어간다(검색엔진이 보는 것과 사람이 보는 것이 같아진다).

    python3 _meta/apply_overrides.py

필요한 환경변수 (셋 중 하나라도 없으면 아무 것도 하지 않고 정상 종료한다)
    SUPABASE_URL        프로젝트 URL
    SUPABASE_ANON_KEY   Publishable key
    BOARD_ADMIN_KEY     Vault 의 board_admin_key 와 같은 값 (GitHub Secret)

동작
    1. admin_list_overrides(only_pending=true) 로 아직 굽지 않은 수정본을 받는다
    2. site/{page} 를 열어 data-edit="{block}" 요소의 **안쪽만** 교체한다
       (요소 자체·클래스·속성은 손대지 않는다)
    3. 파일을 쓴 뒤 admin_mark_override_applied() 로 표시한다
    4. 찾지 못한 블록은 표시하지 않고 경고만 남긴다 — 다음 실행에서 다시 시도한다

실패 정책
    파일을 못 찾거나 블록이 사라진 경우는 **건너뛰고 계속**한다(그 수정본만 미반영).
    네트워크·인증 실패는 0을 반환하고 조용히 끝낸다 — 배포를 막을 이유가 없다.
    잘못 구운 HTML 을 올리는 것보다 안 굽는 쪽이 안전하다.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))
TIMEOUT = 20


def rpc(base_url: str, anon_key: str, name: str, payload: dict):
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/rest/v1/rpc/{name}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body.strip() else None


def find_block(text: str, block: str):
    """data-edit="{block}" 요소의 (안쪽 시작, 안쪽 끝)을 돌려준다. 없으면 None."""
    marker = re.search(
        r'<([a-zA-Z0-9]+)([^>]*\sdata-edit="' + re.escape(block) + r'")([^>]*)>',
        text,
    )
    if not marker:
        return None
    tag = marker.group(1)
    inner_start = marker.end()

    depth = 1
    pattern = re.compile(r"<(/?)" + re.escape(tag) + r"(\s|>|/)", re.I)
    pos = inner_start
    while True:
        match = pattern.search(text, pos)
        if not match:
            return None
        if match.group(1) == "/":
            depth -= 1
            if depth == 0:
                return inner_start, match.start()
            pos = match.end()
            continue
        close = text.find(">", match.end())
        if close == -1:
            return None
        if text[close - 1] != "/":
            depth += 1
        pos = close + 1


def main() -> int:
    base_url = os.environ.get("SUPABASE_URL", "").strip()
    anon_key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    admin_key = os.environ.get("BOARD_ADMIN_KEY", "").strip()

    if not (base_url and anon_key and admin_key):
        print("[본문 수정본] 환경변수 미설정 — 건너뜁니다(정상).")
        return 0

    try:
        rows = rpc(base_url, anon_key, "admin_list_overrides", {
            "admin_key": admin_key, "in_page": None, "only_pending": True,
        }) or []
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:200]
        print(f"[본문 수정본] 조회 실패({error.code}) — 건너뜁니다. {detail}")
        return 0
    except Exception as error:                                  # noqa: BLE001
        print(f"[본문 수정본] 조회 실패 — 건너뜁니다. {error}")
        return 0

    if not rows:
        print("[본문 수정본] 반영 대기 중인 수정 없음.")
        return 0

    # 파일을 여러 번 열지 않도록 페이지별로 모은다.
    by_page: dict[str, list[dict]] = {}
    for row in rows:
        by_page.setdefault(row["page"], []).append(row)

    applied, skipped, touched = 0, 0, []
    for page, items in sorted(by_page.items()):
        # 경로 방어 — SQL 제약과 별개로 여기서도 site/ 밖으로 못 나가게 막는다.
        target = os.path.normpath(os.path.join(SITE, page))
        if not target.startswith(SITE + os.sep) or not os.path.exists(target):
            print(f"  ! 파일 없음, 건너뜀: {page}")
            skipped += len(items)
            continue

        with open(target, encoding="utf-8") as handle:
            text = handle.read()
        original = text
        done_ids = []

        # 뒤쪽 블록부터 바꿔야 앞쪽 위치가 흔들리지 않는다.
        located = []
        for row in items:
            span = find_block(text, row["block"])
            if span is None:
                print(f"  ! 블록 없음, 건너뜀: {page}#{row['block']}")
                skipped += 1
                continue
            located.append((span, row))
        located.sort(key=lambda pair: pair[0][0], reverse=True)

        for (start, end), row in located:
            text = text[:start] + row["html"] + text[end:]
            done_ids.append(row["id"])

        if text == original:
            continue
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(text)
        touched.append(page)

        for override_id in done_ids:
            try:
                rpc(base_url, anon_key, "admin_mark_override_applied", {
                    "admin_key": admin_key, "in_id": override_id,
                })
                applied += 1
            except Exception as error:                          # noqa: BLE001
                # 파일은 이미 바뀌었다. 표시만 실패한 것이라 다음 실행에서 같은 내용을
                # 한 번 더 쓰게 되는데, 결과가 같으므로 해가 없다.
                print(f"  ! 반영 표시 실패(무해): {override_id} {error}")

    print(f"[본문 수정본] {applied}건 반영 · {skipped}건 건너뜀 · 파일 {len(touched)}개")
    for page in touched:
        print(f"   · {page}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
