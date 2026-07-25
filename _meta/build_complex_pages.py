#!/usr/bin/env python3
"""단지별 실거래 페이지 생성 → site/apt/{지역슬러그}/{단지슬러그}/index.html

포지션(지시서 0): 실거래가 페이지는 검색 유입의 진입점이고, 핵심 서비스는 그 가격을 그대로
가져가는 계산기다. 그래서 이 페이지의 목적은 '데이터 나열'이 아니라
    특정 단지의 최근 실거래가 확인 → 그 가격 기준 취득세·대출·잔금 계산
동선을 한 화면에서 끝내는 것이다.

생성물
  site/apt/{지역슬러그}/{단지슬러그}/index.html   단지 페이지
  site/apt/{지역슬러그}/index.html                지역 허브(슬러그 URL 정식판)
  site/apt/{한글지역}.html                        기존 URL 유지 + canonical을 허브로 이전
  data/slug-map.json                              슬러그 매핑·이력
  site/sitemap.xml                                /apt/{slug}/ 항목 재생성

생성 기준(지시서 4단계)
  최근 12개월 유효(비취소) 거래 MIN_DEALS건 이상
  AND 세대수 MIN_HOUSEHOLDS 이상
  AND 최근 거래일·거래가격 확인 가능

데이터 원칙
  · 추정·보간·평활화·예측을 하지 않는다. 값이 없으면 항목 자체를 숨긴다.
  · 취소(해제) 거래는 모든 집계에서 제외하고, 표에만 별도 표시한다.
  · ㎡당 평균은 **거래별 단가의 단순 산술평균**이다(거래금액 가중이 아님). 화면에도 명시한다.

사용법
  python build_complex_pages.py            # 샘플 10개 단지
  python build_complex_pages.py --all      # 기준 통과 전체
  python build_complex_pages.py --limit 50
  python build_complex_pages.py --count    # 생성 없이 조건별 페이지 수만 산출
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from collections import defaultdict

import lib_pdata as L
import lib_slug as SL
# 기존 지역 페이지 생성기의 스타일·헤더·포맷터를 그대로 재사용한다(구조 중복 방지).
import build_apt_pages as BAP

BASE = BAP.BASE
SITE = BAP.SITE
APT_DIR = BAP.APT_DIR
SITEMAP = BAP.SITEMAP

MIN_DEALS = 3
MIN_HOUSEHOLDS = 100
WINDOW_MONTHS = 12
MIN_QUARTERS_FOR_CHART = 4     # 지시서 2-D: 4개 분기 미만이면 차트를 표시하지 않는다
SAMPLE_SIZE = 10
METRO = {"서울", "경기", "인천"}

# 화면에 쓰는 '최근 N개월'의 N. 수집 창(WINDOW_MONTHS)이 아니라 **실제 보유 데이터가 덮는
# 개월 수**를 쓴다. 수집기가 12개월로 확장돼도 실제로는 며칠에 걸쳐 채워지므로, 아직 6개월치
# 뿐인데 "최근 12개월 51건"이라 쓰면 없는 기간을 있는 것처럼 말하게 된다.
# main()이 데이터에서 계산해 채운다.
_ACTUAL_MONTHS = WINDOW_MONTHS

esc = BAP.esc
fmt_price = BAP.fmt_price


# ────────────────────────────────────────────────────────────── 집계

def window_start(today, months=WINDOW_MONTHS):
    """오늘로부터 months개월 전 1일(YYYY-MM-DD)."""
    y, m = today.year, today.month - (months - 1)
    while m <= 0:
        y -= 1
        m += 12
    return f"{y:04d}-{m:02d}-01"


def aggregate(deals, hh_map, since):
    """단지 고유 키(지역|법정동|단지명) 단위 집계."""
    g = defaultdict(list)
    for d in deals:
        rk, name, date = d.get("region_key"), d.get("apt"), d.get("date") or ""
        if not (rk and name and date >= since and d.get("price") and d.get("area_m2")):
            continue
        umd = d.get("umd") or (d.get("region") or "").split()[-1]
        g[(rk, umd, name)].append(d)

    out = []
    for (rk, umd, name), ds in g.items():
        valid = [d for d in ds if not d.get("canceled")]
        canceled = [d for d in ds if d.get("canceled")]
        if not valid:
            continue
        valid.sort(key=lambda x: (x["date"], x.get("floor") or 0))
        info = hh_map.get(f"{rk}|{name}") or {}
        last = valid[-1]
        out.append({
            "region_key": rk, "umd": umd, "name": name,
            "deals": valid, "canceled": canceled,
            "n": len(valid),
            "households": info.get("households"),
            "built_year": info.get("built_year") or last.get("build_year"),
            "last": last,
            "areas": sorted({round(d["area_m2"], 1) for d in valid}),
        })
    return out


def eligible(c):
    return bool(c["n"] >= MIN_DEALS
                and (c["households"] or 0) >= MIN_HOUSEHOLDS
                and c["last"].get("price") and c["last"].get("date"))


def area_summary(c):
    """면적 유형별 요약. ㎡당 평균 = 거래별 단가의 단순 산술평균(가중 아님)."""
    by = defaultdict(list)
    for d in c["deals"]:
        by[round(d["area_m2"], 1)].append(d)
    rows = []
    for area, ds in sorted(by.items()):
        ds.sort(key=lambda x: x["date"])
        unit = [d["price"] / d["area_m2"] for d in ds]
        rows.append({
            "area": area, "pyeong": ds[-1].get("pyeong") or round(area / 3.3058),
            "n": len(ds), "last_price": ds[-1]["price"], "last_date": ds[-1]["date"],
            "avg_unit": sum(unit) / len(unit),
        })
    return rows


def quarterly(c):
    """분기별 ㎡당 단가 평균. 유효 거래가 있는 분기만. 보간·평활화 없음."""
    by = defaultdict(list)
    for d in c["deals"]:
        y, m = int(d["date"][:4]), int(d["date"][5:7])
        by[f"{y}Q{(m - 1) // 3 + 1}"].append(d["price"] / d["area_m2"])
    return [{"q": q, "avg": sum(v) / len(v), "n": len(v)} for q, v in sorted(by.items())]


# ────────────────────────────────────────────────────────────── 샘플 선정

def select_sample(cands, size=SAMPLE_SIZE):
    """지시서 2 샘플 조건: 수도권 5 + 지방 5, 거래 풍부/경계 혼합, 시군구 중복 회피,
    면적 유형 2개 이상 우선. 완전 결정적(동일 입력 → 동일 선정)."""
    def pick(pool, n, rich):
        # rich=True → 거래 많은 순, False → 경계(MIN_DEALS~MIN_DEALS+1)에서 면적유형 많은 순
        if rich:
            pool = sorted(pool, key=lambda c: (-c["n"], -len(c["areas"]), c["name"]))
        else:
            pool = sorted([c for c in pool if c["n"] <= MIN_DEALS + 1],
                          key=lambda c: (-len(c["areas"]), -(c["households"] or 0), c["name"]))
        out, seen = [], set()
        for c in pool:
            if c["region_key"] in seen:
                continue
            out.append(c)
            seen.add(c["region_key"])
            if len(out) >= n:
                break
        return out

    half = size // 2
    groups = []
    for pool in (
        [c for c in cands if c["region_key"].split()[0] in METRO],
        [c for c in cands if c["region_key"].split()[0] not in METRO],
    ):
        chosen = pick(pool, half - 2, rich=True)
        used = {c["region_key"] for c in chosen}
        chosen += pick([c for c in pool if c["region_key"] not in used], 2, rich=False)
        groups.append(chosen)
    picked = groups[0] + groups[1]
    return sorted(picked, key=lambda c: (c["region_key"], c["name"]))[:size]


# ────────────────────────────────────────────────────────────── 계산기 링크

# 실거래 price는 만원, 계산기 입력은 원.
def won(manwon):
    return int(manwon) * 10000


# ⚠ 공통 파라미터에서 'region'과 'area'는 쓰지 않는다.
#   · region: loan-limit.html·registration-cost.html의 '규제지역' 라디오 name과 충돌해
#     지역명을 넘기면 라디오가 전부 해제된다(app.js applyValue는 value 일치로 체크).
#   · area:   interior-estimate.html의 면적 입력 name과 충돌.
#   그래서 region_name·area_m2로 이름을 바꿔 보낸다. 계산기 쪽 필드명은 건드리지 않는다.
CALCS = [
    ("acquisition-tax.html", "이 거래가격의 취득세 계산",
     "최근 실거래가를 취득가액으로 넣고 주택 수·조정대상지역 조건만 고르면 됩니다."),
    ("total-cost-dashboard.html", "잔금일 필요자금 계산",
     "취득세·중개보수·등기비용·대출을 합쳐 잔금일에 필요한 현금을 계산합니다."),
    ("loan-limit.html", "예상 대출한도 확인",
     "이 가격 기준 LTV·DSR 한도를 확인합니다. 소득·금리는 직접 입력해야 합니다."),
    ("registration-cost.html", "등기비용·채권매입액 확인",
     "소유권이전등기 수수료와 국민주택채권 매입·할인 부담액을 계산합니다."),
]


def calc_url(page, c, price_manwon, area_m2):
    from urllib.parse import urlencode
    q = urlencode({
        "price": won(price_manwon),
        "complex": c["name"],
        "region_name": c["region_key"],
        "area_m2": area_m2,
        "source": "apt",
    })
    return f"/calculators/{page}?{q}"


# ────────────────────────────────────────────────────────────── 페이지

EXTRA_STYLE = """
.sumcard{border:1px solid var(--line);border-radius:12px;background:var(--bg);padding:14px 16px;margin:0 0 16px}
.sumcard .headline{font-size:15px;line-height:1.7;margin:0 0 12px}
.sumcard .headline strong{font-size:17px}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.kv div{background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.kv .k{font-size:11.5px;color:var(--sub)}
.kv .v{font-size:15px;font-weight:700;margin-top:2px}
h2{font-size:17px;margin:26px 0 8px}
h3{font-size:14px;margin:16px 0 6px;color:var(--sub)}
.cta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:10px 0 6px}
.cta{display:block;border:1px solid var(--brand);border-radius:10px;padding:12px 14px;text-decoration:none;background:#fff}
.cta .t{color:var(--brand);font-weight:700;font-size:14.5px}
.cta .d{color:var(--sub);font-size:12.5px;margin-top:4px;line-height:1.5}
.cta:hover{background:#f2f7fc}
tr.cancel td{color:var(--sub);text-decoration:line-through}
.badge{display:inline-block;font-size:11px;border:1px solid var(--line);border-radius:4px;padding:1px 5px;color:var(--sub);text-decoration:none;vertical-align:middle}
.chart{border:1px solid var(--line);border-radius:10px;padding:12px;overflow-x:auto}
.linklist{list-style:none;padding:0;margin:6px 0}
.linklist li{padding:6px 0;border-bottom:1px solid var(--line);font-size:14px}
.linklist li:last-child{border-bottom:0}
.linklist a{color:var(--brand);text-decoration:none}
@media(max-width:420px){.sumcard .headline{font-size:14px}}
"""


def head(title, desc, canonical, region=None, complex_name=None):
    html = BAP.page_head(title, desc, canonical)
    html = html.replace("</style>", EXTRA_STYLE + "</style>")
    # GA4 퍼널용 식별자(analytics.js가 읽는다) + 측정 스크립트
    tags = ""
    if region:
        tags += f'<meta name="topda:region" content="{esc(region)}" />\n'
    if complex_name:
        tags += f'<meta name="topda:complex" content="{esc(complex_name)}" />\n'
    tags += '<script defer src="/assets/analytics.js?v=20260725"></script>\n'
    return html.replace("</head>", tags + "</head>")


def summary_block(c, as_of_date):
    """A. 결론 요약 — 문장 + 요약 카드. 없는 값은 항목째 숨긴다."""
    last = c["last"]
    unit = last["price"] / last["area_m2"]
    sent = (f'<p class="headline">{esc(c["region_key"])} {esc(c["umd"])} <strong>{esc(c["name"])}</strong>의 '
            f'가장 최근 신고 거래는 <strong>{esc(last["date"])}</strong> '
            f'전용 {last["area_m2"]}㎡ <strong>{fmt_price(last["price"])}</strong>'
            f'({last.get("floor") or "-"}층)입니다. '
            f'㎡당 {fmt_price(round(unit))} 수준이며, 최근 {_ACTUAL_MONTHS}개월 유효 신고 거래는 '
            f'{c["n"]}건입니다.</p>')
    cells = [("최근 거래일", esc(last["date"])),
             ("최근 거래가격", fmt_price(last["price"])),
             ("해당 전용면적", f'{last["area_m2"]}㎡'),
             ("㎡당 거래가격", fmt_price(round(unit)))]
    if c["built_year"]:
        cells.append(("준공연도", f'{c["built_year"]}년'))
    if c["households"]:
        cells.append(("세대수", f'{c["households"]:,}세대'))
    cells.append(("데이터 갱신일", esc(as_of_date)))
    kv = "".join(f'<div><div class="k">{k}</div><div class="v">{v}</div></div>' for k, v in cells)
    return f'<div class="sumcard">{sent}<div class="kv">{kv}</div></div>\n'


def deals_table(c):
    """B. 최근 실거래 내역 — 거래일 내림차순, 면적별 그룹."""
    rows = sorted(c["deals"] + c["canceled"],
                  key=lambda d: (round(d["area_m2"], 1), d["date"]), reverse=False)
    by = defaultdict(list)
    for d in rows:
        by[round(d["area_m2"], 1)].append(d)
    out = []
    for area in sorted(by):
        ds = sorted(by[area], key=lambda d: d["date"], reverse=True)
        pyeong = ds[0].get("pyeong") or round(area / 3.3058)
        out.append(f'<h3>전용 {area}㎡ ({pyeong}평) · {len(ds)}건</h3>')
        trs = []
        for d in ds:
            cls = ' class="cancel"' if d.get("canceled") else ""
            mark = ' <span class="badge">해제</span>' if d.get("canceled") else ""
            trs.append(f'<tr{cls}><td>{esc(d["date"])}{mark}</td>'
                       f'<td><strong>{fmt_price(d["price"])}</strong></td>'
                       f'<td>{d.get("floor") or "-"}층</td>'
                       f'<td>{fmt_price(round(d["price"] / d["area_m2"]))}</td></tr>')
        out.append('<div class="table-wrap"><table><thead><tr>'
                   '<th>거래일</th><th>거래금액</th><th>층</th><th>㎡당</th>'
                   '</tr></thead><tbody>' + "".join(trs) + '</tbody></table></div>')
    note = ('<p class="note">‘해제’ 표시는 국토교통부에 거래 해제(취소)로 신고된 건으로, '
            '이 페이지의 모든 평균·집계에서 제외했습니다.</p>') if c["canceled"] else ""
    return "".join(out) + note


def area_table(c):
    """C. 면적별 요약."""
    trs = []
    for r in area_summary(c):
        trs.append(f'<tr><td>{r["area"]}㎡ <span class="muted">({r["pyeong"]}평)</span></td>'
                   f'<td><strong>{fmt_price(r["last_price"])}</strong></td>'
                   f'<td>{esc(r["last_date"])}</td><td>{r["n"]}건</td>'
                   f'<td>{fmt_price(round(r["avg_unit"]))}</td></tr>')
    return ('<div class="table-wrap"><table><thead><tr><th>전용면적</th><th>최근 거래가격</th>'
            f'<th>최근 거래일</th><th>최근 {_ACTUAL_MONTHS}개월 거래</th><th>㎡당 평균</th>'
            '</tr></thead><tbody>' + "".join(trs) + '</tbody></table></div>\n'
            '<p class="note">㎡당 평균은 해당 면적 유형의 <strong>거래별 ㎡당 단가를 단순 산술평균</strong>한 '
            '값입니다(거래금액 가중평균이 아닙니다). 표본이 적은 면적은 한두 건에 크게 흔들립니다.</p>\n')


def quarter_chart(c):
    """D. 분기별 ㎡당 거래가격. 4개 분기 미만이면 표시하지 않는다(보간·예측 없음)."""
    qs = quarterly(c)
    if len(qs) < MIN_QUARTERS_FOR_CHART:
        return (f'<p class="note">유효 거래가 있는 분기가 {len(qs)}개뿐이라 추이 차트를 표시하지 않습니다. '
                f'{MIN_QUARTERS_FOR_CHART}개 분기 이상 쌓이면 자동으로 나타납니다. '
                '없는 구간을 추정하거나 보간하지 않습니다.</p>\n')
    w, h, pad = 640, 200, 34
    lo, hi = min(q["avg"] for q in qs), max(q["avg"] for q in qs)
    span = (hi - lo) or 1
    step = (w - pad * 2) / max(len(qs) - 1, 1)
    pts, dots, labels = [], [], []
    for i, q in enumerate(qs):
        x = pad + i * step
        y = h - pad - (q["avg"] - lo) / span * (h - pad * 2)
        pts.append(f"{x:.1f},{y:.1f}")
        dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.5" fill="#0f4c81"/>')
        labels.append(f'<text x="{x:.1f}" y="{h - 10}" font-size="11" fill="#5b6b7b" '
                      f'text-anchor="middle">{q["q"]} (n={q["n"]})</text>')
        labels.append(f'<text x="{x:.1f}" y="{y - 9:.1f}" font-size="11" fill="#1c2733" '
                      f'text-anchor="middle">{fmt_price(round(q["avg"]))}</text>')
    return ('<div class="chart">'
            f'<svg viewBox="0 0 {w} {h}" width="100%" height="{h}" role="img" '
            f'aria-label="분기별 ㎡당 거래가격 추이">'
            f'<polyline fill="none" stroke="#0f4c81" stroke-width="2" points="{" ".join(pts)}"/>'
            + "".join(dots) + "".join(labels) + '</svg></div>\n'
            '<p class="note">유효 거래가 있는 분기만 표시하며, n은 해당 분기 거래 건수입니다. '
            '결측 분기를 보간하거나 예측·평활화하지 않습니다.</p>\n')


def calc_block(c):
    """E. 구매비용 계산 — 최근 실거래가를 그대로 계산기에 전달."""
    last = c["last"]
    cards = "".join(
        f'<a class="cta" href="{esc(calc_url(p, c, last["price"], last["area_m2"]))}" '
        f'data-apt-calc="{esc(p)}"><span class="t">{esc(t)} →</span>'
        f'<span class="d">{esc(d)}</span></a>'
        for p, t, d in CALCS)
    return (f'<p class="lead">아래 계산기에는 이 단지의 최근 실거래가 '
            f'<strong>{fmt_price(last["price"])}</strong>(전용 {last["area_m2"]}㎡)가 미리 입력됩니다. '
            '주택 수·조정대상지역·소득 등 나머지 조건은 직접 확인하고 조정하세요.</p>\n'
            f'<div class="cta-grid">{cards}</div>\n')


def links_block(c, hub_url, siblings):
    """F. 내부 링크. 좌표 데이터가 없으므로 '인근'이라 하지 않고 '같은 지역의 주요 단지'로 쓴다."""
    sib = "".join(
        f'<li><a href="{esc(u)}">{esc(n)}</a> <span class="muted">· 최근 {_ACTUAL_MONTHS}개월 {k}건</span></li>'
        for n, u, k in siblings)
    sib_html = (f'<h3>같은 지역의 주요 단지 (거래량 상위)</h3><ul class="linklist">{sib}</ul>'
                if sib else "")
    return (f'<p><a href="{esc(hub_url)}">← {esc(c["region_key"])} 전체 단지 실거래</a></p>\n'
            + sib_html +
            '<h3>매수 단계 가이드</h3><ul class="linklist">'
            '<li><a href="/posts/funding-plan.html">자금계획 세우기</a></li>'
            '<li><a href="/posts/sale-contract-tips.html">매매계약서 확인 사항</a></li>'
            '<li><a href="/posts/registry-reading.html">등기부등본 보는 법</a></li>'
            '<li><a href="/checklists/sale-balance-day.html">계약·잔금일 체크리스트</a></li>'
            '</ul>\n')


def source_block(c, as_of_date, window_from):
    kapt = ('<p>세대수·준공연도는 공동주택관리정보시스템(K-apt) 공동주택 기본정보를 사용했습니다.</p>'
            if (c["households"] or c["built_year"]) else "")
    return ('<h2>출처와 주의사항</h2>\n'
            f'<p class="note">국토교통부 아파트 매매 실거래가 공개자료를 기준으로 제공하며, '
            f'신고 정정·해제 또는 데이터 갱신 시 실제 내용과 달라질 수 있습니다.<br>'
            f'집계 구간: {esc(window_from)} ~ {esc(as_of_date)} · '
            f'데이터 기준일: {esc(as_of_date)}</p>\n'
            + kapt)


def ld_json(c, url, hub_url, as_of_date, window_from):
    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "아파트 실거래가", "item": f"{BASE}/apt/"},
            {"@type": "ListItem", "position": 2, "name": c["region_key"], "item": hub_url},
            {"@type": "ListItem", "position": 3, "name": c["name"], "item": url},
        ],
    }
    dataset = {
        "@context": "https://schema.org", "@type": "Dataset",
        "name": f'{c["name"]} 아파트 매매 실거래 내역',
        "description": (f'{c["region_key"]} {c["umd"]} {c["name"]}의 최근 {_ACTUAL_MONTHS}개월 '
                        f'아파트 매매 실거래 {c["n"]}건(전용면적·거래일·거래금액·층).'),
        "url": url,
        "creator": {"@type": "GovernmentOrganization", "name": "국토교통부",
                    "url": "https://rt.molit.go.kr/"},
        "temporalCoverage": f"{window_from}/{as_of_date}",
        "dateModified": as_of_date,
        "isAccessibleForFree": True,
        "license": "https://www.kogl.or.kr/info/license.do",
        "variableMeasured": ["거래일", "거래금액", "전용면적", "층"],
    }
    return ("".join(f'<script type="application/ld+json">'
                    f'{json.dumps(o, ensure_ascii=False)}</script>\n'
                    for o in (crumbs, dataset)))


def complex_page(c, region_slug, cslug, siblings, as_of_date, window_from):
    url = f"{BASE}/apt/{region_slug}/{cslug}/"
    hub_url = f"{BASE}/apt/{region_slug}/"
    sigungu = c["region_key"].split()[-1]
    title = f'{c["name"]} 실거래가·취득세 계산 | {sigungu} — 톺다'
    last = c["last"]
    desc = (f'{c["name"]}의 최근 실거래가({last["date"]} 전용 {last["area_m2"]}㎡ '
            f'{fmt_price(last["price"])})와 전용면적별 거래 내역을 확인하고, '
            '해당 거래가격 기준 취득세·잔금·대출한도를 계산할 수 있습니다.')
    body = (
        '<div class="wrap">\n<header><a href="/index.html">톺다</a></header>\n'
        f'<nav class="crumb"><a href="/apt/">아파트 실거래</a> › '
        f'<a href="/apt/{region_slug}/">{esc(c["region_key"])}</a> › {esc(c["name"])}</nav>\n'
        f'<h1>{esc(c["name"])} 실거래가</h1>\n'
        + summary_block(c, as_of_date)
        + f'<h2>최근 {_ACTUAL_MONTHS}개월 실거래 내역</h2>\n' + deals_table(c)
        + '<h2>면적별 요약</h2>\n' + area_table(c)
        + '<h2>분기별 ㎡당 가격 추이</h2>\n' + quarter_chart(c)
        + '<h2>이 가격으로 구매비용 계산하기</h2>\n' + calc_block(c)
        + '<h2>함께 보기</h2>\n' + links_block(c, f"/apt/{region_slug}/", siblings)
        + source_block(c, as_of_date, window_from)
        + ld_json(c, url, hub_url, as_of_date, window_from)
    )
    return (head(title, desc, url, c["region_key"], c["name"])
            + body + BAP.footer_html(as_of_date))


# ────────────────────────────────────────────────────────────── sitemap

# 이 스크립트는 슬러그 URL(/apt/{something}/...)만 관리한다.
# 한글 지역 URL(/apt/*.html)과 /apt/ 색인은 build_apt_pages.py 소관 — 정규식이 겹치지 않게 한다.
SLUG_URL_RE = re.compile(
    r"  <url>\s*<loc>" + re.escape(BASE) + r"/apt/[a-z0-9][^<]*/</loc>.*?</url>\n", re.S)


def update_sitemap(entries):
    try:
        with open(SITEMAP, encoding="utf-8") as f:
            xml = f.read()
    except FileNotFoundError:
        xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n')
    xml = SLUG_URL_RE.sub("", xml)
    add = "".join(
        f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{lastmod}</lastmod>\n"
        f"    <priority>{pri}</priority>\n  </url>\n"
        for loc, lastmod, pri in entries)
    xml = xml.replace("</urlset>", add + "</urlset>")
    xml, dropped = dedupe_locs(xml)
    if dropped:
        print(f"[sitemap] 중복 <loc> {dropped}건 제거")
    with open(SITEMAP, "w", encoding="utf-8") as f:
        f.write(xml)


def dedupe_locs(xml):
    """같은 <loc>이 두 번 이상 실린 <url> 블록에서 첫 번째만 남긴다.

    sitemap.xml은 여러 생성기(i18n·지역·단지)가 나눠 쓰는 공유 파일이라 서로 다른
    스크립트가 같은 URL을 추가하면 중복이 남는다(현재 i18n 허브 9건). 이 스크립트가
    파이프라인의 마지막 sitemap 기록자이므로 여기서 정규화한다.
    """
    seen, out, dropped = set(), [], 0
    pos = 0
    for m in re.finditer(r"  <url>.*?</url>\n", xml, re.S):
        loc = re.search(r"<loc>([^<]+)</loc>", m.group(0))
        out.append(xml[pos:m.start()])
        if loc and loc.group(1) in seen:
            dropped += 1
        else:
            if loc:
                seen.add(loc.group(1))
            out.append(m.group(0))
        pos = m.end()
    out.append(xml[pos:])
    return "".join(out), dropped


# ────────────────────────────────────────────────────────────── main

def counts_report(cands):
    print("조건별 예상 페이지 수 (현재 보유 데이터 기준)")
    for nd in (3, 5):
        for nh in (100, 300):
            n = sum(1 for c in cands
                    if c["n"] >= nd and (c["households"] or 0) >= nh
                    and c["last"].get("price"))
            print(f"  최근 {_ACTUAL_MONTHS}개월 {nd}건 이상 · {nh}세대 이상 → {n:,}개")
    known = sum(1 for c in cands if c["households"])
    print(f"  (참고) 집계 단지 {len(cands):,}개 중 세대수 확보 {known:,}개 "
          f"— 세대수 미확보 단지는 위 숫자에서 전부 탈락합니다")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="기준 통과 전체 생성")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--count", action="store_true", help="생성 없이 조건별 페이지 수만 출력")
    args = ap.parse_args()

    tx = L.load_json(os.path.join(L.SITE_ASSETS, "transactions.json"), default={}) or {}
    deals = tx.get("deals", [])
    if not deals:
        print("transactions.json 비어 있음 — 생성 생략")
        return
    hh_map = (L.load_json(os.path.join(L.SITE_ASSETS, "households.json"), default={}) or {}).get("map", {})

    today = dt.date.today()
    since = window_start(today)
    as_of_date = max(d.get("date", "") for d in deals)
    actual_from = min(d.get("date", "") for d in deals if d.get("date", "") >= since)
    # 화면 문구의 '최근 N개월' — 실제 보유 구간에서 계산한다(수집 창을 그대로 쓰지 않는다).
    global _ACTUAL_MONTHS
    _ACTUAL_MONTHS = min(
        WINDOW_MONTHS,
        (int(as_of_date[:4]) - int(actual_from[:4])) * 12
        + int(as_of_date[5:7]) - int(actual_from[5:7]) + 1)
    cands = aggregate(deals, hh_map, since)
    if args.count:
        counts_report(cands)
        return

    pool = [c for c in cands if eligible(c)]
    pool.sort(key=lambda c: (c["region_key"], c["name"]))   # 결정적 순서 = 슬러그 선점 순서 고정
    if args.all:
        targets = pool
    elif args.limit:
        targets = pool[:args.limit]
    else:
        targets = select_sample(pool)
    if not targets:
        print("생성 기준을 통과한 단지 없음")
        return

    smap = SL.SlugMap()
    # 같은 시군구 거래량 상위 단지(내부 링크용) — 기준 통과 단지 중에서만 고른다.
    by_region = defaultdict(list)
    for c in pool:
        by_region[c["region_key"]].append(c)
    for v in by_region.values():
        v.sort(key=lambda c: (-c["n"], c["name"]))

    target_keys = {(c["region_key"], c["umd"], c["name"]) for c in targets}
    made, entries = [], []
    hubs = defaultdict(list)

    for c in targets:
        rslug, cslug = smap.complex(c["region_key"], c["umd"], c["name"])
        sibs = []
        for o in by_region[c["region_key"]]:
            if (o["region_key"], o["umd"], o["name"]) == (c["region_key"], c["umd"], c["name"]):
                continue
            if (o["region_key"], o["umd"], o["name"]) not in target_keys:
                continue   # 아직 페이지가 없는 단지로는 링크하지 않는다(깨진 링크 방지)
            ors, ocs = smap.complex(o["region_key"], o["umd"], o["name"])
            sibs.append((o["name"], f"/apt/{ors}/{ocs}/", o["n"]))
            if len(sibs) >= 5:
                break
        d = os.path.join(APT_DIR, rslug, cslug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(complex_page(c, rslug, cslug, sibs, as_of_date, actual_from))
        url = f"{BASE}/apt/{rslug}/{cslug}/"
        entries.append((url, as_of_date, "0.7"))
        made.append((c["region_key"], c["name"], url, c["n"], c["households"]))
        hubs[c["region_key"]].append((c, cslug))

    # 지역 허브(슬러그 URL 정식판) — 기존 한글 지역 페이지와 같은 표를 쓰되 단지 페이지로 링크한다.
    apts = (L.load_json(os.path.join(L.SITE_ASSETS, "apartments.json"), default={}) or {}).get("apartments", [])
    market = (L.load_json(os.path.join(L.SITE_ASSETS, "market.json"), default={}) or {}).get("regions", [])
    region_rows = BAP.build_region_rows(deals, apts, hh_map)
    hub_as_of = as_of_date[:7]
    for rk, items in hubs.items():
        rslug = smap.region(rk)
        curls = {c["name"]: f"/apt/{rslug}/{cs}/" for c, cs in items}
        rows = region_rows.get(rk, [])
        os.makedirs(os.path.join(APT_DIR, rslug), exist_ok=True)
        with open(os.path.join(APT_DIR, rslug, "index.html"), "w", encoding="utf-8") as f:
            f.write(BAP.region_page(rk, rows, hub_as_of, BAP.market_summary(rk, market),
                                    canonical=f"{BASE}/apt/{rslug}/", complex_urls=curls))
        entries.append((f"{BASE}/apt/{rslug}/", as_of_date, "0.7"))

    # 허브가 생긴 지역은 한글 URL의 canonical을 허브로 옮긴다(기존 URL은 삭제하지 않음).
    smap.data["_meta"]["hubs"] = sorted(set(list(hubs)) | set(smap.data["_meta"].get("hubs") or []))
    smap.save(force=True)

    update_sitemap(sorted(set(entries)))
    print(f"[ok] 단지 페이지 {len(made)}개 · 지역 허브 {len(hubs)}개 · sitemap {len(entries)}개 URL")
    for rk, name, url, n, hh in made:
        print(f"   · {rk:16} {name[:20]:22} 거래{n:3}건 세대{hh or '-':>6} {url}")
    print("→ 한글 지역 URL의 canonical 이전은 build_apt_pages.py 재실행 시 반영됩니다.")


if __name__ == "__main__":
    sys.exit(main())
