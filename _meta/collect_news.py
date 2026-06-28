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
from collections import Counter

# lib_pdata의 안전 저장/요청 유틸 재사용.
sys.path.insert(0, __import__("os").path.dirname(__file__))
from lib_pdata import SITE_ASSETS, _request, load_json, save_json_safe  # noqa: E402
import os  # noqa: E402

NEWS_JSON = os.path.join(SITE_ASSETS, "news.json")
GNEWS = "https://news.google.com/rss/search"

# 섹터별 검색 질의. 홈 하단 "섹터별 뉴스"에 그대로 노출된다.
SECTORS = [
    {"key": "loan",         "name": "대출·규제",  "query": "부동산 대출 규제 DSR LTV 스트레스"},
    {"key": "trade",        "name": "매매·집값",  "query": "아파트 매매 집값 시세 거래량"},
    {"key": "lease",        "name": "전세·월세",  "query": "전세 월세 임대차 전세사기"},
    {"key": "subscription", "name": "청약·분양",  "query": "아파트 청약 분양 경쟁률"},
    {"key": "policy",       "name": "세금·정책",  "query": "부동산 세금 정책 양도세 종부세 취득세"},
]

# 주간 카드 3종 — 기존 홈 카드의 계산기 연결을 유지하고, 제목만 최신 헤드라인으로 채운다.
WEEKLY_CARDS = [
    {"badge": "대출 규제", "sector": "loan",  "href": "calculators/loan-limit.html",     "cta": "대출한도 계산기 →"},
    {"badge": "집값·매수", "sector": "trade", "href": "calculators/acquisition-tax.html", "cta": "취득세 계산기 →"},
    {"badge": "전월세",    "sector": "lease", "href": "calculators/jeonse-monthly.html",  "cta": "전월세 전환 계산기 →"},
]

# 키워드 빈도 집계 시 제외할 흔한 단어.
STOP = set("""부동산 아파트 기사 뉴스 종합 단독 속보 오늘 올해 내년 지난 관련 위해 대한
서울 경기 전국 시장 가격 상승 하락 이상 이하 그리고 대해 따라 등 및 의 에 를 은 는 이 가
첫 두 세 또 더 큰 중 외 한 것 수 명 곳 억 만 원 % 30 40 50 60 70 80 90""".split())


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


def _top_keywords(titles, n=3):
    cnt = Counter()
    for t in titles:
        for w in re.findall(r"[가-힣A-Za-z]{2,}", t):
            if w not in STOP and len(w) >= 2:
                cnt[w] += 1
    return [w for w, _ in cnt.most_common(n)]


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
                              "items": _serialize(merged, 6)})
        all_recent += merged
        print(f"[ok] {s['name']}: {len(merged)}건")

    # 2) 매주: 섹터별 주간 헤드라인(카드 제목) + 한눈에 요약
    weekly_by_sector, weekly_titles = {}, []
    for s in SECTORS:
        wk = _fetch_feed(s["query"], when="7d", limit=10)
        weekly_by_sector[s["key"]] = wk
        weekly_titles += [it["title"] for it in wk]

    cards = []
    for c in WEEKLY_CARDS:
        wk = weekly_by_sector.get(c["sector"]) or []
        top = wk[0] if wk else None
        cards.append({
            "badge": c["badge"], "href": c["href"], "cta": c["cta"],
            "title": top["title"] if top else "",
            "source": top["source"] if top else "",
            "date": _fmt_date(top["date"]) if top else "",
            "url": top["url"] if top else "",
        })

    kws = _top_keywords(weekly_titles or [it["title"] for it in all_recent])
    lead = ""
    if kws:
        lead = "이번 주 부동산 뉴스의 핵심 키워드는 "
        lead += " · ".join(f"‘{k}’" for k in kws) + " 입니다."
        top_overall = (weekly_titles or [None])[0]
        if top_overall:
            lead += f" 가장 많이 다뤄진 이슈: “{top_overall}”."

    weekly = {
        "as_of": _iso_week_label(now),
        "updated": now.strftime("%Y-%m-%d"),
        "lead": lead,
        "cards": cards,
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


if __name__ == "__main__":
    main()
