#!/usr/bin/env python3
"""사이트 전체 페이지를 훑어 통합 검색 인덱스(site/assets/search-index.json)를 생성.

인덱싱 대상: 가이드 글·계산기·체크리스트·인테리어·카테고리·허브 페이지.
각 항목: { title, desc, url, type, cat } — 클라이언트(find.html)가 제목·설명으로 검색.
표준 라이브러리만 사용. site_root 기준 상대 URL(find.html이 site 루트에 있으므로).
"""
import json
import os
import re

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))
OUT = os.path.join(SITE, "assets", "search-index.json")

# (디렉터리, 타입 라벨, URL 접두사)  — 글 인덱스/허브는 별도 처리
SECTIONS = [
    ("posts", "가이드", "posts/"),
    ("calculators", "계산기", "calculators/"),
    ("checklists", "체크리스트", "checklists/"),
    ("interior", "인테리어", "interior/"),
    ("loan", "대출·금융", "loan/"),
    ("categories", "카테고리", "categories/"),
]

# 시세정보로 분류할 계산기(맞춤찾기·실거래가·지역시세)
MARKET_TOOLS = {"search.html", "transactions.html", "market-trends.html"}

# 루트/허브 단독 페이지
HUBS = [
    ("index.html", "톺다 — 부동산 가이드와 도구", "부동산 거래의 모든 단계를 가이드와 도구로", "홈", "index.html"),
    ("guides.html", "가이드", "매매·전세·대출·인테리어·이사·경매 단계별 가이드", "가이드", "guides.html"),
    ("market.html", "시세정보", "맞춤 내집 찾기·실거래가·지역 시세", "시세정보", "market.html"),
    ("calculators/index.html", "계산기 전체", "취득세·양도세·DSR·대출한도 등 계산기 모음", "계산기", "calculators/index.html"),
    ("checklists/index.html", "체크리스트 전체", "거래 단계별 체크리스트 모음", "체크리스트", "checklists/index.html"),
    ("interior/index.html", "인테리어 가이드", "공정별 자재·단가·견적·하자보수", "인테리어", "interior/index.html"),
    ("posts/index.html", "전체 글", "부동산 거래 가이드 글 31편", "가이드", "posts/index.html"),
]


def meta(src, name):
    m = re.search(r'name="' + name + r'" content="([^"]*)"', src)
    return m.group(1).strip() if m else ""


def title_of(src):
    m = re.search(r"<title>(.*?)</title>", src, re.S)
    if not m:
        return ""
    t = m.group(1).strip()
    # ' — 톺다', ' — 톺다 인테리어' 접미사 제거
    t = re.sub(r"\s*—\s*톺다.*$", "", t).strip()
    return t


def cat_of(src):
    """빵부스러기 두 번째 항목을 카테고리로."""
    m = re.search(r'<div class="breadcrumb">(.*?)</div>', src, re.S)
    if not m:
        return ""
    links = re.findall(r">([^<>/]+?)</a>", m.group(1))
    return links[1].strip() if len(links) >= 2 else ""


def main():
    items = []
    seen = set()

    # 허브/루트
    for rel, title, desc, typ, url in HUBS:
        path = os.path.join(SITE, rel)
        if os.path.exists(path):
            items.append({"title": title, "desc": desc, "url": url, "type": typ, "cat": ""})
            seen.add(url)

    # 섹션별
    for folder, typ, prefix in SECTIONS:
        d = os.path.join(SITE, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".html") or fn == "index.html":
                continue
            url = prefix + fn
            if url in seen:
                continue
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                src = f.read()
            title = title_of(src)
            if not title:
                continue
            this_type = typ
            if folder == "calculators" and fn in MARKET_TOOLS:
                this_type = "시세정보"
            items.append({
                "title": title,
                "desc": meta(src, "description")[:120],
                "url": url,
                "type": this_type,
                "cat": cat_of(src) if folder in ("posts", "categories") else "",
            })
            seen.add(url)

    data = {"generated": "auto", "count": len(items), "items": items}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    # 타입별 집계
    from collections import Counter
    by_type = Counter(i["type"] for i in items)
    print(f"검색 인덱스 {len(items)}개 항목 → {os.path.relpath(OUT, SITE)}")
    print("타입별:", dict(by_type))


if __name__ == "__main__":
    main()
