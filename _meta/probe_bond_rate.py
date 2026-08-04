#!/usr/bin/env python3
"""국민주택채권 할인율 소스 **진단 전용** 스크립트 (수집기 아님).

왜 있나: collect_bond_rate.py 가 몇 주째 값을 못 가져오는데, 개발 환경에서는
nhuf.molit.go.kr·은행 도메인이 모두 막혀 있어(HTTP 000/403) 무엇이 잘못됐는지
확인할 방법이 없었다. 그래서 "표 구조 파서를 고친다"는 추측만 반복됐다.

2026-08-03 CI 로그에서 처음으로 실제 응답 내용이 보였고, 세 소스 모두
**표가 아니라 메뉴·네비게이션 텍스트만** 돌아온다는 게 드러났다:

  주택도시기금: '채권매도단가/수익률/할인율 본문 바로가기 기금안내 주택도시기금소개 …'
  KB:          '매도단가/할인율조회 ( 국민주택채권 | 조회/취소/변경 | … ) 본문 바로가기 로그인 …'

즉 표 자체가 HTML 에 없다 — 값은 JS/AJAX 로 나중에 채워진다. 파서를 아무리
고쳐도 안 되는 게 당연했다. 따라서 필요한 건 '표를 실제로 채우는 요청'을 찾는
것이고, 그건 네트워크가 열린 GitHub Actions 에서만 확인할 수 있다.

이 스크립트는 값을 저장하지 않는다. 각 후보 URL 에 대해 응답을 받아
  · 상태·인코딩·길이
  · <form action> 과 그 hidden 파라미터
  · <iframe src>, <script src>
  · JS 안의 ajax/fetch/location URL 문자열
  · '할인율/부담률/매도단가' 가 나오는 지점의 **가공 안 한 HTML 조각**
를 로그로 뱉는다. 이 로그만 보고 진짜 엔드포인트를 특정한 뒤, 검증된 파서를
collect_bond_rate.py 에 넣는 게 목적이다.

실행: 워크플로 probe-bond-rate.yml (workflow_dispatch) 에서만.
"""
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

KEYWORDS = ("할인율", "고객부담", "본인부담", "매도단가", "수익률")

# 후보. GET 기본, POST 는 (url, data) 튜플.
CANDIDATES = [
    ("주택도시기금 FP070503(현재 1순위 후보)",
     "https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070503.jsp"),
    ("주택도시기금 FP070503 (POST 빈 폼)",
     ("https://nhuf.molit.go.kr/FP/FP07/FP0705/FP070503.jsp", {})),
    ("KB 매도단가/할인율조회",
     "https://okbfex.kbstar.com/quics?page=C028010"),
    ("우리은행 1종채권",
     "https://svc.wooribank.com/svc/Dream?withyou=HBNHB0036"),
    ("신한은행 국민주택채권",
     "https://bank.shinhan.com/index.jsp#020508010000"),
    ("주택도시기금 모바일",
     "https://nhuf.molit.go.kr/MO/MO05/MO0503/MO050301.jsp"),
]


def fetch(target, timeout=30):
    """(status, final_url, encoding, text) 또는 예외 문자열."""
    if isinstance(target, tuple):
        url, data = target
        body = urllib.parse.urlencode(data).encode() if data is not None else b""
        req = urllib.request.Request(url, data=body, headers={
            "User-Agent": UA, "Accept-Language": "ko",
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
        })
    else:
        url = target
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ko"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        status, final_url = resp.status, resp.geturl()
        ctype = resp.headers.get("Content-Type", "")
    enc_used = None
    for enc in ("utf-8", "cp949"):
        try:
            text = raw.decode(enc)
            enc_used = enc
            break
        except UnicodeDecodeError:
            continue
    else:
        text, enc_used = raw.decode("utf-8", "replace"), "utf-8(replace)"
    return status, final_url, f"{enc_used} · {ctype}", text


def show_forms(html):
    """<form> 의 action·method 와 hidden 파라미터 — 표를 채우는 POST 를 찾기 위한 것."""
    out = []
    for m in re.finditer(r"<form([^>]*)>([\s\S]*?)</form>", html, re.I):
        attrs, inner = m.group(1), m.group(2)
        action = re.search(r'action\s*=\s*["\']?([^"\'\s>]+)', attrs, re.I)
        method = re.search(r'method\s*=\s*["\']?(\w+)', attrs, re.I)
        name = re.search(r'name\s*=\s*["\']?([^"\'\s>]+)', attrs, re.I)
        fields = re.findall(
            r'<input[^>]*name\s*=\s*["\']?([^"\'\s>]+)[^>]*?'
            r'(?:value\s*=\s*["\']([^"\']*)["\'])?[^>]*>', inner, re.I)
        out.append({
            "name": name.group(1) if name else "",
            "action": action.group(1) if action else "(self)",
            "method": (method.group(1) if method else "GET").upper(),
            "fields": fields[:25],
        })
    return out


def show_urls(html):
    """JS 안에서 호출될 법한 URL 문자열 — ajax/fetch/submit 대상 후보."""
    pats = [
        r'url\s*:\s*["\']([^"\']+)["\']',
        r'fetch\s*\(\s*["\']([^"\']+)["\']',
        r'\.action\s*=\s*["\']([^"\']+)["\']',
        r'location\.href\s*=\s*["\']([^"\']+)["\']',
        r'["\']([^"\']*\.(?:do|jsp|json|xml)(?:\?[^"\']*)?)["\']',
    ]
    hits = []
    for p in pats:
        for m in re.finditer(p, html, re.I):
            u = m.group(1)
            if u and u not in hits and not u.startswith(("#", "javascript:")):
                hits.append(u)
    return hits[:60]


def show_keyword_html(html, width=700):
    """키워드가 나오는 지점의 **원본 HTML**(태그 포함). 표가 있는지, 아니면 메뉴
    링크일 뿐인지는 태그를 봐야 구분된다 — 태그를 걷어낸 텍스트만 보면 둘이 똑같다."""
    out = []
    for kw in KEYWORDS:
        for m in list(re.finditer(re.escape(kw), html))[:2]:
            i = m.start()
            out.append(f"    [{kw} @{i}] " + repr(html[max(0, i - 200):i + width]))
    return out


def main():
    for label, target in CANDIDATES:
        url = target[0] if isinstance(target, tuple) else target
        kind = "POST" if isinstance(target, tuple) else "GET"
        print(f"\n{'=' * 78}\n[{kind}] {label}\n  {url}\n{'=' * 78}")
        try:
            status, final_url, meta, html = fetch(target)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ 요청 실패: {type(e).__name__}: {e}")
            continue
        print(f"  status={status} len={len(html)} enc={meta}")
        if final_url != url:
            print(f"  → 리다이렉트: {final_url}")

        tables = len(re.findall(r"<table", html, re.I))
        print(f"  <table> 개수: {tables} · <tr> 개수: {len(re.findall(r'<tr', html, re.I))}")

        forms = show_forms(html)
        print(f"  <form> {len(forms)}개:")
        for f in forms[:6]:
            print(f"    · name={f['name']!r} {f['method']} → {f['action']}")
            if f["fields"]:
                print(f"      params: {f['fields']}")

        iframes = re.findall(r'<iframe[^>]*src\s*=\s*["\']?([^"\'\s>]+)', html, re.I)
        if iframes:
            print(f"  <iframe src>: {iframes[:10]}")

        urls = show_urls(html)
        if urls:
            print("  JS/링크 URL 후보:")
            for u in urls:
                print(f"    · {u}")

        kw = show_keyword_html(html)
        if kw:
            print("  키워드 주변 원본 HTML:")
            for line in kw:
                print(line)
        else:
            print("  ⚠ 키워드가 아예 없음 — 이 응답에는 채권 정보가 없다.")

    print("\n진단 종료 — 저장한 파일 없음.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
