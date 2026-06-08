#!/usr/bin/env python3
"""사이트 전 페이지의 상단 네비/모바일 메뉴를 새 4카테고리 구조(가이드/계산기/시세정보/체크리스트) +
   미니멀 버거 아이콘으로 일괄 교체. 1회성 마이그레이션 스크립트.

페이지 위치별로 상대경로 prefix가 다르므로(루트=`./`, `site/calculators/*` = `../`),
파일 경로에서 자동 추정한다. 각 파일에서 활성 메뉴(active)는 어떤 페이지인지로 자동 부여.
"""
import os
import re

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))

# 활성 클래스를 어떤 nav 슬롯에 줄지 결정하는 규칙 (페이지 상대경로 → 활성 슬롯)
ACTIVE_MAP = {
    "guides.html": "guides", "categories/": "guides", "posts/": "guides",
    "interior/": "guides",
    "calculators/": "calc",
    "market.html": "market", "calculators/search.html": "market",
    "calculators/transactions.html": "market", "calculators/market-trends.html": "market",
    "checklists/": "check",
}


def build_nav(prefix, active):
    """prefix: '' 또는 '../'. active: guides|calc|market|check|''"""
    def cls(slot):
        return ' class="active"' if active == slot else ''
    nav = (
        '    <nav class="nav">\n'
        f'      <a href="{prefix}guides.html" data-nav{cls("guides")}>가이드</a>\n'
        f'      <a href="{prefix}calculators/index.html" data-nav{cls("calc")}>계산기</a>\n'
        f'      <a href="{prefix}market.html" data-nav{cls("market")}>시세정보</a>\n'
        f'      <a href="{prefix}checklists/index.html" data-nav{cls("check")}>체크리스트</a>\n'
        '    </nav>\n'
    )
    return nav


def build_burger():
    return (
        '    <button class="nav-toggle" data-nav-toggle aria-label="메뉴 열기">\n'
        '      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>\n'
        '    </button>\n'
    )


def build_mobile(prefix):
    return (
        '  <div class="mobile-menu" data-mobile-menu>\n'
        f'    <a href="{prefix}guides.html">가이드</a>\n'
        f'    <a href="{prefix}calculators/index.html">계산기</a>\n'
        f'    <a href="{prefix}market.html">시세정보</a>\n'
        f'    <a href="{prefix}checklists/index.html">체크리스트</a>\n'
        f'    <a href="{prefix}board.html">게시판</a>\n'
        f'    <a href="{prefix}about.html">안내</a>\n'
        '  </div>\n'
    )


NAV_RE = re.compile(r'<nav class="nav">.*?</nav>\s*', re.DOTALL)
BURGER_RE = re.compile(r'<button class="nav-toggle[^"]*"[^>]*>.*?</button>\s*', re.DOTALL)
MOBILE_RE = re.compile(r'<div class="mobile-menu"[^>]*>.*?</div>\s*(?=</header>)', re.DOTALL)
LANG_RE = re.compile(r'<div class="lang-switch">.*?</div>\s*', re.DOTALL)


def page_relpath(path):
    rel = os.path.relpath(path, SITE).replace("\\", "/")
    return rel


def prefix_for(rel):
    depth = rel.count("/")
    return "../" * depth


def active_for(rel):
    if rel.startswith("en/"):
        return ""
    for k, v in ACTIVE_MAP.items():
        if k.endswith("/") and rel.startswith(k):
            return v
        if rel == k:
            return v
    if rel == "calculators/index.html":
        return "calc"
    if rel == "checklists/index.html":
        return "check"
    return ""


def transform(text, prefix, active):
    new_nav = build_nav(prefix, active)
    new_burger = build_burger()
    new_mobile = build_mobile(prefix)

    if NAV_RE.search(text):
        text = NAV_RE.sub(new_nav, text, count=1)
    if LANG_RE.search(text):
        text = LANG_RE.sub("", text, count=1)
    if BURGER_RE.search(text):
        text = BURGER_RE.sub(new_burger, text, count=1)
    if MOBILE_RE.search(text):
        text = MOBILE_RE.sub(new_mobile, text, count=1)
    return text


def main():
    changed = 0
    for root, _, files in os.walk(SITE):
        for fn in files:
            if not fn.endswith(".html"):
                continue
            path = os.path.join(root, fn)
            rel = page_relpath(path)
            # 영문 사이트는 별도 구조이므로 스킵
            if rel.startswith("en/"):
                continue
            with open(path, encoding="utf-8") as f:
                src = f.read()
            if 'class="nav"' not in src:
                continue
            new = transform(src, prefix_for(rel), active_for(rel))
            if new != src:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new)
                changed += 1
                print(f"  ✓ {rel}")
    print(f"\n총 {changed}개 파일 갱신")


if __name__ == "__main__":
    main()
