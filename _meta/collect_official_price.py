#!/usr/bin/env python3
"""단지 공동주택가격(시가표준액) 점진 보강 → site/assets/official_price.json.

흐름: apartments.json 큐레이션 단지의 '지역+단지명' → Kakao 키워드 검색으로 도로명주소
확보 → 그 주소를 Kakao 주소 검색으로 PNU(19자리)까지 변환 → V-World
'공동주택가격 속성정보' 서비스(getApartHousingPriceAttr)에 PNU로 조회 → 평형(전용면적)별
공시가격을 저장한다.

⚠ 공식 오픈API가 없어 여러 벤더를 조합했다(공공데이터포털에 동/호별 공시가격 API가
없다는 사실은 PR #96 조사 결과 참고). 단지별로 Kakao 2회 + V-World 1회 호출이 필요해
느리다 — collect_households.py와 동일한 TIME_BUDGET_MIN·체크포인트 방식으로 하루 예산
안에서 처리한 만큼만 저장하고, 다음 실행이 안 된 단지부터 이어서 채운다.

PNU 변환은 Kakao 지오코딩 결과의 법정동코드(10자리)+산여부+본번+부번 조합에 의존한다.
Kakao가 반환하는 주소 정확도에 따라 실패할 수 있으며, 실패한 단지는 이번엔 건너뛰고
다음 실행에서 재시도한다(영구 실패 목록을 별도로 두지 않음 — 원인이 일시적일 수 있어서).
"""
import datetime as dt
import os
import sys

import lib_pdata as L

APARTMENTS_JSON = os.path.join(L.SITE_ASSETS, "apartments.json")
OUT_JSON = os.path.join(L.SITE_ASSETS, "official_price.json")


def area_band(m2):
    """전용면적(㎡) → 정수 대표값(반올림). 실거래·검색 화면과 같은 방식으로 평형을 묶는다."""
    return round(m2)


def fetch_one(region, name, vworld_key, diag=None, vworld_domain=None):
    """단지 하나 → (pnu, [{area_m2, official_price, stdr_year}, ...]) 또는 (None, [])."""
    query = f"{region} {name}"
    try:
        j = L.get_json("https://dapi.kakao.com/v2/local/search/keyword.json",
                        {"query": query, "size": 1}, headers=L.kakao_headers())
        docs = j.get("documents") or []
    except Exception:
        return None, []
    if not docs:
        return None, []
    addr_text = docs[0].get("road_address_name") or docs[0].get("address_name")
    if not addr_text:
        return None, []
    pnu = L.address_to_pnu(addr_text)
    if not pnu:
        return None, []
    records = L.get_apart_official_price(pnu, vworld_key, diag=diag, domain=vworld_domain)
    units = []
    for r in records:
        try:
            area = float(r.get("prvuseAr") or 0)
            price = int(r.get("pblntfPc") or 0)
            year = int(r.get("stdrYear") or 0) or None
        except (TypeError, ValueError):
            continue
        if area > 0 and price > 0:
            units.append({"area_m2": round(area, 1), "official_price": price, "stdr_year": year})
    return pnu, units


def summarize(units):
    """평형(반올림 ㎡)별 대표 공시가격(같은 평형 여러 동/호 중 최고 stdr_year → 중앙값)."""
    by_band = {}
    for u in units:
        band = area_band(u["area_m2"])
        by_band.setdefault(band, []).append(u)
    out = []
    for band, arr in sorted(by_band.items()):
        latest_year = max((u["stdr_year"] or 0) for u in arr)
        prices = sorted(u["official_price"] for u in arr if (u["stdr_year"] or 0) == latest_year) or \
            sorted(u["official_price"] for u in arr)
        median = prices[len(prices) // 2]
        out.append({"area_m2": band, "official_price": median, "stdr_year": latest_year or None})
    return out


def main():
    kakao_key = L.key(L.KAKAO_KEYS)
    vworld_key = L.key(L.VWORLD_KEYS)
    if not kakao_key or not vworld_key:
        print("KAKAO_REST_API_KEY/VWORLD_KEY 중 하나가 없음 — 공시가격 보강 건너뜀", file=sys.stderr)
        return
    # V-World는 인증키 발급 시 등록한 도메인이 요청 domain 파라미터와 일치해야 정상 응답한다
    # (문서: "인증키 URL(인증받은 도메인)이 없으면 API가 작동하지 않습니다"). 2026-07-18
    # https 전환 후에도 전 요청이 502였던 것은 이 도메인 검증 때문일 가능성이 커, 등록한
    # 도메인을 VWORLD_DOMAIN으로 넘길 수 있게 한다. 미설정 시 사이트 실제 도메인으로 폴백.
    vworld_domain = os.environ.get("VWORLD_DOMAIN", "").strip() or "topda.kr"
    apts_doc = L.load_json(APARTMENTS_JSON, default={"apartments": []})
    apts = apts_doc.get("apartments") or []
    if not apts:
        print("apartments.json 비어 있음 — 보강 생략", file=sys.stderr)
        return

    existing = L.load_json(OUT_JSON, default={"map": {}})
    out_map = existing.get("map") or {}

    deadline = L.deadline_from_env(default_min=18)
    # 진단 모드: OFFICIAL_PRICE_DIAG=1 이면 캐시 무시하고 소수 단지만 호출 후 V-World 응답
    #  본문을 그대로 로그로 남긴다(수동 dispatch로 빠르게 원인 확인용). OFFICIAL_PRICE_LIMIT로
    #  처리 단지 수 제한. 진단 모드에서는 out_map을 저장하지 않는다(원인 파악만).
    diag_mode = os.environ.get("OFFICIAL_PRICE_DIAG", "").strip() in ("1", "true", "yes")
    limit = int(os.environ.get("OFFICIAL_PRICE_LIMIT", "0") or 0)
    # 진단 모드는 원인 확인용이므로 항상 소수 건만 — limit 미지정(0)이면 5건으로 강제.
    # (7/18 진단 실행에서 limit=0 + 시간예산 미적용이 겹쳐 20분 스텝 타임아웃으로
    #  강제종료된 사고 재발 방지. 시간 예산도 진단 모드에서 동일하게 지킨다.)
    if diag_mode and limit <= 0:
        limit = 5

    stat = {"filled": 0, "skipped_cached": 0, "no_pnu": 0, "no_price": 0}
    processed = 0
    vworld_logged = 0   # V-World 응답 샘플은 처음 몇 건만 로그(로그 폭주 방지)
    for a in apts:
        if L.out_of_time(deadline, margin_sec=15):
            print(f"시간 예산 소진 — 남은 단지는 다음 실행에서 이어서 보강 (누적 {stat['filled']}건)")
            break
        if limit and processed >= limit:
            break
        key = f"{a.get('region_key', '')}|{a.get('name', '')}"
        if key in out_map and not diag_mode:
            stat["skipped_cached"] += 1
            continue
        processed += 1
        diag = {}
        pnu, units = fetch_one(a.get("region", ""), a.get("name", ""), vworld_key, diag=diag, vworld_domain=vworld_domain)
        if not pnu:
            stat["no_pnu"] += 1
            continue
        # V-World가 '가격없음'을 줄 때 실제 응답 본문을 남겨 인증오류/구조변경/빈결과를 구분한다.
        if diag.get("reason") and diag["reason"] != "ok" and vworld_logged < 3:
            print(f"[vworld] {a.get('name','')} pnu={pnu} reason={diag['reason']} "
                  f"sample={diag.get('sample','')!r}", file=sys.stderr)
            vworld_logged += 1
        summary = summarize(units)
        if not summary:
            stat["no_price"] += 1
            continue
        out_map[key] = {"pnu": pnu, "units": summary}
        stat["filled"] += 1

    if diag_mode:
        print(f"[진단] 처리 {processed}건 · 신규 {stat['filled']} · PNU실패 {stat['no_pnu']} · "
              f"가격없음 {stat['no_price']} — 저장 생략(진단 모드)")
        return

    print(f"공시가격 보강 — 신규 {stat['filled']}건 · 캐시생략 {stat['skipped_cached']}건 · "
          f"PNU실패 {stat['no_pnu']}건 · 가격없음 {stat['no_price']}건 · 누적 {len(out_map)}개 단지")

    if not out_map:
        print("수집 결과 없음 — 기존 official_price.json 유지")
        return
    data = {
        "_meta": {
            "source": "V-World 공동주택가격 속성정보(getApartHousingPriceAttr) + Kakao 주소→PNU 변환",
            "note": "공식 오픈API가 없어 Kakao(주소→PNU)와 V-World(PNU→공시가격)를 조합. "
                    "PNU 변환 실패 단지는 자동 재시도(영구 제외 없음). 평형별 대표값은 최신 "
                    "공시연도 기준 중앙값.",
        },
        "as_of": dt.date.today().isoformat(),
        "map": out_map,
    }
    L.save_json_safe(OUT_JSON, data, min_items_key="map")


if __name__ == "__main__":
    main()
