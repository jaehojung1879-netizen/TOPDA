#!/usr/bin/env python3
"""홈 '핵심 이슈' 섹션 생성 → site/index.html 의 home:issues 마커 구간

무엇을 대체하나: 구글 뉴스 RSS 헤드라인 자동 나열을 없애고, 운영자가 직접 쓴 이슈 분석만
노출한다. 기사 제목을 자동으로 가져와 늘어놓는 구조는 톺다가 만든 가치가 아니고,
대량 자동생성 정보 사이트로 보이게 만든다.

설계 원칙
  · 원본은 _meta/home_issues.json 하나. 운영자가 손으로 채운다.
  · issues 가 비면 **섹션 자체를 만들지 않는다.** "이번 주 이슈 없음" 같은 빈 껍데기를
    남기지 않는다(지시서 5단계).
  · 필수 항목(무엇이 바뀌었나·영향 받는 사람·톺다 반영 내용·공식 출처·검토일)이 하나라도
    비면 그 항목은 노출하지 않고 경고한다. 제목만 있는 항목은 통과할 수 없다.
  · source_url 은 공식 원문만 받는다. 뉴스 도메인은 거부한다.
  · 최대 3개.

사용법
  python build_home_issues.py            # index.html 갱신
  python build_home_issues.py --check    # 쓰지 않고 검증만 (CI용)
"""
import argparse
import html
import json
import os
import re
import sys
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
INDEX = os.path.join(ROOT, "site", "index.html")
DATA = os.path.join(HERE, "home_issues.json")

START = "<!-- home:issues:start -->"
END = "<!-- home:issues:end -->"

MAX_ITEMS = 3
REQUIRED = ("title", "changed", "affected", "reflected", "source", "source_url", "reviewed")

# 언론사 링크는 '공식 원문 출처'가 아니다. 원문(법령·고시·보도자료)만 받는다.
NEWS_HOSTS = re.compile(
    r"(news\.google\.|naver\.com|daum\.net|chosun\.|joongang\.|donga\.|hankyung\.|mk\.co\.kr"
    r"|mt\.co\.kr|edaily\.|news1\.kr|yna\.co\.kr|ytn\.co\.kr|sbs\.co\.kr|kbs\.co\.kr|mbc\.co\.kr)",
    re.I)


def esc(s):
    return html.escape(str(s), quote=True)


def validate(issues):
    """(통과 항목, 경고 목록)."""
    ok, warns = [], []
    for i, it in enumerate(issues, 1):
        missing = [k for k in REQUIRED if not str(it.get(k) or "").strip()]
        if missing:
            warns.append(f"이슈 #{i} ({it.get('title') or '제목 없음'}): 필수 항목 누락 — {', '.join(missing)}")
            continue
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", it["reviewed"].strip()):
            warns.append(f"이슈 #{i}: reviewed 가 YYYY-MM-DD 형식이 아님 — {it['reviewed']}")
            continue
        url = it["source_url"].strip()
        host = urllib.parse.urlparse(url).netloc
        if not host:
            warns.append(f"이슈 #{i}: source_url 이 절대 URL 이 아님 — {url}")
            continue
        if NEWS_HOSTS.search(host):
            warns.append(f"이슈 #{i}: source_url 이 언론사 링크임 — 공식 원문(법령·고시·보도자료)으로 바꿔야 함: {host}")
            continue
        ok.append(it)
    if len(ok) > MAX_ITEMS:
        warns.append(f"이슈가 {len(ok)}개 — 홈에는 상위 {MAX_ITEMS}개만 노출합니다")
        ok = ok[:MAX_ITEMS]
    return ok, warns


def render(issues):
    """통과 항목이 없으면 빈 문자열 → 섹션이 만들어지지 않는다."""
    if not issues:
        return ""
    cards = []
    for it in issues:
        links = ""
        if it.get("links"):
            items = "".join(
                f'<li><a href="{esc(l["href"])}">{esc(l["label"])}</a></li>'
                for l in it["links"] if l.get("href") and l.get("label"))
            if items:
                links = f'<ul class="issue-links">{items}</ul>'
        cards.append(
            '      <article class="issue-card">\n'
            f'        <h3>{esc(it["title"])}</h3>\n'
            '        <dl class="issue-fields">\n'
            f'          <dt>무엇이 바뀌었나</dt><dd>{esc(it["changed"])}</dd>\n'
            f'          <dt>영향을 받는 사람</dt><dd>{esc(it["affected"])}</dd>\n'
            f'          <dt>톺다에 반영한 내용</dt><dd>{esc(it["reflected"])}</dd>\n'
            '        </dl>\n'
            + (f'        {links}\n' if links else "")
            + '        <p class="issue-meta">'
            f'공식 원문: <a href="{esc(it["source_url"])}" target="_blank" rel="noopener">{esc(it["source"])}</a>'
            f' · 검토일 {esc(it["reviewed"])}</p>\n'
            '      </article>\n')
    return (
        '<section class="section home-issue">\n'
        '  <div class="container">\n'
        '    <div class="strip-head">\n'
        '      <h2>핵심 이슈</h2>\n'
        '      <span class="strip-sub">운영자가 공식 원문을 확인해 직접 정리한 변경 사항입니다</span>\n'
        '    </div>\n'
        '    <div class="issue-grid">\n'
        + "".join(cards) +
        '    </div>\n'
        '    <p class="news-note">'
        '무엇이 바뀌었는지 확인한 시점을 각 항목에 적었습니다. 투자 권유가 아니며, '
        '적용 여부는 개별 조문을 확인하세요.'
        '</p>\n'
        '  </div>\n'
        '</section>\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="index.html 을 쓰지 않고 검증만")
    args = ap.parse_args()

    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    issues, warns = validate(data.get("issues") or [])
    for w in warns:
        print(f"[warn] {w}")

    with open(INDEX, encoding="utf-8") as f:
        src = f.read()
    if START not in src or END not in src:
        print(f"[error] index.html 에 {START} / {END} 마커가 없습니다")
        return 1

    block = render(issues)
    out = re.sub(re.escape(START) + r".*?" + re.escape(END),
                 lambda _: START + "\n" + block + END, src, flags=re.S)

    if args.check:
        print(f"[check] 노출 대상 이슈 {len(issues)}개 · 경고 {len(warns)}건"
              + (" · 섹션 숨김" if not issues else ""))
        return 1 if warns else 0

    if out != src:
        with open(INDEX, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"[ok] index.html 핵심 이슈 섹션 갱신 — 이슈 {len(issues)}개"
              + (" (섹션 숨김)" if not issues else ""))
    else:
        print(f"[ok] 변경 없음 — 이슈 {len(issues)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
