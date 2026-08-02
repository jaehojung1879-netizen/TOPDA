#!/usr/bin/env python3
"""가이드 글 하단의 '관련 글' 목록을 만든다.

- 같은 카테고리 글 중 다음 3편을 순환 선택(글마다 다른 이웃이 보이도록).
- </main> 직전에 삽입. 마커 주석(<!-- related-posts -->)으로 위치를 잡는다.
- 반복 실행하면 기존 블록을 갈아끼운다(멱등).

2026-08 개편: 카드 3개 그리드 → 텍스트 목록.
  카드 3개 + '관련 계산기' 카드 3개가 34편 전부에 똑같이 붙어 있었다. 글마다 다른 것은
  링크뿐인데 시각적 무게는 본문 절과 같아, 어느 글을 열어도 끝이 똑같아 보였다.
  관련 글은 목록으로 충분하다 — 강조해야 하는 것은 도구(tool-callout) 쪽이다.

  제목·부제는 아래 CATS 가 원본이다. 글 제목을 바꾸면 여기도 함께 고치고 다시 실행한다.
"""
import os
import re

POSTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site", "posts"))
MARKER = "<!-- related-posts -->"

# 카테고리별 글 목록 (posts/index.html 과 동일한 순서·표기)
CATS = {
    "매매": [
        ("balance-day-settlement.html", "매매 잔금일 정산 항목", "선수관리비·장기수선충당금·관리비 일할 계산"),
        ("registry-reading.html", "등기부등본에서 먼저 확인할 항목", "갑구·을구와 말소기준권리를 읽는 순서"),
        ("sale-contract-tips.html", "매매계약서에서 정해 둘 특약 조항", "현 상태 매매·근저당 말소·명도"),
        ("transfer-tax-guide.html", "양도소득세 계산 구조와 비과세 요건", "비과세 요건·장기보유특별공제·세율"),
        ("funding-plan.html", "자금조달계획서 작성 방법", "자기자금·차입금 항목별 작성과 증빙"),
        ("good-house-eye.html", "매물을 볼 때 확인할 기준", "바꿀 수 없는 조건과 고칠 수 있는 조건"),
        ("property-tour.html", "임장에서 확인할 항목", "시간대를 나눠 확인할 것"),
    ],
    "전세·월세": [
        ("jeonse-protection.html", "전세보증금 보호 요건 확인하기", "대항력·우선변제권·보증보험이 생기는 시점"),
        ("jeonse-scam.html", "깡통전세·전세사기 판별법", "계약 전에 확인할 수 있는 위험 신호"),
        ("lease-contract-tips.html", "전세계약서에서 정해 둘 특약 조항", "전입·확정일자 협조와 선순위 확인"),
        ("lease-renewal.html", "계약갱신요구권 정리", "행사 조건·거절 사유·증액 상한"),
        ("lease-return.html", "보증금 못 받을 때 — 임차권등기명령", "이사를 가야 하는데 보증금이 나오지 않는 경우"),
        ("contract-viewer-lease.html", "표준 주택임대차계약서 뷰어", "조항을 눌러 무엇을 정하는 칸인지 확인"),
    ],
    "대출·금융": [
        ("dsr-explain.html", "DSR 계산 구조와 한도", "어떤 부채가 합산되는지"),
        ("stress-dsr.html", "스트레스 DSR", "가산금리가 한도를 줄이는 방식"),
        ("ltv-explain.html", "LTV 담보인정비율 계산 기준", "규제지역·가격 구간별 제한"),
        ("loan-policy.html", "주택도시기금 정책 대출 — 디딤돌·버팀목", "자격 요건·한도·금리 비교"),
    ],
    "인테리어": [
        ("interior-quote.html", "인테리어 견적 비교의 정석", "같은 범위로 맞춰야 비교가 되는 이유"),
        ("interior-company.html", "인테리어 업체를 고를 때 확인할 항목", "등록 여부·실적·보증 확인"),
        ("interior-contract.html", "인테리어 표준계약서와 대금 분할", "지급 시점을 공정에 연결하기"),
        ("interior-defect.html", "하자보수 청구·분쟁 대응", "담보책임기간과 통보·조정 절차"),
    ],
    "이사·입주": [
        ("moving-types.html", "일반·반포장·포장이사 차이", "유형별 가격 구성과 책임 범위"),
        ("moving-quote.html", "이사 견적 — 방문 vs 비대면", "같은 조건으로 비교하고 추가 비용 확정하기"),
        ("moving-company.html", "이사업체를 고를 때 확인할 항목", "허가·적재물배상보험·표준약관"),
        ("moving-day-tips.html", "이사 당일 분쟁 안 만드는 법", "파손·추가요금·인수인계 처리 순서"),
        ("storage-moving.html", "보관이사 — 잔금일이 안 맞을 때", "보관 기간·비용과 계약서 확인 항목"),
        ("move-in-admin.html", "전입신고·우편·공과금 이전", "기한이 있는 신고와 처리 순서"),
    ],
}


def item(slug, title, desc):
    return f'    <li><a href="{slug}">{title}</a> <span>{desc}</span></li>\n'


def build_section(cat, related):
    items = "".join(item(s, t, d) for s, t, d in related)
    return (
        f"\n{MARKER}\n"
        f'<section class="related-reading">\n'
        f'  <div class="block-head">\n'
        f"    <h2>관련 글</h2>\n"
        f'    <a href="index.html?cat={cat}">{cat} 글 전체</a>\n'
        f"  </div>\n"
        f"  <ul>\n{items}  </ul>\n"
        f"</section>\n"
    )


# 이미 삽입돼 있는 블록(옛 카드 그리드 포함)을 찾아 갈아끼우기 위한 패턴.
EXISTING_RE = re.compile(r"\n*" + re.escape(MARKER) + r".*?</section>\n", re.S)


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
            # 기존 블록이 있으면 지우고 새로 만든다(멱등 재실행).
            src = EXISTING_RE.sub("\n", src)
            # 같은 카테고리에서 자기 다음 3편(순환)
            related = [posts[(i + k) % n] for k in range(1, min(4, n))]
            section = build_section(cat, related)
            # 마지막 </main> 직전에 삽입
            idx = src.rfind("</main>")
            if idx < 0:
                print(f"  ! </main> 없음: {slug}")
                continue
            src = src[:idx].rstrip("\n") + "\n" + section + src[idx:]
            with open(path, "w", encoding="utf-8") as f:
                f.write(src)
            changed += 1
            print(f"  ✓ {slug} ← {', '.join(r[0] for r in related)}")
    print(f"\n총 {changed}개 글 갱신")


if __name__ == "__main__":
    main()
