#!/usr/bin/env python3
"""한국부동산원 R-ONE 부동산통계 → site/assets/market.json 갱신.

R-ONE OpenAPI (SttsApiTblData.do)
  GET https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do
  params: KEY, Type=json, STATBL_ID, DTACYCLE_CD=MM, START_WRTTIME, END_WRTTIME, pIndex, pSize
  - CLS_ID(지역)를 지정하지 않으면 모든 지역(전국·시도·시군구) 행이 반환됨 → 자동으로 구 단위까지 수집.
  resp: { "SttsApiTblData": [ {..head..}, {"row":[ {CLS_NM, WRTTIME_IDTFR_ID, DTA_VAL, ...} ]} ] }

통계표 ID (월간, 아파트)
  매매가격지수 : A_2024_00045
  전세가격지수 : A_2024_00050
  전세가율(매매가격대비 전세가격비율) : R-ONE easyStat URL의 A_2024_xxxxx 확인 후 입력
"""
import datetime as dt
import hashlib
import os
import re
import sys

import lib_pdata as L

RONE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
RONE_TBL_LIST = "https://www.reb.or.kr/r-one/openapi/SttsApiTbl.do"   # 통계표 목록(있으면 이름으로 자동 발견)
MARKET_JSON = os.path.join(L.SITE_ASSETS, "market.json")
MONTHS = 13

# 월간 아파트 통계표 ID (지수)
METRICS = {
    "sale_index":   "A_2024_00045",  # 매매가격지수_아파트
    "jeonse_index": "A_2024_00050",  # 전세가격지수_아파트
}
# 평균가격 통계표 → 전세가율(전세평균/매매평균) 계산용
#  매매 평균가격: A_2024_00188 (확인). 전세 평균가격: 추정(검증으로 비정상 자동 배제).
AVG = {
    "sale_avg":   "A_2024_00188",
    "jeonse_avg": "A_2024_00190",
}

# 전세가율 직접 통계표(아파트 매매가격대비 전세가격비율, 월간).
#  R-ONE easyStat에서 확인한 STATBL_ID를 GitHub 변수/시크릿 RONE_RATIO_STATBL_ID 로 주입하면
#  평균가격 역산(AVG) 대신 이 표를 그대로 사용한다(더 정확). 미설정이면 AVG 폴백.
RATIO_STATBL = os.environ.get("RONE_RATIO_STATBL_ID", "").strip()


def norm_month(s):
    s = str(s or "")
    m = re.search(r"(\d{4})\D*(\d{2})", s)  # "202605" / "2026년 05월" / "2026.05"
    return f"{m.group(1)}-{m.group(2)}" if m else None


def rone_result(j):
    """R-ONE 응답에서 RESULT(CODE/MESSAGE)를 찾아 (code, msg)로 반환. 없으면 (None, None).
    정상 데이터는 RESULT가 없고, 키·통계표·기간 오류는 RESULT.CODE(ERROR-*/INFO-*)로 내려온다.
    위치가 응답 최상위거나 SttsApiTblData[*].head 안에 들어오는 두 형태를 모두 본다."""
    def pick(d):
        if isinstance(d, dict) and isinstance(d.get("RESULT"), dict):
            r = d["RESULT"]
            return str(r.get("CODE") or "").strip(), str(r.get("MESSAGE") or r.get("MSG") or "").strip()
        return None
    top = pick(j)
    if top:
        return top
    for block in (j.get("SttsApiTblData") or []):
        if isinstance(block, dict):
            got = pick(block)
            if got:
                return got
            for h in (block.get("head") or []):
                got = pick(h)
                if got:
                    return got
    return None, None


def fetch_metric(statbl_id, start, end, api_key):
    """STATBL_ID 한 표의 전 지역 시계열 → {지역명: {month: value}}.
    R-ONE이 RESULT 오류(키 미승인·통계표ID 오류 등)를 내려주면 즉시 RuntimeError로 올려
    CI 로그에 실패 사유가 드러나게 한다(과거: 0개 수집을 조용히 삼켜 원인 불명이었음)."""
    out = {}
    page = 1
    while page <= 12:
        j = L.get_json(RONE, {
            "KEY": api_key, "Type": "json", "STATBL_ID": statbl_id, "DTACYCLE_CD": "MM",
            "START_WRTTIME": start, "END_WRTTIME": end, "pIndex": page, "pSize": 1000,
        })
        code, msg = rone_result(j)
        if code and not code.upper().startswith("INFO-0"):  # INFO-000=정상. 그 외 INFO-*/ERROR-*는 오류
            raise RuntimeError(f"R-ONE 응답 오류 [{code}] {msg} (STATBL_ID={statbl_id})")
        rows = []
        for block in (j.get("SttsApiTblData") or []):
            if isinstance(block, dict) and block.get("row"):
                rows = block["row"]
        if not rows:
            if page == 1 and not out:  # 첫 페이지부터 데이터·오류 둘 다 없음 → 구조 점검용 원문 일부 출력
                print(f"  · {statbl_id}: row 없음. 응답 키={list(j.keys())} 일부={str(j)[:200]}", file=sys.stderr)
            break
        for r in rows:
            region = (r.get("CLS_NM") or "").strip()
            mon = norm_month(r.get("WRTTIME_IDTFR_ID") or r.get("WRTTIME_DESC"))
            if not region or not mon:
                continue
            try:
                val = float(r.get("DTA_VAL"))
            except (TypeError, ValueError):
                continue
            out.setdefault(region, {})[mon] = val
        if len(rows) < 1000:
            break
        page += 1
    return out


# ── STATBL_ID 자동 발견 ──
# R-ONE 통계표는 개편 시 ID가 바뀌어 조용히 빈다(전세지수 A_2024_00050이 그 사례).
# 이 환경에서는 R-ONE을 직접 못 부르니, CI 실행 시 수집기가 스스로 찾게 한다:
#   1) 통계표 목록 API(SttsApiTbl.do)가 있으면 표 '이름'으로 검색해 채택 (정확)
#   2) 목록이 없으면 sale_index 주변 후보 ID를 1개월치로 탐색해 '지수처럼 생긴' 표를 채택 (근사)
# 채택된 ID는 로그와 market.json _meta에 남겨, 확인 후 METRICS에 고정할 수 있게 한다.

def _row_get(r, key_sub):
    for k, v in r.items():
        if key_sub in str(k).upper():
            return str(v or "").strip()
    return ""


def discover_statbl(api_key, keywords, exclude=()):
    """통계표 목록에서 이름에 keywords가 모두 포함된 표들의 (ID, 이름) 목록. 목록 API 불가 시 None."""
    try:
        found = []
        page = 1
        while page <= 30:
            j = L.get_json(RONE_TBL_LIST, {"KEY": api_key, "Type": "json", "pIndex": page, "pSize": 1000})
            code, msg = rone_result(j)
            if code and not code.upper().startswith("INFO-0"):
                raise RuntimeError(f"[{code}] {msg}")
            rows = []
            for block in (j.get("SttsApiTbl") or j.get("SttsApiTblData") or []):
                if isinstance(block, dict) and block.get("row"):
                    rows = block["row"]
            if not rows:
                break
            for r in rows:
                name = _row_get(r, "STATBL_NM") or _row_get(r, "TBL_NM") or _row_get(r, "NM")
                sid = _row_get(r, "STATBL_ID")
                # 공백 제거 후 비교 — "전세가격 비율"/"매매가격대비 전세가격비율" 등 띄어쓰기 변형 흡수
                flat = name.replace(" ", "")
                if sid and name and all(k.replace(" ", "") in flat for k in keywords) \
                        and not any(x in flat for x in exclude):
                    found.append((sid, name))
            if len(rows) < 1000:
                break
            page += 1
        return found
    except Exception as e:  # noqa: BLE001 — 목록 API 없음/오류 → 후보 탐색 폴백
        print(f"  · 통계표 목록 조회 불가({e}) — 후보 ID 탐색으로 폴백", file=sys.stderr)
        return None


def probe_index_candidates(api_key, end, sale_data, skip_ids):
    """A_2024_00040~00070 대역에서 '전세가격지수로 보이는' 표를 탐색.
    판정: 매매지수와 지역 30개 이상 겹치고, 값이 지수 범위(40~200)이며, 매매지수와 값이 다름."""
    sale_regions = set(sale_data)
    for i in range(40, 71):
        sid = f"A_2024_{i:05d}"
        if sid in skip_ids:
            continue
        try:
            d = fetch_metric(sid, end, end, api_key)   # 최근 1개월만 — 후보당 1회 호출
        except Exception:  # noqa: BLE001
            continue
        common = list(set(d) & sale_regions)
        if len(common) < 30:
            continue
        vals = [v for r in common[:40] for v in d[r].values()]
        if not vals or not all(40 <= v <= 200 for v in vals):
            continue
        # 매매지수 자기 자신(동일 값) 회피
        same = 0
        for r in common[:10]:
            sv = list(sale_data[r].values())[-1] if sale_data.get(r) else None
            dv = list(d[r].values())[-1] if d.get(r) else None
            if sv is not None and dv is not None and abs(sv - dv) < 1e-9:
                same += 1
        if same >= 8:
            continue
        return sid
    return None


def split_region(name):
    """'서울 송파구' → (sido='서울', leaf='송파구'). 공백 없으면 시도/전국 등 상위로 취급."""
    parts = name.split()
    if len(parts) >= 2:
        return parts[0], " ".join(parts[1:])
    return name, None


def main():
    api_key = L.key(L.RONE_KEYS, required=True)
    # 시크릿 지문(값 비노출): 길이 + sha256 앞 10자리. GitHub은 시크릿 원문을 ***로 가리므로
    # 실제로 어떤 값이 들어갔는지 알 수 없는데, 이 지문으로 '정상 키와 동일한지'를 안전하게 대조한다.
    # 정상 키 38c5…64a → len=32, sha256[:10]=c5a0744b65. 다르면 시크릿 값이 잘못 들어간 것.
    fp = hashlib.sha256(api_key.encode()).hexdigest()[:10]
    print(f"[R_ONE 키 점검] 길이={len(api_key)} 지문(sha256[:10])={fp} "
          f"(정상 키라면 길이=32·지문=c5a0744b65)")

    end = dt.date.today().strftime("%Y%m")
    start = (dt.date.today().replace(day=1) - dt.timedelta(days=31 * MONTHS)).strftime("%Y%m")

    metric_data = {}
    adopted = {}   # 자동 발견으로 채택한 STATBL_ID — 로그·_meta 기록용
    for metric, statbl in METRICS.items():
        if not statbl:
            print(f"[skip] {metric}: STATBL_ID 미설정")
            continue
        try:
            metric_data[metric] = fetch_metric(statbl, start, end, api_key)
            print(f"[{metric}] 지역 {len(metric_data[metric])}개 수집")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {metric} 수집 실패: {e}", file=sys.stderr)

    # 전세가격지수가 비면 자동 발견: (1) 통계표 목록 이름 검색 → (2) 후보 ID 탐색
    if metric_data.get("sale_index") and not metric_data.get("jeonse_index"):
        sid = None
        tbls = discover_statbl(api_key, ("아파트", "전세가격지수"), exclude=("연립", "단독", "규모", "연령"))
        if tbls:
            sid = tbls[0][0]
            print(f"[jeonse_index] 통계표 목록에서 발견: {sid} ({tbls[0][1]})")
        if not sid:
            sid = probe_index_candidates(api_key, end, metric_data["sale_index"],
                                         skip_ids={METRICS["sale_index"], METRICS["jeonse_index"]})
            if sid:
                print(f"[jeonse_index] 후보 탐색으로 채택: {sid} — easyStat에서 표 이름 확인 후 METRICS에 고정 권장")
        if sid:
            try:
                metric_data["jeonse_index"] = fetch_metric(sid, start, end, api_key)
                adopted["jeonse_index"] = sid
                print(f"[jeonse_index] 지역 {len(metric_data['jeonse_index'])}개 수집 (자동 발견 {sid})")
            except Exception as e:  # noqa: BLE001
                print(f"  ! 자동 발견 전세지수({sid}) 수집 실패: {e}", file=sys.stderr)
        else:
            print("  ! 전세가격지수 자동 발견 실패 — R-ONE easyStat에서 '아파트 전세가격지수' 표 ID를 "
                  "확인해 METRICS['jeonse_index']를 갱신하세요.", file=sys.stderr)

    if not metric_data.get("sale_index"):
        # 과거: 여기서 조용히 return → 워크플로는 'success'인데 데이터는 시드에 멈춰 원인 불명이었음.
        # 이제는 비정상 종료로 CI를 빨갛게 만들어, 위 stderr 진단(RESULT 코드·응답 구조)이 드러나게 한다.
        print("매매가격지수 수집 실패 — 기존 market.json 유지", file=sys.stderr)
        # 키 문제 vs STATBL_ID 문제 분리 프로브: 문서 예시 표(A_2024_00001)로 1회 호출해본다.
        #   · 프로브도 ERROR-290 → '인증키(시크릿 값)' 문제 (위 지문으로 정상키와 대조).
        #   · 프로브는 정상인데 00045/00050만 실패 → 'STATBL_ID' 문제(표 ID 교체 필요).
        try:
            probe = fetch_metric("A_2024_00001", start, end, api_key)
            print(f"  · 프로브(A_2024_00001) 결과: 지역 {len(probe)}개 — 키는 유효, "
                  f"매매/전세 STATBL_ID(00045·00050)가 잘못됐을 가능성이 큼.", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"  · 프로브(A_2024_00001)도 실패: {e}", file=sys.stderr)
            print("    → 표가 아니라 '인증키' 문제. 위 [R_ONE 키 점검] 지문이 c5a0744b65가 아니면 "
                  "시크릿 값이 정상 키와 다른 것이니 R_ONE 시크릿을 38c5…64a로 다시 저장하세요.", file=sys.stderr)
        print("  → 점검: (1) R_ONE 시크릿 값이 정상 키와 동일한지(지문 대조) "
              "(2) STATBL_ID(A_2024_00045/00050)가 현재 유효한지 — R-ONE easyStat에서 확인.",
              file=sys.stderr)
        sys.exit(1)

    # 전세가율: (1순위) 직접 통계표 RONE_RATIO_STATBL_ID, (2순위) 평균가격 역산(AVG).
    ratio = {}  # {region: {month: 전세가율(%)}}
    if RATIO_STATBL:
        try:
            direct = fetch_metric(RATIO_STATBL, start, end, api_key)
            for region, months in direct.items():
                for mo, v in months.items():
                    if v and 10 <= v <= 100:  # 전세가율 정상 범위만 채택
                        ratio.setdefault(region, {})[mo] = round(v, 1)
            print(f"[jeonse_ratio] 직접 통계표({RATIO_STATBL}) 지역 {len(ratio)}개")
        except Exception as e:  # noqa: BLE001
            print(f"  ! 직접 전세가율 통계표({RATIO_STATBL}) 수집 실패: {e} — AVG 역산으로 폴백", file=sys.stderr)

    if not ratio:
        # 직접 통계표 미설정이면 목록 API에서 '매매가격대비 전세가격비율(아파트)' 표를 자동 발견 시도.
        # 표 이름 표기가 제각각이라 키워드 조합을 여러 개 시도한다(공백은 비교 시 무시됨).
        tbls = None
        for kws in (("아파트", "전세가격비율"), ("아파트", "매매가격대비"), ("아파트", "전세비율"),
                    ("전세가격비율",)):
            tbls = discover_statbl(api_key, kws, exclude=("연립", "단독"))
            if tbls:
                break
            if tbls is None:   # 목록 API 자체가 불가 — 더 시도해도 동일
                break
        if tbls:
            try:
                direct = fetch_metric(tbls[0][0], start, end, api_key)
                for region, months in direct.items():
                    for mo, v in months.items():
                        if v and 10 <= v <= 100:
                            ratio.setdefault(region, {})[mo] = round(v, 1)
                if ratio:
                    adopted["jeonse_ratio"] = tbls[0][0]
                    print(f"[jeonse_ratio] 통계표 목록에서 발견: {tbls[0][0]} ({tbls[0][1]}) — 지역 {len(ratio)}개")
            except Exception as e:  # noqa: BLE001
                print(f"  ! 자동 발견 전세가율({tbls[0][0]}) 수집 실패: {e}", file=sys.stderr)
        elif tbls is not None:
            # 이름 매칭 실패 — 다음 조치를 위해 '비율'이 들어간 표 이름들을 로그로 노출
            hints = discover_statbl(api_key, ("비율",), exclude=())
            if hints:
                print("  · '비율' 포함 통계표 후보(이름 확인용): "
                      + " | ".join(f"{s}:{n}" for s, n in hints[:15]), file=sys.stderr)

    if not ratio:
        # 평균가격 → 전세가율(전세평균/매매평균) 계산. 추정 통계표가 틀리면 비정상값으로 자동 배제.
        avg_data = {}
        for key, statbl in AVG.items():
            try:
                avg_data[key] = fetch_metric(statbl, start, end, api_key)
            except Exception as e:  # noqa: BLE001
                print(f"  ! {key} 수집 실패: {e}", file=sys.stderr)
        sale_avg, jeonse_avg = avg_data.get("sale_avg", {}), avg_data.get("jeonse_avg", {})
        for region, smonths in sale_avg.items():
            for mo, sv in smonths.items():
                jv = jeonse_avg.get(region, {}).get(mo)
                if sv and jv and jv < sv:
                    r = round(jv / sv * 100, 1)
                    if 25 <= r <= 100:  # 전세가율 정상 범위만 채택
                        ratio.setdefault(region, {})[mo] = r
    if not ratio:
        # 지수는 살아있지만 전세가율이 비면(STATBL_ID 미설정·오류) 인덱스만 저장하고 경고.
        print("  ! 전세가율 계산 결과 없음 — 직접 통계표 RONE_RATIO_STATBL_ID 설정을 권장. "
              "(미설정 시 AVG A_2024_00188/00190 역산을 시도하나 추정 ID라 빌 수 있음) "
              "지수는 저장하되 jeonse_ratio는 null로 둔다.", file=sys.stderr)
    print(f"[jeonse_ratio] 최종 지역 {len(ratio)}개")

    # 지역 합집합 → 월별 시계열 병합
    regions = sorted(set().union(*[set(metric_data.get('sale_index', {})), set(metric_data.get('jeonse_index', {}))]))
    out_regions = []
    for region in regions:
        sido, leaf = split_region(region)
        months = sorted(set().union(
            set(metric_data.get('sale_index', {}).get(region, {})),
            set(metric_data.get('jeonse_index', {}).get(region, {})),
        ))[-MONTHS:]
        series = []
        for mo in months:
            series.append({
                "month": mo,
                "sale_index": metric_data.get("sale_index", {}).get(region, {}).get(mo),
                "jeonse_index": metric_data.get("jeonse_index", {}).get(region, {}).get(mo),
                "jeonse_ratio": ratio.get(region, {}).get(mo),
            })
        if series:
            out_regions.append({"key": region, "sido": sido, "name": leaf or (region + " 전체"), "series": series})

    if not out_regions:
        print("수집 결과 없음 — 기존 market.json 유지")
        return
    meta = {"source": "한국부동산원 R-ONE 전국주택가격동향(월간, 아파트)",
            "note": "매매가격지수 A_2024_00045 · 전세가격지수 A_2024_00050"}
    if adopted:
        meta["auto_discovered"] = adopted   # 자동 발견 ID — 확인 후 METRICS에 고정 권장
    data = {
        "_meta": meta,
        "as_of": dt.date.today().strftime("%Y-%m"), "regions": out_regions,
    }
    L.save_json_safe(MARKET_JSON, data, min_items_key="regions")


if __name__ == "__main__":
    main()
