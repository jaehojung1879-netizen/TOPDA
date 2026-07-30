#!/usr/bin/env python3
"""핵심 계산기 페이지에 '이 계산기 정보' 블록을 정적 HTML 로 넣는다 (지시서 8단계).

무엇이 문제였나: site/assets/rates.js 는 계산기별 출처(sources), 최종 검토일(lastReviewed),
변경 이력(changelog)을 이미 관리하고 있었다. 주석에는 "계산기 하단에 표기됨"이라고 적혀
있었지만 **어느 페이지도 그 값을 렌더링하지 않았다.** 즉 유지되는 데이터가 화면에 없었다.

그래서 이 스크립트는 새 문장을 만들어 붙이는 것이 아니라,
  · rates.js 가 이미 관리하는 값 (적용 기준일 · 주요 출처 · 변경 이력) 을 꺼내 화면에 넣고,
  · _meta/calc_meta.json 에 사람이 쓴 계산기 설명 (대상·준비 입력값·공식과 가정·
    결과가 달라지는 조건·예시·관련 링크) 을 함께 넣는다.
분량을 늘리기 위한 일반론은 넣지 않는다. calc_meta.json 에 없는 계산기는 rates.js 기반
정보(기준일·출처·변경 이력)만 받는다.

정적 HTML 로 넣는 이유: JS 로 렌더링하면 네이버(Yeti) 같은 제한적 렌더러가 읽지 못하고,
'출처와 기준일을 밝히지 않은 페이지'로 남는다.

사용법
  python build_calc_meta.py             # 적용
  python build_calc_meta.py --dry-run
"""
import argparse
import glob
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SITE = os.path.join(ROOT, "site")
RATES_JS = os.path.join(SITE, "assets", "rates.js")
META_JSON = os.path.join(HERE, "calc_meta.json")

START = "<!-- calc:meta:start -->"
END = "<!-- calc:meta:end -->"

CHANGELOG_SHOW = 6          # 최근 몇 건까지 화면에 노출할지
SKIP = {"index.html"}
# 도구 성격이 달라 이 블록을 넣지 않는 페이지(내부 검색 결과·데이터 조회 화면).
SKIP_SLUGS = {"search", "transactions", "market-trends", "jeonse-ratio"}


def esc(s):
    return html.escape(str(s), quote=True)


# ───────────────────────────────────────── rates.js 파싱

def parse_rates():
    """rates.js 에서 lastReviewed · sources · changelog 를 뽑는다.

    JS 파일이라 json.loads 를 쓸 수 없다. 세 항목의 형태가 단순하고 고정적이라
    정규식으로 읽는다. 형태가 바뀌면 여기서 값을 못 찾고 빈 값을 반환하므로,
    호출부에서 '값이 없으면 그 줄을 출력하지 않는' 원칙이 그대로 적용된다.
    """
    src = open(RATES_JS, encoding="utf-8").read()

    last = re.search(r"lastReviewed:\s*'([^']+)'", src)
    last_reviewed = last.group(1) if last else None

    sources = {}
    m = re.search(r"sources:\s*\{(.*?)\n    \},", src, re.S)
    if m:
        for k, v in re.findall(r"'([^']+)':\s*'((?:[^'\\]|\\.)*)'", m.group(1)):
            sources[k] = v.replace("\\'", "'")

    changelog = []
    m = re.search(r"changelog:\s*\[(.*?)\n    \],", src, re.S)
    if m:
        for date, note in re.findall(
                r"\{\s*date:\s*'([^']+)',\s*note:\s*'((?:[^'\\]|\\.)*)'\s*\}", m.group(1)):
            changelog.append((date, note.replace("\\'", "'")))
    return last_reviewed, sources, changelog


# ───────────────────────────────────────── 렌더링

def ul(items):
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def render(slug, meta, last_reviewed, source, changelog):
    """블록 HTML. 값이 없는 항목은 아예 출력하지 않는다."""
    parts = []

    if meta.get("audience"):
        parts.append("<h3>어떤 경우에 쓰는 계산기인가</h3>\n"
                     f"<p>{esc(meta['audience'])}</p>")
    if meta.get("inputs"):
        parts.append("<h3>미리 준비할 값</h3>\n" + ul(esc(i) for i in meta["inputs"]))
    if meta.get("formula"):
        parts.append("<h3>적용 공식과 가정</h3>\n" + ul(esc(i) for i in meta["formula"]))
    if meta.get("examples"):
        parts.append("<h3>예시</h3>\n" + ul(esc(i) for i in meta["examples"]))
    if meta.get("varies"):
        parts.append("<h3>결과가 달라질 수 있는 조건</h3>\n" + ul(esc(i) for i in meta["varies"]))
    if meta.get("related"):
        links = "".join(f'<li><a href="{esc(r["href"])}">{esc(r["label"])}</a></li>'
                        for r in meta["related"])
        parts.append("<h3>함께 보기</h3>\n" + f"<ul>{links}</ul>")

    basis = []
    if source:
        basis.append(f"<div class=\"row\"><span class=\"k\">주요 근거</span>"
                     f"<span class=\"v\">{esc(source)}</span></div>")
    if last_reviewed:
        basis.append(f"<div class=\"row\"><span class=\"k\">적용 기준일</span>"
                     f"<span class=\"v\">{esc(last_reviewed)} — 이 날짜의 법령·고시·요율을 기준으로 "
                     f"세율표를 대조했습니다. 이후 개정분은 반영되지 않았을 수 있습니다.</span></div>")
    if basis:
        parts.append("<h3>근거와 기준일</h3>\n"
                     f'<div class="def-list">{"".join(basis)}</div>')

    if changelog:
        rows = "".join(
            f'<div class="row"><span class="k">{esc(d)}</span>'
            f'<span class="v">{esc(n)}</span></div>'
            for d, n in changelog[:CHANGELOG_SHOW])
        parts.append(
            '<h3>변경 이력</h3>\n'
            '<p class="note">계산 결과가 달라지는 변경만 기록합니다. 표기·문구만 다듬은 수정은 남기지 않습니다. '
            '전체 원본은 <code>site/assets/rates.js</code> 에서 관리합니다.</p>\n'
            f'<div class="def-list">{rows}</div>')

    if not parts:
        return ""
    return ('<section class="calc-meta" aria-labelledby="calc-meta-h">\n'
            '  <h2 id="calc-meta-h">이 계산기 정보</h2>\n  '
            + "\n  ".join(parts)
            + '\n  <p class="note">계산 결과는 입력 조건에 따른 <strong>추정값</strong>입니다. '
              '실제 고지·부과·승인 금액과 다를 수 있으며, 개별 사안에 대한 법률·세무·금융 자문이 아닙니다. '
              '작성·관리 원칙은 <a href="/editorial-policy.html">운영·편집 원칙</a>에, '
              '오류 제보는 <a href="/corrections.html">정정 안내</a>에 있습니다.</p>\n'
            '</section>\n')


def inject(raw, block):
    """마커가 있으면 교체, 없으면 </main> 바로 앞에 마커와 함께 넣는다."""
    if START in raw and END in raw:
        return re.sub(re.escape(START) + r".*?" + re.escape(END),
                      lambda _: START + "\n" + block + END, raw, flags=re.S)
    m = re.search(r"\n?</main>", raw, re.I)
    if not m:
        return None
    return raw[: m.start()] + "\n\n" + START + "\n" + block + END + "\n" + raw[m.start():]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    last_reviewed, sources, changelog = parse_rates()
    if not last_reviewed:
        print("[warn] rates.js 에서 lastReviewed 를 찾지 못했습니다 — 적용 기준일을 표시하지 않습니다")
    with open(META_JSON, encoding="utf-8") as f:
        metas = json.load(f)

    changed, skipped, no_authored = 0, [], []
    for fp in sorted(glob.glob(os.path.join(SITE, "calculators", "*.html"))):
        base = os.path.basename(fp)
        slug = base[: -len(".html")]
        if base in SKIP or slug in SKIP_SLUGS:
            skipped.append(base)
            continue
        meta = metas.get(slug) or {}
        if not meta:
            no_authored.append(base)
        with open(fp, encoding="utf-8") as f:
            raw = f.read()
        block = render(slug, meta, last_reviewed,
                       sources.get(slug) or sources.get("default"), changelog)
        new = inject(raw, block)
        if new is None:
            print(f"[warn] {base}: </main> 을 찾지 못해 건너뜀")
            continue
        if new != raw:
            changed += 1
            if not args.dry_run:
                with open(fp, "w", encoding="utf-8") as f:
                    f.write(new)

    print(f"계산기 {changed}개에 '이 계산기 정보' 블록 반영"
          + (" (dry-run)" if args.dry_run else ""))
    print(f"  rates.js — 적용 기준일 {last_reviewed} · 출처 {len(sources)}개 · 변경 이력 {len(changelog)}건")
    print(f"  블록 제외(도구 성격 다름): {', '.join(skipped)}")
    if no_authored:
        print(f"  calc_meta.json 에 설명이 없어 기준일·출처·변경 이력만 넣은 계산기: "
              f"{', '.join(no_authored)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
