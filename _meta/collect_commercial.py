#!/usr/bin/env python3
"""상업용부동산(상가·오피스) 임대시세 → site/assets/commercial.json

한국부동산원 R-ONE **상업용부동산 임대동향조사**(분기)에서 지역·유형별
  · 임대료(㎡당, 원/월)  · 공실률(%)  · 투자수익률(%)
를 모아 '지역별 상가 임차시세' 대시보드용 JSON을 만든다.

R-ONE 통계표 ID(STATBL_ID)는 조사 개편마다 바뀌므로 **코드에 박지 않고**
GitHub 변수 `RONE_COMM_TABLES`(JSON)로 주입한다. 미설정이면 데이터 없이 스킵하고
기존 commercial.json(초기 예시)을 보존한다 → 화면은 '데이터 준비 중'으로 동작.

RONE_COMM_TABLES 예시(유형 key → 지표 → STATBL_ID):
  {
    "office":     {"rent": "A_2024_xxxxx", "vacancy": "A_2024_xxxxx", "yield": "A_2024_xxxxx"},
    "medium":     {"rent": "...", "vacancy": "...", "yield": "..."},
    "small":      {"rent": "...", "vacancy": "...", "yield": "..."},
    "collective": {"rent": "...", "vacancy": "...", "yield": "..."}
  }
"""
import datetime as dt
import json
import os
import sys

import lib_pdata as L

RONE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
OUT_JSON = os.path.join(L.SITE_ASSETS, "commercial.json")

TYPES = [
    {"key": "office",     "name": "오피스"},
    {"key": "medium",     "name": "중대형상가"},
    {"key": "small",      "name": "소규모상가"},
    {"key": "collective", "name": "집합상가"},
]
METRICS = ("rent", "vacancy", "yield")   # 임대료(원/㎡)·공실률(%)·투자수익률(%)

# 지도용 시도 중심 좌표(상권 단위가 아니라 시도 단위 노출).
SIDO_COORD = {
    "서울": (37.5665, 126.9780), "부산": (35.1796, 129.0756), "대구": (35.8714, 128.6014),
    "인천": (37.4563, 126.7052), "광주": (35.1595, 126.8526), "대전": (36.3504, 127.3845),
    "울산": (35.5384, 129.3114), "세종": (36.4801, 127.2890), "경기": (37.4138, 127.5183),
    "강원": (37.8228, 128.1555), "충북": (36.6357, 127.4917), "충남": (36.5184, 126.8000),
    "전북": (35.7175, 127.1530), "전남": (34.8161, 126.4630), "경북": (36.4919, 128.8889),
    "경남": (35.4606, 128.2132), "제주": (33.4996, 126.5312),
}


def fetch_quarter(statbl, start, end, api_key):
    """분기 통계표 → {지역명: {분기: 값}}."""
    out, page = {}, 1
    while page <= 12:
        j = L.get_json(RONE, {
            "KEY": api_key, "Type": "json", "STATBL_ID": statbl, "DTACYCLE_CD": "QQ",
            "START_WRTTIME": start, "END_WRTTIME": end, "pIndex": page, "pSize": 1000,
        })
        rows = []
        for block in (j.get("SttsApiTblData") or []):
            if isinstance(block, dict) and block.get("row"):
                rows = block["row"]
        if not rows:
            break
        for r in rows:
            region = (r.get("CLS_NM") or "").strip()
            q = (r.get("WRTTIME_IDTFR_ID") or "").strip()
            try:
                val = float(r.get("DTA_VAL"))
            except (TypeError, ValueError):
                continue
            if region and q:
                out.setdefault(region, {})[q] = val
        if len(rows) < 1000:
            break
        page += 1
    return out


def latest(series):
    if not series:
        return None
    return series[max(series.keys())]


def main():
    raw = os.environ.get("RONE_COMM_TABLES", "").strip()
    if not raw:
        print("[skip] RONE_COMM_TABLES 미설정 — 상업용 임대 통계표 ID가 없어 수집 생략. "
              "기존 commercial.json(예시) 보존.", file=sys.stderr)
        return
    try:
        tables = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[skip] RONE_COMM_TABLES JSON 파싱 실패: {e}", file=sys.stderr)
        return

    api_key = L.key(L.RONE_KEYS, required=True)
    end = dt.date.today().strftime("%Y") + "0" + str((dt.date.today().month - 1) // 3 + 1)  # YYYYQ
    start = str(dt.date.today().year - 2) + "01"

    # {region: {type: {metric: value}}}
    agg = {}
    for tkey, metrics in tables.items():
        for metric, statbl in (metrics or {}).items():
            if metric not in METRICS or not statbl:
                continue
            try:
                data = fetch_quarter(statbl, start, end, api_key)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {tkey}/{metric} ({statbl}) 수집 실패: {e}", file=sys.stderr)
                continue
            for region, series in data.items():
                v = latest(series)
                if v is None:
                    continue
                agg.setdefault(region, {}).setdefault(tkey, {})[metric] = round(v, 2)

    if not agg:
        print("[skip] 수집 결과 없음 — 기존 commercial.json 유지", file=sys.stderr)
        return

    regions = []
    for region, by_type in sorted(agg.items()):
        coord = SIDO_COORD.get(region)
        regions.append({
            "key": region, "sido": region, "name": region,
            "lat": coord[0] if coord else None, "lng": coord[1] if coord else None,
            "data": by_type,
        })

    payload = {
        "_meta": {
            "source": "한국부동산원 R-ONE 상업용부동산 임대동향조사(분기)",
            "units": {"rent": "원/㎡·월", "vacancy": "%", "yield": "%(분기)"},
            "note": "유형: 오피스·중대형상가·소규모상가·집합상가. 지역·상권 구성에 따라 차이가 있습니다.",
        },
        "as_of": end,
        "types": TYPES,
        "regions": regions,
    }
    L.save_json_safe(OUT_JSON, payload, min_items_key="regions")


if __name__ == "__main__":
    main()
