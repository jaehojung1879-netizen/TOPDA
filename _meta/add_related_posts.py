#!/usr/bin/env python3
"""가이드 글 26편 하단에 '함께 보면 좋은 글' 섹션을 자동 삽입하는 1회성 스크립트.

- 같은 카테고리 글 중 다음 3편을 순환 선택(글마다 다른 이웃이 보이도록).
- </main> 직전에 삽입. 마커 주석(<!-- related-posts -->)으로 중복 실행 방지.
- 카드 스타일·마침표 없는 부제 등 기존 표기 원칙을 그대로 따른다.
"""
import os
import re

POSTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site", "posts"))
MARKER = "<!-- related-posts -->"

# 카테고리별 글 목록 (posts/index.html 과 동일한 순서·표기)
CATS = {
    "매매": [
        ("balance-day-settlement.html", "잔금일 정산, 빠뜨리면 손해 보는 5가지", "선수관리비·장기수선충당금·관리비 일할 정산"),
        ("registry-reading.html", "등기부등본 읽는 법", "갑구·을구·말소기준권리 5분 독해"),
        ("sale-contract-tips.html", "매매계약서 특약, 이것만은", "계약서에 꼭 넣을 특약 조항"),
        ("transfer-tax-guide.html", "양도소득세 완벽 정리 (심화)", "비과세·장특공·세율"),
        ("good-house-eye.html", "좋은 집 보는 눈 12가지", "현장에서 30분 안에 확인할 것들"),
        ("property-tour.html", "임장 체크리스트 30선", "임장 갈 때 챙기는 확인 항목"),
    ],
    "전세·월세": [
        ("jeonse-protection.html", "보증금 지키는 3종 세트", "대항력 · 우선변제권 · 보증보험"),
        ("jeonse-scam.html", "깡통전세·전세사기 판별법", "계약 전 위험 신호 알아채기"),
        ("lease-contract-tips.html", "전세 특약, 이것만은", "전세 계약 필수 특약 목록"),
        ("lease-renewal.html", "계약갱신요구권 정리", "행사 조건 · 거절 사유 · 5% 상한"),
        ("lease-return.html", "보증금 못 받을 때 — 임차권등기명령", "이사 가야 하는데 보증금이 안 나올 때"),
        ("contract-viewer-lease.html", "표준 주택임대차계약서 인터랙티브 뷰어", "조항별 해설을 짚어가며 읽기"),
    ],
    "대출·금융": [
        ("dsr-explain.html", "DSR 완벽 정리", "1금융 40% · 2금융 50% 한도 구조"),
        ("stress-dsr.html", "스트레스 DSR — 1.5%p 가산", "가산금리가 한도를 줄이는 방식"),
        ("ltv-explain.html", "LTV 완벽 정리", "담보인정비율 한도 계산 방식"),
        ("loan-policy.html", "정책 대출상품 정리", "디딤돌 · 보금자리 · 신생아특례 비교"),
    ],
    "인테리어": [
        ("interior-quote.html", "인테리어 견적 비교의 정석", "견적서에서 꼭 확인할 항목"),
        ("interior-company.html", "인테리어 업체 고르는 법 8가지", "실측 · 포트폴리오 · 계약 조건"),
        ("interior-contract.html", "인테리어 표준계약서 & 대금 분할", "계약금 · 중도금 · 잔금 안전 지급"),
        ("interior-defect.html", "인테리어 하자보수 청구·분쟁 대응", "하자 발견부터 분쟁 해결까지"),
    ],
    "이사·입주": [
        ("moving-types.html", "일반·반포장·포장이사 차이", "유형별 가격과 책임 범위"),
        ("moving-quote.html", "이사 견적 — 방문 vs 비대면", "견적 방식별 장단점과 함정"),
        ("moving-company.html", "이사업체 고르는 법 8가지", "허가업체 확인 · 표준약관 · 보험"),
        ("moving-day-tips.html", "이사 당일 분쟁 안 만드는 법", "파손 · 추가요금 · 인수인계 수칙"),
        ("storage-moving.html", "보관이사 — 잔금일 안 맞을 때", "보관 기간 · 비용 · 주의사항"),
        ("move-in-admin.html", "전입신고·우편물·공과금 이전", "입주 후 행정처리 한 번에"),
    ],
}


def card(slug, title, desc, cat):
    return (
        f'    <a class="card" href="{slug}">\n'
        f'      <span class="badge badge-accent">{cat}</span>\n'
        f'      <h3>{title}</h3>\n'
        f'      <p>{desc}</p>\n'
        f'    </a>\n'
    )


def build_section(cat, related):
    cards = "".join(card(s, t, d, cat) for s, t, d in related)
    return (
        f"\n{MARKER}\n"
        f'<section class="hub-section" style="margin-top: 40px;">\n'
        f'  <div class="hub-section-head" style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">\n'
        f"    <div>\n"
        f'      <span class="hub-section-tag">{cat}</span>\n'
        f"      <h2>함께 보면 좋은 글</h2>\n"
        f"    </div>\n"
        f'    <a href="index.html?cat={cat}" class="strip-link" style="color:var(--accent); font-weight:600; font-size:0.9rem;">전체 글 →</a>\n'
        f"  </div>\n"
        f'  <div class="cards-grid">\n{cards}  </div>\n'
        f"</section>\n"
    )


def main():
    changed = 0
    for cat, posts in CATS.items():
        n = len(posts)
        for i, (slug, _t, _d) in enumerate(posts):
            path = os.path.join(POSTS_DIR, slug)
            if not os.path.exists(path):
                print(f"  ! 없음: {slug}")
                continue
            with open(path, encoding="utf-8") as f:
                src = f.read()
            if MARKER in src:
                continue
            # 같은 카테고리에서 자기 다음 3편(순환)
            related = [posts[(i + k) % n] for k in range(1, min(4, n))]
            section = build_section(cat, related)
            # 마지막 </main> 직전에 삽입
            idx = src.rfind("</main>")
            if idx < 0:
                print(f"  ! </main> 없음: {slug}")
                continue
            src = src[:idx] + section + src[idx:]
            with open(path, "w", encoding="utf-8") as f:
                f.write(src)
            changed += 1
            print(f"  ✓ {slug} ← {', '.join(r[0] for r in related)}")
    print(f"\n총 {changed}개 글 갱신")


if __name__ == "__main__":
    main()
