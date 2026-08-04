#!/usr/bin/env python3
"""지역별 정적 단지 시세 페이지 생성 → site/apt/*.html + sitemap-all.xml 갱신

왜 필요한가: 단지 정보(실거래·세대수·추세)가 전부 JS fetch로 렌더링돼 정적 HTML에는
단지명 텍스트 자체가 없었다. 구글은 JS를 렌더링하지만 네이버(Yeti)는 제한적이라
"왕십리자이 실거래" 같은 검색에 사이트가 아예 잡히지 않았다(2026-07 민원).

생성물:
  site/apt/index.html            — 전 지역 색인
  site/apt/{지역-slug}.html      — 지역별 단지 표(단지명·준공·세대수·최근 실거래·㎡당 추세)
  sitemap-all.xml                — /apt/ 항목 재생성(다른 항목 보존)

원칙(CLAUDE.md): 단일 HTML(CSS 인라인)·클라이언트 저장 없음·모바일 360px·출처/면책 하단 고정.
가격 추세는 월별 ㎡당가 평균 기준 — 평형 혼합 왜곡 방지(왕십리자이 상승가치 민원과 동일 원인).
"""
import datetime as dt
import html
import json
import os
import re
import urllib.parse
from collections import defaultdict

import lib_pdata as L

SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site"))
APT_DIR = os.path.join(SITE, "apt")
# 생성기들은 평면 목록(sitemap-all.xml)에 쓴다. 공개용 sitemap.xml은 build_sitemaps.py가
# 이 목록을 분류별로 쪼개 만드는 sitemap index다.
SITEMAP = os.path.join(SITE, "sitemap-all.xml")
BASE = "https://topda.kr"

MIN_DEALS = 2   # 표본 1건짜리 단지는 추세·가격 신뢰도가 낮아 표 하단으로만 노출


def esc(s):
    return html.escape(str(s), quote=True)


def slug(region_key):
    """'서울 성동구' → '서울-성동구' (한글 URL — 국내 검색엔진 정상 처리)."""
    return region_key.replace(" ", "-")


def fmt_price(manwon):
    """만원 → '19억 3,500만' 표기."""
    eok, man = divmod(int(manwon), 10000)
    if eok and man:
        return f"{eok}억 {man:,}만"
    if eok:
        return f"{eok}억"
    return f"{man:,}만원"


def load():
    tx = L.load_json(os.path.join(L.SITE_ASSETS, "transactions.json"), default={}) or {}
    apts = (L.load_json(os.path.join(L.SITE_ASSETS, "apartments.json"), default={}) or {}).get("apartments", [])
    hh = ((L.load_json(os.path.join(L.SITE_ASSETS, "households.json"), default={}) or {}).get("map", {}))
    market = (L.load_json(os.path.join(L.SITE_ASSETS, "market.json"), default={}) or {}).get("regions", [])
    return tx.get("deals", []), apts, hh, market


# 광역시 공통 구명 — R-ONE 지역 목록은 시도 없이 평면이라 어느 광역시인지 특정 불가.
AMBIGUOUS_GU = {"중구", "동구", "서구", "남구", "북구", "강서구"}


def market_summary(region_key, market):
    """R-ONE(market.json)에서 지역 매칭 → {sale_yoy, jeonse_yoy, jeonse_ratio, month, matched}."""
    by_name = {r.get("key"): r for r in market if r.get("series")}
    parts = region_key.split()
    hit = None
    for p in reversed(parts[1:]):
        if p in by_name and p not in AMBIGUOUS_GU:
            hit = by_name[p]
            break
    if hit is None and parts[0] in by_name:
        hit = by_name[parts[0]]
    if hit is None:
        return None
    series = hit["series"]
    last = series[-1]
    base = series[-13] if len(series) >= 13 else series[0]

    def yoy(f):
        a, b = last.get(f), base.get(f)
        if a and b:
            return (a / b - 1) * 100
        return None

    return {
        "sale_yoy": yoy("sale_index"), "jeonse_yoy": yoy("jeonse_index"),
        "jeonse_ratio": last.get("jeonse_ratio"), "month": last.get("month"),
        "matched": hit.get("key"), "n_months": min(len(series) - 1, 12),
    }


def build_region_rows(deals, apts, hh_map):
    """{region_key: [row, ...]} — row: 단지별 집계 dict."""
    apt_info = {(a.get("region_key"), a.get("name")): a for a in apts}
    grouped = defaultdict(lambda: defaultdict(list))
    for d in deals:
        rk, name = d.get("region_key"), d.get("apt")
        if rk and name and d.get("price") and d.get("area_m2"):
            grouped[rk][name].append(d)

    out = {}
    for rk, by_apt in grouped.items():
        rows = []
        for name, ds in by_apt.items():
            ds.sort(key=lambda x: x["date"])
            last = ds[-1]
            cur = apt_info.get((rk, name), {})
            extra = hh_map.get(f"{rk}|{name}", {})
            households = cur.get("households") or extra.get("households")
            built = cur.get("built_year") or extra.get("built_year") or last.get("build_year")
            # 월별 ㎡당가 평균 → 첫달 대비 마지막달 변화율 (평형 혼합 왜곡 방지)
            months = defaultdict(list)
            for d in ds:
                months[d["date"][:7]].append(d["price"] / d["area_m2"])
            series = [sum(v) / len(v) for _, v in sorted(months.items())]
            trend = None
            if len(series) >= 2 and series[0] > 0:
                trend = (series[-1] / series[0] - 1) * 100
            rows.append({
                "name": name, "n": len(ds), "built": built, "households": households,
                "last_date": last["date"], "last_area": last["area_m2"],
                "last_pyeong": last.get("pyeong") or round(last["area_m2"] / 3.3058),
                "last_price": last["price"], "trend": trend, "trend_months": len(series),
            })
        rows.sort(key=lambda r: (-r["n"], r["name"]))
        out[rk] = rows
    return out


STYLE = """
:root{--ink:#1c2733;--sub:#5b6b7b;--line:#e3e9ef;--bg:#f7f9fb;--pos:#c62828;--neg:#1565c0;--brand:#0f4c81}
*{box-sizing:border-box}body{margin:0;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:var(--ink);background:#fff;line-height:1.6}
.wrap{max-width:860px;margin:0 auto;padding:16px}
header a{color:var(--brand);text-decoration:none;font-weight:700}
nav.crumb{font-size:13px;color:var(--sub);margin:8px 0}
nav.crumb a{color:var(--sub)}
h1{font-size:22px;margin:10px 0 4px}
.lead{color:var(--sub);font-size:14px;margin:0 0 14px}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:560px}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
td.name{white-space:normal;word-break:break-all;font-weight:600}
th{background:var(--bg);font-size:12.5px;color:var(--sub)}
tr:last-child td{border-bottom:0}
.up{color:var(--pos);font-weight:700}.down{color:var(--neg);font-weight:700}.flat{color:var(--sub)}
.muted{color:var(--sub)}
a.deep{font-size:12px;color:var(--brand);text-decoration:none}
.note{font-size:12.5px;color:var(--sub);margin:14px 0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:0 0 14px}
.stat{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--bg)}
.stat .k{font-size:12px;color:var(--sub)}
.stat .v{font-size:17px;font-weight:700;margin-top:2px}
footer{margin:24px 0 16px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--sub)}
ul.idx{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
ul.idx a{display:block;padding:8px 10px;border:1px solid var(--line);border-radius:8px;color:var(--ink);text-decoration:none;font-size:14px}
@media(max-width:420px){h1{font-size:19px}th,td{padding:7px 8px}}
"""


def page_head(title, desc, canonical):
    # 파비콘과 OG 이미지는 쓰임새가 달라 크기도 다르다. 파비콘은 16~32px 자리라
    # 688KB 원본을 물리면 모든 페이지가 그만큼을 헛으로 받는다(2026-08-02 실측에서
    # 가장 느린 리소스였다). OG 카드는 크롤러가 받는 큰 그림이라 원본을 그대로 둔다.
    favicon = BASE + "/assets/images/brand/logo-32.png"
    logo = BASE + "/assets/images/brand/logo.png"
    return (
        '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="utf-8" />\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1" />\n'
        f'<title>{esc(title)}</title>\n'
        f'<meta name="description" content="{esc(desc)}" />\n'
        f'<link rel="icon" href="{esc(favicon)}" type="image/png" />\n'
        f'<link rel="canonical" href="{esc(canonical)}" />\n'
        f'<meta property="og:title" content="{esc(title)}" />\n'
        f'<meta property="og:description" content="{esc(desc)}" />\n'
        f'<meta property="og:url" content="{esc(canonical)}" />\n'
        f'<meta property="og:image" content="{esc(logo)}" />\n'
        '<meta property="og:type" content="website" />\n'
        f'<style>{STYLE}</style>\n</head>\n<body>\n'
    )


def footer_html(as_of):
    return (
        '<footer>\n'
        # 지역 페이지는 한 표에 여러 단지가 섞여 출처가 단지마다 다르다 — 둘 다 적는다.
        # (K-apt는 의무관리대상만 수록해 나머지는 건축물대장으로 채운다.)
        f'<p>기준: 국토교통부 아파트 매매 실거래가 OpenAPI · 세대수/준공: K-apt 공동주택 기본정보'
        f'·국토교통부 건축HUB 건축물대장정보 · {esc(as_of)} 자동 갱신</p>\n'
        '<p>본 페이지는 일반 정보 제공용입니다. 실거래가는 신고 기준이며 정정·취소로 달라질 수 있습니다. '
        '거래 판단의 근거로 사용하기 전 원자료를 확인하세요.</p>\n'
        '<p><a href="/index.html">톺다 홈</a> · <a href="/calculators/search.html">맞춤 단지 검색</a> · '
        '<a href="/market.html">지역 시세 대시보드</a></p>\n'
        '</footer>\n</div>\n</body>\n</html>\n'
    )


def trend_html(r):
    if r["trend"] is None:
        return '<span class="muted">—</span>'
    t = r["trend"]
    cls = "up" if t >= 1 else ("down" if t <= -1 else "flat")
    sign = "+" if t > 0 else ""
    return f'<span class="{cls}">{sign}{t:.1f}%</span> <span class="muted">({r["trend_months"]}개월)</span>'


def summary_html(rk, ms):
    """R-ONE 지수 요약 카드 + 한 줄 해설(검색엔진에 잡히는 지역 시황 텍스트)."""
    if not ms:
        return ""

    def pct(v):
        if v is None:
            return '<span class="muted">—</span>'
        cls = "up" if v >= 0.05 else ("down" if v <= -0.05 else "flat")
        return f'<span class="{cls}">{"+" if v > 0 else ""}{v:.1f}%</span>'

    ratio = f'{ms["jeonse_ratio"]:.1f}%' if ms.get("jeonse_ratio") else "—"
    scope = "" if ms["matched"] in rk else f' <span class="muted">({esc(ms["matched"])} 기준)</span>'
    cards = (
        '<div class="stats">'
        f'<div class="stat"><div class="k">매매가격지수 {ms["n_months"]}개월</div><div class="v">{pct(ms["sale_yoy"])}</div></div>'
        f'<div class="stat"><div class="k">전세가격지수 {ms["n_months"]}개월</div><div class="v">{pct(ms["jeonse_yoy"])}</div></div>'
        f'<div class="stat"><div class="k">전세가율</div><div class="v">{ratio}{scope}</div></div>'
        '</div>'
    )
    # 카드에 이미 세 숫자가 다 있다. 바로 아래 문장에서 같은 수치를 다시 읽어 주면
    # 화면이 두 번 같은 말을 한다(감사 8번). 문장은 방향과 출처·기준월, 그리고
    # 지수의 한계만 말하고 숫자 반복은 하지 않는다.
    trend = ""
    if ms["sale_yoy"] is not None:
        trend = ("올랐습니다" if ms["sale_yoy"] > 0.05
                 else ("내렸습니다" if ms["sale_yoy"] < -0.05 else "거의 움직이지 않았습니다"))
        trend = f'최근 {ms["n_months"]}개월간 {esc(rk)} 아파트 매매가격지수는 {trend}. '
    prose = (f'<p class="lead">{trend}'
             f'위 지수는 한국부동산원 R-ONE 자료(<span class="muted">{esc(ms["month"] or "")} 기준</span>)이며 '
             f'지역 평균이라, 아래 표의 개별 단지 실거래가와는 다르게 움직일 수 있습니다.</p>\n')
    return cards + prose


def region_page(rk, rows, as_of, ms=None, canonical=None, complex_urls=None):
    """지역 단지 표 페이지.

    canonical    None이면 자기 자신(한글 URL). 슬러그 허브로 색인을 이전한 지역은
                 build_complex_pages.py가 허브 URL을 넘겨 준다.
    complex_urls {단지명: 단지 페이지 경로} — 있으면 '상세→'가 단지 페이지를 가리킨다.
    """
    url = f"{BASE}/apt/{urllib.parse.quote(slug(rk))}.html"
    canonical = canonical or url
    complex_urls = complex_urls or {}
    top = [r["name"] for r in rows[:5]]
    title = f"{rk} 아파트 실거래가·세대수·시세 추이 — 톺다"
    desc = (f"{rk} 아파트 단지별 최근 실거래가, 세대수, ㎡당 가격 추이 ({as_of} 기준). "
            + ", ".join(top[:4]) + " 등 " + str(len(rows)) + "개 단지.")
    main_rows = [r for r in rows if r["n"] >= MIN_DEALS]
    thin_rows = [r for r in rows if r["n"] < MIN_DEALS]

    def tr(r):
        anchor = esc(r["name"])
        hh = f'{r["households"]:,}세대' if r["households"] else '<span class="muted">—</span>'
        built = r["built"] or '<span class="muted">—</span>'
        q = urllib.parse.quote(r["name"])
        # 단지 페이지가 있으면 그쪽으로(실거래 상세 + 계산기 동선), 없으면 기존 맞춤검색으로.
        deep = complex_urls.get(r["name"]) or f"/calculators/search.html?apt={q}"
        return (
            f'<tr id="{anchor}"><td class="name">{esc(r["name"])} '
            f'<a class="deep" href="{esc(deep)}">상세→</a></td>'
            f'<td>{built}</td><td>{hh}</td>'
            f'<td>{esc(r["last_date"])} · {r["last_pyeong"]}평 · <strong>{fmt_price(r["last_price"])}</strong></td>'
            f'<td>{trend_html(r)}</td><td>{r["n"]}건</td></tr>'
        )

    table = (
        '<div class="table-wrap"><table>\n'
        '<thead><tr><th>단지</th><th>준공</th><th>세대수</th><th>최근 실거래</th><th>㎡당가 추이</th><th>거래</th></tr></thead>\n'
        '<tbody>\n' + "\n".join(tr(r) for r in main_rows + thin_rows) + '\n</tbody></table></div>\n'
    )

    ld = json.dumps({
        "@context": "https://schema.org", "@type": "ItemList",
        "name": f"{rk} 아파트 단지 실거래 목록",
        "numberOfItems": len(rows),
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": r["name"],
             "url": complex_urls.get(r["name"]) and BASE + complex_urls[r["name"]]
                    or f"{canonical}#{urllib.parse.quote(r['name'])}"}
            for i, r in enumerate(rows[:30])
        ],
    }, ensure_ascii=False)

    body = (
        '<div class="wrap">\n'
        '<header><a href="/index.html">톺다</a></header>\n'
        f'<nav class="crumb"><a href="/apt/">아파트 실거래 지역별</a> › {esc(rk)}</nav>\n'
        f'<h1>{esc(rk)} 아파트 실거래가·세대수</h1>\n'
        f'<p class="lead">국토교통부 실거래 신고 기준 {len(rows)}개 단지 · {esc(as_of)} 갱신. '
        '추이는 월별 ㎡당 평균가 기준으로, 어느 평형이 거래됐는지에 따른 왜곡을 제거한 값입니다.</p>\n'
        + summary_html(rk, ms)
        + table +
        ('<p class="note">표 하단 거래 1건 단지는 표본이 적어 추이를 표시하지 않습니다.</p>\n' if thin_rows else '')
        + f'<script type="application/ld+json">{ld}</script>\n'
    )
    return page_head(title, desc, canonical) + body + footer_html(as_of)


def index_page(region_rows, as_of, hubs=None):
    hubs = hubs or {}
    url = f"{BASE}/apt/"
    title = "아파트 실거래가·세대수 지역별 — 톺다"
    n_apt = sum(len(v) for v in region_rows.values())
    desc = f"전국 {len(region_rows)}개 지역 {n_apt:,}개 아파트 단지의 최근 실거래가·세대수·㎡당 추이 ({as_of} 기준)."
    links = "\n".join(
        '<li><a href="{}">{} <span class="muted">({})</span></a></li>'.format(
            esc(hubs[rk][len(BASE):] if rk in hubs
                else f"/apt/{urllib.parse.quote(slug(rk))}.html"),
            esc(rk), len(rows))
        for rk, rows in sorted(region_rows.items())
    )
    body = (
        '<div class="wrap">\n<header><a href="/index.html">톺다</a></header>\n'
        f'<h1>아파트 실거래가·세대수 — 지역별</h1>\n'
        f'<p class="lead">최근 4개월 실거래 기준 · {esc(as_of)} 자동 갱신 · 지역을 선택하세요.</p>\n'
        f'<ul class="idx">\n{links}\n</ul>\n'
    )
    return page_head(title, desc, url) + body + footer_html(as_of)


def update_sitemap(region_rows, today, skip=()):
    """sitemap-all.xml에서 한글 지역 URL(/apt/*.html)과 /apt/ 색인만 재생성(다른 항목 보존).

    슬러그 URL(/apt/{slug}/...)은 build_complex_pages.py 소관이라 정규식이 겹치지 않게
    `.html`로 끝나는 항목과 `/apt/` 자신만 지운다. skip에 든 지역은 canonical을 슬러그
    허브로 넘겼으므로 sitemap에서 제외한다(정식 URL만 싣는다).
    """
    try:
        with open(SITEMAP, encoding="utf-8") as f:
            xml = f.read()
    except FileNotFoundError:
        xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n')
    # 기존 한글 지역 항목 + /apt/ 색인만 제거
    xml = re.sub(r"  <url>\s*<loc>" + re.escape(BASE) + r"/apt/(?:[^<]*\.html)?</loc>.*?</url>\n",
                 "", xml, flags=re.S)
    entries = [f"  <url>\n    <loc>{BASE}/apt/</loc>\n    <lastmod>{today}</lastmod>\n    <priority>0.7</priority>\n  </url>\n"]
    for rk in sorted(region_rows):
        if rk in skip:
            continue
        loc = f"{BASE}/apt/{urllib.parse.quote(slug(rk))}.html"
        entries.append(f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{today}</lastmod>\n    <priority>0.7</priority>\n  </url>\n")
    xml = xml.replace("</urlset>", "".join(entries) + "</urlset>")
    with open(SITEMAP, "w", encoding="utf-8") as f:
        f.write(xml)


def migrated_hubs():
    """슬러그 허브로 색인을 이전한 지역 → {region_key: hub_url}.
    data/slug-map.json의 _meta.hubs를 읽는다(build_complex_pages.py가 기록)."""
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "slug-map.json"))
    m = L.load_json(path, default=None) or {}
    regions = m.get("regions") or {}
    out = {}
    for rk in (m.get("_meta", {}).get("hubs") or []):
        rec = regions.get(rk)
        if rec and rec.get("slug"):
            out[rk] = f"{BASE}/apt/{rec['slug']}/"
    return out


def main():
    deals, apts, hh_map, market = load()
    if not deals:
        print("transactions.json 비어 있음 — 페이지 생성 생략")
        return
    region_rows = build_region_rows(deals, apts, hh_map)
    if not region_rows:
        print("지역별 집계 없음 — 생성 생략")
        return
    as_of = max(d.get("date", "") for d in deals)[:7] or dt.date.today().strftime("%Y-%m")
    os.makedirs(APT_DIR, exist_ok=True)
    hubs = migrated_hubs()
    for rk, rows in region_rows.items():
        path = os.path.join(APT_DIR, f"{slug(rk)}.html")
        with open(path, "w", encoding="utf-8") as f:
            # 허브로 이전한 지역은 canonical만 허브를 가리키고, 페이지 자체는 그대로 둔다
            # (기존 색인·북마크를 살려 두기 위해 즉시 삭제하지 않는다).
            f.write(region_page(rk, rows, as_of, market_summary(rk, market),
                                canonical=hubs.get(rk)))
    with open(os.path.join(APT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_page(region_rows, as_of, hubs))
    update_sitemap(region_rows, dt.date.today().strftime("%Y-%m-%d"), skip=set(hubs))
    n = sum(len(v) for v in region_rows.values())
    print(f"[ok] 지역 페이지 {len(region_rows)}개 + 색인 1개 생성 · 단지 {n:,}개 노출 · "
          f"슬러그 허브 이전 {len(hubs)}개 · sitemap 갱신")


if __name__ == "__main__":
    main()
