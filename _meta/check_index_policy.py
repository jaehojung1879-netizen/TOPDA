#!/usr/bin/env python3
"""색인·광고·신뢰 정책 자동 검증 (지시서 11단계). CI 에서 실행한다.

검사 목록 (실패 = exit 1, 경고 = 통과하되 출력)
   1. placeholder 토큰 미존재
   2. privacy 페이지에 분석 도구·광고·쿠키·브라우저 저장 설명 존재
   3. noindex URL 이 sitemap 에 없음
   4. sitemap 의 URL 에 실제 파일이 있음
   5. canonical 이 정상(자기 URL 을 가리킴)
   6. hreflang 대상이 존재하고 상호 연결됨
   7. noindex 페이지에 AdSense 스크립트 없음
   8. 빈 페이지가 색인 허용되지 않음
   9. Article 페이지에 작성자·게시일·수정일 존재
  10. 작성자 URL 이 실제 존재
  11. 깨진 내부 링크 없음
  12. 단지별 대량 정적 URL 미생성 + 레거시 지역 별칭 noindex
  13. robots.txt 와 sitemap 정책 일치 (noindex 를 Disallow 로 막지 않음)
  14. 중복 title·description (canonical 로 통합된 묶음은 제외)
  15. 동일 템플릿 안에서 그 페이지에만 있는 본문이 충분한가

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
# 같은 템플릿을 쓰는 묶음 안에서, 그 페이지에만 있는 본문의 최소 길이(검사 15).
# MIN_TEXT_CHARS 는 '본문이 있는가'를 보고, 이 값은 '남과 다른 내용이 있는가'를 본다.
# 자동 생성 페이지가 늘어날 때 실제로 필요한 것은 후자다.
MIN_UNIQUE_CHARS = 400


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
    for p, needed in (("/privacy.html", ("Google Analytics", "네이버 애널리틱스",
                                         "AdSense", "쿠키", "localStorage")),
                      ("/en/privacy.html", ("Google Analytics", "Naver Analytics",
                                            "AdSense", "cookies", "localStorage"))):
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
    for p in ("/privacy.html", "/en/privacy.html", "/about.html", "/en/about.html"):
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
        # '내용 검토'(사람이 본문을 확인한 날)와 '파일 최종 수정'(git 커밋 날짜)을 구별해
        # 표기한다 — _meta/add_bylines.py 참고. 둘 중 하나는 반드시 화면에 있어야 한다.
        if not re.search(r"(내용 검토|파일 최종 수정|최근 수정|최근 검토)\s*\d{4}-\d{2}-\d{2}", text):
            rep.fail("9 Article", f"{p} 화면에 내용 검토일 또는 파일 최종 수정일이 없습니다")
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

    # ── 12. 아파트 URL 구조
    # 단지별 정적 HTML은 공개 URL 수를 4,500개 이상 부풀렸지만 각 문서의 독립 본문은
    # 작았다. 상세 조회는 통합 검색으로 옮겼으므로 다시 생성되면 CI에서 즉시 막는다.
    apt_all = [p for p in pages if re.match(r"^/apt/[^/]+/[^/]+/index\.html$", p)]
    if apt_all:
        rep.fail("12 apt URL", f"단지별 정적 HTML {len(apt_all):,}개가 다시 생성됐습니다")
    else:
        rep.note("단지별 정적 HTML 0개 — 상세 조회는 통합 검색 사용")

    aliases = [p for p in pages if re.match(r"^/apt/[^/]+/index\.html$", p)]
    for p in aliases:
        raw = pages[p]["raw"]
        if indexable[p]:
            rep.fail("12 apt URL", f"{p}: 레거시 지역 별칭이 indexable 상태입니다")
        if "http-equiv=\"refresh\"" not in raw.lower():
            rep.fail("12 apt URL", f"{p}: 레거시 지역 별칭에 이동 태그가 없습니다")
    rep.note(f"레거시 지역 별칭 {len(aliases):,}개 noindex 리다이렉트 확인")

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

    # ── 14. 중복 title / description
    #
    # 예전에는 보고만 했다. 그런데 '같은 템플릿에 숫자만 바꾼 페이지가 전부 색인 대상'인
    # 상태가 2026-07 AdSense 지적의 직접 원인이었다. 자동 생성이 계속 늘어나는 구조에서
    # 경고는 아무도 읽지 않으므로 실패로 올린다.
    #
    # 다만 **canonical 로 이미 한 페이지임을 선언한 묶음은 중복이 아니다.** 한글 슬러그
    # 지역 페이지가 여기 해당한다 — /apt/서울-중구.html 과 /apt/seoul-junggu/ 는 둘 다
    # canonical 이 후자를 가리키므로 검색엔진에는 한 페이지다. 이것을 목록(allowlist)이
    # 아니라 규칙으로 두는 이유는, 새 별칭이 생겨도 등록을 잊어 통과/실패가 뒤집히지
    # 않게 하기 위해서다.
    def canon_target(page, d):
        m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']',
                      d["head"], re.I)
        if not m:
            return page
        return urllib.parse.unquote(m.group(1).replace(BASE, "")) or "/"

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
        real, merged = {}, 0
        for k, v in table.items():
            if len(v) < 2:
                continue
            if len({canon_target(p, pages[p]) for p in v}) == 1:
                merged += 1          # canonical 로 통합된 별칭 묶음 — 중복이 아니다
            else:
                real[k] = v
        if merged:
            rep.note(f"14 중복 {label}: canonical 로 통합된 묶음 {merged}종은 중복으로 보지 않음")
        if real:
            rep.fail(f"14 중복 {label}",
                     f"{len(real)}종이 서로 다른 URL 로 색인 허용된 채 {label} 이 같습니다")
            for k, v in sorted(real.items(), key=lambda x: -len(x[1]))[:5]:
                rep.fail(f"14 중복 {label}", f"  '{k[:50]}' × {len(v)} — {', '.join(v[:3])}")

    # ── 15. 템플릿 대비 고유 콘텐츠 비율 (경고)
    # 템플릿을 공유하는 묶음 단위로 본다. 예전에는 posts·calculators·apt-complex 세 묶음만
    # 봤는데, 그러면 checklists·interior·categories 와 언어판이 통째로 사각지대가 된다.
    # (실제로 /calculators/transactions.html 처럼 표를 JS 로 그리는 페이지가 색인·광고 상태로
    #  고유 본문 322자였던 것을 이 검사를 켜고 나서야 발견했다.) 묶음을 넓게 잡는다.
    FAMILIES = ("posts", "calculators", "checklists", "interior", "loan", "categories")
    groups = collections.defaultdict(list)
    for p, d in pages.items():
        if not indexable[p]:
            continue
        if re.match(r"^/apt/[^/]+/[^/]+/", p):
            groups["apt-complex"].append((p, d))
            continue
        for fam in FAMILIES:
            if p.startswith(f"/{fam}/"):
                groups[fam].append((p, d))
                break
            # 언어판은 본문 언어가 달라 한국어 묶음과 섞으면 '공통 블록' 판정이 어긋난다.
            m = re.match(rf"^/([A-Za-z-]+)/{fam}/", p)
            if m:
                groups[f"{m.group(1)}-{fam}"].append((p, d))
                break
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
        rep.note(f"15 고유 콘텐츠 {g}: 색인 허용 {len(items)}개 · 평균 비율 {avg}% · "
                 f"최저 {ratios[0][0]}% ({ratios[0][2]}, 고유 {ratios[0][1]}자)")
        # 같은 템플릿 안에서 '자기만의 내용'이 이만큼도 없는 페이지는 색인 허용하지 않는다.
        # 비율이 아니라 글자 수로 재는 이유: 템플릿이 두꺼운 묶음(계산기)은 본문이 충분해도
        # 비율이 낮게 나온다. 실제로 막고 싶은 것은 '틀만 있고 내용이 없는 페이지'다.
        # 현재 최저치는 계산기 507자 · 글 789자 · 단지 1,891자 — 아래 값은 그보다 낮게 두어
        # 기존 페이지를 통과시키되 새로 생기는 빈 껍데기는 걸리게 한다. 기준을 올릴 때는
        # 그 시점의 최저치를 확인하고 함께 올린다.
        for pct, uniq, path in ratios:
            if uniq < MIN_UNIQUE_CHARS:
                rep.fail("15 고유 콘텐츠",
                         f"{path} 는 색인 허용인데 템플릿 제외 고유 본문이 {uniq}자입니다 "
                         f"(최소 {MIN_UNIQUE_CHARS}자, {g} 묶음 기준 {pct}%)")


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
