#!/usr/bin/env python3
"""사이트 전 페이지의 상단 네비·모바일 메뉴·푸터를 하나의 정의로 동기화한다.

1회성 마이그레이션이 아니라 **반복 실행하는 동기화 도구**다. 헤더 HTML을 169개 파일에
직접 써 두는 구조라 손으로 고치면 반드시 어긋난다 — 실제로 감사 시점에 데스크톱 네비는
2종, 모바일 메뉴는 2종, 푸터는 4종(탐색/사이트 정보 67개, 도구/사이트 3개, 최소 푸터 17개,
없음 82개)으로 갈라져 있었다. 정적 사이트를 프레임워크로 옮기지 않고 이 어긋남을 없애는
가장 싼 방법이 '한 곳에 정의하고 전부 다시 쓰기'다.

  python3 _meta/update_nav.py            # 실제 갱신
  python3 _meta/update_nav.py --check     # 어긋난 파일만 보고(변경 없음, CI용)

페이지 위치별로 상대경로 prefix가 다르므로(루트=`./`, `site/calculators/*` = `../`),
파일 경로에서 자동 추정한다. 각 파일에서 활성 메뉴(active)는 어떤 페이지인지로 자동 부여.

푸터 명칭 규칙 (감사 9번 항목)
  · 열 이름은 `도구` / `사이트` 하나로 고정한다. `탐색`·`사이트 정보`는 쓰지 않는다.
  · 안내 페이지 링크는 `안내` 하나로 부른다. `소개·운영원칙`이라는 별칭을 만들지 않는다.
  · 소개 문구는 브랜드 구호(`부동산, 하나하나 톺아보자.`)가 아니라 사이트가 하는 일을 쓴다.
"""
import os
import sys
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
        # 뒤 공백까지 regex 가 먹으므로, 닫는 `</div>` 들여쓰기를 여기서 되돌려 준다.
        '    </button>\n  '
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


FOOTER_INTRO = "부동산 거래에 필요한 도구와 가이드를 공식 자료 기반으로 정리합니다."

# 면책은 홈에 있던 전문(全文)을 기준으로 삼는다 — 짧은 `© 톺다` 한 줄만 있던 17개 페이지도
# 같은 고지를 받게 된다. 광고가 붙는 사이트에서 페이지마다 면책 수준이 다른 편이 나쁘다.
DISCLAIMER = (
    "본 사이트의 콘텐츠는 일반적인 정보 제공을 목적으로 하며, 개별 사안에 대한 법률·세무·금융 자문이 아닙니다.\n"
    "      구체적인 결정은 변호사·세무사·공인중개사·자격 있는 금융기관과 상의하시기 바랍니다.\n"
    "      게재 시점 기준이며 이후 법령·정책 변경으로 달라질 수 있습니다."
)


def build_footer(prefix):
    return (
        '<footer class="site-footer">\n'
        '  <div class="container">\n'
        '    <div class="row">\n'
        '      <div>\n'
        '        <div class="brand"><span class="brand-mark"></span>톺다</div>\n'
        f'        <p>{FOOTER_INTRO}</p>\n'
        '      </div>\n'
        '      <div>\n'
        '        <h4>도구</h4>\n'
        '        <ul>\n'
        f'          <li><a href="{prefix}calculators/index.html">계산기</a></li>\n'
        f'          <li><a href="{prefix}market.html">시세정보</a></li>\n'
        f'          <li><a href="{prefix}apt/">지역별 아파트 실거래</a></li>\n'
        f'          <li><a href="{prefix}checklists/index.html">체크리스트</a></li>\n'
        '        </ul>\n'
        '      </div>\n'
        '      <div>\n'
        '        <h4>사이트</h4>\n'
        '        <ul>\n'
        f'          <li><a href="{prefix}guides.html">가이드</a></li>\n'
        f'          <li><a href="{prefix}board.html">게시판</a></li>\n'
        f'          <li><a href="{prefix}about.html">안내</a></li>\n'
        f'          <li><a href="{prefix}contact.html">문의</a></li>\n'
        f'          <li><a href="{prefix}terms.html">이용약관</a></li>\n'
        f'          <li><a href="{prefix}privacy.html">개인정보 처리방침</a></li>\n'
        f'          <li><a href="{prefix}en/index.html">English</a></li>\n'
        '        </ul>\n'
        '      </div>\n'
        '    </div>\n'
        f'    <p class="disclaimer">\n      {DISCLAIMER}\n'
        '      <br/>© 톺다.\n'
        '    </p>\n'
        '  </div>\n'
        '</footer>'
    )


# ⚠ 각 패턴은 **줄 앞 들여쓰기까지 함께 먹는다**(`[ \t]*`). 치환문이 자기 들여쓰기를 갖고
# 있으므로, 앞 공백을 남겨 두면 실행할 때마다 들여쓰기가 4칸씩 늘어난다. 1회성 스크립트였을
# 때는 드러나지 않던 버그다 — 이제 반복 실행하므로 멱등해야 한다.
NAV_RE = re.compile(r'[ \t]*<nav class="nav">.*?</nav>\s*', re.DOTALL)
FOOTER_RE = re.compile(r'[ \t]*<footer class="site-footer">.*?</footer>', re.DOTALL)
BURGER_RE = re.compile(r'[ \t]*<button class="nav-toggle[^"]*"[^>]*>.*?</button>\s*', re.DOTALL)
MOBILE_RE = re.compile(r'[ \t]*<div class="mobile-menu"[^>]*>.*?</div>\s*(?=</header>)', re.DOTALL)
LANG_RE = re.compile(r'[ \t]*<div class="lang-switch">.*?</div>\s*', re.DOTALL)


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
    # 푸터는 nav 가 없는 페이지(단지 데이터 페이지 등)에는 애초에 없으므로 있을 때만 바꾼다.
    if FOOTER_RE.search(text):
        text = FOOTER_RE.sub(lambda _: build_footer(prefix), text, count=1)
    return text


# zh/vi/th 판은 각 언어 생성기(scripts/gen_*.mjs)가 자기 언어의 헤더·푸터를 만든다.
# 영문판은 수기 관리 페이지와 생성 페이지가 섞여 있어 이 도구가 함께 맞춘다 —
# 생성기를 다시 돌린 뒤 이 스크립트를 한 번 더 실행하면 크롬이 다시 정렬된다.
SKIP_PREFIXES = ("zh-Hans/", "zh-Hant/", "vi/", "th/")


EN_FOOTER = """<footer class="site-footer">
  <div class="container">
    <div class="row">
      <div>
        <div class="brand"><span class="brand-mark"></span>TOPDA</div>
        <p>Calculators and guides for Korean property transactions, based on official sources.</p>
      </div>
      <div>
        <h4>Tools</h4>
        <ul>
          <li><a href="{e}calculators/index.html">Calculators</a></li>
          <li><a href="{e}market.html">Market Data</a></li>
          <li><a href="{k}checklists/index.html">Checklists (Korean)</a></li>
        </ul>
      </div>
      <div>
        <h4>Site</h4>
        <ul>
          <li><a href="{e}guides.html">Guides</a></li>
          <li><a href="{e}about.html">About</a></li>
          <li><a href="{e}contact.html">Contact</a></li>
          <li><a href="{e}terms.html">Terms</a></li>
          <li><a href="{e}privacy.html">Privacy</a></li>
          <li><a href="{k}board.html">Board (Korean)</a></li>
          <li><a href="{k}index.html">\ud55c\uad6d\uc5b4</a></li>
        </ul>
      </div>
    </div>
    <p class="disclaimer">
      General information only \u2014 not legal, tax, or financial advice. Rules and rates change;
      confirm with a licensed professional before acting.
      <br/>&copy; TOPDA.
    </p>
  </div>
</footer>"""

# 영문 데스크톱 내비에서 한국어 페이지로 나가는 링크를 걷어낸다.
# 링크 자체를 없애는 것이 아니라 모바일 메뉴·푸터로 내린다(라벨은 (Korean) 으로 명시).
EN_KO_NAV_LINK = re.compile(
    r'\s*<a href="[^"]*(?:checklists/index|board)\.html"[^>]*data-nav[^>]*>[^<]*</a>')


def transform_en(text, rel):
    """영문 페이지 크롬 정렬. 헤더 링크 구성과 푸터만 손대고 본문은 건드리지 않는다."""
    k = "../" * (rel.count("/"))          # 한국어 사이트로 나가는 상대경로
    e = "../" if rel.count("/") > 1 else ""  # en/ 안에서의 상대경로

    def nav_repl(m):
        return m.group(1) + EN_KO_NAV_LINK.sub("", m.group(2)) + m.group(3)

    text = re.sub(r'(<nav class="nav">)(.*?)(</nav>)', nav_repl, text, flags=re.DOTALL)
    text = text.replace(f'<a href="{k}index.html">KR (KO)</a>',
                        f'<a href="{k}index.html">\ud55c\uad6d\uc5b4</a>')
    text = text.replace(">Checklists (KO)<", ">Checklists (Korean)<")
    text = text.replace(">Board (KO)<", ">Board (Korean)<")
    if FOOTER_RE.search(text):
        text = FOOTER_RE.sub(lambda _: EN_FOOTER.format(e=e, k=k), text, count=1)
    return text


def main():
    check_only = "--check" in sys.argv
    changed = 0
    stale = []
    for root, _, files in os.walk(SITE):
        for fn in sorted(files):
            if not fn.endswith(".html"):
                continue
            path = os.path.join(root, fn)
            rel = page_relpath(path)
            if rel.startswith(SKIP_PREFIXES):
                continue
            with open(path, encoding="utf-8") as f:
                src = f.read()
            if 'class="nav"' not in src:
                continue
            if rel.startswith("en/"):
                new = transform_en(src, rel)
            else:
                new = transform(src, prefix_for(rel), active_for(rel))
            if new == src:
                continue
            stale.append(rel)
            if check_only:
                continue
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)
            changed += 1
            print(f"  ✓ {rel}")

    if check_only:
        if stale:
            print("헤더·푸터가 공통 정의와 다릅니다 (python3 _meta/update_nav.py 실행):")
            for rel in stale:
                print(f"  · {rel}")
            return 1
        print("헤더·푸터 동기화 상태 정상")
        return 0
    print(f"\n총 {changed}개 파일 갱신")
    return 0


if __name__ == "__main__":
    sys.exit(main())
