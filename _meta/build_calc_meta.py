#!/usr/bin/env python3
"""핵심 계산기 페이지에 이용자가 필요한 계산 기준을 정적 HTML 로 넣는다.

site/assets/rates.js 가 관리하는 계산기별 출처(sources)와 최종 검토일(lastReviewed)을
화면의 근거·기준일 영역에 사용한다. 개발 변경 이력(changelog)은 코드와 Git 이력에만
보관하며 계산기 화면에는 노출하지 않는다.

그래서 이 스크립트는 새 문장을 만들어 붙이는 것이 아니라,
  · rates.js 가 이미 관리하는 값 (적용 기준일 · 주요 출처) 을 꺼내 화면에 넣고,
  · _meta/calc_meta.json 에 사람이 쓴 계산기 설명 (대상·준비 입력값·공식과 가정·
    결과가 달라지는 조건·예시·관련 링크) 을 함께 넣는다.
분량을 늘리기 위한 일반론은 넣지 않는다. calc_meta.json 에 없는 계산기는 rates.js 기반
정보(기준일·출처)만 받는다.

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

SKIP = {"index.html"}
# 도구 성격이 달라 이 블록을 넣지 않는 페이지(내부 검색 결과·데이터 조회 화면).
SKIP_SLUGS = {"search", "transactions", "market-trends", "jeonse-ratio"}


def esc(s):
    return html.escape(str(s), quote=True)


# calc_meta.json 의 자리표시자 표시. 사람이 채우기 전까지 **화면에 내보내지 않는다.**
#
# ⚠ 이 규칙이 없으면 초안 상태의 "TODO(작성필요): …" 문장이 그대로 배포된다. 지금은
#   AdSense 가 '가치 없는 콘텐츠'로 판정한 도메인을 재심사받는 중이라, 빈 자리표시자가
#   본문에 보이는 것은 아무것도 없는 것보다 나쁘다. 슬롯은 JSON 에 남겨 두고 화면에서만
#   뺀다 — 문장을 채우면 그 항목이 자동으로 나타난다.
PLACEHOLDER = "TODO(작성필요)"


def authored(v):
    """사람이 실제로 쓴 값인가. 자리표시자는 아직 안 쓴 것으로 본다."""
    return bool(v) and PLACEHOLDER not in str(v)


def authored_list(items):
    return [i for i in (items or []) if authored(i)]


# ───────────────────────────────────────── rates.js 파싱

def parse_rates():
    """rates.js 에서 방문자에게 필요한 lastReviewed · sources 만 뽑는다.

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

    return last_reviewed, sources


# ───────────────────────────────────────── 렌더링

def ul(items):
    return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def faq_html(faq):
    """FAQ 섹션(화면) + FAQPage JSON-LD. 둘의 문구는 같은 원본에서 나온다.

    ⚠ 스키마와 화면 문구가 다르면 구조화 데이터 위반이다. 그래서 한쪽만 손댈 수 없도록
    같은 리스트에서 둘 다 만든다.
    """
    faq = [f for f in faq if authored(f.get("q")) and authored(f.get("a"))]
    if not faq:
        return ""
    items = "".join(
        '<details class="explain">\n'
        f'      <summary>{esc(f["q"])}</summary>\n'
        f'      <div class="explain-body"><p>{esc(f["a"])}</p></div>\n'
        '    </details>\n    ' for f in faq)
    ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [{"@type": "Question", "name": f["q"],
                        "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in faq],
    }, ensure_ascii=False, indent=2)
    return ('<h3>자주 묻는 질문</h3>\n    ' + items
            + f'<script type="application/ld+json">\n{ld}\n</script>')


def howto_html(howto):
    """계산 순서(화면 <ol>) + HowTo JSON-LD.

    ⚠ HowTo 는 화면에 같은 단계가 보여야 한다. JSON-LD 만 넣으면 구조화 데이터 위반이라
    여기서 <ol> 도 함께 낸다.
    """
    steps = [s for s in (howto.get("steps") or [])
             if authored(s.get("name")) and authored(s.get("text"))]
    if not steps:
        return ""
    lis = "".join(f"<li>{esc(s['name'])} — {esc(s['text'])}</li>" for s in steps)
    ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": howto.get("name", ""),
        "step": [{"@type": "HowToStep", "position": i, "name": s["name"], "text": s["text"]}
                 for i, s in enumerate(steps, 1)],
    }, ensure_ascii=False, indent=2)
    return (f'<h3>{esc(howto.get("name") or "계산 순서")}</h3>\n'
            f"<ol>{lis}</ol>\n"
            f'<script type="application/ld+json">\n{ld}\n</script>')


def render(slug, meta, last_reviewed, source, has_disclaimer=False,
           allow_faq=True):
    """블록 HTML. 값이 없는 항목은 아예 출력하지 않는다."""
    parts = []

    if authored(meta.get("audience")):
        parts.append("<h3>확인할 수 있는 내용</h3>\n"
                     f"<p>{esc(meta['audience'])}</p>")
    for key, heading in (("inputs", "준비할 값"), ("formula", "계산 기준"),
                         ("examples", "입력 예시"), ("varies", "결과가 달라지는 경우")):
        items = authored_list(meta.get(key))
        if items:
            parts.append(f"<h3>{heading}</h3>\n" + ul(esc(i) for i in items))
    if meta.get("howto"):
        block = howto_html(meta["howto"])
        if block:
            parts.append(block)
    # 페이지가 이미 손으로 쓴 FAQPage 를 갖고 있으면 여기서 또 내지 않는다.
    # 한 페이지에 FAQPage 가 두 벌 있으면 구조화 데이터 위반이다.
    if meta.get("faq") and allow_faq:
        block = faq_html(meta["faq"])
        if block:
            parts.append(block)
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

    if not parts:
        return ""
    # 면책 문구가 이미 있는 페이지에는 다시 붙이지 않는다(같은 말이 두 번 나오면 읽지 않게 된다).
    closing = ("" if has_disclaimer else
               '\n  <p class="note">계산 결과는 입력하신 조건에 따른 <strong>추정값</strong>입니다. '
               '실제 고지·부과·승인 금액과 다를 수 있으며, 개별 사안에 대한 법률·세무·금융 자문이 아닙니다.</p>')
    return ('<section class="calc-meta" aria-labelledby="calc-meta-h">\n'
            '  <h2 id="calc-meta-h">계산 전에 확인하세요</h2>\n  '
            + "\n  ".join(parts) + closing + '\n'
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

    last_reviewed, sources = parse_rates()
    if not last_reviewed:
        print("[warn] rates.js 에서 lastReviewed 를 찾지 못했습니다 — 적용 기준일을 표시하지 않습니다")
    with open(META_JSON, encoding="utf-8") as f:
        metas = json.load(f)

    changed, skipped, no_authored, dup_faq = 0, [], [], []
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
        # 이미 면책 문구가 있는 페이지인지 — calc:meta 구간은 제외하고 본다.
        outside = re.sub(re.escape(START) + r".*?" + re.escape(END), "", raw, flags=re.S)
        has_disclaimer = "자문이 아" in outside or "일반적 정보 제공" in outside
        # 손으로 쓴 FAQPage 가 이미 본문에 있는 페이지는 생성 FAQ 를 넣지 않는다.
        hand_faq = '"FAQPage"' in outside
        if hand_faq and meta.get("faq"):
            dup_faq.append(base)
        block = render(slug, meta, last_reviewed,
                       sources.get(slug) or sources.get("default"), has_disclaimer,
                       allow_faq=not hand_faq)
        new = inject(raw, block)
        if new is None:
            print(f"[warn] {base}: </main> 을 찾지 못해 건너뜀")
            continue
        if new != raw:
            changed += 1
            if not args.dry_run:
                with open(fp, "w", encoding="utf-8") as f:
                    f.write(new)

    print(f"계산기 {changed}개에 '계산 전에 확인하세요' 블록 반영"
          + (" (dry-run)" if args.dry_run else ""))
    print(f"  rates.js — 적용 기준일 {last_reviewed} · 출처 {len(sources)}개")
    print(f"  블록 제외(도구 성격 다름): {', '.join(skipped)}")
    if no_authored:
        print(f"  calc_meta.json 에 설명이 없어 기준일·출처만 넣은 계산기: "
              f"{', '.join(no_authored)}")
    if dup_faq:
        print(f"  [warn] 본문에 손으로 쓴 FAQPage 가 이미 있어 calc_meta.json 의 faq 를 "
              f"넣지 않은 계산기: {', '.join(dup_faq)}")

    # 아직 사람이 채우지 않은 슬롯 현황. 자리표시자는 화면에 나가지 않으므로 실패가 아니라
    # 진행 상황 보고다 — 문장을 채우면 그만큼 페이지에 나타난다.
    pending = {}
    for slug, meta in metas.items():
        if slug.startswith("_"):
            continue
        n = len(re.findall(re.escape(PLACEHOLDER), json.dumps(meta, ensure_ascii=False)))
        if n:
            pending[slug] = n
    if pending:
        total = sum(pending.values())
        print(f"  작성 대기 자리표시자 {total}개 (화면에는 나가지 않음): "
              + ", ".join(f"{s} {n}" for s, n in sorted(pending.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
