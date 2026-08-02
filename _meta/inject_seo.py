#!/usr/bin/env python3
"""전 페이지에 SEO 메타/OG/Twitter/canonical/hreflang/JSON-LD/분석 스크립트를 멱등 주입.

- 멱등성: '<!-- seo:meta -->' 마커가 있으면 해당 파일은 건너뜀.
- canonical/OG/JSON-LD URL은 BASE 절대경로 사용.
- hreflang은 KR<->EN 1:1 대응이 명확한 페이지에만 부여.
"""
import html
import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..", "site")
ROOT = os.path.abspath(ROOT)
BASE = "https://topda.kr"
SITE_NAME_KO = "톺다"
SITE_NAME_EN = "TOPDA"
LOGO = BASE + "/assets/images/brand/logo.png"
OG_IMAGE = LOGO
# 파비콘은 16~32px 자리다. 688KB 원본(773×826)을 물리면 모든 페이지가 그 크기를
# 헛으로 받는다 — 2026-08-02 실측에서 계산기 3개 화면 모두 이 파일이 가장 느린
# 리소스였다(app.js 333KB 의 6~9배). 파생본은 _meta/build_logo_sizes.py 가 만든다.
FAVICON = BASE + "/assets/images/brand/logo-32.png"
ANALYTICS = BASE + "/assets/analytics.js"

# KR <-> EN 1:1 대응이 명확한 페이지만 hreflang 부여
HREFLANG_PAIRS = {
    "index.html": "en/index.html",
    "about.html": "en/about.html",
    "feedback.html": "en/feedback.html",
    "calculators/index.html": "en/calculators/index.html",
    "calculators/acquisition-tax.html": "en/calculators/acquisition-tax.html",
    "calculators/auction-bid.html": "en/calculators/auction-bid.html",
    "calculators/brokerage-fee.html": "en/calculators/brokerage-fee.html",
    "calculators/jeonse-monthly.html": "en/calculators/jeonse-monthly.html",
}
# 역방향도 채운다
for k, v in list(HREFLANG_PAIRS.items()):
    HREFLANG_PAIRS[v] = k

SECTION_LABELS = {
    "calculators": ("계산기", "Calculators"),
    "checklists": ("체크리스트", "Checklists"),
    "categories": ("카테고리", "Categories"),
    "posts": ("가이드", "Guides"),
    "interior": ("인테리어", "Interior"),
}


def rel_paths():
    for dirpath, _dirs, files in os.walk(ROOT):
        for f in files:
            if f.endswith(".html"):
                full = os.path.join(dirpath, f)
                rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
                yield rel, full


def attr_safe(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("&amp;amp;", "&amp;")


def text_of(pattern, content, default=""):
    m = re.search(pattern, content, re.S)
    return m.group(1).strip() if m else default


def build_breadcrumb(rel, title_text, is_en):
    segs = rel.split("/")
    home_url = BASE + ("/en/index.html" if is_en else "/index.html")
    home_label = "Home" if is_en else "홈"
    items = [{"name": home_label, "url": home_url}]

    # en/ prefix 제거 후 섹션 판별
    core = segs[1:] if is_en else segs
    if len(core) >= 2:
        section = core[0]
        if section in SECTION_LABELS:
            label = SECTION_LABELS[section][1 if is_en else 0]
            sec_index = ("en/" if is_en else "") + section + "/index.html"
            if os.path.exists(os.path.join(ROOT, sec_index.replace("/", os.sep))):
                sec_url = BASE + "/" + sec_index
            else:
                sec_url = BASE + "/" + ("en/" if is_en else "") + section + "/"
            items.append({"name": label, "url": sec_url})
    # 섹션 인덱스 자신은 이미 items에 있으므로 중복 추가하지 않는다.
    page_url = BASE + "/" + rel
    if items[-1]["url"] != page_url:
        items.append({"name": title_text, "url": page_url})

    elements = []
    for i, it in enumerate(items, 1):
        elements.append({
            "@type": "ListItem",
            "position": i,
            "name": it["name"],
            "item": it["url"],
        })
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": elements,
    }


def build_org_website(is_en):
    name = SITE_NAME_EN if is_en else SITE_NAME_KO
    return [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": BASE + "/#organization",
            "name": name,
            "url": BASE + "/",
            "logo": BASE + "/assets/og-default.svg",
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": BASE + "/#website",
            "name": name,
            "url": BASE + "/",
            "publisher": {"@id": BASE + "/#organization"},
            "inLanguage": "en" if is_en else "ko",
            # sitelinks 검색창(SearchAction). KR 홈은 /find.html?q=, EN도 동일 검색 UI 사용.
            "potentialAction": {
                "@type": "SearchAction",
                "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": BASE + "/find.html?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
            },
        },
    ]


def build_webapp(rel, title_text, desc_text, is_en):
    return {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": title_text,
        "url": BASE + "/" + rel,
        "description": desc_text,
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Any",
        "browserRequirements": "Requires JavaScript",
        "inLanguage": "en" if is_en else "ko",
        "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "KRW"},
        "publisher": {"@id": BASE + "/#organization"},
    }


def jsonld_block(objs):
    out = []
    for o in objs:
        out.append('<script type="application/ld+json">\n'
                   + json.dumps(o, ensure_ascii=False, indent=2)
                   + "\n</script>")
    return "\n".join(out)


def process(rel, full):
    with open(full, encoding="utf-8") as fh:
        content = fh.read()
    if "<!-- seo:meta -->" in content:
        return "skip"

    is_en = rel.startswith("en/")
    lang = "en" if is_en else "ko"
    locale = "en_US" if is_en else "ko_KR"
    site_name = SITE_NAME_EN if is_en else SITE_NAME_KO
    canonical = BASE + "/" + rel
    og_type = "article" if "/posts/" in ("/" + rel) else "website"

    title_text = html.unescape(text_of(r"<title>(.*?)</title>", content, site_name))
    desc_raw = text_of(r'<meta\s+name="description"\s+content="(.*?)"\s*/?>', content, "")
    desc_text = html.unescape(desc_raw)

    title_attr = attr_safe(title_text)
    desc_attr = attr_safe(desc_text)

    # ----- 메타 블록 -----
    lines = ["<!-- seo:meta -->"]
    lines.append('<link rel="icon" href="%s" type="image/png" />' % FAVICON)
    lines.append('<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin />')
    lines.append('<link rel="canonical" href="%s" />' % canonical)
    lines.append('<link rel="alternate" type="application/rss+xml" title="톺다 RSS" href="%s/feed.xml" />' % BASE)
    lines.append('<meta property="og:type" content="%s" />' % og_type)
    lines.append('<meta property="og:site_name" content="%s" />' % site_name)
    lines.append('<meta property="og:title" content="%s" />' % title_attr)
    lines.append('<meta property="og:description" content="%s" />' % desc_attr)
    lines.append('<meta property="og:url" content="%s" />' % canonical)
    lines.append('<meta property="og:image" content="%s" />' % OG_IMAGE)
    lines.append('<meta property="og:locale" content="%s" />' % locale)
    lines.append('<meta name="twitter:card" content="summary_large_image" />')
    lines.append('<meta name="twitter:title" content="%s" />' % title_attr)
    lines.append('<meta name="twitter:description" content="%s" />' % desc_attr)
    lines.append('<meta name="twitter:image" content="%s" />' % OG_IMAGE)

    # hreflang
    if rel in HREFLANG_PAIRS:
        ko_rel = rel if not is_en else HREFLANG_PAIRS[rel]
        en_rel = HREFLANG_PAIRS[rel] if not is_en else rel
        lines.append('<link rel="alternate" hreflang="ko" href="%s/%s" />' % (BASE, ko_rel))
        lines.append('<link rel="alternate" hreflang="en" href="%s/%s" />' % (BASE, en_rel))
        lines.append('<link rel="alternate" hreflang="x-default" href="%s/%s" />' % (BASE, ko_rel))

    # 사이트 인증 (홈에만)
    if rel in ("index.html", "en/index.html"):
        lines.append('<meta name="naver-site-verification" content="NAVER_SITE_VERIFICATION_PLACEHOLDER" />')
        lines.append('<meta name="google-site-verification" content="GOOGLE_SITE_VERIFICATION_PLACEHOLDER" />')

    # 분석 스크립트
    lines.append('<script defer src="%s"></script>' % ANALYTICS)
    meta_block = "\n".join(lines)

    # ----- JSON-LD -----
    objs = []
    is_index = rel in ("index.html", "en/index.html")
    if is_index:
        objs.extend(build_org_website(is_en))
    else:
        objs.append(build_breadcrumb(rel, title_text, is_en))
    # 계산기(목록 제외)에는 WebApplication
    is_calc = "/calculators/" in ("/" + rel) and not rel.endswith("calculators/index.html")
    if is_calc:
        objs.append(build_webapp(rel, title_text, desc_text, is_en))
    ld = jsonld_block(objs)

    # ----- 삽입 -----
    # 1) 메타 블록: description 메타 라인 바로 뒤
    desc_pat = re.compile(r'(<meta\s+name="description"\s+content=".*?"\s*/?>)', re.S)
    if desc_pat.search(content):
        content = desc_pat.sub(lambda m: m.group(1) + "\n" + meta_block, content, count=1)
    else:
        content = content.replace("</title>", "</title>\n" + meta_block, 1)

    # 2) JSON-LD: </head> 직전
    content = content.replace("</head>", ld + "\n</head>", 1)

    # 3) html lang 보정
    content = re.sub(r"<html[^>]*>", '<html lang="%s">' % lang, content, count=1)

    with open(full, "w", encoding="utf-8") as fh:
        fh.write(content)
    return "done"


def main():
    done = skip = 0
    for rel, full in sorted(rel_paths()):
        r = process(rel, full)
        if r == "done":
            done += 1
        else:
            skip += 1
    print("injected: %d, skipped(existing): %d" % (done, skip))


if __name__ == "__main__":
    main()
