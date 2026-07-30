#!/usr/bin/env python3
"""가이드·체크리스트 페이지에 작성자·날짜·출처를 화면과 구조화 데이터에 함께 넣는다 (지시서 7단계).

무엇이 문제였나: 글 상단에 "최근 갱신"이라고만 적혀 있고 **날짜가 없었다.** Article JSON-LD의
author 는 `{"@id": "https://topda.kr/#organization"}` 로만 적혀 있어, 그 @id 가 정의된
index.html 밖에서는 해석되지 않는다. 즉 화면에도 구조화 데이터에도 "누가 언제 쓴 글인지"가
없었다.

무엇을 넣나 (모두 **확인 가능한 값만**)
  · 작성자        — 정재호 (/authors/jaeho-jung.html 로 연결)
  · 최초 게시일   — 그 파일을 추가한 커밋의 날짜 (git)
  · 최근 수정일   — 그 파일을 마지막으로 바꾼 사람 커밋의 날짜 (git, 봇 커밋 제외)
  · 주요 공식 출처 — **페이지에 이미 걸려 있는** 공공기관 링크에서 추출
  · 내용 기준 시점 — 최근 수정일 (그 날짜 기준으로 쓰인 내용임을 밝힌다)

하지 않는 것
  · 날짜를 추정하거나 만들어 내지 않는다. git 에서 못 찾으면 표시하지 않고 보고서에 남긴다.
  · "검토일"이라고 쓰지 않는다. 실제로 재검토한 기록이 없으므로 '수정일'로만 쓴다.
  · 출처를 새로 붙이지 않는다. 페이지에 없는 출처를 만들어 넣지 않는다.
  · reviewedBy 를 넣지 않는다 — 외부 전문가 감수 절차가 없다.

사용법
  python add_bylines.py             # 적용
  python add_bylines.py --dry-run
  python add_bylines.py --report    # 날짜·출처를 못 찾은 페이지 목록만 출력
"""
import argparse
import glob
import html
import json
import os
import re
import subprocess
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
BASE = "https://topda.kr"

AUTHOR_NAME = "정재호"
AUTHOR_URL = f"{BASE}/authors/jaeho-jung.html"

# 자동 데이터 갱신 커밋 — 본문을 바꾼 것이 아니므로 '수정일' 계산에서 뺀다.
BOT_AUTHORS = ("topda-bot",)

# 공공기관 도메인만 '공식 출처'로 인정한다. .go.kr / .or.kr 은 기관 도메인이고,
# 아래 표에 없는 민간 사이트는 출처로 표기하지 않는다.
OFFICIAL_EXTRA = {"sgic.co.kr", "kiscon.net", "applyhome.co.kr"}
HOST_NAMES = {
    "www.law.go.kr": "국가법령정보센터",
    "www.easylaw.go.kr": "찾기쉬운 생활법령정보",
    "www.molit.go.kr": "국토교통부",
    "rt.molit.go.kr": "국토교통부 실거래가 공개시스템",
    "rtms.molit.go.kr": "국토교통부 실거래가 신고시스템",
    "nhuf.molit.go.kr": "국토교통부 주택도시기금",
    "enhuf.molit.go.kr": "국토교통부 주택도시기금",
    "jeonse.molit.go.kr": "국토교통부 전세사기 피해지원",
    "stat.molit.go.kr": "국토교통 통계누리",
    "www.nts.go.kr": "국세청",
    "www.fsc.go.kr": "금융위원회",
    "www.fss.or.kr": "금융감독원",
    "www.ftc.go.kr": "공정거래위원회",
    "www.kca.go.kr": "한국소비자원",
    "www.hf.go.kr": "한국주택금융공사",
    "www.khug.or.kr": "주택도시보증공사(HUG)",
    "www.sgic.co.kr": "SGI서울보증",
    "www.reb.or.kr": "한국부동산원",
    "www.bok.or.kr": "한국은행",
    "www.gov.kr": "정부24",
    "www.iros.go.kr": "인터넷등기소",
    "www.eum.go.kr": "토지이음",
    "www.k-apt.go.kr": "공동주택관리정보시스템(K-apt)",
    "www.moj.go.kr": "법무부",
    "www.klac.or.kr": "대한법률구조공단",
    "www.scourt.go.kr": "대법원",
    "ecfs.scourt.go.kr": "대법원 전자민원센터",
    "www.courtauction.go.kr": "법원경매정보",
    "adr.cak.or.kr": "대한건설협회 분쟁조정",
    "www.kiscon.net": "건설산업지식정보시스템(KISCON)",
    "www.cgbo.or.kr": "건설공제조합",
    "www.kffa.or.kr": "여신금융협회",
    "portal.kfb.or.kr": "전국은행연합회",
    "www.epost.go.kr": "우체국",
    "sgis.kostat.go.kr": "통계지리정보서비스",
    "www.schoolinfo.go.kr": "학교알리미",
    "kras.seoul.go.kr": "서울시 부동산정보광장",
    "www.applyhome.co.kr": "청약홈",
}

# 대상: 글·가이드 성격의 페이지. 목록(index)·도구 대시보드는 제외한다.
TARGET_GLOBS = ("posts/*.html", "interior/*.html", "checklists/*.html", "loan/*.html")
SKIP_BASENAMES = {"index.html"}

BYLINE_MARK = "data-byline"


def esc(s):
    return html.escape(str(s), quote=True)


# ────────────────────────────────────────────────── git 날짜

def git_dates(relpath):
    """(최초 게시일, 최근 수정일). 못 찾으면 (None, None)."""
    def run(args):
        try:
            out = subprocess.run(["git", "-C", ROOT] + args,
                                 capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError:
            return []
        return [l for l in out.splitlines() if l.strip()]

    added = run(["log", "--follow", "--diff-filter=A", "--format=%ad",
                 "--date=short", "--", relpath])
    published = added[-1] if added else None

    log = run(["log", "--follow", "--format=%ad\t%an", "--date=short", "--", relpath])
    modified = None
    for line in log:
        date, _, author = line.partition("\t")
        if author.strip() in BOT_AUTHORS:
            continue
        modified = date.strip()
        break
    if published and modified and modified < published:
        modified = published
    return published, modified


# ────────────────────────────────────────────────── 출처 추출

def official_sources(raw):
    """페이지에 이미 걸려 있는 공공기관 링크 → [(이름, URL)] (중복 제거, 등장 순서)."""
    out, seen = [], set()
    for m in re.finditer(r'href=["\'](https?://[^"\']+)["\']', raw, re.I):
        url = m.group(1)
        host = urllib.parse.urlparse(url).netloc.lower()
        if host in seen:
            continue
        official = host.endswith((".go.kr", ".or.kr")) or host in OFFICIAL_EXTRA
        if not official:
            continue
        seen.add(host)
        out.append((HOST_NAMES.get(host, host), url))
    return out


# ────────────────────────────────────────────────── 화면 표시

def byline_html(published, modified, sources):
    parts = [f'작성 <a href="/authors/jaeho-jung.html" rel="author">{esc(AUTHOR_NAME)}</a>']
    if published:
        parts.append(f'게시 <time datetime="{published}">{published}</time>')
    if modified:
        parts.append(f'최근 수정 <time datetime="{modified}">{modified}</time>')
    line = '<span class="dot">·</span>'.join(f"<span>{p}</span>" for p in parts)

    src = ""
    if sources:
        items = " · ".join(
            f'<a href="{esc(u)}" target="_blank" rel="noopener">{esc(n)}</a>'
            for n, u in sources[:5])
        src = f'<p class="byline-src">주요 공식 출처: {items}</p>'
    basis = ""
    if modified:
        basis = (f'<p class="byline-basis">이 글의 내용은 <strong>{modified}</strong> 기준으로 '
                 f'작성·수정되었습니다. 이후 법령·세율·정책이 바뀌면 달라질 수 있으니 '
                 f'위 공식 출처의 현행 내용을 함께 확인하세요.</p>' if sources else
                 f'<p class="byline-basis">이 글의 내용은 <strong>{modified}</strong> 기준으로 '
                 f'작성·수정되었습니다. 이후 법령·세율·정책이 바뀌면 달라질 수 있습니다.</p>')
    return f'<div class="byline" {BYLINE_MARK}>{line}{src}{basis}</div>'


READ_TIME_RE = re.compile(r"<span>\s*(\d+분 읽기)\s*</span>")
META_DIV_RE = re.compile(r'<div class="meta">(.*?)</div>', re.S)
EXISTING_BYLINE_RE = re.compile(r'<div class="byline"[^>]*' + BYLINE_MARK + r'.*?</div>\s*', re.S)


def insert_byline(raw, block, read_time):
    """기존 byline 을 갈아끼우고, 없으면 <h1> 뒤에 넣는다."""
    out = EXISTING_BYLINE_RE.sub("", raw)

    # '최근 갱신'·'2026.07 갱신'처럼 날짜 없는 갱신 표기가 든 meta 는 byline 이 대체한다.
    def meta_repl(m):
        inner = m.group(1)
        if not re.search(r"갱신|읽기", inner):
            return m.group(0)
        keep = f'<span>{read_time}</span>' if read_time else ""
        return f'<div class="meta">{keep}</div>' if keep else ""

    out = META_DIV_RE.sub(meta_repl, out, count=1)

    m = re.search(r"</h1>\s*\n?", out)
    if not m:
        return None
    return out[: m.end()] + block + "\n" + out[m.end():]


# ────────────────────────────────────────────────── JSON-LD

PUBLISHER = {
    "@type": "Organization",
    "name": "톺다",
    "url": f"{BASE}/",
    "logo": {"@type": "ImageObject", "url": f"{BASE}/assets/images/brand/logo.png"},
}


def author_node():
    return {"@type": "Person", "name": AUTHOR_NAME, "url": AUTHOR_URL}


def patch_jsonld(raw, url, title, desc, published, modified):
    """Article JSON-LD 를 화면과 일치시킨다. 없으면 추가한다."""
    blocks = list(re.finditer(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>',
                              raw, re.S))
    target = None
    for m in blocks:
        try:
            d = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if d.get("@type") == "Article":
            target = (m, d)
            break

    if target:
        m, d = target
    else:
        d = {"@context": "https://schema.org", "@type": "Article",
             "headline": title, "description": desc, "inLanguage": "ko", "url": url}
        m = None

    d["author"] = author_node()
    d["publisher"] = PUBLISHER
    d["mainEntityOfPage"] = {"@type": "WebPage", "@id": url}
    if published:
        d["datePublished"] = published
    if modified:
        d["dateModified"] = modified
    # 실제 외부 감수 절차가 없으므로 reviewedBy 는 넣지 않고, 남아 있으면 지운다.
    d.pop("reviewedBy", None)

    payload = ('<script type="application/ld+json">\n'
               + json.dumps(d, ensure_ascii=False, indent=2) + "\n</script>")
    if m:
        return raw[: m.start()] + payload + raw[m.end():]
    return raw.replace("</head>", payload + "\n</head>", 1)


# ────────────────────────────────────────────────── main

def targets():
    out = []
    for g in TARGET_GLOBS:
        for fp in sorted(glob.glob(os.path.join(SITE, g))):
            if os.path.basename(fp) in SKIP_BASENAMES:
                continue
            out.append(fp)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--report", action="store_true", help="누락 항목만 출력")
    args = ap.parse_args()

    changed, no_date, no_source, no_h1 = 0, [], [], []
    for fp in targets():
        rel = os.path.relpath(fp, ROOT)
        url = BASE + "/" + os.path.relpath(fp, SITE).replace(os.sep, "/")
        with open(fp, encoding="utf-8") as f:
            raw = f.read()

        published, modified = git_dates(rel)
        if not (published and modified):
            no_date.append(rel)
        sources = official_sources(raw)
        if not sources:
            no_source.append(rel)

        title = (re.search(r"<title>(.*?)</title>", raw, re.S) or [None, ""])[1]
        title = html.unescape(re.sub(r"\s*[—|]\s*톺다\s*$", "", title.strip()))
        desc = html.unescape(
            (re.search(r'<meta name="description" content="([^"]*)"', raw) or [None, ""])[1])
        rt = READ_TIME_RE.search(raw)

        block = byline_html(published, modified, sources)
        new = insert_byline(raw, block, rt.group(1) if rt else None)
        if new is None:
            no_h1.append(rel)
            continue
        new = patch_jsonld(new, url, title, desc, published, modified)

        if new != raw:
            changed += 1
            if not args.dry_run and not args.report:
                with open(fp, "w", encoding="utf-8") as f:
                    f.write(new)

    print(f"대상 {len(targets())}개 · 수정 {changed}개"
          + (" (dry-run)" if args.dry_run or args.report else ""))
    print(f"git 에서 날짜를 확정하지 못한 페이지: {len(no_date)}개")
    for r in no_date:
        print("   ·", r)
    print(f"페이지에 공식 출처 링크가 없어 출처를 표기하지 못한 페이지: {len(no_source)}개")
    for r in no_source:
        print("   ·", r)
    if no_h1:
        print(f"<h1> 을 찾지 못해 건너뛴 페이지: {len(no_h1)}개")
        for r in no_h1:
            print("   ·", r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
