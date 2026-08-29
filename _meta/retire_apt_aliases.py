#!/usr/bin/env python3
"""레거시 영문 지역 URL을 얇은 리다이렉트 셸로 바꾼다.

예전 단지 페이지 생성기는 같은 지역 본문을 두 URL에 만들었다.
  /apt/서울-강남구.html
  /apt/seoul-gangnam/

canonical만 같게 둔 결과 정확히 같은 지역 문서가 79쌍 공개됐다. GitHub Pages에서는
서버측 301을 만들 수 없으므로, 영문 슬러그 URL은 noindex + meta refresh 셸로 보존하고
실제 콘텐츠와 sitemap은 한글 지역 URL 하나에만 둔다. 북마크는 계속 동작한다.
"""
import html
import json
import os
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
APT = os.path.join(SITE, "apt")
SLUG_MAP = os.path.join(ROOT, "data", "slug-map.json")
BASE = "https://topda.kr"


def region_path(region_key):
    return "/apt/" + urllib.parse.quote(region_key.replace(" ", "-")) + ".html"


def redirect_html(region_key, target):
    title = html.escape(f"{region_key} 아파트 실거래 페이지 이동 — 톺다")
    absolute = BASE + target
    return f'''<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,follow" />
<meta http-equiv="refresh" content="0; url={html.escape(target, quote=True)}" />
<link rel="canonical" href="{html.escape(absolute, quote=True)}" />
<title>{title}</title>
</head><body>
<main><h1>페이지 주소가 변경되었습니다</h1>
<p><a href="{html.escape(target, quote=True)}">{html.escape(region_key)} 아파트 실거래 페이지로 이동</a></p>
</main></body></html>
'''


def main():
    with open(SLUG_MAP, encoding="utf-8") as f:
        data = json.load(f)
    regions = data.get("regions") or {}
    hubs = data.get("_meta", {}).get("hubs") or []
    changed = 0
    for region_key in hubs:
        slug = (regions.get(region_key) or {}).get("slug")
        if not slug:
            continue
        path = os.path.join(APT, slug, "index.html")
        if not os.path.exists(path):
            continue
        content = redirect_html(region_key, region_path(region_key))
        try:
            with open(path, encoding="utf-8") as f:
                old = f.read()
        except OSError:
            old = ""
        if old != content:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            changed += 1
    print(f"[ok] 레거시 영문 지역 URL {len(hubs)}개 확인 · 리다이렉트 갱신 {changed}개")


if __name__ == "__main__":
    main()
