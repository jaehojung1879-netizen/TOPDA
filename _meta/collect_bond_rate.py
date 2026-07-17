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

# 주택도시기금 포털 — 셀프 채권매입 도우미(로그인 불필요, 일반 공개 조회 페이지).
SOURCE_URL = "https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070509.jsp"

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
    # 못 찾으면 다음 디버깅을 위해 '부담'·'할인' 주변 텍스트를 stderr에 남긴다.
    for kw in ("부담률", "할인율"):
        i = text.find(kw)
        if i >= 0:
            print(f"[bond_rate] 키워드 '{kw}' 주변 텍스트(정규식 불일치, 다음 수정 참고): "
                  f"...{text[max(0, i-40):i+60]}...", file=sys.stderr)
    return None


def main():
    try:
        html = _request(SOURCE_URL, timeout=15)
    except Exception as e:  # noqa: BLE001
        print(f"[bond_rate] 조회 실패 — 기존 값 유지: {e}", file=sys.stderr)
        return
    rate = extract_rate(html)
    if rate is None:
        print("[bond_rate] 할인율 파싱 실패 — 페이지 구조가 바뀌었을 수 있음. 기존 값 유지.", file=sys.stderr)
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
