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
import re
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
    """분기 통계표 → {지역명: {분기: 값}}.

    collect_market.fetch_metric과 동일하게 R-ONE 오류를 RuntimeError로 올려 CI 로그에
    사유가 드러나게 하고, 첫 페이지부터 빈 응답이면 원문 일부를 남긴다(2026-07-15 진단:
    분기 시점 형식이 틀려 조용히 0행이 반환됐고, 오류 표면화가 없어 원인이 가려졌음)."""
    import collect_market as M
    out, page = {}, 1
    while page <= 12:
        j = L.get_json(RONE, {
            "KEY": api_key, "Type": "json", "STATBL_ID": statbl, "DTACYCLE_CD": "QQ",
            "START_WRTTIME": start, "END_WRTTIME": end, "pIndex": page, "pSize": 1000,
        })
        code, msg = M.rone_result(j)
        if code and not code.upper().startswith("INFO-0"):
            raise RuntimeError(f"R-ONE 응답 오류 [{code}] {msg} (STATBL_ID={statbl})")
        rows = []
        for block in (j.get("SttsApiTblData") or []):
            if isinstance(block, dict) and block.get("row"):
                rows = block["row"]
        if not rows:
            if page == 1 and not out:
                print(f"  · {statbl}: row 없음(분기 {start}~{end}). 응답 키={list(j.keys())} "
                      f"일부={str(j)[:200]}", file=sys.stderr)
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


# ── 통계표 자동 발견 (RONE_COMM_TABLES 미설정 시) ──
# 전세지수·전세가율에서 검증된 방식: 통계표 목록(SttsApiTbl.do)을 한 번 내려받아
# 이름으로 유형×지표 표를 찾는다. 임대료는 '지수' 표(기준시점=100)와 혼동하지 않도록 제외.
TYPE_KW = {"office": "오피스", "medium": "중대형", "small": "소규모", "collective": "집합"}
METRIC_KW = {"rent": "임대료", "vacancy": "공실률", "yield": "투자수익률"}


def _list_all_tables(api_key):
    """R-ONE 통계표 목록 [(STATBL_ID, 이름)]. collect_market의 재시도 로직 재사용
    (2026-07-17: 이 호출이 네트워크 타임아웃으로 실패해 상업용 임대 자동발견이
    매번 스킵됐다 — 짧은 재시도로 일시적 지연에 견고하게 만들었다)."""
    import collect_market as M
    return M._list_all_tables(api_key)


MAX_PROBE = 4   # 후보당 실호출 검증 상한(호출량 절제 — 이름만으론 실제 데이터 유무를 알 수 없다)


def discover_tables(api_key, probe_start, probe_end):
    """유형(오피스/중대형/소규모/집합) × 지표(임대료/공실률/투자수익률) 표 자동 발견.

    이름으로만 고르면 동명 이표(같은 조사의 개편 전/후 ID 등) 중 '이름은 최신인데
    실제로는 빈 표'를 채택할 수 있다(2026-07-16 확인: [INFO-200] 해당 데이터 없음 —
    후보 10개 중 데이터가 실제로 채워진 표가 다른 ID였음). 후보를 우선순위대로
    최근 분기 1회 조회해 데이터가 실제로 나오는 첫 표를 채택한다."""
    try:
        all_tables = _list_all_tables(api_key)
    except Exception as e:  # noqa: BLE001
        print(f"[skip] 통계표 목록 조회 실패({e}) — 자동 발견 불가", file=sys.stderr)
        return None
    tables = {}
    for tkey, tkw in TYPE_KW.items():
        for metric, mkw in METRIC_KW.items():
            hits = []
            for sid, name in all_tables:
                flat = name.replace(" ", "")
                if tkw not in flat or mkw not in flat:
                    continue
                if "지수" in flat and metric == "rent":   # 임대료는 지수 표 제외
                    continue
                # 폐지된 과거 시계열(예: 투자수익률 '(2002년~2012년)') 배제 — 닫힌 연도범위 표.
                # 현재 진행형 시계열은 '~)'로 끝나므로(예: '(2024년3분기~)') 그쪽을 선호한다.
                if re.search(r"\(\d{4}년[^)]*~\d{4}년", flat):
                    continue
                current = "~)" in flat or "분기~" in flat
                hits.append((0 if current else 1, sid, name))
            hits.sort()   # 현재 진행형(0) 우선
            picked = None
            for _, sid, name in hits[:MAX_PROBE]:
                try:
                    data = fetch_quarter(sid, probe_start, probe_end, api_key)
                except Exception as e:  # noqa: BLE001
                    print(f"  · {tkey}/{metric} 후보 {sid} 검증 실패: {e}", file=sys.stderr)
                    continue
                if data:
                    picked = (sid, name)
                    break
                print(f"  · {tkey}/{metric} 후보 {sid} ({name}) — 데이터 없음, 다음 후보 시도", file=sys.stderr)
            if picked:
                sid, name = picked
                tables.setdefault(tkey, {})[metric] = sid
                extra = f" (검증 통과, 후보 {len(hits)}건 중)" if len(hits) > 1 else ""
                print(f"[자동발견] {tkey}/{metric}: {sid} ({name}){extra}")
            elif hits:
                print(f"[자동발견] {tkey}/{metric}: 후보 {len(hits)}건 모두 데이터 없음", file=sys.stderr)
            else:
                print(f"[자동발견] {tkey}/{metric}: 매칭 없음", file=sys.stderr)
    return tables or None


def main():
    api_key = L.key(L.RONE_KEYS, required=True)
    # R-ONE 분기 시점 식별자는 'YYYYQ'(예: 2024년 3분기 = '20243'). 과거엔 'YYYY0Q'(6자리)
    # 형식을 보내 전 표에서 0행이 반환됐다(2026-07-15 원인). 범위를 넉넉히 잡고(미래 분기는
    # 빈 응답) latest()가 최신 분기를 고르게 한다.
    y = dt.date.today().year
    start = f"{y - 3}1"   # 3년 전 1분기
    end = f"{y}4"         # 올해 4분기까지

    raw = os.environ.get("RONE_COMM_TABLES", "").strip()
    tables = None
    if raw:
        try:
            tables = json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"! RONE_COMM_TABLES JSON 파싱 실패({e}) — 자동 발견으로 폴백", file=sys.stderr)
    if not tables:
        tables = discover_tables(api_key, start, end)
    if not tables:
        print("[skip] 상업용 임대 통계표를 찾지 못함 — 기존 commercial.json 보존. "
              "R-ONE easyStat에서 표 ID를 확인해 RONE_COMM_TABLES 변수로 지정할 수 있습니다.",
              file=sys.stderr)
        return

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
            "tables": tables,   # 사용한 STATBL_ID — 자동 발견분은 확인 후 RONE_COMM_TABLES에 고정 권장
        },
        "as_of": end,
        "types": TYPES,
        "regions": regions,
    }
    L.save_json_safe(OUT_JSON, payload, min_items_key="regions")


if __name__ == "__main__":
    main()
