#!/usr/bin/env python3
"""색인 정책을 site/ 의 HTML 에 실제로 반영한다 (지시서 3·9·10단계).

이 스크립트 하나가 다음 네 가지를 함께 처리한다. 따로 두면 서로 어긋나기 때문이다.
(예: noindex 로 바꾼 페이지를 hreflang 대상으로 남겨 두면 검색엔진에 모순된 신호를 준다.)

  1) robots 메타      — 색인이 필요 없는 페이지에 noindex,follow
  2) AdSense 스크립트 — 정책·문의·게시판·내부검색·noindex·오류 페이지에서 제거
  3) canonical        — 없으면 자기 URL 로 추가
  4) hreflang         — ko·en 만 남기고, **색인 허용된 실제 파일**끼리만 상호 연결

원칙
  · noindex 로 바꿔도 페이지는 그대로 접근·동작한다. robots.txt 로 크롤을 막지 않는다
    (막으면 검색엔진이 noindex 태그 자체를 읽지 못한다).
  · 언어 선택 UX 는 건드리지 않는다. zh-Hans·zh-Hant·vi·th 페이지는 남아 있고 링크도 살아 있다.
    검색 색인과 hreflang 에서만 뺀다.
  · 되돌릴 수 있어야 한다. 여러 번 실행해도 결과가 같다(idempotent).

사용법
  python apply_index_policy.py            # 적용
  python apply_index_policy.py --dry-run  # 무엇이 바뀌는지만 출력
"""
import argparse
import fnmatch
import os
import re
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
BASE = "https://topda.kr"

# 색인 언어(1차). 나머지 언어는 사용자 여정이 완성될 때까지 noindex,follow.
INDEX_LANGS = {"ko", "en"}
DEINDEX_LANG_DIRS = ("zh-Hans", "zh-Hant", "vi", "th")

# ── 언어와 무관하게 noindex 로 두는 경로 (glob, URL 경로 기준)
NOINDEX_GLOBS = (
    "/board.html", "/board-write.html", "/board-post.html",   # 사용자 생성 콘텐츠 화면
    "/feedback.html", "/*/feedback.html",                      # 수정 요청(게시판으로 통합됨)
    "/find.html",                                              # 내부 통합 검색 결과
    "/calculators/search.html", "/*/calculators/search.html",  # 내부 단지 검색 결과
    "/admin/*",                                                # 운영자 전용
    "/404.html", "/*/404.html",                                # 오류 페이지
    "/naverad*.html",                                          # 검색엔진 소유확인 파일
    # 자체 본문이 없는 JS 렌더링 링크 셸 — 탐색용으로 유지하되 색인에서 뺀다.
    "/market.html", "/*/market.html",
)

# ── 이 스크립트가 건드리지 않는 경로.
#    단지 페이지(/apt/{지역}/{단지}/)의 robots 메타는 build_complex_pages.py 의 색인 품질
#    게이트가 결정한다. 여기서 함께 관리하면 두 생성기가 서로의 태그를 지운다 —
#    실제로 이 스크립트가 게이트가 붙인 noindex 4,716개를 지운 적이 있다(robots 메타를
#    일단 제거하고 자기 판단으로만 다시 넣기 때문). 소유권을 한쪽에만 둔다.
NOT_OURS_GLOBS = ("/apt/*/*/", "/apt/*/*/index.html")

# ── AdSense 를 넣지 않는 경로 (noindex 페이지는 자동 포함)
NO_ADS_GLOBS = (
    "/privacy.html", "/*/privacy.html",
    "/about.html", "/*/about.html",
)

ADS_SCRIPT_RE = re.compile(
    r"[ \t]*<script[^>]*pagead2\.googlesyndication\.com[^>]*>\s*</script>\s*\n?", re.I)
ROBOTS_META_RE = re.compile(r'[ \t]*<meta[^>]+name=["\']robots["\'][^>]*>\s*\n?', re.I)
HREFLANG_BLOCK_RE = re.compile(
    r'(?:[ \t]*<link[^>]+rel=["\']alternate["\'][^>]*hreflang=["\'][^"\']*["\'][^>]*>\s*\n?)+', re.I)
# ⚠ 속성 순서를 가정하면 안 된다. 저장소에는 rel 이 먼저인 태그와 href 가 먼저인 태그가
#   섞여 있어서, 한쪽만 잡는 정규식을 쓰면 "canonical 이 없다"고 판단해 중복으로 하나 더 넣는다.
CANONICAL_TAG_RE = re.compile(r'[ \t]*<link\b[^>]*\brel=["\']canonical["\'][^>]*>[ \t]*\n?', re.I)
CANONICAL_HREF_RE = re.compile(r'\bhref=["\']([^"\']+)["\']', re.I)
HANGUL_RE = re.compile(r"[가-힣]")
SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")

# EN 페이지 중 본문에 한국어가 섞여도 되는 예외 — 한국어 용어를 병기하는 용어집·외국인 안내.
EN_HANGUL_ALLOW = ("/en/glossary.html", "/en/foreigner-loan.html", "/en/foreigner-tax.html")

# EN 페이지의 한국어 대응 페이지 — 슬러그가 다른 경우만 적는다.
# (슬러그가 같으면 /en/X ↔ /X 로 자동 매칭한다.)
EN_KO_ALIAS = {
    "/en/": "/",
    "/en/sale.html": "/categories/sale.html",
    "/en/moving.html": "/categories/moving.html",
    "/en/auction.html": "/categories/auction.html",
    "/en/jeonse.html": "/categories/lease.html",
}

# 한국어 페이지로 가는 링크임을 화면에 밝힌 표시. 이 표시가 붙은 링크는
# "갑자기 한국어로 이동"에 해당하지 않으므로 EN 게이트에서 문제로 보지 않는다.
KO_LINK_MARK = "(KO)"


def url_path(fp):
    rel = os.path.relpath(fp, SITE).replace(os.sep, "/")
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def file_for(path):
    fp = os.path.join(SITE, path.lstrip("/"))
    return os.path.join(fp, "index.html") if path.endswith("/") else fp


def lang_of(path):
    for lg in DEINDEX_LANG_DIRS + ("en",):
        if path.startswith("/" + lg + "/"):
            return lg
    return "ko"


def matches(path, globs):
    return any(fnmatch.fnmatch(path, g) for g in globs)


def visible_text(raw):
    s = SCRIPT_STYLE_RE.sub(" ", raw)
    return TAG_RE.sub(" ", s)


# ────────────────────────────────────────────── EN 색인 게이트

LINK_RE = re.compile(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.S | re.I)


def resolve(page_path, href):
    """페이지 경로 기준으로 상대 href 를 절대 URL 경로로 바꾼다.

    ⚠ 문자열 접두사(`../`)로 판단하면 안 된다. /en/posts/x.html 에서 ../calculators/y.html 는
    /en/calculators/y.html 이지만, /en/x.html 에서 같은 href 는 /calculators/y.html 다.
    깊이에 따라 언어가 달라지므로 반드시 실제로 해석해야 한다.
    """
    href = href.split("#")[0].split("?")[0]
    if not href or href.startswith(("http://", "https://", "mailto:", "javascript:", "tel:")):
        return None
    return urllib.parse.urljoin(page_path, href)


def en_cross_lang_links(path, raw):
    """EN 페이지 본문에서 한국어 페이지로 가는데 표시가 없는 링크 목록."""
    body = raw
    m = re.search(r"<main\b.*?</main>", raw, re.S | re.I)
    if m:
        body = m.group(0)
    out = []
    for mm in LINK_RE.finditer(body):
        target = resolve(path, mm.group(1))
        if not target or target.startswith("/en/"):
            continue
        label = TAG_RE.sub("", mm.group(2))
        if KO_LINK_MARK in label:
            continue      # 한국어 페이지임을 화면에 밝힌 링크
        out.append(target)
    return sorted(set(out))


def en_gate(path, raw, ko_partner, en_support_ready):
    """EN 페이지가 색인 허용 조건을 모두 충족하는가 → (통과, 사유)."""
    if not en_support_ready:
        return False, "영어판 개인정보 처리방침·안내 페이지가 없음"
    if not ko_partner:
        return False, "대응하는 한국어 페이지가 없음(EN 전용 콘텐츠) — 한국어판을 만들면 색인 대상"
    hangul = len(HANGUL_RE.findall(visible_text(raw)))
    if hangul > 40 and path not in EN_HANGUL_ALLOW:
        return False, f"본문에 한국어가 {hangul}자 섞여 있음(영어 전체 번역 미완)"
    bad = en_cross_lang_links(path, raw)
    if bad:
        return False, ("본문 링크가 표시 없이 한국어 페이지로 이동함: "
                       + ", ".join(bad[:3])
                       + (f" 외 {len(bad) - 3}개" if len(bad) > 3 else ""))
    return True, ""


# ────────────────────────────────────────────── 정책 결정

def normalize_en_links(raws):
    """EN 페이지의 내부 링크를 영어판으로 돌린다. 영어판이 없으면 (KO) 표시를 붙인다.

    왜 필요한가: /en/posts/*.html 의 '관련 계산기' 링크가 한국어 계산기로 가 있었다.
    영어 독자가 영어 글에서 링크를 눌렀는데 한국어 화면이 나오는 것은 번역이 끝나지 않은
    사이트로 읽힌다(지시서 9단계). 영어판이 있으면 그쪽으로 돌리고, 없으면 최소한
    한국어 페이지임을 라벨에 밝힌다.
    """
    fixed_links, marked_links, touched = 0, 0, 0
    for path in [p for p in raws if p.startswith("/en/")]:
        raw = raws[path]
        m = re.search(r"<main\b.*?</main>", raw, re.S | re.I)
        if not m:
            continue
        body = m.group(0)
        new_body = body

        def repl(mm):
            nonlocal fixed_links, marked_links
            whole, href, label = mm.group(0), mm.group(1), mm.group(2)
            target = resolve(path, href)
            if not target or target.startswith("/en/"):
                return whole
            en_target = "/en" + target
            if en_target in raws or (en_target.endswith("/") and en_target in raws):
                # 상대 링크 형태를 유지하려면 페이지 깊이를 알아야 한다. 절대 경로가 안전하다.
                fixed_links += 1
                return whole.replace(href, en_target, 1)
            if KO_LINK_MARK in TAG_RE.sub("", label):
                return whole
            marked_links += 1
            return whole.replace(label, label.rstrip() + f' <small>{KO_LINK_MARK}</small>', 1)

        new_body = LINK_RE.sub(repl, body)
        if new_body != body:
            raws[path] = raw.replace(body, new_body, 1)
            touched += 1
    return fixed_links, marked_links, touched


def normalize_en_nav(raws):
    """EN 페이지의 헤더·모바일 메뉴에서 한국어 목적지에 (KO) 표시를 붙인다."""
    n = 0
    for path in [p for p in raws if p.startswith("/en/")]:
        raw = raws[path]
        head_m = re.search(r"<header\b.*?</header>", raw, re.S | re.I)
        if not head_m:
            continue
        block = head_m.group(0)

        def repl(mm):
            nonlocal n
            whole, href, label = mm.group(0), mm.group(1), mm.group(2)
            target = resolve(path, href)
            if not target or target.startswith("/en/") or "brand" in whole:
                return whole
            plain = TAG_RE.sub("", label)
            # 언어 전환 링크("Korean")는 이미 한국어로 간다고 밝히고 있다.
            if KO_LINK_MARK in plain or "Korean" in plain:
                return whole
            n += 1
            return whole.replace(label, label.rstrip() + f" {KO_LINK_MARK}", 1)

        new_block = LINK_RE.sub(repl, block)
        if new_block != block:
            raws[path] = raw.replace(block, new_block, 1)
    return n


def decide(files):
    """{path: {'noindex': bool, 'reason': str, 'ads': bool, 'hreflang': dict|None}}"""
    raws = {}
    for fp in files:
        with open(fp, encoding="utf-8", errors="replace") as f:
            raw = f.read()
        # 검색엔진 소유확인 파일은 .html 확장자를 쓰지만 내용이 한 줄 텍스트다.
        # 여기에 메타 태그를 끼워 넣으면 소유확인이 깨지므로 건드리지 않는다.
        if not raw.lstrip().startswith("<"):
            continue
        path = url_path(fp)
        if matches(path, NOT_OURS_GLOBS):
            continue
        raws[path] = raw
    # ⚠ EN 링크 정규화가 raws 를 직접 바꾸므로, '파일을 다시 써야 하는가'의 비교 기준은
    #   원본 사본이어야 한다. 정규화 결과와 비교하면 링크만 바뀐 파일이 기록되지 않는다.
    original = dict(raws)

    fixed, marked, touched = normalize_en_links(raws)
    nav_marked = normalize_en_nav(raws)
    print(f"[en] 본문 링크 영어판으로 교정 {fixed}개 · (KO) 표시 {marked}개 · 내비 표시 {nav_marked}개"
          f" · 수정된 EN 파일 {touched}개")

    # ko↔en 짝 찾기: ① 기존 hreflang 선언 ② 별칭 표 ③ 같은 슬러그(/en/X ↔ /X)
    partner = {}     # path -> {lang: path}

    def link(a, b):
        partner.setdefault(a, {})[lang_of(b)] = b
        partner.setdefault(b, {})[lang_of(a)] = a

    for path, raw in raws.items():
        for lg, href in re.findall(
                r'<link[^>]+hreflang=["\']([^"\']+)["\'][^>]*href=["\']([^"\']+)["\']', raw, re.I):
            if lg not in INDEX_LANGS or lg == "x-default":
                continue
            tgt = urllib.parse.unquote(href.replace(BASE, "")) or "/"
            if tgt.endswith("/index.html"):
                tgt = tgt[: -len("index.html")]
            if tgt in raws and tgt != path:
                link(path, tgt)
    for en, ko in EN_KO_ALIAS.items():
        if en in raws and ko in raws:
            link(en, ko)
    for path in raws:
        if not path.startswith("/en/") and path != "/en/":
            continue
        ko = "/" + path[len("/en/"):]
        if ko in raws:
            link(path, ko)

    # 지시서 9단계: 영어판 개인정보 처리방침·안내 페이지가 있어야 EN 색인을 허용한다.
    en_support_ready = "/en/privacy.html" in raws and "/en/about.html" in raws

    policy = {}
    for path, raw in raws.items():
        lang = lang_of(path)
        noindex, reason = False, ""
        if matches(path, NOINDEX_GLOBS):
            noindex, reason = True, "검색 색인이 필요 없는 화면(게시판·내부검색·오류·운영자·소유확인)"
        elif lang in DEINDEX_LANG_DIRS:
            noindex, reason = True, f"{lang} 사용자 여정 미완성 — 접근은 유지, 색인만 보류"
        elif lang == "en":
            ko = partner.get(path, {}).get("ko")
            ok, why = en_gate(path, raw, ko if ko in raws else None, en_support_ready)
            if not ok:
                noindex, reason = True, f"EN 색인 게이트 미달 — {why}"
        policy[path] = {"noindex": noindex, "reason": reason, "raw": raw,
                        "original": original[path],
                        "ads": not (noindex or matches(path, NO_ADS_GLOBS))}

    # hreflang 재구성 — 색인 허용된 실제 파일끼리만, 상호 연결되도록.
    groups = []
    seen = set()
    for path in sorted(raws):
        if path in seen:
            continue
        members = {lang_of(path): path}
        for lg, tgt in (partner.get(path) or {}).items():
            if tgt in raws:
                members[lg] = tgt
        members = {lg: p for lg, p in members.items()
                   if lg in INDEX_LANGS and not policy[p]["noindex"]}
        if len(members) >= 2:
            groups.append(members)
            seen.update(members.values())
        else:
            seen.add(path)

    hreflang = {}
    for members in groups:
        for p in members.values():
            hreflang[p] = dict(members)
    for path in raws:
        policy[path]["hreflang"] = hreflang.get(path)
    return policy


# ────────────────────────────────────────────── 파일 수정

def hreflang_html(members):
    """ko 를 x-default 로 삼는다 — 한국 부동산 정보이므로 기본 언어는 한국어다."""
    lines = []
    for lg in ("ko", "en"):
        if lg in members:
            lines.append(f'<link rel="alternate" hreflang="{lg}" href="{BASE}{members[lg]}" />')
    if "ko" in members:
        lines.append(f'<link rel="alternate" hreflang="x-default" href="{BASE}{members["ko"]}" />')
    return "\n".join(lines) + "\n"


def apply_to(path, pol):
    raw = pol["raw"]
    out = raw

    # 1) AdSense
    if not pol["ads"]:
        out = ADS_SCRIPT_RE.sub("", out)

    # 2) robots
    out = ROBOTS_META_RE.sub("", out)
    if pol["noindex"]:
        tag = '<meta name="robots" content="noindex,follow" />\n'
        # <title> 바로 뒤에 넣어 head 상단에서 바로 보이게 한다.
        # </title> 뒤에 개행이 없는 페이지(한 줄로 압축된 404 등)도 있어 개행을 요구하지 않는다.
        m = re.search(r"</title>[ \t]*\n?", out, re.I)
        if m:
            out = out[: m.end()] + tag + out[m.end():]
        else:
            out = re.sub(r"(<head[^>]*>\s*\n)", lambda mm: mm.group(1) + tag, out, count=1, flags=re.I)

    # 3) canonical — hreflang 삽입 위치의 기준이 되므로 먼저 보장한다.
    #    같은 값이 두 번 들어 있는 페이지가 생기지 않도록, 있으면 첫 태그만 남긴다.
    canon_tags = CANONICAL_TAG_RE.findall(out)
    if len(canon_tags) > 1:
        first = [True]

        def keep_first(m):
            if first[0]:
                first[0] = False
                return m.group(0)
            return ""
        out = CANONICAL_TAG_RE.sub(keep_first, out)
    elif not canon_tags:
        tag = f'<link rel="canonical" href="{BASE}{path}" />\n'
        # </title> 뒤에 개행이 없는 페이지(한 줄로 압축된 404 등)도 있어 개행을 요구하지 않는다.
        m = re.search(r"</title>[ \t]*\n?", out, re.I)
        if m:
            out = out[: m.end()] + tag + out[m.end():]

    # 4) hreflang — 기존 블록을 **전부** 지우고 canonical 뒤에 한 번만 다시 넣는다.
    #    ⚠ '첫 블록 교체 + 나머지 삭제' 순서로 하면 방금 넣은 블록이 두 번째 sub 에 걸려
    #      지워진다(여러 번 실행하면 hreflang 이 붙었다 떨어졌다 한다). 지우고 넣는 순서를 지킨다.
    out = HREFLANG_BLOCK_RE.sub("", out)
    new_block = hreflang_html(pol["hreflang"]) if pol["hreflang"] else ""
    if new_block:
        m = CANONICAL_TAG_RE.search(out)
        if m:
            nl = out.find("\n", m.end())
            insert = len(out) if nl == -1 else nl + 1
            out = out[:insert] + new_block + out[insert:]

    # 빈 줄이 연달아 생기는 것만 정리(그 밖의 포맷은 건드리지 않는다).
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = []
    for dirpath, dirnames, filenames in os.walk(SITE):
        dirnames[:] = [d for d in dirnames if d != "assets"]
        files += [os.path.join(dirpath, f) for f in filenames if f.endswith(".html")]
    files.sort()

    policy = decide(files)

    changed, noindexed, ads_removed = 0, [], []
    for path, pol in sorted(policy.items()):
        new = apply_to(path, pol)
        if pol["noindex"]:
            noindexed.append((path, pol["reason"]))
        if not pol["ads"] and "pagead2.googlesyndication.com" in pol["original"]:
            ads_removed.append(path)
        if new != pol["original"]:
            changed += 1
            if not args.dry_run:
                with open(file_for(path), "w", encoding="utf-8") as f:
                    f.write(new)

    hl = sum(1 for p in policy.values() if p["hreflang"])
    print(f"HTML {len(policy):,}개 검사 · 수정 {changed:,}개"
          + (" (dry-run — 파일은 그대로)" if args.dry_run else ""))
    print(f"noindex,follow 적용: {len(noindexed):,}개")
    print(f"AdSense 스크립트 제거: {len(ads_removed)}개")
    print(f"hreflang 상호 연결 페이지: {hl}개 (ko·en 만)")
    print()
    print("noindex 사유별:")
    by = {}
    for _, r in noindexed:
        by[r] = by.get(r, 0) + 1
    for r, n in sorted(by.items(), key=lambda x: -x[1]):
        print(f"  {n:5,}  {r}")
    print()
    print("AdSense 제거된 경로:")
    for p in ads_removed:
        print("  ·", p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
