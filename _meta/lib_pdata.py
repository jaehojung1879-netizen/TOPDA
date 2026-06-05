#!/usr/bin/env python3
"""톺다 공공데이터 파이프라인 공용 유틸 (표준 라이브러리만 사용).

필요 환경변수(=GitHub Secrets):
  DATA_GO_KR_KEY       공공데이터포털 serviceKey (국토부 실거래·K-apt·학교알리미 공용)
  KAKAO_REST_API_KEY   Kakao Developers REST API 키 (주소→좌표, 지하철·학교 거리)
  REB_RONE_KEY         한국부동산원 R-ONE OpenAPI 키 (부동산 통계)
  NAVER_MAP_CLIENT_ID / NAVER_MAP_CLIENT_SECRET  (선택, Kakao 대체)
  JUSO_API_KEY, VWORLD_KEY                        (선택, 주소→좌표 대체)

설계 원칙
  - 외부 의존성 없음(urllib/json/xml). CI에서 pip install 불필요.
  - 네트워크/키 오류 시 예외를 올리되, 호출부가 '기존 데이터 보존'을 택할 수 있게 한다.
  - save_json_safe(): 수집 결과가 비면 기존 파일을 덮어쓰지 않는다(데이터 유실 방지).
"""
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

SITE_ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "site", "assets"))


def key(name, required=False):
    v = os.environ.get(name, "").strip()
    if required and not v:
        raise RuntimeError(f"환경변수 {name} 가 없습니다. GitHub Secret으로 등록하세요.")
    return v


def _request(url, headers=None, timeout=20, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", "replace")
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


def kakao_headers():
    return {"Authorization": "KakaoAK " + key("KAKAO_REST_API_KEY", required=True)}


def geocode_kakao(address):
    """주소 → (lng, lat). 실패 시 None."""
    try:
        j = get_json("https://dapi.kakao.com/v2/local/search/address.json",
                     {"query": address}, headers=kakao_headers())
        docs = j.get("documents") or []
        if not docs:
            return None
        d = docs[0]
        return float(d["x"]), float(d["y"])
    except Exception:
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


def load_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json_safe(path, data, min_items_key=None):
    """비어 있으면 저장하지 않음(기존 데이터 보존). min_items_key가 주어지면 그 리스트가 비면 skip."""
    if data is None:
        print(f"[skip] {os.path.basename(path)}: 수집 결과 없음 — 기존 파일 유지")
        return False
    if min_items_key is not None and not (data.get(min_items_key) or []):
        print(f"[skip] {os.path.basename(path)}: '{min_items_key}' 비어 있음 — 기존 파일 유지")
        return False
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(f"[ok] {os.path.basename(path)} 저장")
    return True


# 시군구 법정동 코드(LAWD_CD, 5자리) — 국토부 실거래 API용. 필요 지역만 수록.
LAWD = {
    "서울 강남구": "11680", "서울 서초구": "11650", "서울 송파구": "11710", "서울 강동구": "11740",
    "서울 마포구": "11440", "서울 성동구": "11200", "서울 종로구": "11110", "서울 양천구": "11470",
    "서울 영등포구": "11560", "서울 동작구": "11590", "서울 서대문구": "11410", "서울 노원구": "11350",
    "경기 수원시영통구": "41117", "경기 성남시분당구": "41135", "경기 용인시수지구": "41465",
    "경기 하남시": "41450", "경기 광명시": "41210", "경기 화성시": "41590", "경기 고양시일산서구": "41281",
    "인천 연수구": "28185", "인천 부평구": "28237", "부산 해운대구": "26350",
    "대구 수성구": "27260", "대전 서구": "30170",
}
