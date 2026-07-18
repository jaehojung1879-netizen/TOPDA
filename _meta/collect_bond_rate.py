#!/usr/bin/env python3
"""제1종국민주택채권 당일 할인율(고객부담률) → site/assets/bond_rate.json.

⚠ 공식 오픈API가 없다. 은행·주택도시기금 포털 모두 사람이 보는 조회 페이지(HTML)만
제공해, 이 수집기는 그 페이지를 파싱하는 방식이다.

소스는 여러 곳을 순서대로 시도한다 — 주택도시기금 포털은 조회 화면이 JS 위젯이라
정적 파싱이 닿지 않는 것으로 확인돼(2026-07-17 첫 실행), 당일 수치를 정적 HTML로
노출하는 은행 조회 페이지(우리은행·KB)를 먼저 시도한다. 은행 페이지는 EUC-KR
인코딩·비브라우저 UA 차단 가능성이 있어 자체 fetch(UA 지정 + cp949 폴백)를 쓴다.

모든 소스가 실패하면 기존 값을 그대로 유지하고(save_json_safe), 소스별 실패
사유와 '부담/할인' 키워드 주변 텍스트를 stderr에 남긴다 — Actions 로그의
"[bond_rate]" 라인만 보면 다음에 어떤 소스/정규식을 고치면 되는지 알 수 있게.
"""
import datetime as dt
import os
import re
import sys
import urllib.request

from lib_pdata import SITE_ASSETS, save_json_safe  # noqa: E402

OUT = os.path.join(SITE_ASSETS, "bond_rate.json")

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# 시도 순서: 정적 HTML로 당일 수치를 노출할 가능성이 높은 순.
#  · 우리은행 매도단가/수익률/할인율 조회 — 당일 표가 기본 표시되는 고전형 페이지
#  · KB 매도단가/할인율 조회(quics)
#  · 주택도시기금 포털 메뉴(기존 소스 — JS 위젯이라 실패 예상이지만 구조 변경 대비 유지)
SOURCES = [
    ("우리은행 1종채권 매도단가/할인율", "https://svc.wooribank.com/svc/Dream?withyou=HBNHB0036"),
    ("KB 1종채권 매도단가/할인율", "https://okbfex.kbstar.com/quics?page=C028010"),
    ("주택도시기금 포털", "https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070509.jsp"),
]

# "고객부담률"·"할인율" 인근에서 "12.34%" 형태를 찾는다. 태그 차이에 덜 민감하도록
# HTML 태그를 제거한 텍스트에서 찾는다. 매도단가(원)로 부담률을 역산하는 방법은
# 선급이자·세금 보정이 빠져 은행 공표치와 어긋날 수 있어 쓰지 않는다 — 명시적
# 부담률/할인율 숫자만 채택.
PATTERNS = [
    r"고객부담률[^0-9%]{0,40}(\d{1,2}\.\d{1,4})\s*%",
    r"할인율[^0-9%]{0,40}(\d{1,2}\.\d{1,4})\s*%",
    r"본인부담률[^0-9%]{0,40}(\d{1,2}\.\d{1,4})\s*%",
]


def fetch(url, timeout=15):
    """UA를 브라우저로 지정해 GET. UTF-8 → CP949(EUC-KR) 순으로 디코딩 시도.
    (은행 페이지는 EUC-KR이 흔해 utf-8 강제 디코딩 시 '고객부담률' 키워드가 깨져
    정규식이 절대 매치되지 않는다.)"""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    for enc in ("utf-8", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def strip_tags(html):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text)


def extract_rate_from_table(html):
    """은행 조회 페이지의 표 구조 대응 — 헤더행의 '고객부담률/할인율' 열 위치를 찾고,
    다음 데이터행의 같은 위치 셀에서 숫자를 취한다. (헤더와 값이 떨어져 있어
    근접 정규식으로는 매도단가·수익률 등 다른 열 숫자와 구분할 수 없기 때문.)"""
    rows = []
    for tr in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", html, re.I):
        cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).strip()
                 for c in re.findall(r"<t[hd][^>]*>([\s\S]*?)</t[hd]>", tr.group(1), re.I)]
        if cells:
            rows.append(cells)
    for ri, row in enumerate(rows):
        for ci, cell in enumerate(row):
            if not any(kw in cell for kw in ("고객부담률", "할인율", "본인부담률")):
                continue
            # 같은 행의 다음 셀(라벨-값 가로 배치) → 다음 행들의 같은 열(헤더-데이터 세로 배치) 순으로 탐색
            candidates = row[ci + 1:ci + 2]
            for below in rows[ri + 1:ri + 4]:
                if ci < len(below):
                    candidates.append(below[ci])
            for cand in candidates:
                if re.search(r"\d{4}\s*[.\-/년]\s*\d{1,2}", cand):
                    continue   # 날짜 셀("2026.07.18"·"2026년 7월") — 중간 숫자 오탐 방지
                m = re.search(r"(?<!\d)(\d{1,2}\.\d{1,4})(?!\d)\s*%?", cand)
                if m:
                    return float(m.group(1))
    return None


def extract_rate(html):
    rate = extract_rate_from_table(html)
    if rate is not None:
        return rate
    text = strip_tags(html)
    for pat in PATTERNS:
        m = re.search(pat, text)
        if m:
            return float(m.group(1))
    return None


def excerpt_around_keywords(html, keywords=("부담", "할인"), width=120):
    """실패 진단용 — 키워드 주변 텍스트 조각을 모아 반환(정규식만 고치면 되게)."""
    text = strip_tags(html)
    pieces = []
    for kw in keywords:
        i = text.find(kw)
        if i >= 0:
            pieces.append(text[max(0, i - 20):i + width])
    return " ⧸ ".join(pieces) if pieces else text[:200]


def main():
    rate, used = None, None
    for label, url in SOURCES:
        try:
            html = fetch(url)
        except Exception as e:  # noqa: BLE001
            print(f"[bond_rate] {label} 조회 실패: {e}", file=sys.stderr)
            continue
        rate = extract_rate(html)
        if rate is not None:
            used = label
            break
        print(f"[bond_rate] {label} 파싱 실패 — 키워드 주변: "
              f"{excerpt_around_keywords(html)!r}", file=sys.stderr)

    if rate is None:
        print("[bond_rate] 모든 소스에서 할인율 파싱 실패 — 기존 값 유지.", file=sys.stderr)
        return
    if not (0 < rate < 50):   # 상식적 범위를 벗어나면 오탐 가능성 — 저장하지 않음
        print(f"[bond_rate] 파싱값이 비정상 범위({rate}%) — 저장하지 않음", file=sys.stderr)
        return
    data = {
        "_meta": {"source": f"{used} 조회 페이지 파싱 — 제1종국민주택채권 고객부담률(할인율)",
                  "note": "공식 오픈API가 없어 조회 페이지를 파싱함. 실패 시 기존 값 유지."},
        "as_of": dt.date.today().isoformat(),
        "customer_burden_rate_pct": rate,
    }
    save_json_safe(OUT, data)
    print(f"[bond_rate] 고객부담률 {rate}% ({used}, {data['as_of']})")


if __name__ == "__main__":
    main()
