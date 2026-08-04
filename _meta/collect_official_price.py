#!/usr/bin/env python3
"""단지 공동주택가격(공시가격) 점진 보강 → site/assets/official_price.json.

■ 용어 주의 — '공시가격'과 '시가표준액'을 같은 말로 쓰면 안 된다

  아파트·연립·다세대(주택)   시가표준액 = 공동주택가격   (지방세법 제4조 제1항:
                             "토지 및 주택에 대한 시가표준액은 「부동산 가격공시에 관한
                             법률」에 따라 공시된 가액") → 같은 값이다.
  단독주택                   시가표준액 = 개별주택가격
  오피스텔·상가(주택 외 건축물) 시가표준액 ≠ 공시가격. 지방세법 제4조 제2항의 별도 산정
                             (신축가격기준액 × 구조·용도·위치지수 × 경과연수 등)을 쓴다.
  공시가격 미공시(신축 등)    지자체장 산정액

이 수집기가 모으는 값은 '공동주택가격'이다. 아파트에 한해 시가표준액과 같으므로 취득세
등 계산에 그대로 쓸 수 있지만, 오피스텔로 대상을 넓히면 그 전제가 깨진다.
또한 건축물대장의 주택가격은 공시가격을 전재한 값이라 정본(부동산공시가격알리미)보다
갱신이 늦을 수 있다 — 저장 레코드의 std_day(공시기준일)를 반드시 함께 보여줘야 한다.

건축HUB 건축물대장 주택가격 조회(getBrHsprcInfo)를 지번으로 직접 부른다.
  sigunguCd + bjdongCd + bun + ji → hsprc(주택가격) · stdDay(공시기준일)

■ 왜 이 경로인가 (2026-07-27 전환)

이전 구현은 Kakao 키워드 검색으로 단지 주소를 찾고 → Kakao 주소검색으로 PNU(19자리)를
만든 뒤 → V-World 공동주택가격 서비스를 부르는 3단계였다. 두 가지 이유로 한 건도 못 모았다.

  1) V-World(api.vworld.kr)가 GitHub Actions 클라우드 IP를 막는다. 같은 키·파라미터가
     브라우저·가정용 네트워크에서는 정상 응답한다(2026-07-18 확인). data.go.kr에 있는
     같은 데이터는 API 유형이 LINK라 vworld.kr로 리다이렉트될 뿐이어서 우회가 안 됐다.
  2) 시작이 '단지명 검색'이라 K-apt 이름매칭과 같은 취약함을 그대로 안고 있었다.

건축HUB는 apis.data.go.kr에 있어 IP 차단과 무관하고(다른 수집기가 매일 정상 호출한다),
조회키는 실거래 원장이 주는 값이라 단지명을 한 글자도 대조하지 않는다. 그 키는
collect_transactions.py가 complex_addr.json에 적어 둔다.

■ 수집 단위 — 항목 하나는 '호 × 공시기준일'이다 (2026-08-01 수정)

응답의 항목 하나는 전유부(호) 하나가 아니라 **호 하나의 공시연도 하나**다. 1,000세대
단지에 10년치 이력이 있으면 10,000건이 나온다. 초기 구현은 이걸 모르고 전량을 한 통에
담아 min·med·max를 냈다 — 2013년 가격과 2026년 가격이 섞여 중앙값이 실제 시가표준액보다
한참 낮게 나왔고(수집된 28개 중 18개가 페이지 상한 6,000건에 걸려 잘렸다), std_day도
'마지막으로 본 항목의 기준일'이라 값과 연도가 서로 맞지 않았다.

그래서 지금은 기준일(stdDay)별로 나눠 담고 **가장 최근 기준일의 가격만** 요약한다.

■ 페이지 수 (같은 수정)

전량 페이징은 단지당 최대 60회 호출이라 18분 예산에 16개밖에 못 채웠다(전국 16,141개
→ 1,000일). 이제 첫 페이지의 totalCount로 전체 페이지 수를 알아낸 뒤, 그 범위에 고르게
흩어 SAMPLE_PAGES개만 읽는다. 동·호 순서로 정렬돼 있어 앞쪽만 읽으면 저층 편향이 생기지만
고르게 흩으면 그 편향이 없다 — 중앙값을 내는 데는 전수가 필요하지 않다.

■ 처리 순서

거래가 많은 단지부터 채운다(finder_index.json의 유효거래수). 전수를 채우는 데는 시간이
걸리는데, 그동안 검색되는 단지가 사람들이 실제로 찾는 단지여야 계산기가 쓸모 있다.

■ 로컬 전량 적재 (2026-08-02)

CI에서는 50분 예산에 24개밖에 못 채운다(2026-08-01 실측 — 단지당 74초. 호출이 느리고
37%가 HTTP 500·타임아웃으로 실패한다). 그 속도로는 16,000개에 2년이 걸려 사실상 안 채워진다.
그래서 전량 적재는 로컬에서 한 번에 끝내는 것을 정공법으로 삼는다:

    python collect_official_price.py --full

--full 은 시간 예산을 끄고(TIME_BUDGET_MIN 무시), 여러 단지를 동시에 부르고, 진행률과
남은 시간을 찍는다. 몇 시간짜리 실행이라 다음 세 가지를 전제로 짰다.

  1) 언제 끊겨도 이어받는다. CHECKPOINT_SEC마다 저장하고, Ctrl-C·한도 초과에도 저장하고
     끝낸다. 다시 돌리면 채운 단지는 건너뛴다.
  2) 죽은 지번에 시간을 쓰지 않는다. 재시도를 줄이고(LOCAL_RETRIES), 대장에 없거나 계속
     실패하는 지번은 MISSES_JSON에 적어 MISS_RECHECK_DAYS 동안 다시 부르지 않는다.
     (건축물대장 수집기의 ledger_misses.json과 같은 장치다.)
  3) 일일 한도 초과를 조용히 넘기지 않는다. data.go.kr은 한도를 넘겨도 HTTP 200에 <item>
     없는 봉투를 주는데, 그걸 '데이터 없음'으로 세면 남은 만 몇 천 건을 전부 헛치고
     '응답없음'으로 기록해 버린다. lib_pdata가 이걸 TrafficExceeded로 올리고, 여기서는
     즉시 저장하고 멈춘다.

공시가격은 연 1회(1월 1일 기준, 4~5월 발표) 갱신이라, 한 번 전량을 채우고 나면 CI의 매일
실행은 대상이 0이라 사실상 아무 일도 하지 않는다. 그게 정상 상태다.
"""
import argparse
import datetime as dt
import math
import os
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import lib_pdata as L

HSPRC_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrHsprcInfo"
COMPLEX_ADDR_JSON = os.path.join(L.SITE_ASSETS, "complex_addr.json")
FINDER_INDEX_JSON = os.path.join(L.SITE_ASSETS, "finder_index.json")
OUT_JSON = os.path.join(L.SITE_ASSETS, "official_price.json")
# 응답 없음·실패 지번 기록. site/assets 가 아니라 data/ 에 둔다 — 배포되는 자산이 아니라
# 수집기끼리 주고받는 운영 기록이다(ledger_misses.json과 같은 자리).
MISSES_JSON = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "data", "official_price_misses.json"))

ROWS = 100          # 명세상 페이지당 최대 100건
SAMPLE_PAGES = 6    # 단지당 읽을 페이지 수(전체 범위에 고르게 흩는다) — 위 '페이지 수' 참고
MAX_PAGES = 60      # totalCount를 못 받았을 때만 쓰는 안전 상한(무한 루프 방지)
SAVE_EVERY = 50     # 체크포인트 주기(단지 수) — CI처럼 짧은 실행용
# 기준연도가 올해가 아닌 단지를 다시 볼 간격(일). 대장의 주택가격은 공시가격을 전재한
# 값이라 갱신이 늦을 수 있어, 매 실행 재조회하면 헛돈다. 공시는 4~5월에 발표된다.
RECHECK_DAYS = 30
# 레코드 형식 판(版). 2026-08-01 이전 레코드는 공시연도를 섞어 요약한 값이라 기준연도가
# 올해여도 믿을 수 없다 — 판이 낮으면 다시 부른다.
REC_VERSION = 2

# ── 로컬 전량 적재(--full) 기본값 ──
FULL_WORKERS = 8        # 동시에 부르는 단지 수. 호출 하나가 십수 초라 병렬이 아니면 끝나지 않는다
LOCAL_RETRIES = 1       # 죽은 지번에 재시도 3회 + 백오프를 쓰면 한 건에 1분 가까이 간다
LOCAL_TIMEOUT = 15      # 초. 이보다 오래 끄는 응답은 기다릴수록 손해다
CHECKPOINT_SEC = 120    # 몇 시간짜리 실행이라 건수가 아니라 시간으로 저장 주기를 잡는다
MISS_RECHECK_DAYS = 45  # 응답 없음·실패 지번을 다시 볼 간격(건축물대장 수집기와 같은 값)


def _to_int(v):
    try:
        return int(float(str(v).strip()))
    except (TypeError, ValueError):
        return 0


def pad(v, width=4):
    """본번·부번은 4자리 0채움이 규약이다('12' → '0012'). 숫자가 아니면 그대로 둔다."""
    s = str(v or "").strip()
    return s.zfill(width) if s.isdigit() else s


def lookup_keys(entry):
    """complex_addr.json 항목 → 조회키 dict. 부를 수 없으면 None.

    주소 문자열만 담던 초기 형식에는 조회키가 없다. 부번은 없을 수 있어 '0000'으로 채우되,
    시군구·법정동·본번이 하나라도 비면 부르지 않는다 — 엉뚱한 지번을 조회하게 된다.
    """
    if not isinstance(entry, dict):
        return None
    sgg, umd = str(entry.get("sgg") or "").strip(), str(entry.get("umd") or "").strip()
    bun = pad(entry.get("bun"))
    if not (sgg and umd and bun):
        return None
    return {"sgg": sgg, "umd": umd, "bun": bun, "ji": pad(entry.get("ji")) or "0000"}


def summarize(by_day, today=None):
    """{공시기준일: [가격, ...]} → 저장 레코드. 없으면 None.

    ■ 가장 최근 기준일의 가격만 쓴다
      응답은 호 하나당 공시연도마다 한 건이라 전부 한 통에 담으면 2013년 가격과 2026년
      가격이 섞인다. 그 중앙값은 어느 해의 시가표준액도 아니다.

    단지 하나를 대표하는 값은 중앙값으로 둔다. fetched는 마지막 조회일 — 대장 기재가
    늦은 단지를 재조회할 간격을 재는 데 쓴다."""
    days = [d for d in by_day if by_day[d]]
    if not days:
        return None
    # 기준일 문자열(YYYYMMDD)은 사전순 = 시간순이다. 기준일이 빈 항목("")은 연도를 알 수
    # 없어 최신으로 볼 수 없으니, 연도가 붙은 기준일이 하나라도 있으면 그쪽을 쓴다.
    dated = [d for d in days if d]
    if dated:
        # 해마다 호 수가 비슷하게 나오는 게 정상인데, 공시 발표기(4~5월)에는 새 기준일이
        # 몇 호에만 먼저 기재돼 있을 수 있다. 그 몇 호로 중앙값을 내면 단지를 대표하지
        # 못하므로, 표본이 가장 큰 해의 1/3에 못 미치는 기준일은 건너뛰고 그 앞 해를 쓴다
        # (std_day를 함께 저장하니 화면에는 '몇 년도 기준'인지 그대로 드러난다).
        big = max(len(by_day[d]) for d in dated)
        enough = [d for d in dated if len(by_day[d]) * 3 >= big]
        std_day = max(enough or dated)
    else:
        std_day = ""
    prices = by_day[std_day]
    return {
        "min": min(prices), "med": int(statistics.median(prices)), "max": max(prices),
        "n": len(prices), "std_day": std_day, "v": REC_VERSION,
        "fetched": (today or dt.date.today()).strftime("%Y-%m-%d"),
    }


def miss_is_fresh(miss_day, today=None, min_days=MISS_RECHECK_DAYS):
    """최근에 '응답 없음·실패'로 기록된 지번인지 → True면 이번엔 부르지 않는다.

    대장에 주택가격이 없는 지번(오피스텔·단독 등)과 서버가 계속 500을 뱉는 지번이 섞여
    있다. 둘 다 매 실행 다시 부르면 예산의 상당 부분을 여기에 쓴다 — 2026-08-01 CI 실행은
    41건 시도 중 15건이 실패였고 재시도·백오프까지 더해 절반 가까이를 거기 썼다."""
    if not miss_day:
        return False
    try:
        gap = ((today or dt.date.today()) - dt.date.fromisoformat(str(miss_day))).days
    except ValueError:
        return False
    return 0 <= gap < min_days


def needs_refresh(rec, this_year, today=None, min_days=RECHECK_DAYS):
    """이미 채운 단지를 다시 부를지.

    공시가격은 연 1회(1월 1일 기준) 갱신이므로 기준연도가 올해면 부를 이유가 없다.
    문제는 건축물대장의 주택가격이 공시가격을 '전재'한 값이라 갱신이 늦을 수 있다는 것이다
    (활용가이드 샘플의 stdDay가 20200101이다). 기준연도만 보고 판단하면 대장이 몇 해 전
    값만 들고 있는 단지를 매 실행 다시 부르게 된다 — 16,000개 단지면 영원히 헛돈다.
    그래서 마지막 조회일로 재조회 간격을 둔다.

    단, 옛 판(공시연도를 섞어 요약한 값)은 기준연도와 무관하게 다시 부른다."""
    if not rec:
        return True
    if int(rec.get("v") or 1) < REC_VERSION:
        return True
    std = str(rec.get("std_day") or "")
    if len(std) >= 4 and std[:4] == str(this_year):
        return False        # 올해 기준일을 이미 확보했다
    last = str(rec.get("fetched") or "")
    if not last:
        return True         # 조회일 기록 전 데이터 — 한 번은 다시 본다
    try:
        gap = ((today or dt.date.today()) - dt.date.fromisoformat(last)).days
    except ValueError:
        return True
    return gap >= min_days


def sample_pages(total, rows=ROWS, want=SAMPLE_PAGES):
    """전체 건수 → 읽을 페이지 번호 목록(1부터). 전체 범위에 고르게 흩는다.

    항목은 동·호 순서라 앞에서부터 want쪽만 읽으면 저층·앞동 편향이 생긴다. 페이지가
    want개 이하면 전부 읽는다(그게 전수다)."""
    pages = max(1, math.ceil(max(0, total) / rows))
    if pages <= want:
        return list(range(1, pages + 1))
    step = (pages - 1) / (want - 1)
    return sorted({1 + round(i * step) for i in range(want)})


def _page(keys, service_key, page, http=None):
    http = http or {}
    return L.get_items_total(HSPRC_URL, {
        "serviceKey": service_key,
        "sigunguCd": keys["sgg"], "bjdongCd": keys["umd"],
        "platGbCd": "0", "bun": keys["bun"], "ji": keys["ji"],
        "numOfRows": ROWS, "pageNo": page, "_type": "json",
    }, **http)


def fetch_prices(keys, service_key, http=None):
    """지번 하나의 주택가격 표본 → {공시기준일: [가격, ...]}.

    항목 하나는 '호 × 공시기준일'이라 연도가 섞여 온다. 기준일별로 나눠 담아야 호출부가
    최신 연도만 골라 쓸 수 있다(전부 한 통에 담으면 2013년 가격이 2026년 중앙값을 끌어내린다).
    """
    by_day = {}

    def take(items):
        for it in items:
            p = _to_int(it.get("hsprc"))
            if p > 0:
                by_day.setdefault(str(it.get("stdDay") or "").strip(), []).append(p)

    items, total = _page(keys, service_key, 1, http)
    take(items)
    if not items:
        return by_day
    if total is None:
        # totalCount를 안 주는 응답 — 옛 방식대로 짧은 페이지가 나올 때까지 순차로 읽는다.
        if len(items) >= ROWS:
            for page in range(2, MAX_PAGES + 1):
                items, _ = _page(keys, service_key, page, http)
                take(items)
                if len(items) < ROWS:
                    break
        return by_day
    for page in sample_pages(total)[1:]:
        take(_page(keys, service_key, page, http)[0])
    return by_day


def trade_counts():
    """'지역키|단지명' → 유효거래수. 없으면 빈 dict.

    전수를 채우는 데 며칠이 걸리므로 처리 순서가 곧 '오늘 검색되는 단지'다. 거래가 많은
    단지가 사람들이 계산기에 넣어 보는 단지라 그 순서로 채운다."""
    idx = L.load_json(FINDER_INDEX_JSON, default=None) or {}
    out = {}
    for c in idx.get("complexes") or []:
        key = f"{c.get('rk')}|{c.get('n')}"
        out[key] = max(out.get(key, 0), _to_int(c.get("c")))
    return out


def eta_text(done, total, started):
    """남은 시간 문구. 몇 시간짜리 실행이라 '언제 끝나는지'가 보여야 손을 뗄 수 있다."""
    if done <= 0:
        return "-"
    rate = done / max(1e-9, time.monotonic() - started)      # 단지/초
    left = (total - done) / rate if rate > 0 else 0
    h, m = divmod(int(left // 60), 60)
    return f"{h}시간 {m}분" if h else f"{m}분"


def build_todo(addr, out, misses, this_year, today=None):
    """부를 단지 목록 → ([(name, keys)], 통계). 거래 많은 순으로 정렬해서 돌려준다."""
    todo, skipped = [], {"no_keys": 0, "filled": 0, "miss": 0}
    for name, entry in addr.items():
        keys = lookup_keys(entry)
        if not keys:
            skipped["no_keys"] += 1
        elif not needs_refresh(out.get(name), this_year, today):
            skipped["filled"] += 1
        elif miss_is_fresh(misses.get(name), today):
            skipped["miss"] += 1
        else:
            todo.append((name, keys))
    rank = trade_counts()
    todo.sort(key=lambda t: -rank.get(t[0], 0))
    return todo, skipped, bool(rank)


def main(argv=None):
    ap = argparse.ArgumentParser(description="공동주택 공시가격(시가표준액) 수집")
    ap.add_argument("--full", action="store_true",
                    help="로컬 전량 적재: 시간 예산 없이 끝까지, 여러 단지를 동시에 부른다")
    ap.add_argument("--workers", type=int, default=None,
                    help=f"동시 호출 수 (--full 기본 {FULL_WORKERS}, 그 외 1)")
    ap.add_argument("--limit", type=int, default=0,
                    help="이번에 처리할 단지 수 상한(0=제한 없음). 시험 실행용")
    args = ap.parse_args(argv)
    workers = args.workers or (FULL_WORKERS if args.full else 1)

    service_key = L.key(L.DATA_GO_KEYS)
    if not service_key:
        print("[공시가격] data.go.kr 키 없음 — 건너뜀", file=sys.stderr)
        return
    addr = (L.load_json(COMPLEX_ADDR_JSON, default=None) or {}).get("map") or {}
    if not addr:
        print("[공시가격] complex_addr.json 없음/비어 있음 — collect_transactions.py를 "
              "먼저 실행해야 조회키가 생긴다", file=sys.stderr)
        return

    data = L.load_json(OUT_JSON, default=None) or {}
    out = data.setdefault("map", {})
    miss_data = L.load_json(MISSES_JSON, default=None) or {}
    misses = miss_data.setdefault("map", {})
    this_year = dt.date.today().year
    today_str = dt.date.today().strftime("%Y-%m-%d")

    todo, skipped, ranked = build_todo(addr, out, misses, this_year)
    if args.limit > 0:
        todo = todo[:args.limit]
    print(f"[공시가격] 전체 {len(addr):,}개 · 이번 대상 {len(todo):,}개 "
          f"(이미 채움 {skipped['filled']:,} · 최근 실패 건너뜀 {skipped['miss']:,} · "
          f"키 없음 {skipped['no_keys']:,}) · "
          f"거래 많은 순 {'적용' if ranked else '미적용(finder_index 없음)'}"
          + (f" · 동시 {workers}" if workers > 1 else ""))
    if skipped["no_keys"] and not todo and not skipped["filled"]:
        print("‼ 조회키가 없어 한 건도 부를 수 없다 — complex_addr.json의 "
              "_meta.resolved_fields로 행정코드 항목명을 확인하라", file=sys.stderr)
        return

    # --full 은 시간 예산을 끈다. 죽은 지번에 오래 매달리지 않도록 재시도·타임아웃도 줄인다.
    deadline = None if args.full else L.deadline_from_env()
    http = ({"retries": LOCAL_RETRIES, "timeout": LOCAL_TIMEOUT} if args.full else {})

    stat = {"ok": 0, "empty": 0, "fail": 0, "units": 0}
    started = time.monotonic()
    lock = threading.Lock()
    stop = threading.Event()
    stop_reason = [""]
    last_save = [time.monotonic()]

    def save(force=False):
        """체크포인트. 몇 시간짜리 실행이라 언제 끊겨도 진행분이 남아야 한다."""
        if not force and time.monotonic() - last_save[0] < CHECKPOINT_SEC:
            return
        data["as_of"] = today_str
        # 들여쓰기 없이 쓴다. 이 파일은 브라우저가 계산기에서 직접 받는 자산이고,
        # 레코드가 숫자 배열(평형별 추정 u)까지 갖게 되면서 indent=2 로는 값 하나가
        # 한 줄씩 차지해 크기가 2배 넘게 뛴다(135개 단지에서 30KB→72KB). 전국 16,000개
        # 단지를 채우면 그대로 사람이 받는 용량이 된다 — 기계가 쓰고 기계가 읽는
        # 파일이라 diff 가독성보다 전송 크기가 중요하다.
        L.save_json_safe(OUT_JSON, data, indent=None)
        miss_data["_meta"] = {
            "note": "'지역키|단지명' → 마지막으로 '응답 없음·실패'가 난 날(YYYY-MM-DD). "
                    f"{MISS_RECHECK_DAYS}일 동안 다시 부르지 않는다. 대장에 주택가격이 없는 "
                    "지번(오피스텔·단독 등)과 서버가 계속 500을 뱉는 지번이 섞여 있다.",
        }
        L.save_json_safe(MISSES_JSON, miss_data)
        last_save[0] = time.monotonic()

    def work(item):
        name, keys = item
        if stop.is_set():
            return
        try:
            by_day = fetch_prices(keys, service_key, http)
        except L.TrafficExceeded as e:
            with lock:
                if not stop.is_set():
                    stop_reason[0] = (f"일일 요청 한도 초과 — 여기까지 저장하고 멈춘다. "
                                      f"내일 같은 명령을 다시 돌리면 이어받는다 ({e})")
                stop.set()
            return
        except L.AuthError as e:
            with lock:
                if not stop.is_set():
                    stop_reason[0] = ("권한 오류 — data.go.kr에서 '국토교통부_건축HUB_"
                                      f"건축물대장정보 서비스'를 활용신청·승인했는지 확인하라 ({e})")
                stop.set()
            return
        except Exception as e:  # noqa: BLE001 — 개별 실패는 다음 단지로
            with lock:
                stat["fail"] += 1
                misses[name] = today_str
                if stat["fail"] <= 3:
                    print(f"  ! {name} 실패: {e}", file=sys.stderr)
            return
        rec = summarize(by_day)
        with lock:
            if rec:
                out[name] = rec
                misses.pop(name, None)
                stat["ok"] += 1
                stat["units"] += rec["n"]
            else:
                # 대장에 주택가격이 없는 지번이다. 기록해 두지 않으면 매 실행 다시 부른다.
                stat["empty"] += 1
                misses[name] = today_str
            done = stat["ok"] + stat["empty"] + stat["fail"]
            if args.full and done % 100 == 0:
                print(f"  … {done:,}/{len(todo):,} · 성공 {stat['ok']:,} · "
                      f"없음 {stat['empty']:,} · 실패 {stat['fail']:,} · "
                      f"남은 시간 약 {eta_text(done, len(todo), started)}", flush=True)
            save()

    try:
        if workers > 1:
            pool = ThreadPoolExecutor(max_workers=workers)
            try:
                for _ in pool.map(work, todo):
                    if stop.is_set():
                        break
            finally:
                # map()은 대상 전부를 미리 대기열에 넣는다. Ctrl-C·한도 초과로 빠져나올 때
                # 취소하지 않으면 shutdown이 남은 만 몇 천 건을 다 소진할 때까지 안 돌아온다.
                stop.set()
                pool.shutdown(wait=True, cancel_futures=True)
        else:
            for item in todo:
                if stop.is_set():
                    break
                if L.out_of_time(deadline, margin_sec=30):
                    stop_reason[0] = ("시간 예산 소진 — 남은 단지는 다음 실행에서 "
                                      "이어서 수집")
                    break
                work(item)
    except KeyboardInterrupt:
        stop_reason[0] = "사용자 중단(Ctrl-C) — 여기까지 저장한다. 다시 돌리면 이어받는다"
        stop.set()

    if stop_reason[0]:
        print(f"‼ {stop_reason[0]}", file=sys.stderr)

    data["_meta"] = {
        "source": "국토교통부 건축HUB 건축물대장정보 서비스(getBrHsprcInfo)",
        "note": "'지역키|단지명' → {min, med, max, n, std_day, v, fetched}. 대장의 호별 "
                "주택가격 중 **가장 최근 공시기준일** 것만 요약한 값(원). 응답 항목은 "
                "'호 × 공시연도'라 연도를 섞으면 중앙값이 실제보다 낮아진다. "
                "이 값은 '공동주택가격'이며, 아파트에 한해 지방세법상 시가표준액과 같다"
                "(오피스텔·상가는 다르다). std_day는 공시기준일 — 대장 기재가 늦을 수 "
                "있어 표시할 때 함께 보여줄 것. n은 요약에 쓴 호 수(전수가 아니라 표본일 "
                "수 있다). v는 레코드 형식 판. fetched는 마지막 조회일(재조회 간격 계산용).",
        "unit": "원",
    }
    elapsed = int(time.monotonic() - started)
    print(f"[공시가격] 이번 실행 {stat['ok']:,}개 단지(요약에 쓴 호 {stat['units']:,}건) · "
          f"응답없음 {stat['empty']:,} · 실패 {stat['fail']:,} · 누적 {len(out):,}개 · "
          f"{elapsed // 60}분 {elapsed % 60}초")
    # 성공이 없어도 저장한다 — 실패·응답없음 기록(misses)이 남아야 다음 실행이 그 지번을
    # 건너뛴다. 이걸 빠뜨리면 죽은 지번을 영원히 다시 부른다.
    if stat["ok"] or stat["empty"] or stat["fail"]:
        save(force=True)
    else:
        print("변경 없음 — 저장 생략")
    if len(out) and not stop_reason[0]:
        remaining = len(todo) - (stat["ok"] + stat["empty"] + stat["fail"])
        if remaining <= 0:
            print(f"✔ 이번 대상 전부 처리 — 누적 {len(out):,}개 단지 수록")


if __name__ == "__main__":
    main()
