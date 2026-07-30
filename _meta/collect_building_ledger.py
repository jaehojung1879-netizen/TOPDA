#!/usr/bin/env python3
"""건축물대장으로 단지 세대수·준공연도 보강 → site/assets/households.json.

■ 왜 이 수집기가 필요한가 (2026-07-30 신설)

세대수는 맞춤 내집 찾기의 '단지규모' 배점(10%)과 '최소 세대수' 필터가 쓰는 값인데,
2026-07-29 기준 파인더 노출 16,101개 단지 중 43.2%만 채워져 있었다. 절반 넘게
'세대수 미상'으로 뜨면 추천 점수 자체를 믿을 수 없다.

기존 경로(collect_households.py)는 K-apt 공동주택 기본정보만 쓴다. K-apt는
**의무관리대상 공동주택**(300세대 이상 등)만 수록하므로 소규모·나홀로 단지는 애초에
목록에 없다 — 전국 K-apt 목록 11,546개 / 전체 단지 16,209개로 **수록률 71%가 천장**이다.
실제로 세대수 보강은 회당 0~3건으로 포화됐고, 2026-07-27~29 사흘간 누적이
7,077 → 7,023으로 오히려 줄었다(주소 검증 소급 정리分). 더 돌려도 안 붙는다.

건축물대장은 의무관리대상 여부와 무관하게 **모든 건축물**이 등재되므로 그 천장이 없다.
그리고 조회에 필요한 것이 이미 다 있다:

  · complex_addr.json 15,353개 항목 전부가 조회키{sgg,umd,bun,ji}를 들고 있고,
    세대수 미상 8,468개도 **100%** 보유한다(collect_transactions.py가 실거래 상세에서 적어둔다).
  · 같은 서비스(BldRgstHubService)를 collect_official_price.py가 매일 정상 호출한다 —
    키(DATA_GO_KR_KEY)·IP 차단 여부가 이미 검증됐다.
  · 단지명을 한 글자도 대조하지 않으므로 K-apt 이름매칭의 취약함(표기 차이 4,305건)이 없다.

■ 어느 대장을 부르는가 — 총괄표제부 우선, 표제부 합산 폴백

아파트 단지는 동별로 표제부가 쪼개져 있다. 표제부만 부르면 한 동의 세대수를 단지
전체로 착각한다(101동 128세대 → 단지 128세대).

  1) getBrRecapTitleInfo (총괄표제부) — 대지(단지) 단위 집계. hhldCnt가 단지 총 세대수다.
  2) getBrTitleInfo (표제부) — 동 단위. 총괄표제부가 없는 단일동 단지의 폴백으로만 쓰고,
     주거용 동만 골라 합산한다(부속 상가동은 세대수 0이지만 주용도로 한 번 더 거른다).

■ 값을 붙이지 않는 쪽을 택하는 경우

"엉뚱한 세대수가 붙는 게 비어 있는 것보다 나쁘다"(collect_households.py의 원칙)를 따른다.

  · 이미 세대수가 있는 단지는 건드리지 않는다. K-apt 값이 정본에 가깝고, 덮어쓰면
    collect_households.py와 매 실행 서로 값을 밀어내게 된다.
  · 세대수가 0이거나 상한(MAX_HOUSEHOLDS)을 넘으면 버린다. 국내 최대 단지는
    9,510세대(헬리오시티)이므로 20,000을 넘는 값은 조회키가 어긋났다는 신호다.
  · 한 단지가 여러 지번에 걸쳐 있으면 complex_addr.json에 실린 지번 하나의 총괄표제부는
    단지의 일부만 담을 수 있다. 이때 값은 실제보다 작아진다 — 그래서 출처를 hh_src에
    남겨 K-apt 값과 구분할 수 있게 한다(사후 검증·정정용).

■ 재조회 정책

세대수는 거의 바뀌지 않으므로 한 번 채우면 다시 부르지 않는다. 문제는 '응답 없음'이다.
미상 8,468개를 매 실행 다시 부르면 예산을 전부 헛쓴다(대장에 없는 지번은 계속 없다).
그래서 빈손으로 끝난 단지는 data/ledger_misses.json에 조회일을 적고 MISS_RECHECK_DAYS
동안 건너뛴다. 이 파일은 site/ 밖이라 브라우저로 내려가지 않는다.
"""
import datetime as dt
import os
import sys

import lib_pdata as L

RECAP_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo"
TITLE_URL = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo"

COMPLEX_ADDR_JSON = os.path.join(L.SITE_ASSETS, "complex_addr.json")
HOUSEHOLDS_JSON = os.path.join(L.SITE_ASSETS, "households.json")
APARTMENTS_JSON = os.path.join(L.SITE_ASSETS, "apartments.json")
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
MISSES_JSON = os.path.join(DATA_DIR, "ledger_misses.json")

ROWS = 100          # 명세상 페이지당 최대 100건
MAX_PAGES = 10      # 동이 1,000개를 넘는 단지는 없다(무한 루프 방지)
SAVE_EVERY = 100    # 체크포인트 주기(단지 수)
MISS_RECHECK_DAYS = 45

# 조회키가 어긋났을 때를 걸러내는 상한. 국내 최대 단지는 9,510세대(헬리오시티)다.
MAX_HOUSEHOLDS = 20000
# 준공연도로 받아들일 범위. 대장에 오기(19701231 → 1070 등)가 있다.
MIN_BUILD_YEAR = 1950

# 표제부에서 주거용 동만 고르는 데 쓰는 주용도 키워드. 총괄표제부에는 주용도가 없으므로
# 이 필터는 폴백 경로에만 걸린다.
RESIDENTIAL_PURPOSES = ("공동주택", "아파트", "연립주택", "다세대주택", "주거")


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

    collect_official_price.lookup_keys와 같은 규약이다. 시군구·법정동·본번이 하나라도
    비면 부르지 않는다 — 엉뚱한 지번을 조회하게 된다.
    """
    if not isinstance(entry, dict):
        return None
    sgg, umd = str(entry.get("sgg") or "").strip(), str(entry.get("umd") or "").strip()
    bun = pad(entry.get("bun"))
    if not (sgg and umd and bun):
        return None
    return {"sgg": sgg, "umd": umd, "bun": bun, "ji": pad(entry.get("ji")) or "0000"}


def is_residential(item):
    """표제부 항목이 주거용 동인지. 주용도가 비어 있으면 세대수 유무로 판단한다.

    부속 상가동(제1·2종 근린생활시설)은 세대수가 0이라 합산에 영향이 없지만, 주용도가
    섞인 복합건축물에서 엉뚱한 동을 더하지 않도록 한 번 더 거른다.
    """
    purpose = str(item.get("mainPurpsCdNm") or item.get("etcPurps") or "").strip()
    if not purpose:
        return _to_int(item.get("hhldCnt")) > 0
    return any(k in purpose for k in RESIDENTIAL_PURPOSES)


def build_year_of(items):
    """사용승인일(useAprDay, YYYYMMDD) 중 가장 이른 해 → 준공연도. 없으면 None.

    단지에 여러 동이 있으면 준공이 갈리는데(재건축 아닌 순차 준공), 단지 연식은 첫 준공을
    기준으로 보는 것이 실무 관례다. 범위를 벗어난 값은 대장 오기로 보고 버린다.
    """
    this_year = dt.date.today().year
    years = []
    for it in items:
        raw = str(it.get("useAprDay") or "").strip()
        if len(raw) < 4 or not raw[:4].isdigit():
            continue
        y = int(raw[:4])
        if MIN_BUILD_YEAR <= y <= this_year + 3:
            years.append(y)
    return min(years) if years else None


def households_of(recap_items, title_items):
    """(세대수, 출처필드) — 총괄표제부 우선, 없으면 주거용 표제부 합산. 못 구하면 (0, '').

    총괄표제부의 hhldCnt는 단지 총계다. 0이면 가구수(fmlyCnt)로 폴백한다 — 오래된 대장은
    세대수 칸을 비우고 가구수만 적은 경우가 있다. 어느 칸에서 왔는지 남겨 사후 검증에 쓴다.
    (호수 hoCnt는 쓰지 않는다. 오피스텔·도시형생활주택에서 세대수와 어긋난다.)
    """
    for field in ("hhldCnt", "fmlyCnt"):
        total = sum(_to_int(it.get(field)) for it in recap_items)
        if total > 0:
            return total, f"recap.{field}"
    residential = [it for it in title_items if is_residential(it)]
    for field in ("hhldCnt", "fmlyCnt"):
        total = sum(_to_int(it.get(field)) for it in residential)
        if total > 0:
            return total, f"title.{field}"
    return 0, ""


def plausible(households):
    """조회키가 어긋나면 다른 지번의 대형 단지가 붙는다 — 상한으로 걸러낸다."""
    return 0 < households <= MAX_HOUSEHOLDS


def fetch_ledger(url, keys, service_key):
    """지번 하나의 대장 항목 전량. 페이지가 가득 차면 다음 페이지까지 읽는다."""
    items = []
    for page in range(1, MAX_PAGES + 1):
        got = L.get_items(url, {
            "serviceKey": service_key,
            "sigunguCd": keys["sgg"], "bjdongCd": keys["umd"],
            "platGbCd": "0", "bun": keys["bun"], "ji": keys["ji"],
            "numOfRows": ROWS, "pageNo": page, "_type": "json",
        })
        items.extend(got)
        if len(got) < ROWS:
            break
    return items


def fetch_complex(keys, service_key):
    """단지 하나 → (세대수, 출처필드, 준공연도). 총괄표제부를 먼저 부른다.

    총괄표제부에서 세대수를 얻으면 표제부는 부르지 않는다 — 호출을 절반으로 줄인다.
    준공연도는 총괄표제부에 사용승인일이 비어 있는 경우가 있어, 세대수를 얻었더라도
    연도가 없으면 표제부를 한 번 더 본다.
    """
    recap = fetch_ledger(RECAP_URL, keys, service_key)
    households, src = households_of(recap, [])
    year = build_year_of(recap)
    if households and year:
        return households, src, year
    title = fetch_ledger(TITLE_URL, keys, service_key)
    if not households:
        households, src = households_of(recap, title)
    return households, src, (year or build_year_of(title))


def stale_miss(recorded, today=None, min_days=MISS_RECHECK_DAYS):
    """빈손으로 끝난 단지를 다시 부를지. 기록이 망가졌으면 다시 본다."""
    if not recorded:
        return True
    try:
        gap = ((today or dt.date.today()) - dt.date.fromisoformat(str(recorded))).days
    except ValueError:
        return True
    return gap >= min_days


def curated_filled(apartments):
    """apartments.json에서 세대수를 이미 가진 단지 키 집합.

    파인더는 apartments.json(큐레이션)과 households.json(실거래 전용)을 병합해 보여준다.
    households.json만 보고 대상을 고르면 큐레이션 쪽에 이미 세대수가 있는 단지를 다시
    부른다(2026-07-30 실측 1,300개 = 대상의 13%). 화면 값은 apartments.json이 이기므로
    틀린 값이 붙는 문제는 아니지만, 예산을 그만큼 헛쓴다.
    """
    filled = set()
    for a in apartments or []:
        if a.get("households"):
            filled.add(f"{a.get('region_key') or ''}|{a.get('name')}")
    return filled


def targets(addr_map, hh_map, misses, today=None, filled_elsewhere=()):
    """보강 대상 [(키, 조회키)]. 이미 세대수가 있거나 최근 빈손이었던 단지는 뺀다."""
    filled_elsewhere = set(filled_elsewhere)
    out = []
    for name, entry in addr_map.items():
        if (hh_map.get(name) or {}).get("households") or name in filled_elsewhere:
            continue
        if not stale_miss(misses.get(name), today):
            continue
        keys = lookup_keys(entry)
        if keys:
            out.append((name, keys))
    return out


def apply_result(hh_map, name, households, src, year):
    """수집값을 households.json 항목에 반영. 기존 값은 덮어쓰지 않는다.

    준공연도는 세대수를 못 구한 단지에도 붙인다 — 파인더의 '연식' 조건이 쓰는 값이라
    세대수와 별개로 값어치가 있다.
    """
    rec = hh_map.setdefault(name, {})
    changed = False
    if households and not rec.get("households"):
        rec["households"] = households
        rec["hh_src"] = src
        changed = True
    if year and not rec.get("built_year"):
        rec["built_year"] = year
        changed = True
    return changed


def save_progress(hh_data, miss_data, today):
    """산출물과 응답없음 기록을 함께 저장. households.json 저장 성공 여부를 돌려준다.

    두 파일이 같은 시점을 가리켜야 한다. 한쪽만 저장하면 다음 실행이 이미 채운 단지를
    다시 부르거나(misses만 저장), 대장에 없는 지번을 다시 부른다(households만 저장).
    """
    stamp = today.strftime("%Y-%m-%d")
    hh_data["as_of"] = stamp
    saved = L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    miss_data["as_of"] = stamp
    os.makedirs(DATA_DIR, exist_ok=True)
    L.save_json_safe(MISSES_JSON, miss_data)
    return saved


def main():
    service_key = L.key(L.DATA_GO_KEYS)
    if not service_key:
        print("[대장] data.go.kr 키 없음 — 건너뜀", file=sys.stderr)
        return
    addr_map = (L.load_json(COMPLEX_ADDR_JSON, default=None) or {}).get("map") or {}
    if not addr_map:
        print("[대장] complex_addr.json 없음/비어 있음 — collect_transactions.py를 "
              "먼저 실행해야 조회키가 생긴다", file=sys.stderr)
        return

    hh_data = L.load_json(HOUSEHOLDS_JSON, default=None) or {"map": {}}
    hh_map = hh_data.setdefault("map", {})
    miss_data = L.load_json(MISSES_JSON, default=None) or {}
    misses = miss_data.setdefault("map", {})
    miss_data["_meta"] = {
        "note": "'지역키|단지명' → 마지막으로 건축물대장에서 아무것도 못 받은 날. "
                f"{MISS_RECHECK_DAYS}일 지나면 다시 조회한다. 대장 미등재 지번을 매 "
                "실행 다시 부르지 않기 위한 것으로, 사이트로 배포되지 않는다.",
        "recheck_days": MISS_RECHECK_DAYS,
    }
    curated = curated_filled(
        (L.load_json(APARTMENTS_JSON, default=None) or {}).get("apartments") or [])

    today = dt.date.today()
    todo = targets(addr_map, hh_map, misses, today, curated)
    filled_before = sum(1 for v in hh_map.values() if v.get("households"))
    print(f"[대장] 조회키 {len(addr_map):,}개 · 세대수 기보유 "
          f"{filled_before:,}(원장) + {len(curated):,}(큐레이션)개 · "
          f"이번 대상 {len(todo):,}개 (최근 응답없음 건너뜀 {len(misses):,})")
    if not todo:
        print("보강할 단지 없음 — 저장 생략")
        return

    deadline = L.deadline_from_env()
    stat = {"hh": 0, "year": 0, "empty": 0, "fail": 0, "reject": 0}
    since_save = 0
    for name, keys in todo:
        if L.out_of_time(deadline, margin_sec=30):
            print(f"시간 예산 소진 — 세대수 {stat['hh']:,}개 확보 후 중단. "
                  f"남은 단지는 다음 실행에서 이어서 수집")
            break
        try:
            households, src, year = fetch_complex(keys, service_key)
        except L.AuthError as e:
            print(f"‼ 권한 오류 — data.go.kr에서 '국토교통부_건축HUB_건축물대장정보 서비스'를 "
                  f"활용신청·승인했는지 확인하라 ({e})", file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001 — 개별 실패는 다음 단지로
            stat["fail"] += 1
            if stat["fail"] <= 3:
                print(f"  ! {name} 실패: {e}", file=sys.stderr)
            continue

        if households and not plausible(households):
            # 조회키가 어긋나 다른 지번이 붙은 경우. 값을 버리고 미상으로 남긴다.
            stat["reject"] += 1
            if stat["reject"] <= 3:
                print(f"  ! {name} 세대수 {households:,} — 상한 초과로 버림", file=sys.stderr)
            households, src = 0, ""

        if not (households or year):
            stat["empty"] += 1
            misses[name] = today.strftime("%Y-%m-%d")
            continue
        if apply_result(hh_map, name, households, src, year):
            if households:
                stat["hh"] += 1
            if year:
                stat["year"] += 1
            since_save += 1
        misses.pop(name, None)
        if since_save >= SAVE_EVERY:
            # 응답없음 기록도 함께 저장한다. households.json만 체크포인트하면 스텝
            # 타임아웃에 걸렸을 때 misses가 통째로 유실되고, 다음 실행이 대장에 없는
            # 같은 지번을 처음부터 다시 부른다(워크플로 설계원칙 4).
            if save_progress(hh_data, miss_data, today):
                since_save = 0

    filled_after = sum(1 for v in hh_map.values() if v.get("households"))
    print(f"[대장] 이번 실행 세대수 {stat['hh']:,}개 · 준공연도 {stat['year']:,}개 · "
          f"대장에 없음 {stat['empty']:,} · 상한초과 버림 {stat['reject']:,} · "
          f"실패 {stat['fail']:,} · 누적 세대수 {filled_after:,}개")

    # 응답없음 기록은 값이 안 붙어도 저장해야 한다 — 저장하지 않으면 다음 실행이 대장에
    # 없는 같은 지번을 또 부르고, 예산이 그쪽에만 쓰인다.
    if stat["hh"] or stat["year"] or stat["empty"]:
        save_progress(hh_data, miss_data, today)
    else:
        print("변경 없음 — 저장 생략")


if __name__ == "__main__":
    main()
