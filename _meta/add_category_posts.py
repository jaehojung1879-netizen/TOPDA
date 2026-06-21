#!/usr/bin/env python3
"""카테고리 페이지(5곳) 본문 끝(</main> 직전)에 '관련 글' 카드 그리드를 삽입.

기존 .cards-grid/.card 스타일 재사용. 마커 주석으로 중복 실행 방지.
"""
import os
import re

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))
MARKER = "<!-- category-posts -->"

# (페이지 경로, 카테고리, 글 리스트[slug, title, sub])
TARGETS = [
    (
        "categories/sale.html", "매매",
        [
            ("balance-day-settlement.html", "잔금일 정산, 빠뜨리면 손해 보는 5가지", "선수관리비·장수금·관리비 일할"),
            ("registry-reading.html", "등기부등본 읽는 법", "갑구·을구·말소기준권리 5분 독해"),
            ("sale-contract-tips.html", "매매계약서 특약, 이것만은", "계약서에 꼭 넣을 특약 조항"),
            ("good-house-eye.html", "좋은 집 보는 눈 12가지", "현장에서 30분 안에 확인할 것들"),
            ("property-tour.html", "임장 체크리스트 30선", "임장 갈 때 챙기는 확인 항목"),
            ("transfer-tax-guide.html", "양도소득세 완벽 정리 (심화)", "비과세·장특공·세율"),
        ],
    ),
    (
        "categories/lease.html", "전세·월세",
        [
            ("jeonse-protection.html", "보증금 지키는 3종 세트", "대항력·우선변제권·보증보험"),
            ("jeonse-scam.html", "깡통전세·전세사기 판별법", "계약 전 위험 신호 알아채기"),
            ("lease-contract-tips.html", "전세 특약, 이것만은", "전세 계약 필수 특약 목록"),
            ("lease-renewal.html", "계약갱신요구권 정리", "행사 조건·거절 사유·5% 상한"),
            ("lease-return.html", "보증금 못 받을 때 — 임차권등기명령", "이사 가야 하는데 보증금이 안 나올 때"),
            ("contract-viewer-lease.html", "표준 주택임대차계약서 인터랙티브 뷰어", "조항별 해설을 짚어가며 읽기"),
        ],
    ),
    (
        "categories/loan.html", "대출·금융",
        [
            ("dsr-explain.html", "DSR 완벽 정리", "1금융 40%·2금융 50% 한도 구조"),
            ("stress-dsr.html", "스트레스 DSR — 1.5%p 가산", "가산금리가 한도를 줄이는 방식"),
            ("ltv-explain.html", "LTV 완벽 정리", "담보인정비율 한도 계산 방식"),
            ("loan-policy.html", "정책 대출상품 정리", "디딤돌·보금자리·신생아특례 비교"),
        ],
    ),
    (
        "categories/moving.html", "이사·입주",
        [
            ("moving-types.html", "일반·반포장·포장이사 차이", "유형별 가격과 책임 범위"),
            ("moving-quote.html", "이사 견적 — 방문 vs 비대면", "견적 방식별 장단점과 함정"),
            ("moving-company.html", "이사업체 고르는 법 8가지", "허가업체 확인·표준약관·보험"),
            ("moving-day-tips.html", "이사 당일 분쟁 안 만드는 법", "파손·추가요금·인수인계 수칙"),
            ("storage-moving.html", "보관이사 — 잔금일 안 맞을 때", "보관 기간·비용·주의사항"),
            ("move-in-admin.html", "전입신고·우편물·공과금 이전", "입주 후 행정처리 한 번에"),
        ],
    ),
    (
        "interior/index.html", "인테리어",
        [
            ("interior-quote.html", "인테리어 견적 비교의 정석", "견적서에서 꼭 확인할 항목"),
            ("interior-company.html", "인테리어 업체 고르는 법 8가지", "실측·포트폴리오·계약 조건"),
            ("interior-contract.html", "인테리어 표준계약서 & 대금 분할", "계약금·중도금·잔금 안전 지급"),
            ("interior-defect.html", "인테리어 하자보수 청구·분쟁 대응", "하자 발견부터 분쟁 해결까지"),
        ],
    ),
]


def section(cat, posts, posts_url):
    cards = "".join(
        f'    <a class="card" href="{posts_url}{slug}">\n'
        f'      <span class="badge badge-accent">{cat}</span>\n'
        f'      <h3>{title}</h3>\n'
        f'      <p>{sub}</p>\n'
        f'    </a>\n'
        for slug, title, sub in posts
    )
    return (
        f"\n{MARKER}\n"
        f'<section class="hub-section" style="margin-top: 40px;">\n'
        f'  <div class="hub-section-head" style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">\n'
        f"    <div>\n"
        f'      <span class="hub-section-tag">{cat}</span>\n'
        f"      <h2>관련 글 모아보기</h2>\n"
        f"    </div>\n"
        f'    <a href="../posts/index.html?cat={cat}" class="strip-link" style="color:var(--accent); font-weight:600; font-size:0.9rem;">전체 글 →</a>\n'
        f"  </div>\n"
        f'  <div class="cards-grid">\n{cards}  </div>\n'
        f"</section>\n"
    )


def main():
    changed = 0
    for rel, cat, posts in TARGETS:
        path = os.path.join(SITE, rel)
        if not os.path.exists(path):
            print(f"  ! 없음: {rel}")
            continue
        with open(path, encoding="utf-8") as f:
            src = f.read()
        if MARKER in src:
            continue
        posts_url = "../posts/"
        sec = section(cat, posts, posts_url)
        idx = src.rfind("</main>")
        if idx < 0:
            print(f"  ! </main> 없음: {rel}")
            continue
        src = src[:idx] + sec + src[idx:]
        with open(path, "w", encoding="utf-8") as f:
            f.write(src)
        changed += 1
        print(f"  ✓ {rel} ({len(posts)}편)")
    print(f"\n총 {changed}개 페이지 갱신")


if __name__ == "__main__":
    main()
