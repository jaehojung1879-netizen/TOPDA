#!/usr/bin/env python3
"""한국부동산원 R-ONE 상업용부동산 임대동향 → commercial.json.

R-ONE 분기 자료는 ``DTACYCLE_CD=QY``와 한 개의
``WRTTIME_IDTFR_ID=YYYY0Q``(예: 2026년 1분기 = 202601)로 조회한다.
통계표가 개편될 때 ID가 바뀌므로 현재 진행 중인 표를 이름으로 찾고, 실제 행이
반환되는 최신 분기를 확인한 뒤 게시한다. 실패나 비정상 결과는 기존 파일을
덮어쓰지 않는다.

선택적으로 GitHub 변수 ``RONE_COMM_TABLES``에 기존 형식의 JSON을 지정해 자동
발견 결과를 고정할 수 있다.

  {
    "office": {"rent": "TT...", "vacancy": "TT...", "yield": "TT..."},
    "medium": {"rent": "TT...", "vacancy": "TT...", "yield": "TT..."}
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
    {"key": "office", "name": "오피스"},
    {"key": "medium", "name": "중대형상가"},
    {"key": "small", "name": "소규모상가"},
    {"key": "collective", "name": "집합상가"},
]
METRICS = ("rent", "vacancy", "yield")
TYPE_KW = {
    "office": "오피스",
    "medium": "중대형상가",
    "small": "소규모상가",
    "collective": "집합상가",
}

# 현재 화면은 시도 단위 지도를 제공한다. 상권(도심·강남·동대구 등)은 별도 행으로
# 반환되지만 시도 마커와 중복되므로 이 payload에서는 시도 합계만 게시한다.
SIDO_COORD = {
    "서울": (37.5665, 126.9780),
    "부산": (35.1796, 129.0756),
    "대구": (35.8714, 128.6014),
    "인천": (37.4563, 126.7052),
    "광주": (35.1595, 126.8526),
    "대전": (36.3504, 127.3845),
    "울산": (35.5384, 129.3114),
    "세종": (36.4801, 127.2890),
    "경기": (37.4138, 127.5183),
    "강원": (37.8228, 128.1555),
    "충북": (36.6357, 127.4917),
    "충남": (36.5184, 126.8000),
    "전북": (35.7175, 127.1530),
    "전남": (34.8161, 126.4630),
    "경북": (36.4919, 128.8889),
    "경남": (35.4606, 128.2132),
    "제주": (33.4996, 126.5312),
}

MAX_PROBE = 12
_PROBE_CACHE = {}


def quarter_ids(today=None, lookback=16):
    """기준일이 속한 분기부터 과거 순서로 R-ONE 분기 식별자를 만든다."""
    today = today or dt.date.today()
    year = today.year
    quarter = (today.month - 1) // 3 + 1
    out = []
    for _ in range(lookback):
        out.append(f"{year}{quarter:02d}")
        quarter -= 1
        if quarter == 0:
            year -= 1
            quarter = 4
    return out


def format_quarter(period):
    """R-ONE ``YYYY0Q``를 화면용 ``YYYYQn``으로 바꾼다."""
    value = str(period or "").strip()
    if re.fullmatch(r"\d{6}", value) and value[-2] == "0" and value[-1] in "1234":
        return f"{value[:4]}Q{value[-1]}"
    return value


def _response_rows(payload):
    rows = []
    for block in payload.get("SttsApiTblData") or []:
        if isinstance(block, dict) and isinstance(block.get("row"), list):
            rows.extend(block["row"])
    return rows


def _response_total(payload):
    for block in payload.get("SttsApiTblData") or []:
        if not isinstance(block, dict):
            continue
        candidates = [block] + [head for head in (block.get("head") or []) if isinstance(head, dict)]
        for candidate in candidates:
            for key, value in candidate.items():
                if str(key).lower() == "list_total_count":
                    try:
                        return int(value)
                    except (TypeError, ValueError):
                        return None
    return None


def fetch_period(statbl, period, api_key):
    """한 통계표의 한 분기 원본 행을 전 페이지에서 가져온다.

    ``INFO-200``은 아직 발표되지 않았거나 해당 표에 없는 분기이므로 빈 결과로
    처리한다. 인증·파라미터 오류 등 다른 응답은 CI에서 원인이 보이도록 예외로
    올린다.
    """
    import collect_market as M

    cache_key = (statbl, period)
    if cache_key in _PROBE_CACHE:
        return _PROBE_CACHE[cache_key]

    out = []
    page = 1
    while page <= 20:
        payload = L.get_json(
            RONE,
            {
                "KEY": api_key,
                "Type": "json",
                "STATBL_ID": statbl,
                "DTACYCLE_CD": "QY",
                "WRTTIME_IDTFR_ID": period,
                "pIndex": page,
                "pSize": 1000,
            },
        )
        code, message = M.rone_result(payload)
        normalized = str(code or "").upper()
        if normalized == "INFO-200":
            _PROBE_CACHE[cache_key] = []
            return []
        if normalized and normalized != "INFO-000":
            raise RuntimeError(
                f"R-ONE 응답 오류 [{code}] {message} "
                f"(STATBL_ID={statbl}, WRTTIME_IDTFR_ID={period})"
            )

        rows = _response_rows(payload)
        if not rows:
            break
        out.extend(rows)
        total = _response_total(payload)
        if (total is not None and len(out) >= total) or len(rows) < 1000:
            break
        page += 1

    _PROBE_CACHE[cache_key] = out
    return out


def table_start_period(name):
    """표 제목의 시작 시점을 정렬용 숫자로 반환한다."""
    flat = str(name or "").replace(" ", "")
    match = re.search(r"\((\d{4})년(?:(\d)분기)?~\)", flat)
    if not match:
        return 0
    return int(match.group(1)) * 100 + int(match.group(2) or 1)


def _is_closed_series(name):
    flat = str(name or "").replace(" ", "")
    return bool(re.search(r"\(\d{4}년[^)]*~\d{4}년", flat))


def _matches_metric(name, metric):
    flat = str(name or "").replace(" ", "")
    if _is_closed_series(flat):
        return False
    if metric == "rent":
        return "지역별임대료" in flat and "층별" not in flat and "지수" not in flat
    if metric == "vacancy":
        return "지역별공실률" in flat
    if metric == "yield":
        return (
            "수익률(분기)" in flat
            and "소득수익률" not in flat
            and "자본수익률" not in flat
        )
    return False


def _list_all_tables(api_key):
    import collect_market as M

    return M._list_all_tables(api_key)


def _latest_rows(statbl, periods, api_key, deadline=None):
    for period in periods:
        if L.out_of_time(deadline, margin_sec=20):
            return None, []
        try:
            rows = fetch_period(statbl, period, api_key)
        except Exception as exc:  # noqa: BLE001
            print(f"  · {statbl}/{period} 조회 실패: {exc}", file=sys.stderr)
            continue
        if rows:
            return period, rows
    return None, []


def discover_tables(api_key, periods, deadline=None):
    """표 이름과 실제 최신 분기 행을 함께 검증해 유형별 통계표를 고른다."""
    try:
        all_tables = _list_all_tables(api_key)
    except Exception as exc:  # noqa: BLE001
        print(f"[skip] 통계표 목록 조회 실패({exc}) — 자동 발견 불가", file=sys.stderr)
        return None

    selected = {}
    for type_key, type_name in TYPE_KW.items():
        for metric in METRICS:
            if L.out_of_time(deadline, margin_sec=20):
                print("[자동발견] 시간 예산 초과 — 남은 표 탐색 중단", file=sys.stderr)
                return selected or None

            candidates = []
            for statbl, name in all_tables:
                flat = name.replace(" ", "")
                if type_name not in flat or not _matches_metric(name, metric):
                    continue
                candidates.append((table_start_period(name), statbl, name))
            candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)

            picked = None
            for _, statbl, name in candidates[:MAX_PROBE]:
                period, rows = _latest_rows(statbl, periods, api_key, deadline)
                if rows:
                    picked = {"id": statbl, "name": name, "period": period}
                    break
            if picked:
                selected.setdefault(type_key, {})[metric] = picked
                print(
                    f"[자동발견] {type_key}/{metric}: {picked['id']} "
                    f"({picked['period']}, {picked['name']})"
                )
            else:
                print(
                    f"[자동발견] {type_key}/{metric}: "
                    f"후보 {min(len(candidates), MAX_PROBE)}/{len(candidates)}건에 최신 데이터 없음",
                    file=sys.stderr,
                )
    return selected or None


def _item_name(row):
    return " ".join(
        str(row.get(key) or "").strip()
        for key in ("ITM_NM", "ITM_FULLNM")
        if row.get(key)
    )


def metric_value(row, metric):
    """행을 화면 단위로 변환한다. 대상이 아닌 수익률 세부 행은 None."""
    if metric == "yield" and "투자수익률" not in _item_name(row):
        return None
    try:
        value = float(row.get("DTA_VAL"))
    except (TypeError, ValueError):
        return None

    if metric == "rent":
        unit = str(row.get("UI_NM") or row.get("UNIT_NM") or "")
        if "천원" in unit:
            value *= 1000
        elif "만원" in unit:
            value *= 10000
    return value


def _normalize_override(raw_tables, periods, api_key, deadline):
    """기존 ``{metric: id}`` 환경변수를 검증 결과 객체로 정규화한다."""
    selected = {}
    for type_key, metrics in (raw_tables or {}).items():
        if type_key not in TYPE_KW or not isinstance(metrics, dict):
            continue
        for metric, value in metrics.items():
            if metric not in METRICS:
                continue
            statbl = value.get("id") if isinstance(value, dict) else value
            if not statbl:
                continue
            period, rows = _latest_rows(str(statbl), periods, api_key, deadline)
            if rows:
                selected.setdefault(type_key, {})[metric] = {
                    "id": str(statbl),
                    "name": value.get("name", "") if isinstance(value, dict) else "",
                    "period": period,
                }
            else:
                print(f"  · 고정 표 {type_key}/{metric}({statbl})에 최신 데이터 없음", file=sys.stderr)
    return selected or None


def _publishable(regions):
    """빈 결과·단위 오류·명백한 이상치가 기존 정상 파일을 덮지 못하게 한다."""
    if len(regions) < 5:
        return False, f"시도 데이터가 {len(regions)}개뿐임(최소 5개 필요)"

    rent_count = 0
    for region in regions:
        for values in (region.get("data") or {}).values():
            rent = values.get("rent")
            vacancy = values.get("vacancy")
            yield_value = values.get("yield")
            if rent is not None:
                rent_count += 1
                if not 500 <= rent <= 10_000_000:
                    return False, f"임대료 단위/범위 이상: {region['key']}={rent}"
            if vacancy is not None and not 0 <= vacancy <= 100:
                return False, f"공실률 범위 이상: {region['key']}={vacancy}"
            if yield_value is not None and not -100 <= yield_value <= 100:
                return False, f"투자수익률 범위 이상: {region['key']}={yield_value}"
    if not rent_count:
        return False, "임대료 행이 한 건도 없음"
    return True, ""


def main():
    api_key = L.key(L.RONE_KEYS, required=True)
    periods = quarter_ids()
    deadline = L.deadline_from_env(default_min=8)

    selected = None
    raw = os.environ.get("RONE_COMM_TABLES", "").strip()
    if raw:
        try:
            selected = _normalize_override(json.loads(raw), periods, api_key, deadline)
        except json.JSONDecodeError as exc:
            print(f"! RONE_COMM_TABLES JSON 해석 실패({exc}) — 자동 발견으로 대체", file=sys.stderr)
    if not selected:
        selected = discover_tables(api_key, periods, deadline)
    if not selected:
        print("[skip] 유효한 상업용 임대 통계표를 찾지 못해 기존 commercial.json 보존", file=sys.stderr)
        return

    aggregate = {}
    actual_periods = []
    for type_key, metrics in selected.items():
        for metric, info in (metrics or {}).items():
            rows = fetch_period(info["id"], info["period"], api_key)
            accepted = 0
            for row in rows:
                region = str(row.get("CLS_NM") or "").strip()
                if region not in SIDO_COORD:
                    continue
                value = metric_value(row, metric)
                if value is None:
                    continue
                aggregate.setdefault(region, {}).setdefault(type_key, {})[metric] = round(value, 2)
                accepted += 1
            if accepted:
                actual_periods.append(info["period"])
            else:
                print(
                    f"  · {type_key}/{metric}({info['id']}, {info['period']})에서 "
                    "시도 대상 행을 찾지 못함",
                    file=sys.stderr,
                )

    regions = []
    for region, by_type in sorted(aggregate.items()):
        lat, lng = SIDO_COORD[region]
        regions.append(
            {
                "key": region,
                "sido": region,
                "name": region,
                "lat": lat,
                "lng": lng,
                "data": by_type,
            }
        )

    ok, reason = _publishable(regions)
    if not ok:
        print(f"[skip] 수집 품질검사 실패({reason}) — 기존 commercial.json 보존", file=sys.stderr)
        return

    table_ids = {
        type_key: {metric: info["id"] for metric, info in metrics.items()}
        for type_key, metrics in selected.items()
    }
    table_periods = {
        type_key: {metric: info["period"] for metric, info in metrics.items()}
        for type_key, metrics in selected.items()
    }
    table_names = {
        type_key: {metric: info.get("name", "") for metric, info in metrics.items()}
        for type_key, metrics in selected.items()
    }
    payload = {
        "_meta": {
            "source": "한국부동산원 R-ONE 상업용부동산 임대동향조사(분기)",
            "units": {"rent": "원/㎡·월", "vacancy": "%", "yield": "%(분기)"},
            "note": "시도 단위 자료. 임대료는 R-ONE 천원/㎡ 값을 원/㎡로 환산했습니다.",
            "tables": table_ids,
            "table_periods": table_periods,
            "table_names": table_names,
        },
        "as_of": format_quarter(max(actual_periods)),
        "types": TYPES,
        "regions": regions,
    }
    L.save_json_safe(OUT_JSON, payload, min_items_key="regions")


if __name__ == "__main__":
    main()
