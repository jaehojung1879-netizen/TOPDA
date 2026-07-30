#!/usr/bin/env python3
"""톺다 부동산 뉴스 수집기 → site/assets/news.json

구글 뉴스 RSS(한국어)로 섹터별 부동산 기사를 모아
  · 홈 상단 "이번 주 부동산 핵심 이슈"(주간 요약·카드)
  · 홈 하단 "섹터별 부동산 뉴스"(매일 갱신)
두 영역을 채울 JSON을 만든다.

설계 원칙(lib_pdata와 동일):
  - 표준 라이브러리만 사용(urllib/xml). CI에서 pip install 불필요.
  - 키 불필요(공개 RSS). 실패·빈 결과면 기존 news.json을 덮어쓰지 않는다.
  - 네트워크 정책으로 일부 피드가 막혀도, 가능한 섹터만으로 부분 갱신한다.

주의: 일부 격리 환경(에이전트 샌드박스)에서는 news.google.com 접근이 정책상
차단될 수 있다. GitHub Actions 러너에서는 정상 동작한다.
"""
import datetime as dt
import html
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET

# lib_pdata의 안전 저장/요청 유틸 재사용.
sys.path.insert(0, __import__("os").path.dirname(__file__))
from lib_pdata import SITE_ASSETS, _request, load_json, save_json_safe  # noqa: E402
import os  # noqa: E402

NEWS_JSON = os.path.join(SITE_ASSETS, "news.json")
GNEWS = "https://news.google.com/rss/search"

# 섹터별 검색 질의. 홈 하단 "섹터별 뉴스"에 그대로 노출된다.
# 부동산 경기 전반을 읽을 수 있게 주택·임대차·공급·금융·상업용·정책으로 나눈다.
SECTORS = [
    {"key": "housing",    "name": "주택 매매·집값", "query": "아파트 매매 집값 거래량 주택시장"},
    {"key": "rent",       "name": "전세·월세",      "query": "전세 월세 임대차 전세사기"},
    {"key": "supply",     "name": "청약·분양",      "query": "아파트 청약 분양 경쟁률 입주물량"},
    {"key": "loan",       "name": "대출·금융",      "query": "부동산 대출 DSR LTV 금리 규제"},
    {"key": "commercial", "name": "오피스·상업용",  "query": "오피스 상가 상업용부동산 빌딩 공실률 꼬마빌딩"},
    {"key": "policy",     "name": "정책·세제",      "query": "부동산 정책 세제 양도세 종부세 취득세"},
]

# 섹터당 노출 기사 수(가로형 카드) — 핵심만 2~3건.
ITEMS_PER_SECTOR = 3

# 홈 상단 "핵심 이슈" — 섹터별 주간 1위 기사를 뉴스 헤드라인처럼 나열한다.
SITE_INDEX = os.path.join(os.path.dirname(SITE_ASSETS), "index.html")

def _fetch_feed(query, when=None, limit=12):
    """구글 뉴스 RSS 검색 → [{title, url, source, date(datetime)}] (최신순)."""
    q = query + (f" when:{when}" if when else "")
    url = GNEWS + "?" + urllib.parse.urlencode(
        {"q": q, "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
    try:
        xml_text = _request(url, timeout=20)
    except Exception as e:  # noqa: BLE001
        print(f"[warn] 피드 실패({query[:18]}…): {e}")
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"[warn] RSS 파싱 실패({query[:18]}…): {e}")
        return []

    out, seen = [], set()
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        if not title or not link:
            continue
        src_el = it.find("source")
        source = (src_el.text or "").strip() if src_el is not None else ""
        # 구글 뉴스 제목은 "헤드라인 - 언론사" 꼴 → 언론사 꼬리표 제거.
        if source and title.endswith(" - " + source):
            title = title[: -(len(source) + 3)].strip()
        else:
            title = re.sub(r"\s+-\s+[^-]+$", "", title).strip()
        title = html.unescape(title)
        norm = re.sub(r"\s+", "", title)
        if norm in seen:
            continue
        seen.add(norm)
        date = _parse_date(it.findtext("pubDate"))
        out.append({"title": title, "url": link, "source": source, "date": date})
        if len(out) >= limit:
            break
    return out


def _parse_date(s):
    if not s:
        return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s)
    except Exception:  # noqa: BLE001
        return None


def _fmt_date(d):
    return d.strftime("%Y-%m-%d") if isinstance(d, dt.datetime) else ""


def _serialize(items, n):
    return [
        {"title": it["title"], "url": it["url"],
         "source": it["source"], "date": _fmt_date(it["date"])}
        for it in items[:n]
    ]


def _kst_now():
    return dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=9)


def _iso_week_label(d):
    """'2026년 6월 4주' 형태(월 내 주차)."""
    first = d.replace(day=1)
    week_of_month = (d.day + first.weekday()) // 7 + 1
    return f"{d.year}년 {d.month}월 {week_of_month}주"


def _esc(s):
    return html.escape(str(s or ""), quote=True)


def _headline_li(it, rank):
    """홈 '핵심 이슈' 헤드라인 한 건 — assets/app.js renderWeekly()와 동일 마크업."""
    meta = " · ".join(x for x in (it.get("source"), it.get("date")) if x)
    return (
        f'<li><a class="headline-item" href="{_esc(it.get("url") or "#")}"'
        ' target="_blank" rel="noopener">'
        f'<span class="headline-rank">{rank}</span>'
        '<span class="headline-body">'
        + (f'<span class="headline-badge">{_esc(it["badge"])}</span>' if it.get("badge") else "")
        + f'<span class="headline-title">{_esc(it.get("title"))}</span>'
        + (f'<span class="headline-meta">{_esc(meta)}</span>' if meta else "")
        + "</span></a></li>"
    )


def _news_row(sector):
    """섹터별 뉴스 한 줄 — assets/app.js renderDaily()와 동일 마크업."""
    cards = ""
    for it in sector["items"][:ITEMS_PER_SECTOR]:
        meta = " · ".join(x for x in (it.get("source"), it.get("date")) if x)
        cards += (
            f'<a class="news-card" href="{_esc(it.get("url") or "#")}" target="_blank" rel="noopener">'
            f'<span class="news-title">{_esc(it.get("title"))}</span>'
            + (f'<span class="news-meta">{_esc(meta)}</span>' if meta else "")
            + "</a>"
        )
    return (
        '<div class="news-row">'
        f'<div class="news-row-label">{_esc(sector["name"])}</div>'
        f'<div class="news-row-items">{cards}</div>'
        "</div>"
    )


def _replace_between(text, start_mark, end_mark, inner):
    """마커 사이 내용 교체. 마커가 없으면 원문 유지(None 반환)."""
    pat = re.compile(re.escape(start_mark) + r".*?" + re.escape(end_mark), re.S)
    if not pat.search(text):
        return None
    # 치환문 안의 \, \g 등이 escape로 해석되지 않도록 함수 치환 사용.
    return pat.sub(lambda _: start_mark + "\n" + inner + "\n" + end_mark, text)


def inject_static(payload):
    """news.json 내용을 site/index.html 정적 폴백(마커 구간)에도 주입.

    JS(fetch) 실패·크롤러 대응용. 마커가 없으면 조용히 건너뛴다.

    ⚠ 2026-07-30 부터 site/index.html 에는 news:weekly:static / news:daily:static 마커가
    없다. 홈의 기사 헤드라인 자동 나열을 없애고 운영자가 직접 쓴 '핵심 이슈'
    (_meta/home_issues.json → build_home_issues.py)로 대체했기 때문이다. 따라서 이 함수는
    현재 아무것도 쓰지 않는다(마커가 없으면 _replace_between 이 None 을 반환한다).
    news.json 수집 자체는 그대로 두어, 운영자가 '무엇이 바뀌었는지' 단서를 찾는 데 쓴다.
    홈에 기사 목록을 되살리려면 마커를 다시 넣는 것만으로는 안 되고,
    운영·편집 원칙(광고·편집 분리, 기사 본문 미복사)을 먼저 검토해야 한다.
    """
    try:
        src = open(SITE_INDEX, encoding="utf-8").read()
    except OSError as e:
        print(f"[warn] index.html 읽기 실패 — 정적 주입 생략: {e}")
        return

    w = payload.get("weekly") or {}
    heads = [h for h in (w.get("headlines") or []) if h.get("title")]
    out = src
    if heads:
        inner = "\n".join(_headline_li(h, i + 1) for i, h in enumerate(heads))
        replaced = _replace_between(out, "<!-- news:weekly:static -->",
                                    "<!-- /news:weekly:static -->", inner)
        if replaced:
            out = replaced
        if w.get("as_of"):
            asof = _esc(w["as_of"])
            out = re.sub(r'(<span data-news-asof>)[^<]*(</span>)',
                         lambda m: m.group(1) + asof + m.group(2), out)

    d = payload.get("daily") or {}
    sectors = [s for s in (d.get("sectors") or []) if s.get("items")]
    if sectors:
        inner = "\n".join(_news_row(s) for s in sectors)
        replaced = _replace_between(out, "<!-- news:daily:static -->",
                                    "<!-- /news:daily:static -->", inner)
        if replaced:
            out = replaced
        if d.get("updated"):
            upd = _esc(d["updated"]) + " 갱신"
            out = re.sub(r'(<span data-news-daily-updated>)[^<]*(</span>)',
                         lambda m: m.group(1) + upd + m.group(2), out)

    if out != src:
        open(SITE_INDEX, "w", encoding="utf-8").write(out)
        print("[ok] index.html 정적 뉴스 폴백 갱신")


def main():
    now = _kst_now()

    # 1) 매일: 섹터별 최신 뉴스 (최근 2일)
    daily_sectors, all_recent = [], []
    for s in SECTORS:
        items = _fetch_feed(s["query"], when="2d", limit=8)
        if len(items) < 3:  # 최근 2일이 빈약하면 7일로 보강
            items = (items + _fetch_feed(s["query"], when="7d", limit=8))
        # 중복 제거(보강 합산분)
        seen, merged = set(), []
        for it in items:
            k = re.sub(r"\s+", "", it["title"])
            if k in seen:
                continue
            seen.add(k)
            merged.append(it)
        daily_sectors.append({"key": s["key"], "name": s["name"],
                              "items": _serialize(merged, ITEMS_PER_SECTOR)})
        all_recent += merged
        print(f"[ok] {s['name']}: {len(merged)}건")

    # 2) 매주: 섹터별 주간 1위 기사를 헤드라인 목록으로 (계산기 연결 없이 원문 링크)
    headlines = []
    for s in SECTORS:
        wk = _fetch_feed(s["query"], when="7d", limit=10)
        top = wk[0] if wk else None
        if not top:  # 주간 피드가 비면 일간 수집분으로 보강
            daily = next((d for d in daily_sectors if d["key"] == s["key"]), None)
            if daily and daily["items"]:
                it = daily["items"][0]
                headlines.append({"badge": s["name"], **it})
            continue
        headlines.append({
            "badge": s["name"],
            "title": top["title"],
            "url": top["url"],
            "source": top["source"],
            "date": _fmt_date(top["date"]),
        })

    weekly = {
        "as_of": _iso_week_label(now),
        "updated": now.strftime("%Y-%m-%d"),
        "headlines": headlines,
    }

    payload = {
        "_meta": {
            "source": "Google News RSS (한국어) — 섹터별 부동산 검색 집계",
            "note": "여러 보도를 자동 집계한 목록이며 투자 권유가 아닙니다.",
        },
        "generated_at": now.strftime("%Y-%m-%d %H:%M KST"),
        "weekly": weekly,
        "daily": {"updated": now.strftime("%Y-%m-%d %H:%M KST"), "sectors": daily_sectors},
    }

    # 전 섹터가 비면(네트워크 차단 등) 저장하지 않고 기존 파일 보존.
    total = sum(len(s["items"]) for s in daily_sectors)
    if total == 0:
        print("[skip] 수집된 뉴스 0건 — 기존 news.json 유지")
        prev = load_json(NEWS_JSON)
        if prev is None:
            sys.exit(0)  # 첫 실행에서 빈 결과면 그냥 종료(워크플로 실패로 보지 않음)
        return
    save_json_safe(NEWS_JSON, payload)
    inject_static(payload)


if __name__ == "__main__":
    main()
