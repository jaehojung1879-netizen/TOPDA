#!/usr/bin/env python3
"""국토교통부 아파트 매매 실거래가 → site/assets/apartments.json 갱신.

흐름
  1) 시군구(LAWD)별 최근 N개월 실거래 수집 (국토부 OpenAPI, XML)
  2) 단지(아파트명)별로 평형(전용면적 밴드)·최근 실거래가·가격이력 집계
  3) Kakao Local API로 단지 좌표·최근접 지하철역·초등학교 거리 보강
  4) (선택) K-apt로 세대수·준공연도 보강
  5) 기존 apartments.json과 안전 병합(큐레이션 값 보존, 수집 실패 시 기존 유지)

DATA_GO_KR_KEY 는 공공데이터포털의 '일반 인증키(Decoding)' 사용 권장.
첫 실행은 GitHub Actions(네트워크 가능)에서 수행하고 로그로 파라미터를 검증하세요.
"""
import datetime as dt
import math
import os
import re
import sys
from collections import defaultdict

import lib_pdata as L

# ── K-apt(공동주택) 단지정보 — 세대수·준공연도 보강 ──
KAPT_LIST = "https://apis.data.go.kr/1613000/AptListService3/getSigunguAptList3"
KAPT_INFO = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV3/getAphusBassInfoV3"


def clean_school(name):
    """'서울왕북초등학교 체육관' → '서울왕북초등학교'. '초등학교'가 없으면 원본 유지."""
    if not name:
        return name
    m = re.match(r"^(.*?초등학교)", name)
    return m.group(1) if m else name


def _norm_name(s):
    return re.sub(r"[\s()\-아파트단지]", "", s or "")


def kapt_map(sigungu_code, api_key):
    """시군구 단지목록 → {정규화 단지명: kaptCode}. 실패 시 빈 dict."""
    out = {}
    try:
        root = L.get_xml(KAPT_LIST, {"serviceKey": api_key, "sigunguCode": sigungu_code,
                                     "numOfRows": 3000, "pageNo": 1})
        for it in root.iter("item"):
            code = (it.findtext("kaptCode") or "").strip()
            name = (it.findtext("kaptName") or "").strip()
            if code and name:
                out[_norm_name(name)] = code
    except Exception as e:  # noqa: BLE001
        print(f"  ! K-apt 목록 실패 {sigungu_code}: {e}", file=sys.stderr)
    return out


def kapt_info(code, api_key):
    """kaptCode → (세대수, 준공연도). 실패 시 (None, None)."""
    try:
        root = L.get_xml(KAPT_INFO, {"serviceKey": api_key, "kaptCode": code})
        cnt = (root.findtext(".//kaptdaCnt") or "").strip()
        use = (root.findtext(".//kaptUsedate") or "").strip()  # YYYYMMDD
        households = int(cnt) if cnt.isdigit() else None
        year = int(use[:4]) if len(use) >= 4 and use[:4].isdigit() else None
        return households, year
    except Exception:  # noqa: BLE001
        return None, None

# 주요 업무지구 좌표 (lng, lat) — 통근시간 추정용
HUBS = {
    "강남": (127.0276, 37.4979),   # 강남역
    "판교": (127.1112, 37.3947),   # 판교역
    "여의도": (126.9244, 37.5215), # 여의도역
    "광화문": (126.9769, 37.5707), # 광화문
}
BUILDERS = [("래미안", "삼성물산"), ("자이", "GS건설"), ("푸르지오", "대우건설"),
            ("e편한세상", "DL이앤씨"), ("더샵", "포스코이앤씨"), ("힐스테이트", "현대건설"),
            ("롯데캐슬", "롯데건설"), ("캐슬", "롯데건설"), ("아이파크", "HDC현대산업"),
            ("위브", "두산건설"), ("센트레빌", "동부건설")]


def builder_of(name):
    for k, v in BUILDERS:
        if k in name:
            return v
    return "기타"


def haversine_km(lng1, lat1, lng2, lat2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def estimate_commute(lng, lat):
    """수도권 단지 → 4대 업무지구 추정 통근시간(분). 직선거리×보정(도어투도어 ~26km/h).
    Kakao Mobility(자동차 ETA) 키가 있으면 이 함수를 대체하세요."""
    if not (36.8 <= lat <= 38.3 and 126.3 <= lng <= 127.6):  # 수도권 대략 bbox
        return None
    out = {}
    for hub, (hlng, hlat) in HUBS.items():
        km = haversine_km(lng, lat, hlng, hlat)
        out[hub] = int(round(8 + km / 26.0 * 60))  # 기본 8분 + 이동
    return out

MOLIT = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
MONTHS_BACK = 4           # 최근 4개월 실거래 (호출량·시간 절감)
TOP_PER_REGION = 10       # 지역별 거래 많은 상위 단지 수
APARTMENTS_JSON = os.path.join(L.SITE_ASSETS, "apartments.json")


def band_label(area_m2):
    pyeong = round(area_m2 / 3.3058)
    return f"{int(round(area_m2))}㎡({pyeong}평)"


def recent_months(n):
    today = dt.date.today().replace(day=1)
    out = []
    for i in range(1, n + 1):
        d = (today - dt.timedelta(days=1)).replace(day=1)
        today = d
        out.append(d.strftime("%Y%m"))
    return out


def fetch_region(lawd_cd, ym, service_key):
    """한 시군구·한 달 실거래 item 리스트."""
    root = L.get_xml(MOLIT, {
        "serviceKey": service_key, "LAWD_CD": lawd_cd, "DEAL_YMD": ym,
        "numOfRows": 1000, "pageNo": 1,
    })
    items = []
    for it in root.iter("item"):
        def g(tag):
            el = it.find(tag)
            return (el.text or "").strip() if el is not None else ""
        try:
            amount = int(g("dealAmount").replace(",", ""))
            area = float(g("excluUseAr"))
        except ValueError:
            continue
        items.append({
            "apt": g("aptNm"), "area": area, "price": amount,
            "build_year": g("buildYear"), "umd": g("umdNm"), "jibun": g("jibun"),
            "ym": f"{g('dealYear')}-{int(g('dealMonth') or 0):02d}",
        })
    return items


def aggregate(region_name, items):
    """단지별 → 평형별 최근가 + 가격이력. 거래 많은 상위 단지만."""
    by_apt = defaultdict(list)
    for it in items:
        by_apt[it["apt"]].append(it)
    ranked = sorted(by_apt.items(), key=lambda kv: len(kv[1]), reverse=True)[:TOP_PER_REGION]
    out = []
    for apt, deals in ranked:
        deals.sort(key=lambda d: d["ym"])
        # 평형 밴드별 최근 실거래가
        by_area = defaultdict(list)
        for d in deals:
            by_area[round(d["area"])].append(d)
        units = []
        for area, ds in sorted(by_area.items()):
            ds.sort(key=lambda d: d["ym"])
            units.append({"label": band_label(area), "area_m2": area, "recent_price": ds[-1]["price"]})
        # 가격이력: 월별 평균(최근 4개월)
        by_month = defaultdict(list)
        for d in deals:
            by_month[d["ym"]].append(d["price"])
        history = [round(sum(v) / len(v)) for _, v in sorted(by_month.items())][-4:]
        parts = region_name.split()
        sido = parts[0]
        sigungu = " ".join(parts[1:]) if len(parts) > 1 else region_name
        out.append({
            "name": apt, "region": f"{region_name} {deals[-1]['umd']}",
            "region_key": region_name,  # "서울 강남구" — 시도+시군구로 모호함 제거
            "sido": sido, "sigungu": sigungu,
            "built_year": int(deals[-1]["build_year"] or 0) or None,
            "units": units, "price_history": history, "builder": builder_of(apt),
            "_addr": f"{region_name} {deals[-1]['umd']} {deals[-1]['jibun']}",
        })
    return out


def enrich_location(apt):
    """Kakao로 좌표·지하철·초등학교 보강."""
    geo = L.geocode_kakao(apt.get("_addr", ""))
    if not geo:
        return
    lng, lat = geo
    apt["lat"], apt["lng"] = round(lat, 6), round(lng, 6)
    sub = L.nearest_kakao(lng, lat, category_code="SW8")
    if sub:
        apt["subway"] = {"station": sub[0], "line": "", "distance_m": sub[1]}
    sch = L.nearest_kakao(lng, lat, keyword="초등학교")
    if sch:
        apt["elementary"] = {"name": clean_school(sch[0]), "distance_m": sch[1], "in_zone": False}
    commute = estimate_commute(lng, lat)
    if commute:
        apt["commute"] = commute


def merge(existing, fresh):
    """이름 기준 병합. 기존 큐레이션(세대수·노선 등) 보존, 가격/좌표는 신규로 갱신."""
    by_name = {a["name"]: a for a in existing.get("apartments", [])}
    for f in fresh:
        cur = by_name.get(f["name"])
        if cur:
            cur["units"] = f["units"] or cur.get("units")
            cur["price_history"] = f["price_history"] or cur.get("price_history")
            if f.get("built_year"):
                cur["built_year"] = f["built_year"]
            for k in ("lat", "lng"):
                if f.get(k):
                    cur[k] = f[k]
            # 신규(실데이터·정제된) 값을 우선 반영
            if f.get("subway") and f["subway"].get("station"):
                cur["subway"] = f["subway"]
            if f.get("elementary") and f["elementary"].get("name"):
                cur["elementary"] = f["elementary"]
            if f.get("households"):
                cur["households"] = f["households"]
            if f.get("builder") and f["builder"] != "기타":
                cur["builder"] = f["builder"]
            for k in ("region_key", "sido", "sigungu", "region"):
                if f.get(k):
                    cur[k] = f[k]
        else:
            f.pop("_addr", None)
            if not f.get("households"):
                f["households"] = None  # K-apt 보강 전까지 미상
            by_name[f["name"]] = f
    existing["apartments"] = list(by_name.values())
    existing.setdefault("_meta", {})["as_of"] = dt.date.today().strftime("%Y-%m")
    return existing


def main():
    service_key = L.key(L.DATA_GO_KEYS, required=True)
    kapt_key = L.key(L.KAPT_KEYS)  # 선택: 세대수·준공 보강 (없으면 건너뜀)
    months = recent_months(MONTHS_BACK)
    # 기존(큐레이션) 단지를 먼저 읽어, 이미 좌표·세대수가 있는 단지는 외부 보강 호출을 생략한다.
    # Kakao 지오코딩(단지당 3회)이 전 지역에 걸쳐 누적되면 워크플로가 30분 한도를 초과하므로,
    # 가격만 신규 실거래로 갱신하고 위치/세대수는 기존 값을 재사용한다(신규 단지만 보강).
    existing = L.load_json(APARTMENTS_JSON, default={"apartments": []})
    existing_by_name = {a.get("name"): a for a in existing.get("apartments", [])}
    fresh = []
    enriched_n = 0
    for region, lawd in L.LAWD.items():
        region_items = []
        for ym in months:
            try:
                region_items += fetch_region(lawd, ym, service_key)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {region} {ym} 수집 실패: {e}", file=sys.stderr)
        if not region_items:
            continue
        agg = aggregate(region, region_items)
        # 이 지역에 좌표/세대수가 없는 신규 단지가 있을 때만 K-apt 목록을 1회 호출
        needs_kapt = any(
            not (existing_by_name.get(a["name"]) or {}).get("households") for a in agg
        )
        kmap = kapt_map(lawd, kapt_key) if (kapt_key and needs_kapt) else {}
        for a in agg:
            cur = existing_by_name.get(a["name"]) or {}
            if cur.get("lat") and cur.get("lng"):
                # 큐레이션된 위치·통근·역/학교 정보 재사용 (Kakao 호출 생략)
                for k in ("lat", "lng", "subway", "elementary", "commute"):
                    if cur.get(k) is not None:
                        a[k] = cur[k]
            else:
                try:
                    enrich_location(a)
                    enriched_n += 1
                except Exception as e:  # noqa: BLE001
                    print(f"  ! {a['name']} 위치 보강 실패: {e}", file=sys.stderr)
            # K-apt 세대수·준공 보강 — 기존 세대수가 없을 때만
            if not cur.get("households"):
                code = kmap.get(_norm_name(a["name"]))
                if code:
                    hh, yr = kapt_info(code, kapt_key)
                    if hh:
                        a["households"] = hh
                    if yr and not a.get("built_year"):
                        a["built_year"] = yr
        fresh += agg
        print(f"[{region}] 거래 {len(region_items)}건 → 단지 {len(agg)}개")
    if not fresh:
        print("수집 결과 없음 — 기존 apartments.json 유지")
        return
    print(f"신규 위치 보강(Kakao) 호출 단지 수: {enriched_n}")
    merged = merge(existing, fresh)
    L.save_json_safe(APARTMENTS_JSON, merged, min_items_key="apartments")


if __name__ == "__main__":
    main()
