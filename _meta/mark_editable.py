#!/usr/bin/env python3
"""가이드 페이지의 '문단'에 data-edit 표시를 붙이고 편집 대상 목록을 만든다.

    python3 _meta/mark_editable.py            # 표시 부착 + 목록 생성
    python3 _meta/mark_editable.py --list     # 목록만 다시 생성(파일 수정 없음)

왜 선택자를 좁히나
    가이드 페이지에는 표·인라인 SVG 도식·체크리스트·JSON-LD가 섞여 있다. 이걸 전부
    브라우저에서 편집하게 하면 반드시 깨진다. 그래서 **글자만 든 블록**에만 붙인다.
    구조를 바꾸는 일은 계속 코드로 한다.

블록 이름 규칙
    같은 파일 안에서만 유일하면 된다. 사람이 편집기에서 보고 위치를 짐작할 수 있게
    가까운 상위 섹션의 id를 앞에 둔다. 예: `types.lead`, `faq.2`, `keypoint`.

    ⚠ 이름이 바뀌면 그 블록에 저장해 둔 수정본과의 연결이 끊긴다(수정본은 남지만
    적용되지 않는다). 이미 붙은 data-edit 값은 바꾸지 않는다 — 이 스크립트는 값이
    없는 요소에만 새로 붙인다.
"""
from __future__ import annotations

import json
import os
import re
import sys
from html.parser import HTMLParser

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))
MANIFEST = os.path.join(SITE, "assets", "editable-pages.json")

# 편집을 열어 줄 디렉터리(재귀). 단지 페이지(apt/)와 다국어(en/ 등)는 제외 —
# 자동 생성물이라 손으로 고쳐도 다음 생성 때 덮어쓴다.
ROOTS = ["interior", "loan", "posts", "categories", "checklists"]
EXTRA_FILES = ["guides.html", "about.html", "market.html"]

# (클래스, 블록 이름 접두어). 이 클래스를 가진 요소에만 붙인다.
TARGETS = [
    ("g-lead", "lead"),
    ("g-chapter-lead", "lead"),
    ("g-area-desc", "desc"),
    ("brand-note", "note"),
    ("mat-card-desc", "carddesc"),
    ("topic-card-desc", "carddesc"),
]
# 자식 문단까지 여는 컨테이너: (컨테이너 클래스, 블록 이름 접두어)
CONTAINERS = [
    ("g-keypoint", "keypoint"),
    ("g-faq-a", "faq"),
    ("prose", "p"),          # posts/*.html 의 본문 문단 — 실제로 가장 자주 고칠 곳
]

ATTR_RE = re.compile(r'\bdata-edit\s*=')


class Scanner(HTMLParser):
    """열림 태그의 위치와 클래스를 모은다. 위치는 원본 문자열 오프셋으로 환산한다."""

    def __init__(self, text: str):
        super().__init__(convert_charrefs=False)
        self.text = text
        self._line_starts = [0]
        for line in text.split("\n")[:-1]:
            self._line_starts.append(self._line_starts[-1] + len(line) + 1)
        self.hits: list[tuple[int, int, str, str]] = []   # (start, end, tag, class)
        self.section_stack: list[str] = []
        self.open_sections: list[tuple[str, int]] = []
        self.depth = 0

    def abs_offset(self, pos) -> int:
        line, col = pos
        return self._line_starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        raw = self.get_starttag_text() or ""
        start = self.abs_offset(self.getpos())
        attr = dict(attrs)
        classes = (attr.get("class") or "").split()

        # 가장 가까운 id 있는 section 을 기억해 블록 이름 접두어로 쓴다.
        if tag == "section" and attr.get("id"):
            self.open_sections.append((attr["id"], self.depth))
        if not raw.endswith("/>"):
            self.depth += 1

        self.hits.append((start, start + len(raw), tag, " ".join(classes)))

    def handle_endtag(self, tag):
        self.depth = max(0, self.depth - 1)
        while self.open_sections and self.open_sections[-1][1] >= self.depth:
            self.open_sections.pop()

    def current_section(self) -> str:
        return self.open_sections[-1][0] if self.open_sections else ""


def close_tag_end(text: str, tag: str, open_end: int) -> int:
    """열림 태그가 끝난 지점부터 짝이 맞는 닫힘 태그의 끝 위치를 찾는다."""
    depth = 1
    pattern = re.compile(r"<(/?)" + re.escape(tag) + r"(\s|>|/)", re.I)
    pos = open_end
    while depth > 0:
        match = pattern.search(text, pos)
        if not match:
            return -1
        if match.group(1) == "/":
            depth -= 1
            if depth == 0:
                end = text.find(">", match.end())
                return end + 1 if end != -1 else -1
        else:
            close = text.find(">", match.end())
            if close == -1:
                return -1
            if text[close - 1] != "/":
                depth += 1
            pos = close + 1
            continue
        pos = match.end()
    return -1


def mark_file(path: str) -> tuple[str, int]:
    with open(path, encoding="utf-8") as handle:
        text = handle.read()

    scanner = Scanner(text)
    try:
        scanner.feed(text)
    except Exception as error:                      # noqa: BLE001
        print(f"  ! 파싱 실패, 건너뜀: {path} ({error})")
        return text, 0

    # 뒤에서부터 삽입해야 앞쪽 오프셋이 흔들리지 않는다.
    inserts: list[tuple[int, str]] = []
    used: set[str] = set(re.findall(r'data-edit="([^"]+)"', text))
    counters: dict[str, int] = {}

    def name_for(prefix: str, section: str) -> str:
        base = (section + "." + prefix) if section else prefix
        counters[base] = counters.get(base, 0) + 1
        candidate = base if counters[base] == 1 else f"{base}.{counters[base]}"
        while candidate in used:
            counters[base] += 1
            candidate = f"{base}.{counters[base]}"
        used.add(candidate)
        return candidate

    # 컨테이너 안의 <p> 를 먼저 골라 둔다.
    container_paragraphs: dict[int, str] = {}
    for start, end, tag, classes in scanner.hits:
        class_set = set(classes.split())
        for container_class, prefix in CONTAINERS:
            if container_class in class_set:
                stop = close_tag_end(text, tag, end)
                if stop == -1:
                    continue
                for p_start, p_end, p_tag, _ in scanner.hits:
                    if p_tag == "p" and end <= p_start < stop:
                        container_paragraphs[p_start] = prefix

    # 문서 순서대로 이름을 매기기 위해 section 문맥을 다시 계산한다.
    section_at: dict[int, str] = {}
    tracker = Scanner(text)
    original_start = tracker.handle_starttag

    def tracking_start(tag, attrs):
        original_start(tag, attrs)
        section_at[tracker.abs_offset(tracker.getpos())] = tracker.current_section()

    tracker.handle_starttag = tracking_start  # type: ignore[method-assign]
    try:
        tracker.feed(text)
    except Exception as error:                      # noqa: BLE001
        print(f"  ! 섹션 문맥 계산 실패: {path} ({error})")

    for start, end, tag, classes in scanner.hits:
        raw = text[start:end]
        if ATTR_RE.search(raw):
            continue
        class_set = set(classes.split())
        prefix = None
        for target_class, target_prefix in TARGETS:
            if target_class in class_set:
                prefix = target_prefix
                break
        if prefix is None and start in container_paragraphs:
            prefix = container_paragraphs[start]
        if prefix is None:
            continue
        if close_tag_end(text, tag, end) == -1:
            continue          # 짝이 안 맞으면 건드리지 않는다

        block = name_for(prefix, section_at.get(start, ""))
        insert_at = end - (2 if raw.endswith("/>") else 1)
        inserts.append((insert_at, f' data-edit="{block}"'))

    for position, snippet in sorted(inserts, reverse=True):
        text = text[:position] + snippet + text[position:]
    return text, len(inserts)


def page_files() -> list[str]:
    files: list[str] = []
    for root_name in ROOTS:
        root = os.path.join(SITE, root_name)
        if not os.path.isdir(root):
            continue
        for current, _dirs, names in os.walk(root):
            for name in sorted(names):
                if name.endswith(".html"):
                    files.append(os.path.join(current, name))
    for name in EXTRA_FILES:
        path = os.path.join(SITE, name)
        if os.path.exists(path):
            files.append(path)
    return sorted(files)


def title_of(text: str) -> str:
    match = re.search(r"<title>(.*?)</title>", text, re.S)
    if not match:
        return ""
    return re.sub(r"\s*[—|]\s*톺다.*$", "", match.group(1).strip()).strip()


def build_manifest() -> int:
    entries = []
    for path in page_files():
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        blocks = re.findall(r'data-edit="([^"]+)"', text)
        if not blocks:
            continue
        entries.append({
            "path": os.path.relpath(path, SITE).replace(os.sep, "/"),
            "title": title_of(text) or os.path.basename(path),
            "blocks": len(blocks),
        })
    entries.sort(key=lambda item: item["path"])
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as handle:
        json.dump(entries, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    return len(entries)


def main() -> int:
    list_only = "--list" in sys.argv
    changed = 0
    added = 0

    if not list_only:
        for path in page_files():
            text, count = mark_file(path)
            if count:
                with open(path, "w", encoding="utf-8") as handle:
                    handle.write(text)
                changed += 1
                added += count

    pages = build_manifest()
    if list_only:
        print(f"[ok] 편집 대상 목록 {pages}개 페이지 → assets/editable-pages.json")
    else:
        print(f"[ok] data-edit {added}개 추가 (파일 {changed}개) · 편집 대상 {pages}개 페이지")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
