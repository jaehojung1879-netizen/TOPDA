#!/usr/bin/env python3
"""톺다 공공데이터 파이프라인 공용 유틸 (표준 라이브러리만 사용).

필요 환경변수(=GitHub Secrets):
  DATA_GO_KR_KEY       공공데이터포털 serviceKey (국토부 실거래·K-apt·학교알리미 공용)
  KAKAO_REST_API_KEY   Kakao Developers REST API 키 (주소→좌표, 지하철·학교 거리)
  REB_RONE_KEY         한국부동산원 R-ONE OpenAPI 키 (부동산 통계)
  NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET  (선택, Kakao 대체)
  JUSO_API_KEY                                    (선택, 주소→좌표 대체)

설계 원칙
  - 외부 의존성 없음(urllib/json/xml). CI에서 pip install 불필요.
  - 네트워크/키 오류 시 예외를 올리되, 호출부가 '기존 데이터 보존'을 택할 수 있게 한다.
  - save_json_safe(): 수집 결과가 비면 기존 파일을 덮어쓰지 않는다(데이터 유실 방지).
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

SITE_ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site", "assets"))

# ── 시간 예산 (워크플로 스텝 타임아웃보다 먼저 스스로 마무리·저장하기 위한 장치) ──
# 스텝 타임아웃으로 강제 종료되면 그 실행의 진행분이 통째로 유실된다.
# 워크플로가 TIME_BUDGET_MIN(분)을 주면, 수집기는 마감 전에 루프를 끊고 저장한다.
_T0 = time.monotonic()


def deadline_from_env(var="TIME_BUDGET_MIN", default_min=None):
    """모듈 로드 시각 기준 시간 예산(분) → monotonic 마감시각. 미설정이면 None(무제한)."""
    v = os.environ.get(var, "").strip()
    try:
        minutes = float(v) if v else default_min
    except ValueError:
        minutes = default_min
    return None if not minutes else _T0 + minutes * 60


def out_of_time(deadline, margin_sec=0):
    """마감까지 margin_sec 미만 남았는지. deadline이 None이면 항상 False."""
    return deadline is not None and time.monotonic() >= deadline - margin_sec


def key(names, required=False):
    """환경변수 값을 가져온다. names 는 문자열 또는 후보 이름 리스트(여러 이름 중 먼저 있는 값)."""
    if isinstance(names, str):
        names = [names]
    for n in names:
        v = os.environ.get(n, "").strip()
        if v:
            return v
    if required:
        raise RuntimeError(f"환경변수 {' 또는 '.join(names)} 중 하나가 필요합니다. GitHub Secret으로 등록하세요.")
    return ""


class AuthError(RuntimeError):
    """서비스키 미승인·권한 오류(401/403). 재시도해도 동일하므로 즉시 중단 신호로 쓴다."""


class TrafficExceeded(AuthError):
    """일일 요청 한도 초과(data.go.kr returnReasonCode 22).

    AuthError를 물려받는다 — 기존 수집기들이 `except L.AuthError`로 '즉시 중단'을 이미
    처리하고 있어, 새 예외를 그 밑에 두면 손대지 않아도 옳게 멈춘다. 오늘 더 불러 봐야
    같은 응답이므로 재시도·계속 진행 모두 무의미하다."""


# data.go.kr 공통 오류 봉투(OpenAPI_ServiceResponse)의 returnReasonCode 중, 재시도해도
# 결과가 같아 즉시 멈춰야 하는 것들. 이 응답은 HTTP 200으로 오고 <item>이 없어서, 걸러내지
# 않으면 '데이터 없는 정상 응답'으로 보인다 — 16,000건짜리 배치가 조용히 전부 공치게 된다.
_FATAL_REASONS = {
    "22": "일일 요청 한도 초과 — 내일 다시 실행하거나 활용신청으로 한도를 늘려야 한다",
    "30": "등록되지 않은 서비스키",
    "31": "활용기간 만료",
    "32": "등록되지 않은 IP",
    "20": "서비스 접근 거부",
}


def _raise_if_api_error(text):
    """data.go.kr 오류 봉투면 예외를 올린다. 정상 응답이면 아무 일도 하지 않는다."""
    if "returnReasonCode" not in text:
        return
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return
    node = root.find(".//returnReasonCode")
    code = (node.text or "").strip() if node is not None else ""
    if code not in _FATAL_REASONS:
        return
    msg_node = root.find(".//returnAuthMsg")
    msg = (msg_node.text or "").strip() if msg_node is not None else ""
    detail = f"{_FATAL_REASONS[code]} (코드 {code}{' ' + msg if msg else ''})"
    raise (TrafficExceeded if code == "22" else AuthError)(detail)


def _request(url, headers=None, timeout=20, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):   # 인증·권한 오류는 재시도해도 동일 → 즉시 중단(불필요한 백오프 방지)
                raise AuthError(f"인증/권한 오류 {e.code} — 서비스키가 해당 API에 활용신청·승인되지 않았을 수 있음 ({url[:80]}...)")
            if e.code == 404:          # 엔드포인트 없음(버전 폐기 등) → 재시도 무의미
                raise RuntimeError(f"404 Not Found — 엔드포인트 없음(버전 확인) ({url[:80]}...)")
            last = e
            time.sleep(2 ** i)
        except Exception as e:  # noqa: BLE001 — 네트워크 계열 전반
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"요청 실패({url[:80]}...): {last}")


def get_json(base, params, headers=None, timeout=20):
    url = base + ("&" if "?" in base else "?") + urllib.parse.urlencode(params)
    return json.loads(_request(url, headers=headers, timeout=timeout))


def get_xml(base, params, headers=None, timeout=20):
    url = base + ("&" if "?" in base else "?") + urllib.parse.urlencode(params)
    return ET.fromstring(_request(url, headers=headers, timeout=timeout))


def _parse_items(text):
    """data.go.kr 응답 본문 → (item 목록, totalCount 또는 None). XML·JSON 무관."""
    _raise_if_api_error(text)
    if text[:1] in ("{", "["):
        body = ((json.loads(text).get("response") or {}).get("body")) or {}
        items = body.get("items")
        if isinstance(items, dict):
            item = items.get("item")
        elif items is not None:
            item = items
        else:
            item = body.get("item")
        total = body.get("totalCount")
        if item is None:
            item = []
        elif not isinstance(item, list):
            item = [item]
        # 결과가 없을 때 items를 빈 문자열로 주는 엔드포인트가 있다("items": ""). 그대로
        # 넘기면 호출부의 it.get(...)이 AttributeError로 터지므로 dict만 남긴다.
        return [it for it in item if isinstance(it, dict)], _as_int(total)
    root = ET.fromstring(text)
    total = root.find(".//totalCount")
    return ([{c.tag: (c.text or "").strip() for c in it} for it in root.iter("item")],
            _as_int(total.text if total is not None else None))


def _as_int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def get_items(base, params, headers=None, timeout=20, retries=3):
    """data.go.kr 응답(XML 또는 JSON 무관)에서 item들을 dict 목록으로 정규화해 반환.
    버전·포맷이 바뀌어도(예: V4 기본 JSON) 동일하게 동작. AuthError/404는 그대로 전파."""
    return get_items_total(base, params, headers=headers, timeout=timeout,
                           retries=retries)[0]


def get_items_total(base, params, headers=None, timeout=20, retries=3):
    """get_items 와 같되 응답의 totalCount(전체 건수)를 함께 돌려준다 → (items, total).

    페이지 수를 미리 알아야 하는 수집기용이다. totalCount를 안 주는 엔드포인트도 있어
    그때는 None을 돌려주므로, 호출부는 '짧은 페이지에서 멈추기'로 폴백해야 한다.

    retries는 만 건 단위 배치에서 낮춰 잡으라고 열어 둔다 — 기본값 3은 백오프까지 더하면
    죽은 지번 하나에 1분 가까이 쓴다."""
    url = base + ("&" if "?" in base else "?") + urllib.parse.urlencode(params)
    return _parse_items(_request(url, headers=headers, timeout=timeout,
                                 retries=retries).strip())


KAKAO_KEYS = ["KAKAO_REST_API_KEY", "KAKAO_REST_KEY", "KAKAO_API_KEY"]
# 국토부 실거래가 키 (실제 등록명 DATA_GO_APT_PRICE 우선). data.go.kr 계정 키는 활성화한 API 전반에 공용.
DATA_GO_KEYS = ["DATA_GO_APT_PRICE", "DATA_GO_KR_KEY", "DATA_GO_KR_SERVICE_KEY", "DATA_GO_KR", "PUBLIC_DATA_KEY", "MOLIT_KEY"]
# K-apt 단지 기본정보(세대수·준공) 키 — 보강용. 없으면 위 PRICE 키로 폴백.
KAPT_KEYS = ["DATA_GO_APT_BASIC_INFO"] + DATA_GO_KEYS
RONE_KEYS = ["R_ONE", "REB_RONE_KEY", "R_ONE_KEY", "RONE_KEY", "REB_KEY"]
# 공동주택 공시가격은 2026-07-27부터 건축HUB 건축물대장 주택가격(getBrHsprcInfo)으로
# 받는다 — apis.data.go.kr이라 DATA_GO_KEYS를 그대로 쓴다. V-World 경로(PNU 변환 +
# api.vworld.kr)는 Actions 클라우드 IP가 차단돼 한 건도 못 모아 걷어냈다(이력은 git 참조).
# 따라서 VWORLD_* 시크릿은 더 이상 쓰이지 않는다.


# ── 행정구역 개편 자가 탐색 ──
# 구 설치·분할로 기존 LAWD 코드가 폐지되면 그 지역 수집이 조용히 0건이 된다.
# (화성시 2026.2 만세·효행·병점·동탄구 신설, 인천 2026.7 개편 등 — 신규 코드는 고시 전까지 불확실.)
# 여기 등록된 지역은 기본 코드가 최근 2개월 모두 0건일 때 후보 코드를 1회씩 탐색해,
# 실거래가 나오는 코드들을 채택한다(같은 region 키로 합산 — 프런트 지역 키는 그대로 유지).
MOLIT_TRADE = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
LAWD_CANDIDATES = {
    # 화성시: 41590 폐지 가능성 — 신설 4개 구 코드 후보(4159x 대역)
    "경기 화성시": ["41591", "41592", "41593", "41594", "41595", "41596", "41597", "41598", "41599"],
    # 인천 서구: 2026-07 개편으로 **서해구·검단구로 분할**(중구→영종구, 동구→제물포구도 같은 개편).
    # 옛 서구 코드(28260)로도 거래가 조회돼 '0건일 때만 탐색' 조건에 안 걸렸고, 그 결과
    # 갈라져 나간 구의 단지가 조용히 누락돼 있었다(세대수 보강 29.5%). 이제 기본 코드가
    # 살아 있어도 후보를 합산한다(resolve_lawd_codes 참고). 신설 구 코드가 미확인이라
    # 2826x·287x 대역을 넓게 둔다 — 거래가 실제로 나오는 코드만 채택하므로 오채택은 없다.
    "인천 서구": ["28261", "28262", "28263", "28264", "28265", "28266", "28267",
                "28270", "28271", "28272", "28275", "28280", "28285"],
    # 광주 서구·남구: 2026-07-01 전남광주통합특별시 출범으로 광주(29)·전남(46) 코드 체계
    # 개편 — 기존 29140/29155 전 기간 0건의 원인. 새 시도코드가 미확인이라 유력 대역을
    # 자가탐색한다(1차 후보 53~55 대역은 2026-07-13 런에서 전부 0건 → 범위 확대).
    # 행정코드 순서는 '시(목포·여수·순천·광양·나주)→구(동·서·남·북·광산)→군'으로 확정
    # (2026-04-28 발표) — 통상 배분(110,130,…)이면 서구=XX230, 남구=XX250.
    # 새 시도코드는 강원(42→51)·전북(45→52) 선례상 53~60 대역 유력. 자가탐색은 실거래가
    # 실제로 나오는 코드만 채택하므로 범위를 넓혀도 오채택 위험이 없다(값이 없으면 그대로 0건).
    # 채택 코드는 CI 로그 [LAWD 자가탐색]에 남는다 — 확인되면 LAWD 본표에 고정할 것.
    # MOLIT가 신규 코드로 데이터를 아직 안 옮겼다면 이번 분기엔 계속 0건일 수 있다(외생 요인).
    "광주 서구": [f"{p}230" for p in range(53, 61)] + ["53140", "54140", "46230", "29140"],
    "광주 남구": [f"{p}250" for p in range(53, 61)] + ["53155", "54155", "46250", "29155"],
}
_lawd_resolved = {}   # region → [codes] (프로세스 내 캐시)


def _trade_count(code, ym, service_key):
    try:
        root = get_xml(MOLIT_TRADE, {"serviceKey": service_key, "LAWD_CD": code,
                                     "DEAL_YMD": ym, "numOfRows": 1, "pageNo": 1})
        total = root.findtext(".//totalCount")
        if total is not None and str(total).strip().isdigit():
            return int(str(total).strip())
        return sum(1 for _ in root.iter("item"))
    except Exception:  # noqa: BLE001 — 탐색 실패는 0건 취급
        return 0


def resolve_lawd_codes(region, default_code, service_key, recent_yms):
    """지역의 유효 LAWD 코드 목록.

    행정구역 개편에는 두 가지가 있고, 대응이 다르다.

    ① 코드 폐지·교체 — 기본 코드가 0건이 된다. 후보 중 거래가 나오는 코드로 **대체**한다.
       (경기 화성시 41590 폐지 → 41591·41593·41595·41597 채택)

    ② 분할 — 기본 코드가 **살아 있는 채로** 일부만 담게 된다. 2026-07 개편으로
       인천 서구가 서해구·검단구로, 중구가 영종구로, 동구가 제물포구로 나뉘었다.
       옛 코드로도 여전히 거래가 조회되니 ①의 '0건일 때만 탐색' 조건에 걸려
       탐색 자체가 돌지 않고, 갈라져 나간 구의 단지가 통째로 누락된다.
       그래서 기본 코드가 살아 있어도 후보를 확인해 거래가 있으면 **합친다**.

    ②는 조용히 누락되기 때문에 ①보다 발견이 늦다. 실제로 인천 서구는 세대수 보강이
    0%가 아니라 29.5%로 '조금은 되는' 상태라 한동안 정상으로 보였다.
    """
    if region in _lawd_resolved:
        return _lawd_resolved[region]
    codes = [default_code]
    if region in LAWD_CANDIDATES:
        yms = list(recent_yms)[:2]
        alive = any(_trade_count(default_code, ym, service_key) > 0 for ym in yms)
        found = [c for c in LAWD_CANDIDATES[region]
                 if c != default_code and any(_trade_count(c, ym, service_key) > 0 for ym in yms)]
        if not alive:
            if found:
                print(f"[LAWD 자가탐색] {region}: {default_code} 0건 → 대체 코드 {found}")
                codes = found
            else:
                print(f"[LAWD 자가탐색] {region}: 기본·후보 코드 모두 0건 — 코드 고시 확인 필요")
        elif found:
            print(f"[LAWD 자가탐색] {region}: {default_code} 유효 + 분할 코드 {found} 합산")
            codes = [default_code] + found
        else:
            print(f"[LAWD 자가탐색] {region}: {default_code} 유효 · 추가 코드 없음")
    _lawd_resolved[region] = codes
    return codes


def kakao_headers():
    return {"Authorization": "KakaoAK " + key(KAKAO_KEYS, required=True)}


def geocode_kakao(address, strict=False):
    """주소 → (lng, lat). 결과가 없으면 None.

    strict=True면 요청 자체가 실패했을 때(네트워크·429·5xx) 예외를 그대로 올린다.
    '주소가 잘못됐다'와 '이번에 못 물어봤다'를 구분해야 하는 호출부를 위한 것이다 —
    전자는 영구 표식을 남겨도 되지만 후자에 표식을 남기면 멀쩡한 단지를 영영 잃는다
    (2026-07-28: 두 경우를 뭉뚱그려 addr_bad로 잠근 항목이 274건 있었다)."""
    try:
        j = get_json("https://dapi.kakao.com/v2/local/search/address.json",
                     {"query": address}, headers=kakao_headers())
    except Exception:
        if strict:
            raise
        return None
    try:
        docs = j.get("documents") or []
        if not docs:
            return None
        d = docs[0]
        return float(d["x"]), float(d["y"])
    except Exception:   # noqa: BLE001 — 응답 형태가 예상과 다르면 '결과 없음'으로 본다
        return None


def nearest_kakao(lng, lat, category_code=None, keyword=None, radius=1500):
    """좌표 기준 가장 가까운 장소까지 (이름, 거리m). category_code 예: 'SW8'(지하철역).
    keyword 예: '초등학교'. 실패 시 None."""
    try:
        if category_code:
            base = "https://dapi.kakao.com/v2/local/search/category.json"
            params = {"category_group_code": category_code, "x": lng, "y": lat,
                      "radius": radius, "sort": "distance"}
        else:
            base = "https://dapi.kakao.com/v2/local/search/keyword.json"
            params = {"query": keyword, "x": lng, "y": lat, "radius": radius, "sort": "distance"}
        j = get_json(base, params, headers=kakao_headers())
        docs = j.get("documents") or []
        if not docs:
            return None
        d = docs[0]
        return d["place_name"], int(float(d.get("distance") or 0))
    except Exception:
        return None


def nearest_school_kakao(lng, lat, radius=2000):
    """가장 가까운 '초등학교'까지 (이름, 거리m). 학교 카테고리(SC4)에서 이름에 '초등학교'가
    들어간 곳만 채택한다. 키워드 검색은 영어교습소·학원(AC5) 등을 잘못 잡으므로 쓰지 않는다."""
    try:
        j = get_json("https://dapi.kakao.com/v2/local/search/category.json",
                     {"category_group_code": "SC4", "x": lng, "y": lat,
                      "radius": radius, "sort": "distance", "size": 15},
                     headers=kakao_headers())
        for d in (j.get("documents") or []):
            name = d.get("place_name", "")
            if "초등학교" in name:
                return name, int(float(d.get("distance") or 0))
        return None
    except Exception:
        return None


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json_safe(path, data, min_items_key=None, indent=2):
    """비어 있으면 저장하지 않음(기존 데이터 보존). min_items_key가 주어지면 그 리스트가 비면 skip.

    indent=None이면 구분자까지 붙여 최소 크기로 저장한다(대용량 원장용). 사람이 diff를 읽는
    작은 파일은 기본값(2)을 그대로 쓴다.
    """
    if data is None:
        print(f"[skip] {os.path.basename(path)}: 수집 결과 없음 — 기존 파일 유지")
        return False
    if min_items_key is not None and not (data.get(min_items_key) or []):
        print(f"[skip] {os.path.basename(path)}: '{min_items_key}' 비어 있음 — 기존 파일 유지")
        return False
    tmp = path + ".tmp"
    kw = {"indent": indent} if indent is not None else {"separators": (",", ":")}
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, **kw)
    os.replace(tmp, path)
    print(f"[ok] {os.path.basename(path)} 저장 ({os.path.getsize(path) / 1024 / 1024:.1f}MB)")
    return True


# 시군구 법정동 코드(LAWD_CD, 5자리) — 국토부 실거래 API용.
# 키는 "<시도> <시군구>" 형식(시/구가 2단계면 "수원시 영통구")으로 모호함을 없앤다.
#
# ⚠ 행정구역 개편 시 코드가 폐지·분할되면 그 지역 수집이 조용히 0건이 된다.
#   (사례: 부천시 2024년 구 재설치로 41190 → 원미/소사/오정 3개 코드로 분리,
#    인천 2026.7 행정체제 개편으로 중구·동구·서구 일부 재편.)
#   collect_transactions가 '0건 지역' 요약을 로그로 남기니, 0건이 계속되면 코드를 점검할 것.
LAWD = {
    # 서울 25개 구 전체
    "서울 종로구": "11110", "서울 중구": "11140", "서울 용산구": "11170", "서울 성동구": "11200",
    "서울 광진구": "11215", "서울 동대문구": "11230", "서울 중랑구": "11260", "서울 성북구": "11290",
    "서울 강북구": "11305", "서울 도봉구": "11320", "서울 노원구": "11350", "서울 은평구": "11380",
    "서울 서대문구": "11410", "서울 마포구": "11440", "서울 양천구": "11470", "서울 강서구": "11500",
    "서울 구로구": "11530", "서울 금천구": "11545", "서울 영등포구": "11560", "서울 동작구": "11590",
    "서울 관악구": "11620", "서울 서초구": "11650", "서울 강남구": "11680", "서울 송파구": "11710",
    "서울 강동구": "11740",
    # 경기 — 수원·성남·안양·안산·용인은 전체 구, 시 단위는 주요 시 전체
    "경기 수원시 장안구": "41111", "경기 수원시 권선구": "41113",
    "경기 수원시 영통구": "41117", "경기 수원시 팔달구": "41115",
    "경기 성남시 분당구": "41135", "경기 성남시 수정구": "41131", "경기 성남시 중원구": "41133",
    "경기 용인시 수지구": "41465", "경기 용인시 기흥구": "41463", "경기 용인시 처인구": "41461",
    "경기 고양시 일산동구": "41285", "경기 고양시 일산서구": "41287", "경기 고양시 덕양구": "41281",
    "경기 안양시 동안구": "41173", "경기 안양시 만안구": "41171",
    # 부천시: 2024년 구 재설치로 41190(폐지) → 원미·소사·오정 3개 코드
    "경기 부천시 원미구": "41192", "경기 부천시 소사구": "41194", "경기 부천시 오정구": "41196",
    "경기 화성시": "41590",
    "경기 남양주시": "41360", "경기 안산시 단원구": "41273", "경기 안산시 상록구": "41271",
    "경기 평택시": "41220",
    "경기 광명시": "41210", "경기 하남시": "41450", "경기 김포시": "41570", "경기 의정부시": "41150",
    "경기 구리시": "41310", "경기 과천시": "41290", "경기 군포시": "41410", "경기 의왕시": "41430",
    "경기 시흥시": "41390", "경기 오산시": "41370", "경기 파주시": "41480", "경기 이천시": "41500",
    "경기 안성시": "41550", "경기 광주시": "41610", "경기 양주시": "41630",
    # 인천 — ⚠ 2026.7 행정체제 개편(검단구·영종구·제물포구 신설) 대상. 서구·중구 계열이
    # 0건으로 바뀌면 신설 구 코드로 교체 필요.
    "인천 연수구": "28185", "인천 부평구": "28237", "인천 서구": "28260", "인천 남동구": "28200",
    "인천 미추홀구": "28177", "인천 계양구": "28245",
    # 세종 — 키를 "<시도> <시군구>" 2단으로 유지해야 프런트 드롭다운(sido/gu 분해)이 깨지지 않는다
    "세종 세종시": "36110",
    # 부산
    "부산 해운대구": "26350", "부산 수영구": "26500", "부산 동래구": "26260", "부산 부산진구": "26230",
    # 대구
    "대구 수성구": "27260", "대구 달서구": "27290",
    # 대전
    "대전 서구": "30170", "대전 유성구": "30200",
    # 광주 · 울산
    "광주 서구": "29140", "광주 남구": "29155", "울산 남구": "31140",
}

