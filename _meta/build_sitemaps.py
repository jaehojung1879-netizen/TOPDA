#!/usr/bin/env python3
"""site/sitemap.xml → sitemap index + 분류별 sitemap 파일로 분할 (지시서 5단계).

    sitemap.xml                  ← sitemap index (robots.txt가 가리키는 진입점)
    ├─ sitemap-pages.xml
    ├─ sitemap-calculators.xml
    ├─ sitemap-guides.xml
    ├─ sitemap-apt-regions.xml
    └─ sitemap-apt-complexes.xml

왜 index로 바꾸나: 단지 페이지가 늘면 단일 sitemap의 URL 수가 빠르게 커지고, Search
Console에서 "어느 묶음이 색인되는가"를 분리해 볼 수 없다. 분류별로 나눠야 단지 페이지의
색인율만 따로 추적할 수 있다(10단계 판단 기준).

설계
  · 입력은 기존 site/sitemap.xml 하나다. 각 생성기(build_apt_pages·build_complex_pages·
    gen_i18n_sitemap)는 지금처럼 sitemap.xml에 항목을 쓰고, 이 스크립트가 **마지막에**
    읽어 분할한다. 생성기들을 건드리지 않기 위한 구조다.
  · 그래서 sitemap.xml이 index로 바뀐 뒤에도 원본 목록이 필요하다 →
    site/sitemap-all.xml 에 평면 목록을 보존하고, 다음 실행은 그쪽을 읽는다.
  · lastmod는 원본 값을 그대로 옮긴다. 매 빌드마다 전 URL의 lastmod를 오늘로 덮어쓰면
    크롤러에 '전부 바뀌었다'는 잘못된 신호를 준다(지시서 5단계 요구사항).
  · noindex 페이지는 sitemap에 넣지 않는다 — 실제 HTML의 robots 메타를 확인해 제외한다.
  · 파일당 상한 50,000 URL. 넘으면 -2, -3으로 쪼갠다.
"""
import datetime as dt
import os
import re
import urllib.parse

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))
BASE = "https://topda.kr"
SITEMAP = os.path.join(SITE, "sitemap.xml")
FLAT = os.path.join(SITE, "sitemap-all.xml")     # 평면 원본(생성기들이 계속 쓰는 대상)
MAX_URLS = 50000

NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'


def classify(loc):
    """URL → sitemap 묶음 이름."""
    p = urllib.parse.unquote(loc.replace(BASE, ""))
    if p.startswith("/apt/"):
        # /apt/{지역}/{단지}/ 는 단지, /apt/ 와 /apt/{지역}.html·/apt/{지역}/ 는 지역
        rest = p[len("/apt/"):].strip("/")
        return "apt-complexes" if rest.count("/") >= 1 else "apt-regions"
    if "/calculators/" in p:
        return "calculators"
    if p.startswith(("/posts/", "/checklists/", "/interior/", "/loan/")) or p.endswith("/guides.html"):
        return "guides"
    return "pages"


def parse(xml):
    """<url> 블록 → [(loc, lastmod, priority)] (등장 순서, 중복 제거)."""
    out, seen = [], set()
    for m in re.finditer(r"<url>(.*?)</url>", xml, re.S):
        block = m.group(1)
        loc = re.search(r"<loc>([^<]+)</loc>", block)
        if not loc or loc.group(1) in seen:
            continue
        seen.add(loc.group(1))
        lm = re.search(r"<lastmod>([^<]+)</lastmod>", block)
        pr = re.search(r"<priority>([^<]+)</priority>", block)
        out.append((loc.group(1), lm.group(1) if lm else None, pr.group(1) if pr else None))
    return out


NOINDEX_RE = re.compile(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', re.I)


def is_noindex(loc):
    """해당 URL의 실제 HTML이 noindex인지. 파일이 없으면 False(판단 보류).

    ⚠ 앞 4KB만 읽으면 안 된다. 단지 페이지처럼 head 안에 큰 <style> 블록이 있는 문서는
    robots 메타가 4KB 뒤로 밀려 noindex 를 놓치고, 그 URL이 sitemap 에 남는다.
    head 전체를 읽는다(body 까지 읽을 필요는 없다).
    """
    p = urllib.parse.unquote(loc.replace(BASE, ""))
    fp = os.path.join(SITE, p.lstrip("/"))
    if p.endswith("/"):
        fp = os.path.join(fp, "index.html")
    try:
        with open(fp, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return False
    head = text.split("</head>", 1)[0]
    return bool(NOINDEX_RE.search(head))


def urlset(entries):
    body = []
    for loc, lastmod, pri in entries:
        body.append("  <url>\n    <loc>" + loc + "</loc>\n")
        if lastmod:
            body.append("    <lastmod>" + lastmod + "</lastmod>\n")
        if pri:
            body.append("    <priority>" + pri + "</priority>\n")
        body.append("  </url>\n")
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset {NS}>\n' + "".join(body) + "</urlset>\n"


def sitemapindex(files):
    body = "".join(
        f"  <sitemap>\n    <loc>{BASE}/{name}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </sitemap>\n"
        for name, lastmod in files)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex {NS}>\n' + body + "</sitemapindex>\n"


ORDER = ["pages", "calculators", "guides", "apt-regions", "apt-complexes"]


def main():
    # 평면 원본을 우선 읽는다. 아직 없으면(최초 전환) sitemap.xml이 평면이므로 그걸 쓴다.
    src = FLAT if os.path.exists(FLAT) else SITEMAP
    with open(src, encoding="utf-8") as f:
        xml = f.read()
    if "<sitemapindex" in xml:
        print(f"! {os.path.basename(src)} 가 이미 index 형식 — 평면 목록을 찾을 수 없어 중단")
        return 1
    entries = parse(xml)
    if not entries:
        print("! URL 없음 — 중단")
        return 1

    # 평면 원본 보존(생성기들이 계속 여기에 쓰도록 다음 실행의 입력이 된다)
    with open(FLAT, "w", encoding="utf-8") as f:
        f.write(urlset(entries))

    dropped = [e for e in entries if is_noindex(e[0])]
    entries = [e for e in entries if e not in dropped]

    groups = {k: [] for k in ORDER}
    for e in entries:
        groups[classify(e[0])].append(e)

    today = dt.date.today().strftime("%Y-%m-%d")
    files, made = [], []
    for name in ORDER:
        items = groups[name]
        if not items:
            continue
        chunks = [items[i:i + MAX_URLS] for i in range(0, len(items), MAX_URLS)]
        for i, chunk in enumerate(chunks, 1):
            fname = f"sitemap-{name}.xml" if i == 1 else f"sitemap-{name}-{i}.xml"
            with open(os.path.join(SITE, fname), "w", encoding="utf-8") as f:
                f.write(urlset(chunk))
            # index의 lastmod는 그 묶음에서 가장 최근 lastmod — 안 바뀐 묶음은 그대로 둔다.
            lastmod = max((e[1] for e in chunk if e[1]), default=today)
            files.append((fname, lastmod))
            made.append((fname, len(chunk)))

    with open(SITEMAP, "w", encoding="utf-8") as f:
        f.write(sitemapindex(files))

    # 오래된 분할 파일 정리(묶음이 비어 사라진 경우)
    keep = {n for n, _ in files}
    for f_ in os.listdir(SITE):
        if re.fullmatch(r"sitemap-(?!all\.xml)[a-z0-9-]+\.xml", f_) and f_ not in keep:
            os.remove(os.path.join(SITE, f_))
            print(f"  · 삭제(빈 묶음) {f_}")

    print(f"[ok] sitemap index {len(files)}개 파일 · URL {sum(n for _, n in made):,}개"
          + (f" · noindex 제외 {len(dropped)}개" if dropped else ""))
    for fname, n in made:
        print(f"   · {fname:32} {n:6,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
