#!/usr/bin/env python3
"""AdSense 재심사용 Pages 산출물에서 레거시 공개면을 제거한다.

번역 원본과 과거 URL 호환 셸은 저장소에 남긴다. 배포 산출물에서는 한국어 핵심
콘텐츠만 공개해 크롤러가 미완성 다국어 여정과 meta-refresh 별칭을 다시 발견하지
않도록 한다. 삭제 대상은 고정된 언어 디렉터리와 slug-map의 지역 별칭으로 한정한다.
"""
import json
from pathlib import Path
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SLUG_MAP = ROOT / "data" / "slug-map.json"
LANG_DIRS = ("en", "zh-Hans", "zh-Hant", "vi", "th")
LANG_LINK_RE = re.compile(
    r'\s*<li>\s*<a\b[^>]*href=["\'][^"\']*en/index\.html["\'][^>]*>\s*English\s*</a>\s*</li>',
    re.I,
)


def safe_remove_tree(path: Path, parent: Path) -> bool:
    path = path.resolve()
    parent = parent.resolve()
    if path.parent != parent or not path.exists() or not path.is_dir():
        return False
    shutil.rmtree(path)
    return True


def remove_language_links() -> int:
    changed = 0
    for path in SITE.rglob("*.html"):
        if any(part in LANG_DIRS for part in path.relative_to(SITE).parts):
            continue
        text = path.read_text(encoding="utf-8")
        new = LANG_LINK_RE.sub("", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    return changed


def main():
    removed_langs = sum(safe_remove_tree(SITE / name, SITE) for name in LANG_DIRS)

    data = json.loads(SLUG_MAP.read_text(encoding="utf-8"))
    regions = data.get("regions") or {}
    hubs = data.get("_meta", {}).get("hubs") or []
    removed_aliases = 0
    for region_key in hubs:
        slug = (regions.get(region_key) or {}).get("slug")
        if slug:
            removed_aliases += safe_remove_tree(SITE / "apt" / slug, SITE / "apt")

    changed_links = remove_language_links()
    print(
        f"[ok] 배포 산출물 축소 · 다국어 디렉터리 {removed_langs}개 · "
        f"레거시 지역 별칭 {removed_aliases}개 제거 · English 링크 {changed_links}개 정리"
    )


if __name__ == "__main__":
    main()
