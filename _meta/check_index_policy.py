#!/usr/bin/env python3
"""색인·광고·신뢰 정책 자동 검증 (지시서 11단계). CI 에서 실행한다.

검사 목록 (실패 = exit 1, 경고 = 통과하되 출력)
   1. placeholder 토큰 미존재
   2. privacy 페이지에 GA4·네이버 애널리틱스·AdSense·Supabase 설명 존재
   3. noindex URL 이 sitemap 에 없음
   4. sitemap 의 URL 에 실제 파일이 있음
   5. canonical 이 정상(자기 URL 을 가리킴)
   6. hreflang 대상이 존재하고 상호 연결됨
   7. noindex 페이지에 AdSense 스크립트 없음
   8. 빈 페이지가 색인 허용되지 않음
   9. Article 페이지에 작성자·게시일·수정일 존재
  10. 작성자 URL 이 실제 존재
  11. 깨진 내부 링크 없음
  12. 아파트 색인 품질 게이트 (색인 허용 단지가 기준을 충족)
  13. robots.txt 와 sitemap 정책 일치 (noindex 를 Disallow 로 막지 않음)
  14. 중복 title·description 보고 (경고)
  15. 동일 템플릿 고유 콘텐츠 비율 보고 (경고)

사용법
  python check_index_policy.py            # 전부 검사
  python check_index_policy.py --warn-only  # 실패도 경고로만 (조사용)
"""
import argparse
import collections
import glob
import html
import json
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
BASE = "https://topda.kr"

PLACEHOLDER_RE = re.compile(
    r"NAVER_SITE_VERIFICATION_PLACEHOLDER|GOOGLE_SITE_VERIFICATION_PLACEHOLDER"
    r"|CONTACT_EMAIL_PLACEHOLDER|GA4_MEASUREMENT_ID_PLACEHOLDER|__TODO__")
# 배포 워크플로가 치환하는 값은 저장소에 남아 있는 것이 정상이므로 제외한다.
DEPLOY_INJECTED = ("__KAKAO_JS_KEY__", "__SUPABASE_URL__", "__SUPABASE_ANON_KEY__")

TAG_RE = re.compile(r"<[^>]+>")
SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)

# 자체 본문 없이 링크만 있는 것이 정상인 페이지(빈 페이지 검사 예외).
EMPTY_OK = {"/naverad49c771a0767deb237476d745c1ee22.html"}
MIN_TEXT_CHARS = 350          # 이보다 짧은 본문이 색인 허용이면 실패


def visible(raw):
    s = SCRIPT_STYLE_RE.sub(" ", raw)
    s = re.sub(r"<svg\b.*?</svg>", " ", s, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", s))).strip()


def url_path(fp):
    rel = os.path.relpath(fp, SITE).replace(os.sep, "/")
    if rel == "index.html":
        return "/"
    return "/" + rel


def variants(path):
    """같은 문서를 가리키는 URL 형태들. /a/index.html ↔ /a/ 를 동일하게 본다."""
    out = {path}
    if path.endswith("/index.html"):
        out.add(path[: -len("index.html")])
    elif path == "/index.html":
        out.add("/")
    elif path.endswith("/"):
        out.add(path + "index.html")
    return out


class Report:
    def __init__(self):
        self.fails, self.warns, self.notes = [], [], []

    def fail(self, check, msg):
        self.fails.append((check, msg))

    def warn(self, check, msg):
        self.warns.append((check, msg))

    def note(self, msg):
        self.notes.append(msg)


def load_pages():
    pages = {}
    for dirpath, dirnames, filenames in os.walk(SITE):
        dirnames[:] = [d for d in dirnames if d != "assets"]
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            fp = os.path.join(dirpath, fn)
            with open(fp, encoding="utf-8", errors="replace") as f:
                raw = f.read()
            if not raw.lstrip().startswith("<"):
                continue      # 소유확인용 텍스트 파일
            head = raw.split("</head>", 1)[0]
            pages[url_path(fp)] = {"fp": fp, "raw": raw, "head": head}
    return pages


def sitemap_locs():
    """{경로: [파일명]} — sitemap-all.xml(내부 평면 목록)은 공개 대상이 아니라 제외."""
    out = collections.defaultdict(list)
    for fp in sorted(glob.glob(os.path.join(SITE, "sitemap*.xml"))):
        fn = os.path.basename(fp)
        if fn == "sitemap-all.xml":
            continue
        xml = open(fp, encoding="utf-8").read()
        if "<sitemapindex" in xml:
            continue
        for loc in re.findall(r"<loc>([^<]+)</loc>", xml):
            out[urllib.parse.unquote(loc.replace(BASE, "")) or "/"].append(fn)
    return out


def run(rep):
    pages = load_pages()
    sm = sitemap_locs()
    indexable = {}
    for p, d in pages.items():
        indexable[p] = not re.search(r'name=["\']robots["\'][^>]*noindex', d["head"], re.I)

    # 모든 URL 형태를 하나로 정규화한 색인 여부 표
    idx_by_variant = {}
    for p, ok in indexable.items():
        for v in variants(p):
            idx_by_variant[v] = ok
    exists = set(idx_by_variant)

    # ── 1. placeholder
    for p, d in pages.items():
        if PLACEHOLDER_RE.search(d["raw"]):
            rep.fail("1 placeholder", f"{p} 에 플레이스홀더 토큰이 남아 있습니다")
    for extra in glob.glob(os.path.join(SITE, "**", "*.txt"), recursive=True):
        if PLACEHOLDER_RE.search(open(extra, encoding="utf-8", errors="replace").read()):
            rep.fail("1 placeholder", f"{os.path.relpath(extra, ROOT)} 에 플레이스홀더가 남아 있습니다")
    rep.note(f"배포 시 치환되는 토큰은 검사 대상이 아님: {', '.join(DEPLOY_INJECTED)}")

    # ── 2. privacy 페이지 설명
    for p, needed in (("/privacy.html", ("Google Analytics 4", "네이버 애널리틱스",
                                         "AdSense", "Supabase", "localStorage")),
                      ("/en/privacy.html", ("Google Analytics 4", "Naver Analytics",
                                            "AdSense", "Supabase", "localStorage"))):
        d = pages.get(p)
        if not d:
            rep.fail("2 privacy", f"{p} 가 없습니다")
            continue
        text = visible(d["raw"])
        for kw in needed:
            if kw not in text:
                rep.fail("2 privacy", f"{p} 에 '{kw}' 설명이 없습니다")

    # ── 3. noindex URL 이 sitemap 에 있는지
    for loc, files in sm.items():
        if loc in idx_by_variant and not idx_by_variant[loc]:
            rep.fail("3 noindex/sitemap", f"noindex 인 {loc} 가 {','.join(files)} 에 있습니다")

    # ── 4. sitemap URL 의 실제 파일 존재
    for loc, files in sm.items():
        if loc not in exists:
            rep.fail("4 sitemap/파일", f"{loc} (in {','.join(files)}) 에 해당하는 파일이 없습니다")

    # ── 5. canonical
    for p, d in pages.items():
        m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']',
                      d["head"], re.I)
        if not m:
            (rep.fail if indexable[p] else rep.warn)(
                "5 canonical", f"{p} 에 canonical 이 없습니다")
            continue
        canon = urllib.parse.unquote(m.group(1).replace(BASE, "")) or "/"
        if not canon.startswith("/"):
            rep.fail("5 canonical", f"{p} 의 canonical 이 절대 URL 이 아닙니다: {m.group(1)}")
            continue
        if canon in variants(p):
            continue
        # 다른 URL 을 가리키는 canonical(중복 통합)은 그 URL 이 존재하고 색인 허용이어야 하며,
        # 이 페이지가 sitemap 에 실려 있으면 안 된다.
        if canon not in exists:
            rep.fail("5 canonical", f"{p} 의 canonical 목적지가 없습니다: {canon}")
        elif any(v in sm for v in variants(p)):
            rep.fail("5 canonical", f"{p} 는 canonical 이 {canon} 인데 sitemap 에 자기 URL 이 있습니다")

    # ── 6. hreflang
    declared = {}
    for p, d in pages.items():
        pairs = re.findall(
            r'<link[^>]+rel=["\']alternate["\'][^>]*hreflang=["\']([^"\']+)["\'][^>]*'
            r'href=["\']([^"\']+)["\']', d["head"], re.I)
        if not pairs:
            continue
        declared[p] = {}
        for lg, href in pairs:
            tgt = urllib.parse.unquote(href.replace(BASE, "")) or "/"
            declared[p][lg] = tgt
            if tgt not in exists:
                rep.fail("6 hreflang", f"{p} 의 hreflang {lg} 목적지가 없습니다: {tgt}")
            elif not idx_by_variant.get(tgt, True):
                rep.fail("6 hreflang", f"{p} 의 hreflang {lg} 목적지가 noindex 입니다: {tgt}")
        if not indexable[p]:
            rep.fail("6 hreflang", f"{p} 는 noindex 인데 hreflang 을 선언하고 있습니다")
    for p, langs in declared.items():
        for lg, tgt in langs.items():
            if lg == "x-default":
                continue
            back = None
            for v in variants(tgt):
                if v in declared:
                    back = declared[v]
                    break
            if back is None:
                rep.fail("6 hreflang", f"{p} → {tgt} 이 hreflang 을 선언하지 않습니다(상호 연결 아님)")
                continue
            if not any(v in variants(p) for v in back.values()):
                rep.fail("6 hreflang", f"{p} → {tgt} 이 되돌아오는 hreflang 이 없습니다")

    # ── 7. noindex 페이지의 AdSense
    for p, d in pages.items():
        if not indexable[p] and "pagead2.googlesyndication.com" in d["raw"]:
            rep.fail("7 광고 범위", f"noindex 인 {p} 에 AdSense 스크립트가 있습니다")
    # 정책·문의 페이지에도 광고를 넣지 않는다.
    for p in ("/privacy.html", "/en/privacy.html", "/contact.html", "/editorial-policy.html",
              "/corrections.html", "/data-methodology.html", "/authors/jaeho-jung.html"):
        d = pages.get(p)
        if d and "pagead2.googlesyndication.com" in d["raw"]:
            rep.fail("7 광고 범위", f"{p} 에 AdSense 스크립트가 있습니다(정책 페이지에는 넣지 않음)")

    # ── 8. 빈 페이지가 색인 허용인지
    for p, d in pages.items():
        if not indexable[p] or p in EMPTY_OK:
            continue
        n = len(visible(d["raw"]))
        if n < MIN_TEXT_CHARS:
            rep.fail("8 빈 페이지", f"{p} 본문이 {n}자뿐인데 색인 허용입니다")

    # ── 9·10. Article 페이지의 작성자·날짜, 작성자 URL 존재
    author_urls = set()
    article_paths = [p for p in pages
                     if re.match(r"^/(posts|interior|checklists|loan)/", p)
                     and not p.endswith("/index.html")]
    for p in article_paths:
        d = pages[p]
        found = None
        for m in re.finditer(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>',
                             d["raw"], re.S):
            try:
                obj = json.loads(m.group(1))
            except json.JSONDecodeError:
                rep.fail("9 Article", f"{p} 의 JSON-LD 파싱 실패")
                continue
            if obj.get("@type") == "Article":
                found = obj
        if not found:
            rep.fail("9 Article", f"{p} 에 Article JSON-LD 가 없습니다")
            continue
        for key in ("datePublished", "dateModified", "author", "publisher", "mainEntityOfPage"):
            if not found.get(key):
                rep.fail("9 Article", f"{p} 의 Article JSON-LD 에 {key} 가 없습니다")
        au = found.get("author") or {}
        if isinstance(au, dict) and au.get("url"):
            author_urls.add(au["url"])
        elif isinstance(au, dict) and au.get("@id"):
            rep.fail("9 Article", f"{p} 의 author 가 @id 참조뿐입니다 — 다른 페이지의 @id 는 해석되지 않습니다")
        if found.get("reviewedBy"):
            rep.fail("9 Article", f"{p} 에 reviewedBy 가 있습니다 — 외부 감수 절차가 없으므로 넣지 않습니다")
        # 화면 표시
        text = visible(d["raw"])
        if "작성" not in text:
            rep.fail("9 Article", f"{p} 화면에 작성자 표시가 없습니다")
        if not re.search(r"게시\s*\d{4}-\d{2}-\d{2}", text):
            rep.fail("9 Article", f"{p} 화면에 게시일(YYYY-MM-DD)이 없습니다")
        if not re.search(r"(최근 수정|최근 검토)\s*\d{4}-\d{2}-\d{2}", text):
            rep.fail("9 Article", f"{p} 화면에 최근 수정일이 없습니다")
        if re.search(r"최근 갱신\s*(?![\d])", text):
            rep.fail("9 Article", f"{p} 에 날짜 없는 '최근 갱신' 표기가 남아 있습니다")
    for u in sorted(author_urls):
        tgt = urllib.parse.unquote(u.replace(BASE, ""))
        if tgt not in exists:
            rep.fail("10 작성자 URL", f"작성자 URL 목적지가 없습니다: {u}")

    # ── 11. 깨진 내부 링크
    broken = collections.Counter()
    for p, d in pages.items():
        body = d["raw"]
        for m in re.finditer(r'href=["\']([^"\']+)["\']', body, re.I):
            href = m.group(1).split("#")[0].split("?")[0]
            if not href or href.startswith(("http://", "https://", "mailto:", "tel:", "javascript:")):
                continue
            tgt = urllib.parse.urljoin(p, urllib.parse.unquote(href))
            if tgt in exists:
                continue
            fp = os.path.join(SITE, tgt.lstrip("/"))
            if os.path.exists(fp) or os.path.exists(os.path.join(fp, "index.html")):
                continue
            broken[(p, tgt)] += 1
    for (p, tgt), _ in sorted(broken.items()):
        rep.fail("11 내부 링크", f"{p} → {tgt} (대상 없음)")

    # ── 12. 아파트 색인 품질 게이트
    apt_index = [p for p in pages
                 if re.match(r"^/apt/[^/]+/[^/]+/index\.html$", p) and indexable[p]]
    apt_all = [p for p in pages if re.match(r"^/apt/[^/]+/[^/]+/index\.html$", p)]
    if apt_all:
        cap = int(os.environ.get("APT_INDEX_MAX_PAGES", "100") or 0)
        min_deals = int(os.environ.get("APT_INDEX_MIN_DEALS", "30"))
        min_areas = int(os.environ.get("APT_INDEX_MIN_AREA_TYPES", "2"))
        if cap and len(apt_index) > cap:
            rep.fail("12 apt 게이트",
                     f"색인 허용 단지 페이지 {len(apt_index)}개 > 상한 {cap}개")
        for p in apt_index:
            raw = pages[p]["raw"]
            deals = len(re.findall(r"<tr[^>]*><td>\d{4}-\d{2}-\d{2}", raw))
            areas = len(re.findall(r"<h3>전용 [\d.]+㎡", raw))
            if deals < min_deals:
                rep.fail("12 apt 게이트", f"{p}: 색인 허용인데 거래 {deals}건 < {min_deals}건")
            if areas < min_areas:
                rep.fail("12 apt 게이트", f"{p}: 색인 허용인데 면적 {areas}유형 < {min_areas}유형")
            if "추이 차트를 표시하지 않습니다" in raw:
                rep.fail("12 apt 게이트", f"{p}: 색인 허용인데 분기 추이 차트가 없습니다")
            if "데이터 기준일" not in visible(raw):
                rep.fail("12 apt 게이트", f"{p}: 데이터 기준일 표시가 없습니다")
        rep.note(f"단지 페이지 {len(apt_all):,}개 중 색인 허용 {len(apt_index):,}개")
    else:
        rep.note("단지 페이지가 생성되지 않은 상태 — apt 게이트 검사 생략 "
                 "(build_complex_pages.py --all 실행 후 검사됨)")

    # ── 13. robots.txt
    rp = os.path.join(SITE, "robots.txt")
    if not os.path.exists(rp):
        rep.fail("13 robots.txt", "site/robots.txt 가 없습니다")
    else:
        robots = open(rp, encoding="utf-8").read()
        disallows = [l.split(":", 1)[1].strip()
                     for l in robots.splitlines() if l.lower().startswith("disallow:")]
        disallows = [d for d in disallows if d]
        for p, ok in indexable.items():
            if ok:
                continue
            for d in disallows:
                if p.startswith(d) and not p.startswith("/admin/"):
                    rep.fail("13 robots.txt",
                             f"noindex 인 {p} 가 Disallow {d} 로 막혀 있습니다 — "
                             f"크롤을 막으면 noindex 태그를 읽지 못합니다")
        if f"Sitemap: {BASE}/sitemap.xml" not in robots:
            rep.fail("13 robots.txt", "robots.txt 가 sitemap.xml 을 가리키지 않습니다")
        for d in disallows:
            hit = [p for p in pages if p.startswith(d)]
            if hit and all(indexable[p] for p in hit):
                rep.warn("13 robots.txt", f"Disallow {d} 아래 페이지가 모두 색인 허용 상태입니다")

    # ── 14. 중복 title / description (경고)
    titles, descs = collections.defaultdict(list), collections.defaultdict(list)
    for p, d in pages.items():
        if not indexable[p]:
            continue
        t = re.search(r"<title>(.*?)</title>", d["head"], re.S)
        if t:
            titles[html.unescape(t.group(1)).strip()].append(p)
        m = re.search(r'<meta name="description" content="([^"]*)"', d["head"])
        if m:
            descs[html.unescape(m.group(1)).strip()].append(p)
    for label, table in (("title", titles), ("description", descs)):
        dup = {k: v for k, v in table.items() if len(v) > 1}
        if dup:
            rep.warn(f"14 중복 {label}", f"{len(dup)}종이 중복 (색인 허용 페이지 기준)")
            for k, v in sorted(dup.items(), key=lambda x: -len(x[1]))[:5]:
                rep.warn(f"14 중복 {label}", f"  '{k[:50]}' × {len(v)} — {', '.join(v[:3])}")

    # ── 15. 템플릿 대비 고유 콘텐츠 비율 (경고)
    groups = collections.defaultdict(list)
    for p, d in pages.items():
        if not indexable[p]:
            continue
        if re.match(r"^/apt/[^/]+/[^/]+/", p):
            groups["apt-complex"].append((p, d))
        elif p.startswith("/posts/"):
            groups["post"].append((p, d))
        elif p.startswith("/calculators/"):
            groups["calculator"].append((p, d))
    for g, items in groups.items():
        if len(items) < 4:
            continue
        blocks = []
        for _, d in items:
            s = SCRIPT_STYLE_RE.sub(" ", d["raw"])
            s = re.sub(r"</(td|th)>", " | ", s, flags=re.I)
            s = re.sub(r"</(p|div|li|h[1-6]|tr|section|article)>", "\n", s, flags=re.I)
            lines = {re.sub(r"\s+", " ", html.unescape(TAG_RE.sub(" ", l))).strip()
                     for l in s.split("\n")}
            blocks.append({l for l in lines if len(l) >= 12})
        cnt = collections.Counter()
        for b in blocks:
            cnt.update(b)
        common = {k for k, c in cnt.items() if c >= len(items) * 0.5}
        ratios = []
        for (p, _), b in zip(items, blocks):
            total = sum(len(x) for x in b) or 1
            uniq = sum(len(x) for x in b if x not in common)
            ratios.append((uniq * 100 // total, uniq, p))
        ratios.sort()
        avg = sum(r[0] for r in ratios) // len(ratios)
        rep.warn("15 고유 콘텐츠 비율",
                 f"{g}: 색인 허용 {len(items)}개 · 평균 고유 비율 {avg}% · "
                 f"최저 {ratios[0][0]}% ({ratios[0][2]}, 고유 {ratios[0][1]}자)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--warn-only", action="store_true", help="실패를 경고로만 처리(조사용)")
    args = ap.parse_args()

    rep = Report()
    run(rep)

    if rep.notes:
        print("참고")
        for n in rep.notes:
            print(f"  · {n}")
        print()
    if rep.warns:
        print(f"경고 {len(rep.warns)}건")
        by = collections.defaultdict(list)
        for c, m in rep.warns:
            by[c].append(m)
        for c, msgs in by.items():
            print(f"  [{c}]")
            for m in msgs[:12]:
                print(f"    · {m}")
            if len(msgs) > 12:
                print(f"    … 외 {len(msgs) - 12}건")
        print()
    if rep.fails:
        print(f"실패 {len(rep.fails)}건")
        by = collections.defaultdict(list)
        for c, m in rep.fails:
            by[c].append(m)
        for c, msgs in sorted(by.items()):
            print(f"  [{c}] {len(msgs)}건")
            for m in msgs[:15]:
                print(f"    · {m}")
            if len(msgs) > 15:
                print(f"    … 외 {len(msgs) - 15}건")
        if not args.warn_only:
            return 1
        print("\n(--warn-only 이므로 통과 처리)")
        return 0
    print("모든 검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
