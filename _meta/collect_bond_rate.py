#!/usr/bin/env python3
"""제1종국민주택채권 당일 할인율(고객부담률) → site/assets/bond_rate.json.

⚠ 공식 오픈API가 없다. 은행·주택도시기금 포털 모두 사람이 보는 조회 페이지(HTML)만
제공해, 이 수집기는 그 페이지를 파싱하는 방식이다. 페이지 구조가 바뀌면 조용히
0건이 되고 기존 값을 그대로 유지한다(save_json_safe) — 그래프·계산기가 깨지진
않지만, 값이 갱신되지 않는다는 뜻이므로 Actions 로그의 "[bond_rate]" 라인을
주기적으로 확인해야 한다.

키워드 근접 정규식으로 "고객부담률 N.NNNN%" 형태를 찾는다. 못 찾으면
DEBUG_EXCERPT로 '부담'·'할인' 주변 텍스트를 stderr에 남겨, 다음에 정규식만
고치면 되도록 한다(페이지 구조 자체를 다시 조사할 필요가 없게).
"""
import datetime as dt
import os
import re
import sys

from lib_pdata import SITE_ASSETS, _request, save_json_safe  # noqa: E402

OUT = os.path.join(SITE_ASSETS, "bond_rate.json")

BASE = "https://nhuf.molit.go.kr"
# 주택도시기금 포털 — 첫 실행(2026-07-17) 확인 결과 이 페이지는 실제 조회 화면이 아니라
# '청약/채권' 메뉴 목록이었다("채권매도단가/수익률/할인율"이 그 안의 메뉴 링크 텍스트로만
# 나왔음). 그래서 이 페이지에서 바로 못 찾으면, 그 메뉴 링크를 찾아 한 번 더 따라간다.
SOURCE_URL = BASE + "/FP/FP07/FP0705/FP070509.jsp"
LINK_KEYWORD = "할인율"

# "고객부담률" 인근에서 "12.34%" 형태를 찾는다. 페이지가 표/스팬 등 어떤 마크업이든
# 텍스트만 남기고 비교하면 태그 차이에 덜 민감하므로, HTML 태그를 먼저 제거한 뒤 찾는다.
PATTERNS = [
    r"고객부담률[^0-9%]{0,30}(\d{1,2}\.\d{1,4})\s*%",
    r"할인율[^0-9%]{0,30}(\d{1,2}\.\d{1,4})\s*%",
]


def strip_tags(html):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)


def extract_rate(html):
    text = strip_tags(html)
    for pat in PATTERNS:
        m = re.search(pat, text)
        if m:
            return float(m.group(1))
    return None


def find_link(html, keyword):
    """본문 앵커 중 '보이는 텍스트'에 keyword가 포함된 첫 링크의 (href, 텍스트)."""
    for m in re.finditer(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S):
        href = m.group(1)
        text = re.sub(r"<[^>]+>", "", m.group(2))
        text = re.sub(r"\s+", " ", text).strip()
        if keyword in text:
            return href, text
    return None, None


def resolve_url(href):
    if href.startswith("http"):
        return href
    return BASE + href if href.startswith("/") else BASE + "/" + href


def fetch_and_extract(url, label):
    """url을 받아 (rate, html) — 실패해도 진단용으로 html은 최대한 반환."""
    try:
        html = _request(url, timeout=15)
    except Exception as e:  # noqa: BLE001
        print(f"[bond_rate] {label} 조회 실패: {e}", file=sys.stderr)
        return None, None
    return extract_rate(html), html


def main():
    rate, html = fetch_and_extract(SOURCE_URL, "메뉴 페이지")
    if html is None:
        return   # 조회 자체가 실패 — 기존 값 유지(위에서 이미 로그 남김)

    if rate is None:
        href, link_text = find_link(html, LINK_KEYWORD)
        if not href:
            text = strip_tags(html)
            print(f"[bond_rate] '{LINK_KEYWORD}' 링크를 못 찾음 — 페이지 앞부분: {text[:300]}", file=sys.stderr)
        elif href.strip().lower().startswith("javascript:"):
            print(f"[bond_rate] '{link_text}' 링크가 자바스크립트 함수 호출(href={href[:80]})이라 "
                  "정적 크롤링으로 따라갈 수 없음 — 이 조회는 JS 기반 위젯일 가능성이 큼. 기존 값 유지.",
                  file=sys.stderr)
        else:
            follow_url = resolve_url(href)
            print(f"[bond_rate] 메뉴에서 '{link_text}' 링크 발견 → 따라가기: {follow_url}")
            rate, html2 = fetch_and_extract(follow_url, "링크 페이지")
            if rate is None and html2 is not None:
                text2 = strip_tags(html2)
                print(f"[bond_rate] 링크 페이지도 파싱 실패 — 페이지 앞부분: {text2[:300]}", file=sys.stderr)

    if rate is None:
        print("[bond_rate] 할인율 파싱 실패 — 기존 값 유지.", file=sys.stderr)
        return
    if not (0 < rate < 50):   # 상식적 범위를 벗어나면 오탐 가능성 — 저장하지 않음
        print(f"[bond_rate] 파싱값이 비정상 범위({rate}%) — 저장하지 않음", file=sys.stderr)
        return
    data = {
        "_meta": {"source": "주택도시기금 포털 — 제1종국민주택채권 고객부담률(할인율)",
                  "note": "공식 오픈API가 없어 조회 페이지를 파싱함. 실패 시 기존 값 유지."},
        "as_of": dt.date.today().isoformat(),
        "customer_burden_rate_pct": rate,
    }
    save_json_safe(OUT, data)
    print(f"[bond_rate] 고객부담률 {rate}% ({data['as_of']})")


if __name__ == "__main__":
    main()
