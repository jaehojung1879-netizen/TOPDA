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
# data.go.kr이 버전을 올리면(예: V3→V4) 구버전 엔드포인트는 403/폐기된다.
# 현재 승인 현황: 단지목록=AptListService3(V3), 기본정보=AptBasisInfoServiceV4(V4)로 서로 다름.
# 확인된 버전을 먼저 시도하고 다른 버전을 폴백으로 둬, 향후 버전 변경에도 자동 대응한다.
KAPT_HOST = "https://apis.data.go.kr/1613000/"
KAPT_LIST_OPS = ["AptListService3/getSigunguAptList3", "AptListService4/getSigunguAptList4"]
KAPT_INFO_OPS = ["AptBasisInfoServiceV4/getAphusBassInfoV4", "AptBasisInfoServiceV3/getAphusBassInfoV3"]
_list_op = None   # 작동 확인된 목록 오퍼레이션(첫 성공 후 캐시)
_info_op = None   # 작동 확인된 기본정보 오퍼레이션(첫 성공 후 캐시)


def clean_school(name):
    """'서울왕북초등학교 체육관' → '서울왕북초등학교'. '초등학교'가 없으면 원본 유지."""
    if not name:
        return name
    m = re.match(r"^(.*?초등학교)", name)
    return m.group(1) if m else name


def _norm_name(s):
    """단지명 정규화(매칭용). 공백·괄호·하이픈과 '아파트' 단어만 제거한다.
    (과거 버그: 문자클래스 [아파트단지]로 개별 음절 아·파·트·단·지를 모두 지워
     '파크리오'→'크리오'처럼 이름이 깨져 K-apt 매칭이 거의 실패했음)"""
    s = (s or "").replace("아파트", "")
    return re.sub(r"[\s()\-·,_]", "", s)


def _name_keys(s):
    """매칭 키 후보(구체→느슨). 국토부 실거래(aptNm)와 K-apt(kaptName)의 표기 차이 흡수:
    '개포주공6단지'↔'개포주공6', '한양1차'↔'한양1', '진주(1단지)' 등.
    (2026-07-12: 정규화 원명 완전일치만 쓰던 시절 보강 대상 1,119개 중 29개만 매칭 —
     남은 미보강 단지 대부분이 이 표기 차이였다)"""
    base = _norm_name(s)
    keys = [base]
    for v in (re.sub(r"(\d+)(?:단지|차)$", r"\1", base),   # 끝의 '6단지'·'1차' → '6'·'1'
              re.sub(r"(\d+)(?:단지|차)", r"\1", base),    # 중간 포함 '1차상가동' 등
              base.replace("단지", "")):
        if v and v != base and v not in keys:
            keys.append(v)
    return keys


def _kapt_dong(it):
    """K-apt 목록 항목에서 읍면동명 추출. V3/V4 필드명이 다를 수 있어 방어적으로 시도."""
    for f in ("as3", "umdNm", "bjdongNm", "emdNm", "as4"):
        v = str(it.get(f) or "").strip()
        if v and (v.endswith("동") or v.endswith("읍") or v.endswith("면") or v.endswith("가")):
            return v
    # 주소 문자열에서 '○○동/읍/면/가' 추출 (폴백)
    addr = str(it.get("kaptAddr") or it.get("doroJuso") or it.get("as3") or "")
    m = re.search(r"([가-힣]+[0-9]?(?:동|읍|면|가))(?:\s|$)", addr)
    return m.group(1) if m else ""


def _put(d, k, code):
    """변형키→코드 등록. 다른 단지가 같은 키를 주장하면 ''(모호) 표식."""
    cur = d.get(k)
    if cur is None:
        d[k] = code
    elif cur != code:
        d[k] = ""


def kapt_map(sigungu_code, api_key):
    """시군구 단지목록 → {"sig": {변형키: 코드|''}, "dong": {동: {변형키: 코드|''}}, "n": 단지수}.
    같은 키를 서로 다른 단지가 주장하면(예: '주공1'과 '주공1차'의 축약 충돌) ''로 표식.
    동(洞) 단위 색인을 함께 만들어 일반명 충돌('벽산'·'두산' 등)을 법정동으로 푼다.
    모든 버전이 권한 오류(403)면 None(이후 호출 생략 신호), 그 외 실패는 빈 구조."""
    global _list_op
    ops = [_list_op] if _list_op else KAPT_LIST_OPS
    auth_fail = False
    for op in ops:
        try:
            items = L.get_items(KAPT_HOST + op, {"serviceKey": api_key, "sigunguCode": sigungu_code,
                                                 "numOfRows": 3000, "pageNo": 1})
            _list_op = op   # 작동 버전 캐시 (이후 이 버전만 호출)
            sig, dong = {}, {}
            n, n_dong = 0, 0
            for it in items:
                code = str(it.get("kaptCode") or "").strip()
                name = str(it.get("kaptName") or "").strip()
                if not (code and name):
                    continue
                n += 1
                d = _kapt_dong(it)
                if d:
                    n_dong += 1
                    dmap = dong.setdefault(d, {})
                for k in _name_keys(name):
                    _put(sig, k, code)
                    if d:
                        _put(dmap, k, code)
            return {"sig": sig, "dong": dong, "n": n, "n_dong": n_dong}
        except L.AuthError:
            auth_fail = True   # 이 버전 권한 없음 — 다음 버전 시도
        except Exception as e:  # noqa: BLE001 — 404(버전없음)·네트워크 등
            print(f"  ! K-apt 목록 실패 {sigungu_code} ({op}): {e}", file=sys.stderr)
    if auth_fail:
        return None
    return {"sig": {}, "dong": {}, "n": 0, "n_dong": 0}


def _match_in(table, keys):
    """변형키 목록으로 table(변형키→코드) 조회. ① 완전일치 ② 유일 포함관계.
    ''(모호)를 만나면 그 경로는 포기(None). 매칭 실패 시 None."""
    for k in keys:
        code = table.get(k)
        if code:
            return code
        if code == "":
            return None
    probe = keys[-1]
    if len(probe) >= 3 and re.search(r"[가-힣]", probe):
        hits = {c for k, c in table.items() if probe in k or (len(k) >= 3 and k in probe)}
        if len(hits) == 1 and "" not in hits:
            return next(iter(hits))
    return None


def kapt_match(kmap, name, dong=""):
    """단지명(+법정동) → kaptCode.
    ① 법정동 안에서 매칭(가장 정확 — '벽산'·'두산' 등 일반명 충돌을 동으로 해소)
    ② 실패 시 시군구 전체에서 매칭(기존 동작, 회귀 방지 폴백).
    실거래명이 법정동을 접두로 달고 오는 경우('대흥동태영')는 그 접두를 떼어 변형에 추가한다."""
    # 하위호환: 옛 평면 dict가 오면 시군구 맵으로 취급
    if "sig" not in kmap and "dong" not in kmap:
        sig, dmap = kmap, {}
    else:
        sig, dmap = kmap.get("sig", {}), kmap.get("dong", {})

    keys = list(_name_keys(name))
    # 법정동 접두 제거 변형: '대흥동태영'(+동) → '태영'
    if dong:
        base = _norm_name(name)
        dn = _norm_name(dong)
        if dn and base.startswith(dn) and len(base) > len(dn):
            for k in _name_keys(base[len(dn):]):
                if k not in keys:
                    keys.append(k)

    if dong and dong in dmap:
        code = _match_in(dmap[dong], keys)
        if code:
            return code
    return _match_in(sig, keys)


_info_diag = []   # 기본정보 조회 실패 사유 샘플(첫 몇 건) — 0건일 때 원인 진단용


def _to_int(v):
    """K-apt 숫자 필드 방어적 파싱. V4(JSON)는 값이 int/float/'1,234' 등 제각각이라
    str.isdigit()만 믿으면 전부 버려진다(2026-07-04: kaptdaCnt가 응답에 있는데도
    세대수 0건이던 원인). float 경유로 콤마·소수점 표기까지 흡수한다."""
    try:
        n = int(float(str(v).replace(",", "").strip()))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def kapt_info(code, api_key):
    """kaptCode → (세대수, 준공연도, 주소). V4→V3 순으로 시도. 실패 시 (None, None, None).
    주소(kaptAddr)는 실거래 전용 단지의 좌표·역·학교 보강(Kakao 지오코딩)에 쓴다.

    버그 수정: 과거에는 get_items가 예외 없이 '빈 응답/세대수 없음'을 줘도 _info_op를
    캐시해버려, 첫 호출에서 V4가 비면 V3 폴백을 영영 못 타고 전 단지 세대수가 0이 됐다.
    이제는 '세대수를 실제로 얻은' op만 캐시하고, 못 얻으면 다음 버전을 시도한다."""
    global _info_op
    ops = [_info_op] if _info_op else KAPT_INFO_OPS
    for op in ops:
        try:
            items = L.get_items(KAPT_HOST + op, {"serviceKey": api_key, "kaptCode": code})
        except L.AuthError as e:
            if len(_info_diag) < 4:
                _info_diag.append(f"{op}: 권한오류 {e}")
            continue
        except Exception as e:  # noqa: BLE001 — 404·네트워크 등
            if len(_info_diag) < 4:
                _info_diag.append(f"{op}: 예외 {e}")
            continue
        it = items[0] if items else {}
        # kaptdaCnt(세대수)가 0으로 오는 단지가 있다(2026-07-12 확인) — 호수(hoCnt)로 폴백.
        households = _to_int(it.get("kaptdaCnt")) or _to_int(it.get("hoCnt"))
        use = str(it.get("kaptUsedate") or "").strip()  # YYYYMMDD
        year = int(use[:4]) if len(use) >= 4 and use[:4].isdigit() else None
        if households:
            _info_op = op   # 세대수를 실제로 얻은 op만 캐시(올바른 버전 고정)
            addr = str(it.get("kaptAddr") or it.get("doroJuso") or "").strip() or None
            return households, year, addr
        # 응답은 왔으나 세대수가 비었다 → 원인 진단용으로 '실제 값'을 남기고 다른 버전 시도
        if len(_info_diag) < 4:
            _info_diag.append(f"{op}: items={len(items)} kaptdaCnt={it.get('kaptdaCnt')!r} "
                              f"hoCnt={it.get('hoCnt')!r} keys={list(it.keys())[:12]}")
    return None, None, None


# 주요 업무지구 좌표 (lng, lat) — 통근시간 추정용
HUBS = {
    "강남": (127.0276, 37.4979),   # 강남역
    "판교": (127.1112, 37.3947),   # 판교역
    "여의도": (126.9244, 37.5215), # 여의도역
    "광화문": (126.9769, 37.5707), # 광화문
}
# 브랜드 → 시공사. 구체 브랜드를 먼저 두어(첫 매치 채택) '롯데캐슬'이 '캐슬'보다 앞선다.
BUILDERS = [("래미안", "삼성물산"), ("자이", "GS건설"), ("푸르지오", "대우건설"),
            ("e편한세상", "DL이앤씨"), ("이편한세상", "DL이앤씨"), ("아크로", "DL이앤씨"),
            ("더샵", "포스코이앤씨"), ("힐스테이트", "현대건설"), ("디에이치", "현대건설"),
            ("롯데캐슬", "롯데건설"), ("르엘", "롯데건설"), ("캐슬", "롯데건설"),
            ("아이파크", "HDC현대산업"), ("위브", "두산건설"), ("트리마제", "두산건설"),
            ("센트레빌", "동부건설"), ("포레나", "한화 건설부문"), ("꿈에그린", "한화 건설부문"),
            ("SK뷰", "SK에코플랜트"), ("sk뷰", "SK에코플랜트"), ("SK VIEW", "SK에코플랜트"),
            ("데시앙", "태영건설"), ("우미린", "우미건설"),
            ("호반베르디움", "호반건설"), ("호반써밋", "호반건설"), ("베르디움", "호반건설"),
            ("중흥S", "중흥건설"), ("중흥에스", "중흥건설"), ("하늘채", "코오롱글로벌"),
            ("어울림", "금호건설"), ("스위첸", "KCC건설"), ("리슈빌", "계룡건설"),
            ("한라비발디", "HL디앤아이한라"), ("비발디", "HL디앤아이한라"),
            ("동원로얄듀크", "동원개발"), ("쌍용예가", "쌍용건설"), ("예가", "쌍용건설"),
            ("서희스타힐스", "서희건설"), ("신동아파밀리에", "신동아건설"),
            ("해모로", "HJ중공업"), ("풍림아이원", "풍림산업"), ("아이원", "풍림산업"),
            ("경남아너스빌", "SM경남기업"), ("아너스빌", "SM경남기업"),
            ("파라곤", "동양건설산업"), ("코아루", "한국토지신탁"),
            ("금강펜테리움", "금강주택"), ("펜테리움", "금강주택"),
            ("사랑으로", "부영주택"), ("한신더휴", "한신공영"), ("더휴", "한신공영"),
            ("벽산블루밍", "벽산"), ("블루밍", "벽산"), ("극동스타클래스", "극동건설"),
            ("협성휴포레", "협성건설"), ("에일린의뜰", "아이에스동서"),
            ("금호어울림", "금호건설"), ("한양수자인", "한양"), ("수자인", "한양"),
            ("모아엘가", "모아건설"), ("엘가", "모아건설"), ("골드클래스", "보광종합건설"),
            ("유승한내들", "유승종합건설"), ("한내들", "유승종합건설"),
            ("동문굿모닝힐", "동문건설"), ("굿모닝힐", "동문건설"),
            ("삼정그린코아", "삼정"), ("일성트루엘", "일성건설"), ("트루엘", "일성건설")]


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
TOP_PER_REGION = 20       # 지역별 거래 많은 상위 단지 수 (중위권 단지까지 포함하도록 10→20)
# Kakao 보강(지오코딩·역·학교) 1회 실행당 상한. 월초 신규 단지가 몰리면 50분 한도를 넘겨
# 저장 전에 강제 종료→매일 처음부터 재시도(무한 루프)되므로, 한 번에 이만큼만 보강하고
# 나머지는 다음 실행에서 점진 보강한다(merge가 기존 값을 보존하므로 안전).
MAX_ENRICH = 200
APARTMENTS_JSON = os.path.join(L.SITE_ASSETS, "apartments.json")


def valid_school(elem):
    """기존 elementary 값이 진짜 초등학교인지. '○○초등학교' 또는 약칭 '○○초'는 유효,
    과거 키워드 검색이 잘못 넣은 '○○영어교습소·학원·유치원' 등은 무효로 본다."""
    name = (elem or {}).get("name") or ""
    return name.endswith("초등학교") or name.endswith("초")


def band_label(area_m2):
    pyeong = round(area_m2 / 3.3058)
    return f"{int(round(area_m2))}㎡({pyeong}평)"


def recent_months(n):
    """오늘이 속한 달을 포함해 최근 n개월(YYYYMM 내림차순). 당월을 포함해야 이번 달 거래가 누락되지 않는다."""
    d = dt.date.today().replace(day=1)
    out = []
    for _ in range(n):
        out.append(d.strftime("%Y%m"))
        d = (d - dt.timedelta(days=1)).replace(day=1)
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
        # 가격이력: 월별 ㎡당가 평균 × 대표면적(거래 중위 면적).
        # 단순 월별 가격 평균은 평형 혼합에 왜곡된다 — 2026-07 왕십리자이 민원:
        # 2~3월은 85㎡만, 4월은 52㎡만 거래돼 실제 상승(㎡당 +30%)이 -24% 폭락으로 표시됐다.
        areas = sorted(d["area"] for d in deals)
        rep_area = areas[len(areas) // 2]
        by_month = defaultdict(list)
        for d in deals:
            if d["area"] > 0:
                by_month[d["ym"]].append(d["price"] / d["area"])
        history = [round(sum(v) / len(v) * rep_area) for _, v in sorted(by_month.items())][-4:]
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
    sch = L.nearest_school_kakao(lng, lat)
    if sch:
        apt["elementary"] = {"name": clean_school(sch[0]), "distance_m": sch[1], "in_zone": False}
    commute = estimate_commute(lng, lat)
    if commute:
        apt["commute"] = commute


def _akey(a):
    """단지 식별 복합키 '지역+단지명' — 동명 단지(예: 강동/종로 '아남1')가 다른 지역이면 별개로 취급."""
    return (a.get("region_key") or "") + "|" + (a.get("name") or "")


def _dong_of(a):
    """단지의 법정동('대흥동') — region에서 region_key 접두를 뗀 마지막 토큰. 세대수 매칭 정확도용."""
    region = a.get("region") or ""
    rk = a.get("region_key") or ""
    d = region[len(rk):].strip() if rk and region.startswith(rk) else region
    parts = d.split()
    return parts[-1] if parts else ""


def merge(existing, fresh):
    """'지역+단지명' 복합키 병합. 기존 큐레이션(세대수·노선 등) 보존, 가격/좌표는 신규로 갱신."""
    by_key = {_akey(a): a for a in existing.get("apartments", [])}
    for f in fresh:
        cur = by_key.get(_akey(f))
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
            by_key[_akey(f)] = f
    existing["apartments"] = list(by_key.values())
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
    existing_by_key = {_akey(a): a for a in existing.get("apartments", [])}
    fresh = []
    enriched_n = 0
    # 시간 예산: 스텝 타임아웃에 강제 종료되면 수집분 전체가 유실된다.
    # 여유가 5분 밑으로 줄면 외부 보강(Kakao·K-apt)을 멈추고 가격 수집만 계속,
    # 2분 밑으로 줄면 루프를 끊고 지금까지의 수집분을 병합·저장한다.
    deadline = L.deadline_from_env()
    kapt_off = False   # K-apt 403 권한 오류가 한 번 나면 이후 호출 전부 생략
    # K-apt 진단 카운터 — 세대수 보강이 0건이던 원인(권한/목록빈값/이름매칭)을 로그로 드러낸다.
    kstat = {"list_ok": 0, "list_empty": 0, "codes": 0, "matched": 0, "filled": 0, "needed": 0}

    # 사전 보정: 브랜드 사전 확장 시 기존 단지에도 시공사 소급 적용(이름 기반, 호출 0회).
    for a in existing.get("apartments", []):
        if not a.get("builder") or a.get("builder") == "기타":
            b = builder_of(a.get("name") or "")
            if b != "기타":
                a["builder"] = b

    # 사전 보정: 과거 키워드 검색이 잘못 넣은 학교(교습소·학원 등)를 카테고리 기반으로 정정.
    # 좌표가 이미 있어 1회 호출이면 되고, 예산(MAX_ENRICH) 내에서 점진 처리한다.
    fixed_school = 0
    for a in existing.get("apartments", []):
        if L.out_of_time(deadline, margin_sec=300):
            break
        if not valid_school(a.get("elementary")):
            if a.get("elementary") is not None:
                a.pop("elementary", None)  # 틀린 값은 우선 제거(잘못된 정보 노출 방지)
                fixed_school += 1
            if enriched_n < MAX_ENRICH and a.get("lat") and a.get("lng"):
                sch = L.nearest_school_kakao(a["lng"], a["lat"])
                if sch:
                    a["elementary"] = {"name": clean_school(sch[0]), "distance_m": sch[1], "in_zone": False}
                enriched_n += 1
    if fixed_school:
        print(f"학교 데이터 보정 대상 {fixed_school}건(초등학교 아님 → 제거/재조회)")

    for region, lawd in L.LAWD.items():
        if L.out_of_time(deadline, margin_sec=120):
            print("시간 예산 소진 — 남은 지역은 다음 실행에서 갱신 (merge가 기존 값 보존)")
            break
        enrich_ok = not L.out_of_time(deadline, margin_sec=300)   # 보강 계속할 여유가 있나
        region_items = []
        for code in L.resolve_lawd_codes(region, lawd, service_key, months):
            for ym in months:
                try:
                    region_items += fetch_region(code, ym, service_key)
                except Exception as e:  # noqa: BLE001
                    print(f"  ! {region} {ym} 수집 실패: {e}", file=sys.stderr)
        if not region_items:
            continue
        agg = aggregate(region, region_items)
        # 이 지역에 좌표/세대수가 없는 신규 단지가 있을 때만 K-apt 목록을 1회 호출
        needs_kapt = enrich_ok and any(
            not (existing_by_key.get(_akey(a)) or {}).get("households") for a in agg
        )
        kmap = {}
        if kapt_key and needs_kapt and not kapt_off:
            km = kapt_map(lawd, kapt_key)
            if km is None:   # 403 권한 오류 → 이후 전 지역 K-apt 호출 생략
                kapt_off = True
                print("  ※ K-apt 세대수 보강 생략 — data.go.kr에서 '공동주택 단지목록(AptListService)'·"
                      "'공동주택 기본정보(AptBasisInfoService)' API 활용신청·승인 필요.", file=sys.stderr)
            else:
                kmap = km
                if km.get("n"):
                    kstat["list_ok"] += 1
                    kstat["codes"] += km["n"]
                else:
                    kstat["list_empty"] += 1
        for a in agg:
            cur = existing_by_key.get(_akey(a)) or {}
            if cur.get("lat") and cur.get("lng"):
                # 큐레이션된 위치·통근·역/학교 정보 재사용 (Kakao 호출 생략). 학교는 사전 보정 패스에서 정정됨.
                for k in ("lat", "lng", "subway", "elementary", "commute"):
                    if cur.get(k) is not None:
                        a[k] = cur[k]
            elif enrich_ok and enriched_n < MAX_ENRICH:
                try:
                    enrich_location(a)
                    enriched_n += 1
                except Exception as e:  # noqa: BLE001
                    print(f"  ! {a['name']} 위치 보강 실패: {e}", file=sys.stderr)
            # K-apt 세대수·준공 보강 — 기존 세대수가 없을 때만
            if not cur.get("households"):
                kstat["needed"] += 1
                code = kapt_match(kmap, a["name"], _dong_of(a))
                if code:
                    kstat["matched"] += 1
                    hh, yr, _addr = kapt_info(code, kapt_key)
                    if hh:
                        a["households"] = hh
                        kstat["filled"] += 1
                    if yr and not a.get("built_year"):
                        a["built_year"] = yr
        fresh += agg
        print(f"[{region}] 거래 {len(region_items)}건 → 단지 {len(agg)}개")
    if not fresh:
        print("수집 결과 없음 — 기존 apartments.json 유지")
        return
    print(f"신규 위치 보강(Kakao) 호출 단지 수: {enriched_n}")
    # K-apt 세대수 보강 결과 요약 — 0건이면 어느 단계에서 막혔는지 바로 진단된다.
    if not kapt_key:
        print("[K-apt] 키 없음(DATA_GO_APT_BASIC_INFO/DATA_GO_*) — 세대수 보강 건너뜀", file=sys.stderr)
    elif kapt_off:
        print("[K-apt] 권한 오류로 전 지역 생략 — API 활용신청·승인 필요", file=sys.stderr)
    else:
        print(f"[K-apt] 목록 성공 지역 {kstat['list_ok']} / 빈 지역 {kstat['list_empty']} · "
              f"수집 단지코드 {kstat['codes']}개 · 세대수 필요 {kstat['needed']} → 이름매칭 {kstat['matched']} "
              f"→ 세대수확보 {kstat['filled']}건")
        if kstat["needed"] and not kstat["filled"]:
            print("  ! 세대수 0건 — 목록·이름매칭은 됐으나 기본정보(세대수) 조회가 전부 실패. "
                  "AptBasisInfoService 버전·승인·필드명 점검 필요.", file=sys.stderr)
            for d in _info_diag:
                print(f"    · 기본정보 실패 샘플: {d}", file=sys.stderr)
    merged = merge(existing, fresh)
    L.save_json_safe(APARTMENTS_JSON, merged, min_items_key="apartments")


if __name__ == "__main__":
    main()
