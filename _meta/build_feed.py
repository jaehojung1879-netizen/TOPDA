#!/usr/bin/env python3
"""site/feed.xml 을 실제 HTML 에서 생성한다.

■ 왜 필요한가 (2026-08-08 감사)

  feed.xml 은 생성기 없이 손으로 관리되던 파일이었고, 그 사이 본문 정비(2026-07-30)가
  제목·설명을 고치면서 **32건 중 21건이 HTML 과 어긋난 상태**로 남았다. 그것도 정비가
  의도적으로 걷어낸 표현들이 RSS 에만 살아 있었다.

      RSS  "매매 분쟁의 90%가 특약에서 시작됩니다"  ↔  HTML  근거 문장으로 교체됨
      RSS  "DSR 완벽 정리"                        ↔  HTML  "DSR 계산 구조와 한도"
      RSS  "잔금일에 동시에 갖춰야 진짜 안전"        ↔  HTML  "언제 생기고 무엇을 지켜 주는지"

  게다가 발행된 글 17건이 아예 빠져 있었고, lastBuildDate 는 정비 이전 날짜였다.
  feed.xml 은 inject_seo.py 가 **전 페이지에 <link rel="alternate"> 로 걸어 두는**
  공개 문서라, 사이트가 스스로와 모순된 두 버전을 동시에 발행하는 상태였다.

  손으로 맞추면 다음 편집에서 또 어긋난다. 그래서 HTML 을 단일 출처로 삼아 생성한다.

■ RSS 가 SEO 에 도움이 되는가

  솔직히 말하면 거의 되지 않는다. Search Console 은 RSS 를 sitemap 형식으로 받아주지만
  <lastmod>·<priority> 를 표현하지 못해 이미 있는 분류별 sitemap 보다 열등하고,
  robots.txt 도 feed.xml 을 가리키지 않는다. 실질 가치는 RSS 구독자용이다.
  그래서 이 스크립트의 목적은 '검색 순위 개선'이 아니라 **모순 제거**다.
  (없애는 선택지도 있었지만, 전 페이지에 박힌 rel=alternate 를 걷어내는 쪽이
   생성기 하나를 두는 것보다 변경 범위가 크다.)

■ 무엇을 싣는가

  · 대상: /posts/ · /checklists/ · /interior/ · /loan/ 의 한국어 글. 허브(index.html) 제외.
  · noindex 페이지는 싣지 않는다 — 색인에서 뺀 글을 피드로 밀어내면 신호가 어긋난다.
  · 제목·설명은 HTML 의 <title>·<meta name="description"> 을 그대로 쓴다.
    (여기서 따로 문구를 만들지 않는다. 만들면 그 순간 다시 두 버전이 된다.)
  · 날짜는 byline 의 '게시' 시각을 pubDate 로, 가장 최근 날짜를 lastBuildDate 로 쓴다.
    byline markup 은 add_bylines.py 가 만든다(`게시 <time datetime="...">`).

사용법
  python build_feed.py            # 생성
  python build_feed.py --check    # 생성하지 않고, 현재 파일이 최신인지만 검사 (CI)
"""
import argparse
import datetime as dt
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
FEED = os.path.join(SITE, "feed.xml")
BASE = "https://topda.kr"

DIRS = ("posts", "checklists", "interior", "loan")

CHANNEL_TITLE = "톺다 — 부동산, 하나하나 톺아보자"
CHANNEL_DESC = ("매매·전세·대출·인테리어·이사. 부동산 거래의 각 단계에서 확인할 항목과 "
                "공공데이터 기반 계산 도구를 정리합니다.")

NOINDEX_RE = re.compile(r'<meta[^>]+name=["\']robots["\'][^>]*content=["\'][^"\']*noindex', re.I)
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S | re.I)
DESC_RE = re.compile(r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']', re.S | re.I)
CANON_RE = re.compile(r'<link\b[^>]*\brel=["\']canonical["\'][^>]*>', re.I)
HREF_RE = re.compile(r'\bhref=["\']([^"\']+)["\']', re.I)
PUBLISHED_RE = re.compile(r'게시 <time datetime="(\d{4}-\d{2}-\d{2})"')
# '내용 검토' 또는 '파일 최종 수정' — 어느 쪽이든 그 글의 최신 날짜로 본다.
TOUCHED_RE = re.compile(r'(?:내용 검토|파일 최종 수정) <time datetime="(\d{4}-\d{2}-\d{2})"')

# 사이트 이름 꼬리표. RSS 제목에서는 뗀다(채널 제목에 이미 있다).
SUFFIX_RE = re.compile(r"\s*[—|·-]\s*톺다\s*$")


def rfc822(date_str):
    """'2026-07-04' → 'Sat, 04 Jul 2026 00:00:00 +0000'."""
    d = dt.datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    return d.strftime("%a, %d %b %Y %H:%M:%S +0000")


def collect():
    items = []
    for d in DIRS:
        base = os.path.join(SITE, d)
        if not os.path.isdir(base):
            continue
        for fn in sorted(os.listdir(base)):
            if not fn.endswith(".html") or fn == "index.html":
                continue
            fp = os.path.join(base, fn)
            raw = open(fp, encoding="utf-8", errors="replace").read()
            head = raw.split("</head>", 1)[0]
            if NOINDEX_RE.search(head):
                continue

            t = TITLE_RE.search(head)
            title = SUFFIX_RE.sub("", html.unescape(t.group(1).strip())) if t else ""
            de = DESC_RE.search(head)
            desc = html.unescape(de.group(1).strip()) if de else ""

            link = f"{BASE}/{d}/{fn}"
            c = CANON_RE.search(head)
            if c:
                h = HREF_RE.search(c.group(0))
                if h:
                    link = h.group(1)

            pub = PUBLISHED_RE.search(raw)
            touched = TOUCHED_RE.search(raw)
            if not (title and pub):
                # 제목이나 게시일이 없으면 싣지 않는다. 날짜를 추정해 채우지 않는다.
                print(f"  · 건너뜀 (제목/게시일 없음): /{d}/{fn}")
                continue
            items.append({
                "title": title, "desc": desc, "link": link,
                "published": pub.group(1),
                "touched": touched.group(1) if touched else pub.group(1),
            })
    # 최신 게시순. 같은 날이면 제목순으로 고정해 실행마다 순서가 흔들리지 않게 한다.
    items.sort(key=lambda x: (x["published"], x["title"]), reverse=True)
    return items


def render(items):
    last = max((i["touched"] for i in items), default=dt.date.today().isoformat())
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "  <channel>",
        f"    <title>{html.escape(CHANNEL_TITLE)}</title>",
        # 채널 link 는 정규 홈 URL 이다. 예전 값은 /index.html 로, canonical 과 달랐다.
        f"    <link>{BASE}/</link>",
        f'    <atom:link href="{BASE}/feed.xml" rel="self" type="application/rss+xml" />',
        f"    <description>{html.escape(CHANNEL_DESC)}</description>",
        "    <language>ko</language>",
        f"    <lastBuildDate>{rfc822(last)}</lastBuildDate>",
    ]
    for it in items:
        out += [
            "    <item>",
            f'      <title><![CDATA[{it["title"]}]]></title>',
            f'      <link>{it["link"]}</link>',
            f'      <guid isPermaLink="true">{it["link"]}</guid>',
            f'      <description><![CDATA[{it["desc"]}]]></description>',
            f'      <pubDate>{rfc822(it["published"])}</pubDate>',
            "    </item>",
        ]
    out += ["  </channel>", "</rss>", ""]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="생성하지 않고 현재 feed.xml 이 HTML 과 일치하는지만 검사")
    args = ap.parse_args()

    items = collect()
    if not items:
        print("! 실을 글이 없다 — 중단(기존 feed.xml 을 건드리지 않는다)")
        return 1
    new = render(items)

    cur = open(FEED, encoding="utf-8").read() if os.path.exists(FEED) else ""
    if args.check:
        if cur == new:
            print(f"[ok] feed.xml 최신 ({len(items)}건)")
            return 0
        print("! feed.xml 이 HTML 과 어긋납니다. `python _meta/build_feed.py` 를 실행하고 "
              "결과를 커밋하세요.")
        # 무엇이 다른지 한눈에 보이도록 항목 수만이라도 알려 준다.
        print(f"  현재 item {cur.count('<item>')}건 · 생성 결과 {len(items)}건")
        return 1

    with open(FEED, "w", encoding="utf-8") as f:
        f.write(new)
    print(f"[ok] feed.xml {len(items)}건 · lastBuildDate {max(i['touched'] for i in items)}"
          + ("" if cur else " (신규)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
