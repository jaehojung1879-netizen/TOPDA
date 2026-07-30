#!/usr/bin/env python3
"""공개 URL 콘텐츠 인벤토리 생성 → reports/content-inventory.{csv,json}

무엇을 재나: "이 URL은 검색 색인에 올릴 만한 고유 콘텐츠를 가졌는가"를 페이지마다
기계적으로 판정한다. AdSense '가치 없는 콘텐츠' 판정의 원인을 찾으려면 페이지 수가
아니라 **템플릿을 제외한 고유 본문 분량**을 봐야 한다.

핵심 지표: unique_chars
  같은 page_type 안에서 절반 이상의 페이지에 똑같이 등장하는 텍스트 블록을 '템플릿'으로
  보고 본문 글자 수에서 뺀다. 헤더·푸터·면책·출처 문구가 대량 자동생성 페이지의 본문
  대부분을 차지하는 구조를 그대로 드러내기 위한 계산이다.

등급
  A  독창적이고 완성된 핵심 색인 페이지
  B  사용자에게 필요하지만 검색에는 noindex가 적합한 페이지
  C  삭제·통합·리다이렉트·배포 제외가 필요한 페이지

사용법
  python audit_content.py                 # reports/ 에 csv+json 생성
  python audit_content.py --json-only
  python audit_content.py --summary       # 표준출력 요약만
"""
import argparse
import csv
import html as html_mod
import json
import os
import re
import urllib.parse
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
REPORTS = os.path.join(ROOT, "reports")
BASE = "https://topda.kr"

LANGS = ("en", "zh-Hans", "zh-Hant", "vi", "th")

# 템플릿 판정 임계치 — 같은 page_type 페이지의 이 비율 이상에 등장하면 공통 문구로 본다.
TEMPLATE_SHARE = 0.5
# page_type 안 페이지가 이보다 적으면 템플릿 추정을 신뢰할 수 없어 unique=total로 둔다.
TEMPLATE_MIN_PAGES = 4


# ───────────────────────────────────────────────────────── HTML 파싱(정규식)

SCRIPT_RE = re.compile(r"<(script|style|template)\b.*?</\1>", re.S | re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
TAG_RE = re.compile(r"<[^>]+>")
SVG_RE = re.compile(r"<svg\b.*?</svg>", re.S | re.I)


def visible_text(raw):
    """화면에 보이는 텍스트만. script/style/svg/주석 제거 후 태그 제거."""
    s = COMMENT_RE.sub(" ", raw)
    s = SCRIPT_RE.sub(" ", s)
    s = SVG_RE.sub(" ", s)
    # 블록 경계를 개행으로 남겨 블록 단위 비교가 가능하게 한다.
    # ⚠ td/th 는 개행이 아니라 ' | ' 로 잇는다. 셀 하나씩 끊으면 "2026-03-15" 같은 값이
    #   12자 미만이라 전부 버려져, 표가 본문의 대부분인 실거래 페이지의 고유 분량이
    #   0에 가깝게 측정된다(측정이 곧 등급이므로 여기서 틀리면 판정 전체가 틀어진다).
    s = re.sub(r"</(td|th)>", " | ", s, flags=re.I)
    s = re.sub(r"</(p|div|li|h[1-6]|tr|section|article|header|footer|nav)>", "\n", s, flags=re.I)
    s = TAG_RE.sub(" ", s)
    s = html_mod.unescape(s)
    return s


def text_blocks(raw):
    """비교 가능한 텍스트 블록 목록. 공백 정규화 후 12자 이상만."""
    out = []
    for line in visible_text(raw).split("\n"):
        t = re.sub(r"\s+", " ", line).strip()
        if len(t) >= 12:
            out.append(t)
    return out


def attr(raw, pattern, group=1):
    m = re.search(pattern, raw, re.I | re.S)
    return html_mod.unescape(m.group(group)).strip() if m else ""


def meta_content(raw, name):
    m = re.search(
        r'<meta[^>]+name=["\']' + re.escape(name) + r'["\'][^>]*content=["\']([^"\']*)["\']',
        raw, re.I)
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*name=["\']' + re.escape(name) + r'["\']',
            raw, re.I)
    return html_mod.unescape(m.group(1)).strip() if m else ""


# ───────────────────────────────────────────────────────── URL·분류

def url_path(fp):
    """파일 경로 → 공개 URL 경로. index.html 은 디렉터리 URL로 접힌다."""
    rel = os.path.relpath(fp, SITE).replace(os.sep, "/")
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def language_of(path, raw):
    for lg in LANGS:
        if path.startswith("/" + lg + "/"):
            return lg
    lang = attr(raw, r'<html[^>]+lang=["\']([^"\']+)["\']')
    return lang or "ko"


def page_type_of(path):
    p = path
    for lg in LANGS:
        if p.startswith("/" + lg + "/"):
            p = p[len(lg) + 1:]
            break
    if p == "/":
        return "home"
    if p.startswith("/apt/"):
        rest = p[len("/apt/"):].strip("/")
        if not rest:
            return "apt-index"
        return "apt-complex" if rest.count("/") >= 1 else "apt-region"
    if p.startswith("/admin/"):
        return "admin"
    if p.startswith("/authors/"):
        return "author"
    if "/calculators/search" in p:
        return "internal-search"
    if p.startswith("/calculators/"):
        return "calculator-index" if p.endswith("/") or p.endswith("/index.html") else "calculator"
    if p.startswith("/checklists/"):
        return "checklist-index" if p.endswith("/index.html") else "checklist"
    if p.startswith("/posts/"):
        return "post-index" if p.endswith("/index.html") else "post"
    if p.startswith("/interior/"):
        return "interior-index" if p.endswith("/index.html") else "interior"
    if p.startswith("/categories/"):
        return "category"
    if p.startswith("/loan/"):
        return "guide"
    if p in ("/find.html",):
        return "internal-search"
    if p in ("/board.html", "/board-write.html", "/board-post.html"):
        return "board"
    if p == "/feedback.html":
        return "feedback"
    if p == "/404.html":
        return "error"
    if p == "/privacy.html":
        return "policy"
    if p in ("/about.html",):
        return "about"
    if p in ("/guides.html", "/glossary.html", "/market.html", "/jeonse.html",
             "/sale.html", "/auction.html", "/moving.html", "/foreigner-loan.html",
             "/foreigner-tax.html"):
        return "hub"
    if re.match(r"^/naverad[0-9a-f]+\.html$", p):
        return "verification"
    return "other"


# ───────────────────────────────────────────────────────── 신호 감지

# byline 은 "게시 2026-05-27 · 최근 수정 2026-07-30" 형태다. 라벨만 찾으면
# 날짜 없는 "최근 갱신" 표기와 구별되지 않으므로, 날짜가 붙은 경우를 따로 잡는다.
DATE_LABEL_RE = {
    "published": re.compile(r"(게시|최초\s*게시|작성일|발행일|Published)\s*\d{4}-\d{2}-\d{2}"),
    "modified": re.compile(r"(최근\s*수정|수정일|최종\s*수정|갱신일|Updated)\s*\d{4}-\d{2}-\d{2}"),
    "reviewed": re.compile(r"(검토일|최근\s*검토|감수일|Reviewed)\s*\d{4}-\d{2}-\d{2}"),
}
AUTHOR_RE = re.compile(r"(작성\s|작성자|글쓴이|Author|톺다 작성)")
SOURCE_RE = re.compile(r"(출처|근거 법령|법적 근거|기준 법령|법령|Source|국토교통부|행정안전부|"
                       r"기획재정부|국세청|한국부동산원|지방세법|소득세법|Sources)")
ASOF_RE = re.compile(r"(기준일|적용 기준|기준 시점|as of|as-of)", re.I)
CALC_RE = re.compile(r'(class="calc-form|data-calc|<input[^>]+type="number")', re.I)
NEWS_RE = re.compile(r"news\.google\.com|rss/articles|헤드라인|news-headlines")


def detect(raw, text):
    ext = set()
    for m in re.finditer(r'href=["\'](https?://[^"\']+)["\']', raw, re.I):
        host = urllib.parse.urlparse(m.group(1)).netloc.lower()
        if host and "topda.kr" not in host:
            ext.add(m.group(1))
    internal = len({m.group(1) for m in re.finditer(
        r'href=["\'](?!https?://|mailto:|#|javascript:)([^"\']+)["\']', raw, re.I)})
    return {
        "external_links": len(ext),
        "internal_links": internal,
        "news_aggregation": bool(NEWS_RE.search(raw)),
        "has_author": bool(AUTHOR_RE.search(text)),
        "has_published_date": bool(DATE_LABEL_RE["published"].search(text)),
        "has_modified_date": bool(DATE_LABEL_RE["modified"].search(text)),
        "has_reviewed_date": bool(DATE_LABEL_RE["reviewed"].search(text)),
        "has_source": bool(SOURCE_RE.search(text)),
        "has_as_of": bool(ASOF_RE.search(text)),
        "is_tool": bool(CALC_RE.search(raw)),
        "has_adsense": "adsbygoogle.js" in raw or "ca-pub-" in raw,
        "uses_ga4": "analytics.js" in raw,
        "uses_naver_analytics": "analytics.js" in raw,
        "uses_supabase": "supabase-client.js" in raw or "board.js" in raw or "comments.js" in raw,
        "has_meta_refresh": bool(re.search(r'http-equiv=["\']refresh["\']', raw, re.I)),
    }


# ───────────────────────────────────────────────────────── sitemap

def sitemap_urls():
    """공개 sitemap 에 실린 URL 경로 집합 → {path: [파일명, ...]}

    sitemap-all.xml 은 생성기들이 공유하는 **내부 평면 목록**이라 제외한다.
    robots.txt 도 이 파일을 가리키지 않고, 배포 단계에서 산출물에서 제거한다.
    """
    out = defaultdict(list)
    for fn in sorted(os.listdir(SITE)):
        if not re.fullmatch(r"sitemap[a-z0-9-]*\.xml", fn) or fn == "sitemap-all.xml":
            continue
        with open(os.path.join(SITE, fn), encoding="utf-8") as f:
            xml = f.read()
        if "<sitemapindex" in xml:
            continue
        for m in re.finditer(r"<loc>([^<]+)</loc>", xml):
            p = urllib.parse.unquote(m.group(1).replace(BASE, "")) or "/"
            out[p].append(fn)
    return out


# ───────────────────────────────────────────────────────── 데이터 완성도

def data_completeness(pt, raw, text, unique_chars):
    """도구·데이터 페이지가 실제로 값을 담고 있는지. 빈 상태 페이지를 잡아낸다."""
    if pt == "apt-complex":
        # 거래 행은 <tbody> 안의 <tr> — 면적별 요약표 행이 섞이지 않게 거래 표만 센다.
        deal_rows = len(re.findall(r"<tr[^>]*><td>\d{4}-\d{2}-\d{2}", raw))
        quarters = 0 if "추이 차트를 표시하지 않습니다" in raw else 4
        areas = len(re.findall(r"<h3>전용 [\d.]+㎡", raw))
        return {"deal_rows": deal_rows, "quarters_charted": quarters,
                "area_types": areas, "has_chart": quarters >= 4}
    if pt in ("apt-region", "apt-index"):
        return {"table_rows": len(re.findall(r"<tr[^>]*>\s*<td", raw))}
    if pt in ("calculator", "internal-search"):
        return {"inputs": len(re.findall(r"<input\b", raw, re.I)),
                "has_faq": "FAQ" in raw or "자주 묻는" in text,
                "has_legal_basis": bool(SOURCE_RE.search(text))}
    return {"unique_chars": unique_chars}


# ───────────────────────────────────────────────────────── 등급 판정

# B 등급(사용자에게 필요하나 검색 색인 부적합) 고정 대상
B_TYPES = {"board", "feedback", "internal-search", "admin", "error", "verification"}
# 색인 대상 언어(1차). 나머지 언어는 여정 완성 전까지 B.
INDEX_LANGS = {"ko", "en"}

MIN_UNIQUE_A = 900          # 이 미만이면 고유 본문이 얇다고 본다
MIN_UNIQUE_APT_A = 1200     # 데이터 페이지는 표가 있으므로 기준을 올린다


def grade(rec):
    """(grade, reason) — 왜 그 등급인지 한 문장으로 남긴다."""
    pt, lang, uq = rec["page_type"], rec["language"], rec["unique_chars"]

    if pt == "verification":
        return "B", "검색엔진 소유확인 파일 — 색인 대상 아님(크롤 허용 유지)"
    if pt == "admin":
        return "B", "운영자 전용 화면 — noindex 유지, robots.txt Disallow 유지"
    if pt == "error":
        return "B", "오류 페이지 — noindex"
    if pt == "internal-search":
        return "B", "내부 검색 결과 — 검색 색인 부적합, 도구로는 계속 제공"
    if pt == "board":
        return "B", "사용자 생성 콘텐츠 화면 — noindex,follow"
    if pt == "feedback":
        if rec["has_meta_refresh"]:
            return "C", "board.html?cat=fix 로 즉시 리다이렉트하는 껍데기 — 색인·sitemap 제외"
        return "B", "수정 요청 화면 — noindex,follow"

    if lang not in INDEX_LANGS:
        return "B", f"{lang} 사용자 여정 미완성 — noindex,follow 로 접근만 유지"

    if pt == "home":
        return "A", "언어 루트 — 색인 유지"

    if pt == "apt-complex":
        dc = rec["data_completeness"]
        if dc.get("deal_rows", 0) < 30 or dc.get("area_types", 0) < 2 or not dc.get("has_chart"):
            return "B", (f"품질 게이트 미달(거래 {dc.get('deal_rows', 0)}행 · 면적 "
                         f"{dc.get('area_types', 0)}유형 · 분기차트 "
                         f"{'있음' if dc.get('has_chart') else '없음'}) — noindex,follow")
        if uq < MIN_UNIQUE_APT_A:
            return "B", f"템플릿 제외 고유 본문 {uq}자 — 색인 기준 미달, noindex,follow"
        return "A", "품질 게이트 통과 단지 페이지 — 색인 후보"

    if pt == "apt-region":
        if rec["data_completeness"].get("table_rows", 0) < 10:
            return "B", "지역 허브 표본 부족 — noindex,follow"
        return "A", "지역 허브 — 단지 페이지 진입점"

    # 링크 허브(계산기 색인·카테고리·가이드 목록)는 본문 분량이 아니라 '어디로 보내는가'가
    # 존재 이유다. 고유 문장이 얇아도 목적지가 충분하면 색인 가치가 있고, 목적지까지
    # 빈약하면 색인해도 검색 결과에 기여하지 않는다.
    if pt in ("calculator-index", "post-index", "checklist-index", "interior-index",
              "apt-index", "hub", "category"):
        if rec["internal_links"] >= 8:
            return "A", f"링크 허브 — 내부 목적지 {rec['internal_links']}개, 색인 유지"
        return "B", f"링크 허브인데 내부 목적지가 {rec['internal_links']}개뿐 — noindex,follow"

    if uq < 200:
        return "C", f"고유 본문 {uq}자 — 사실상 빈 페이지, 삭제·통합·색인 제외 검토"
    if pt in ("calculator", "checklist"):
        return "A", "도구 페이지 — 핵심 색인 대상"
    if uq < MIN_UNIQUE_A:
        return "B", f"템플릿 제외 고유 본문 {uq}자 — 색인 기준 미달, noindex,follow"
    return "A", "고유 본문 확보 — 색인 대상"


# ───────────────────────────────────────────────────────── main

def collect():
    files = []
    for dirpath, dirnames, filenames in os.walk(SITE):
        dirnames[:] = [d for d in dirnames if d not in ("assets",)]
        for fn in filenames:
            if fn.endswith(".html"):
                files.append(os.path.join(dirpath, fn))
    files.sort()

    smap = sitemap_urls()
    recs = []
    for fp in files:
        with open(fp, encoding="utf-8", errors="replace") as f:
            raw = f.read()
        path = url_path(fp)
        pt = page_type_of(path)
        lang = language_of(path, raw)
        text = visible_text(raw)
        body_chars = len(re.sub(r"\s+", " ", text).strip())
        robots = meta_content(raw, "robots")
        hreflangs = re.findall(r'<link[^>]+hreflang=["\']([^"\']+)["\'][^>]*href=["\']([^"\']+)["\']',
                               raw, re.I)
        rec = {
            "path": path,
            "page_type": pt,
            "language": lang,
            "title": attr(raw, r"<title>(.*?)</title>"),
            "canonical": attr(raw, r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']'),
            "robots": robots or "(none → index)",
            "indexable": "noindex" not in robots.lower(),
            "in_sitemap": path in smap,
            "sitemap_files": ",".join(smap.get(path, [])),
            "hreflang": ";".join(f"{lg}={u}" for lg, u in hreflangs),
            "body_chars": body_chars,
            "_blocks": text_blocks(raw),
        }
        rec.update(detect(raw, text))
        recs.append(rec)

    # ── 템플릿 공제: page_type 안에서 절반 이상 페이지에 등장하는 블록을 뺀다
    by_type = defaultdict(list)
    for r in recs:
        by_type[r["page_type"]].append(r)
    for pt, group in by_type.items():
        n = len(group)
        if n < TEMPLATE_MIN_PAGES:
            for r in group:
                r["unique_chars"] = r["body_chars"]
                r["template_share_pct"] = 0.0
            continue
        cnt = Counter()
        for r in group:
            cnt.update(set(r["_blocks"]))
        common = {b for b, c in cnt.items() if c >= n * TEMPLATE_SHARE}
        for r in group:
            uniq = sum(len(b) for b in set(r["_blocks"]) if b not in common)
            r["unique_chars"] = uniq
            r["template_share_pct"] = round(
                100.0 * (r["body_chars"] - uniq) / r["body_chars"], 1) if r["body_chars"] else 0.0

    # data_completeness·등급은 원문이 필요하다. 템플릿 공제가 끝난 뒤라야 unique_chars 를
    # 등급 판정에 쓸 수 있어 두 번째 패스로 돈다.
    for r in recs:
        fp = os.path.join(SITE, r["path"].lstrip("/"))
        if r["path"].endswith("/"):
            fp = os.path.join(fp, "index.html")
        with open(fp, encoding="utf-8", errors="replace") as f:
            raw = f.read()
        r["data_completeness"] = data_completeness(
            r["page_type"], raw, visible_text(raw), r["unique_chars"])
        g, why = grade(r)
        r["grade"], r["action_reason"] = g, why
        del r["_blocks"]
    return recs


COLUMNS = [
    "path", "page_type", "language", "title", "canonical", "robots", "indexable",
    "in_sitemap", "sitemap_files", "hreflang", "body_chars", "unique_chars",
    "template_share_pct", "external_links", "internal_links", "news_aggregation", "has_author",
    "has_published_date", "has_modified_date", "has_reviewed_date", "has_source",
    "has_as_of", "is_tool", "data_completeness", "has_adsense", "uses_ga4",
    "uses_naver_analytics", "uses_supabase", "has_meta_refresh",
    "grade", "action_reason",
]


def summarize(recs):
    lines = []
    total = len(recs)
    idx = sum(1 for r in recs if r["indexable"])
    lines.append(f"공개 HTML {total:,}개 · 색인 허용 {idx:,}개 · noindex {total - idx:,}개")
    lines.append("")
    lines.append(f"{'page_type':20} {'수':>6} {'색인':>6} {'A':>5} {'B':>5} {'C':>5} {'평균고유자':>10}")
    by = defaultdict(list)
    for r in recs:
        by[r["page_type"]].append(r)
    for pt in sorted(by, key=lambda k: -len(by[k])):
        g = by[pt]
        avg = sum(r["unique_chars"] for r in g) // len(g)
        lines.append(f"{pt:20} {len(g):6,} {sum(1 for r in g if r['indexable']):6,} "
                     f"{sum(1 for r in g if r['grade'] == 'A'):5,} "
                     f"{sum(1 for r in g if r['grade'] == 'B'):5,} "
                     f"{sum(1 for r in g if r['grade'] == 'C'):5,} {avg:10,}")
    lines.append("")
    lines.append("언어별:")
    bl = defaultdict(list)
    for r in recs:
        bl[r["language"]].append(r)
    for lg in sorted(bl):
        g = bl[lg]
        lines.append(f"  {lg:10} 전체 {len(g):5,} · 색인 {sum(1 for r in g if r['indexable']):5,} "
                     f"· A {sum(1 for r in g if r['grade'] == 'A'):5,}")
    lines.append("")
    bad = [r for r in recs if not r["indexable"] and r["in_sitemap"]]
    lines.append(f"noindex 인데 sitemap 에 있는 URL: {len(bad)}개")
    ads_noindex = [r for r in recs if not r["indexable"] and r["has_adsense"]]
    lines.append(f"noindex 인데 AdSense 스크립트가 있는 URL: {len(ads_noindex)}개")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary", action="store_true", help="파일을 쓰지 않고 요약만 출력")
    ap.add_argument("--json-only", action="store_true")
    args = ap.parse_args()

    recs = collect()
    print(summarize(recs))
    if args.summary:
        return 0

    os.makedirs(REPORTS, exist_ok=True)
    with open(os.path.join(REPORTS, "content-inventory.json"), "w", encoding="utf-8") as f:
        json.dump({"generated_from": "site/", "total": len(recs), "urls": recs},
                  f, ensure_ascii=False, indent=1)
    if not args.json_only:
        with open(os.path.join(REPORTS, "content-inventory.csv"), "w",
                  encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
            w.writeheader()
            for r in recs:
                row = dict(r)
                row["data_completeness"] = json.dumps(r["data_completeness"], ensure_ascii=False)
                w.writerow(row)
    print(f"\n[ok] reports/content-inventory.csv · reports/content-inventory.json ({len(recs):,}행)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
