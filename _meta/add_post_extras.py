#!/usr/bin/env python3
"""글 페이지에 읽는 시간과 '관련 도구'를 보강한다.

  1) 헤더에 'X분 읽기' — 본문 텍스트 분량으로 계산(한글 400자/분).
     추정이 아니라 실제 글자 수에서 나온 값이다.

  2) 본문 끝(related-posts 직전)에 '이 글에 이어서 쓰는 계산기' 삽입.

2026-08 개편
  · 계산기 **카드 3개 그리드 → 도구 1~2개 목록**(.tool-callout).
    34편 전부에 카드 3개가 같은 모양으로 붙어 있어서, 정작 그 글과 가장 직접
    연결되는 도구가 나머지 둘에 묻혔다. 카테고리별 첫 두 개만 남긴다.
  · 반복 실행하면 기존 블록을 갈아끼운다(멱등).
"""
import os
import re

POSTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site", "posts"))
RELATED_TOOLS_MARKER = "<!-- related-tools -->"
RELATED_POSTS_MARKER = "<!-- related-posts -->"
WPM = 400  # 한글 평균 분당 글자수 (요지 파악 속도)

# 카테고리 매핑 — add_related_posts.py와 동일한 키
CATS = {
    "매매": [
        "balance-day-settlement.html", "registry-reading.html", "sale-contract-tips.html",
        "good-house-eye.html", "property-tour.html", "transfer-tax-guide.html", "funding-plan.html",
    ],
    "전세·월세": [
        "jeonse-protection.html", "jeonse-scam.html", "lease-contract-tips.html",
        "lease-renewal.html", "lease-return.html", "contract-viewer-lease.html",
    ],
    "대출·금융": ["dsr-explain.html", "stress-dsr.html", "ltv-explain.html", "loan-policy.html"],
    "인테리어": ["interior-quote.html", "interior-company.html", "interior-contract.html", "interior-defect.html"],
    "이사·입주": [
        "moving-types.html", "moving-quote.html", "moving-company.html",
        "moving-day-tips.html", "storage-moving.html", "move-in-admin.html",
    ],
}

# 카테고리별 관련 계산기 (label, href, sub)
TOOLS = {
    "매매": [
        ("취득세 계산기", "../calculators/acquisition-tax.html", "주택수·조정·면적 반영 총액"),
        ("잔금일 정산 계산기", "../calculators/balance-settlement.html", "관리비·선수·장수금 일할"),
        ("등기·법무사 비용 계산기", "../calculators/registration-cost.html", "인지세·채권·보수"),
    ],
    "전세·월세": [
        ("월세 ↔ 전세 전환", "../calculators/jeonse-monthly.html", "전월세 전환율로 양방향 환산"),
        ("대출 한도 시뮬레이터", "../calculators/loan-limit.html", "HF·HUG·SGI 보증사별 한도"),
        ("종합 계산기", "../calculators/total-cost-dashboard.html", "전세 임차 시나리오 비용 전체"),
    ],
    "대출·금융": [
        ("대출 한도 시뮬레이터", "../calculators/loan-limit.html", "주담대 + 전세대출 한도"),
        ("DSR 한도 계산기", "../calculators/dsr.html", "1금융 40% · 2금융 50%"),
        ("원리금 vs 원금균등", "../calculators/loan-compare.html", "월상환·총이자 비교"),
    ],
    "인테리어": [
        ("인테리어 견적 계산기", "../calculators/interior-estimate.html", "평형·자재 등급별 단가 합산"),
    ],
    "이사·입주": [
        ("잔금일 정산 계산기", "../calculators/balance-settlement.html", "관리비·선수·장수금 일할"),
    ],
}


def cat_of(slug):
    for c, ps in CATS.items():
        if slug in ps:
            return c
    return None


def extract_body_text(html):
    """<main> 안의 본문 텍스트만 대략 추출. 태그·관련글 섹션·기존 ref-list 제외."""
    m = re.search(r"<main[^>]*>(.*?)</main>", html, re.S | re.I)
    body = m.group(1) if m else html
    # related-posts/관련 도구 섹션 이후는 제외 (정확한 분량 계산)
    for marker in (RELATED_POSTS_MARKER, RELATED_TOOLS_MARKER):
        idx = body.find(marker)
        if idx >= 0:
            body = body[:idx]
    # 태그 제거 → 텍스트만
    text = re.sub(r"<[^>]+>", " ", body)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def read_minutes(text):
    chars = len(re.sub(r"\s", "", text))
    return max(1, round(chars / WPM))


def inject_read_time(html, minutes):
    """article-header 안 .meta div 내부의 '<span>...</span>'을 보강.
    .meta 안에 이미 '분 읽기'가 있으면 건드리지 않는다."""
    m = re.search(r'(<div class="meta">.*?<span[^>]*>)([^<]*)(</span>.*?</div>)', html, re.S)
    if not m:
        return html, False
    if "분 읽기" in m.group(0):
        return html, False
    head, inner, tail = m.group(1), m.group(2), m.group(3)
    new_inner = inner.rstrip() + " · 약 " + str(minutes) + "분 읽기"
    new_meta = head + new_inner + tail
    return html.replace(m.group(0), new_meta, 1), True


# 가장 직접 연결되는 도구만 남긴다(최대 2개).
MAX_TOOLS = 2

EXISTING_TOOLS_RE = re.compile(r"\n*" + re.escape(RELATED_TOOLS_MARKER) + r".*?</section>\n", re.S)


def build_tools_section(cat, tools):
    items = "".join(
        f'    <li><a href="{href}">{name}</a><span>{sub}</span></li>\n'
        for name, href, sub in tools
    )
    return (
        f"\n{RELATED_TOOLS_MARKER}\n"
        f'<section class="tool-callout">\n'
        f"  <h2>이 글에 이어서 쓰는 계산기</h2>\n"
        f"  <ul>\n{items}  </ul>\n"
        f"</section>\n"
    )


def inject_tools_section(html, cat):
    tools = (TOOLS.get(cat) or [])[:MAX_TOOLS]
    if not tools:
        # 매핑이 없으면 남아 있던 옛 블록만 걷어낸다.
        stripped = EXISTING_TOOLS_RE.sub("\n", html)
        return stripped, stripped != html
    before = html
    html = EXISTING_TOOLS_RE.sub("\n", html)
    section = build_tools_section(cat, tools)
    idx = html.find(RELATED_POSTS_MARKER)
    if idx < 0:
        idx = html.rfind("</main>")
    if idx < 0:
        return before, False
    out = html[:idx].rstrip("\n") + "\n" + section + html[idx:]
    return out, out != before


def main():
    rt_changed, tools_changed = 0, 0
    for slug in sorted(os.listdir(POSTS_DIR)):
        if not slug.endswith(".html") or slug == "index.html":
            continue
        path = os.path.join(POSTS_DIR, slug)
        cat = cat_of(slug)
        if not cat:
            print(f"  ? 카테고리 없음: {slug}")
            continue
        with open(path, encoding="utf-8") as f:
            src = f.read()

        text = extract_body_text(src)
        minutes = read_minutes(text)
        src, rt_ok = inject_read_time(src, minutes)
        src, tools_ok = inject_tools_section(src, cat)

        if rt_ok or tools_ok:
            with open(path, "w", encoding="utf-8") as f:
                f.write(src)
            flags = []
            if rt_ok: flags.append(f"⏱ {minutes}분"); rt_changed += 1
            if tools_ok: flags.append("🧰 계산기"); tools_changed += 1
            print(f"  ✓ {slug} ({', '.join(flags)})")
    print(f"\n읽는 시간 추가: {rt_changed}편 · 관련 계산기 추가: {tools_changed}편")


if __name__ == "__main__":
    main()
