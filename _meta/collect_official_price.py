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

■ 수집 단위

응답은 전유부(호) 하나가 항목 하나다. 단지 하나를 끝까지 페이징해 최저·중앙·최고가를
저장한다. 첫 페이지만 보면 동·호 순서 탓에 저층 편향이 생겨 공시가격을 낮게 보이게 한다.

공시가격은 연 1회(1월 1일 기준, 4~5월 발표) 갱신이라 급할 게 없다. 시간 예산 안에서
처리한 만큼만 저장하고 다음 실행이 이어받는다. 이미 올해 기준일로 채운 단지는 건너뛴다.
"""
import datetime as dt
import os
import statistics
import sys

import lib_pdata as L

HSPRC_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrHsprcInfo"
COMPLEX_ADDR_JSON = os.path.join(L.SITE_ASSETS, "complex_addr.json")
OUT_JSON = os.path.join(L.SITE_ASSETS, "official_price.json")

ROWS = 100          # 명세상 페이지당 최대 100건
MAX_PAGES = 60      # 6,000세대 초과 단지는 없다(안전 상한 — 무한 루프 방지)
SAVE_EVERY = 50     # 체크포인트 주기(단지 수)
# 기준연도가 올해가 아닌 단지를 다시 볼 간격(일). 대장의 주택가격은 공시가격을 전재한
# 값이라 갱신이 늦을 수 있어, 매 실행 재조회하면 헛돈다. 공시는 4~5월에 발표된다.
RECHECK_DAYS = 30


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


def summarize(prices, std_day, today=None):
    """가격 목록 → 저장 레코드. 단지 하나를 대표하는 값은 중앙값으로 둔다.

    fetched는 마지막 조회일 — 대장 기재가 늦은 단지를 재조회할 간격을 재는 데 쓴다."""
    return {
        "min": min(prices), "med": int(statistics.median(prices)), "max": max(prices),
        "n": len(prices), "std_day": std_day,
        "fetched": (today or dt.date.today()).strftime("%Y-%m-%d"),
    }


def needs_refresh(rec, this_year, today=None, min_days=RECHECK_DAYS):
    """이미 채운 단지를 다시 부를지.

    공시가격은 연 1회(1월 1일 기준) 갱신이므로 기준연도가 올해면 부를 이유가 없다.
    문제는 건축물대장의 주택가격이 공시가격을 '전재'한 값이라 갱신이 늦을 수 있다는 것이다
    (활용가이드 샘플의 stdDay가 20200101이다). 기준연도만 보고 판단하면 대장이 몇 해 전
    값만 들고 있는 단지를 매 실행 다시 부르게 된다 — 16,000개 단지면 영원히 헛돈다.
    그래서 마지막 조회일로 재조회 간격을 둔다."""
    if not rec:
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


def fetch_prices(keys, service_key):
    """지번 하나의 전유부 주택가격 전량 → ([가격, ...], 기준일)."""
    prices, std_day = [], ""
    for page in range(1, MAX_PAGES + 1):
        items = L.get_items(HSPRC_URL, {
            "serviceKey": service_key,
            "sigunguCd": keys["sgg"], "bjdongCd": keys["umd"],
            "platGbCd": "0", "bun": keys["bun"], "ji": keys["ji"],
            "numOfRows": ROWS, "pageNo": page, "_type": "json",
        })
        for it in items:
            p = _to_int(it.get("hsprc"))
            if p > 0:
                prices.append(p)
                std_day = str(it.get("stdDay") or "").strip() or std_day
        if len(items) < ROWS:
            break
    return prices, std_day


def main():
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
    this_year = dt.date.today().year

    todo, no_keys = [], 0
    for name, entry in addr.items():
        keys = lookup_keys(entry)
        if not keys:
            no_keys += 1
        elif needs_refresh(out.get(name), this_year):
            todo.append((name, keys))
    print(f"[공시가격] 조회키 보유 {len(addr) - no_keys:,}/{len(addr):,}개 단지 · "
          f"이번 대상 {len(todo):,}개 (키 없음 {no_keys:,})")
    if no_keys and not todo:
        print("‼ 조회키가 없어 한 건도 부를 수 없다 — complex_addr.json의 "
              "_meta.resolved_fields로 행정코드 항목명을 확인하라", file=sys.stderr)
        return

    deadline = L.deadline_from_env()
    stat = {"ok": 0, "empty": 0, "fail": 0, "units": 0}
    since_save = 0
    for name, keys in todo:
        if L.out_of_time(deadline, margin_sec=30):
            print(f"시간 예산 소진 — {stat['ok']:,}개 저장 후 중단. "
                  f"남은 단지는 다음 실행에서 이어서 수집")
            break
        try:
            prices, std_day = fetch_prices(keys, service_key)
        except L.AuthError as e:
            print(f"‼ 권한 오류 — data.go.kr에서 '국토교통부_건축HUB_건축물대장정보 서비스'를 "
                  f"활용신청·승인했는지 확인하라 ({e})", file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001 — 개별 실패는 다음 단지로
            stat["fail"] += 1
            if stat["fail"] <= 3:
                print(f"  ! {name} 실패: {e}", file=sys.stderr)
            continue
        if not prices:
            stat["empty"] += 1
            continue
        out[name] = summarize(prices, std_day)
        stat["ok"] += 1
        stat["units"] += len(prices)
        since_save += 1
        if since_save >= SAVE_EVERY:
            data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
            if L.save_json_safe(OUT_JSON, data):
                since_save = 0

    data["_meta"] = {
        "source": "국토교통부 건축HUB 건축물대장정보 서비스(getBrHsprcInfo)",
        "note": "'지역키|단지명' → {min, med, max, n, std_day, fetched}. 단지의 전유부(호)별 "
                "주택가격을 전량 조회해 요약한 값(원). 이 값은 '공동주택가격'이며, "
                "아파트에 한해 지방세법상 시가표준액과 같다(오피스텔·상가는 다르다). "
                "std_day는 공시기준일 — 대장 기재가 늦을 수 있어 표시할 때 함께 보여줄 것. "
                "fetched는 마지막 조회일(재조회 간격 계산용).",
        "unit": "원",
    }
    data["as_of"] = dt.date.today().strftime("%Y-%m-%d")
    print(f"[공시가격] 이번 실행 {stat['ok']:,}개 단지(전유부 {stat['units']:,}건) · "
          f"응답없음 {stat['empty']:,} · 실패 {stat['fail']:,} · 누적 {len(out):,}개")
    if stat["ok"]:
        L.save_json_safe(OUT_JSON, data)
    else:
        print("변경 없음 — 저장 생략")


if __name__ == "__main__":
    main()
