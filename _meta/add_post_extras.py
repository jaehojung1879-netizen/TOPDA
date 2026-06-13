#!/usr/bin/env python3
"""글 페이지(26편)에 두 가지를 자동 보강하는 1회성 스크립트.

  1) 헤더에 'X분 읽기' 자동 표시 — 본문 텍스트 분량으로 계산(한글 400자/분).
     이미 .meta 안에 '분 읽기'가 있으면 건드리지 않는다.

  2) 본문 끝(related-posts 섹션 직전)에 '이 글과 관련된 계산기' 카드 삽입.
     카테고리별로 매핑된 계산기를 카드 그리드로 노출. 마커 주석으로 중복 실행 방지.

기존 카드 스타일(.cards-grid/.card/.badge)을 재사용 — 새 시각 언어 없음.
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
        "contract-viewer-sale.html", "good-house-eye.html", "property-tour.html",
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


def build_tools_section(cat, tools):
    cards = "".join(
        f'    <a class="card" href="{href}">\n'
        f'      <span class="badge badge-accent">관련 계산기</span>\n'
        f'      <h3>{name}</h3>\n'
        f'      <p>{sub}</p>\n'
        f'    </a>\n'
        for name, href, sub in tools
    )
    return (
        f"\n{RELATED_TOOLS_MARKER}\n"
        f'<section class="hub-section" style="margin-top: 40px;">\n'
        f'  <div class="hub-section-head">\n'
        f'    <span class="hub-section-tag">{cat}</span>\n'
        f"    <h2>이 글과 관련된 계산기</h2>\n"
        f"  </div>\n"
        f'  <div class="cards-grid">\n{cards}  </div>\n'
        f"</section>\n"
    )


def inject_tools_section(html, cat):
    if RELATED_TOOLS_MARKER in html:
        return html, False
    tools = TOOLS.get(cat) or []
    if not tools:
        return html, False
    section = build_tools_section(cat, tools)
    # related-posts 섹션 직전(있으면)에 삽입, 없으면 </main> 직전
    idx = html.find(RELATED_POSTS_MARKER)
    if idx < 0:
        idx = html.rfind("</main>")
    if idx < 0:
        return html, False
    return html[:idx] + section + html[idx:], True


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
