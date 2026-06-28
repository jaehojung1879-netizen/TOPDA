#!/usr/bin/env python3
"""단지 세대수·준공연도 보강 (K-apt 전용, Kakao 미사용) → site/assets/apartments.json

문제: collect_apartments.py는 신규 단지 Kakao 지오코딩(단지당 3회)이 느려 35분 타임아웃에
먼저 걸리고, 그 뒤에 오던 K-apt 세대수 보강이 거의 실행되지 못했다(전 1193개 중 30개만 채워짐).

해결: 세대수 보강만 떼어 별도 스텝으로 빠르게 끝까지 돌린다. 좌표·역·학교 없이
  지역목록(AptListService) 1회/지역 + 기본정보(AptBasisInfoService) 1회/단지
만 호출하므로 가볍다. 권한(403)·이름매칭·세대수응답 단계별 카운터로 원인을 즉시 진단한다.
"""
import os
import sys

import lib_pdata as L
# collect_apartments의 K-apt 헬퍼 재사용(중복 구현 방지).
import collect_apartments as CA

APARTMENTS_JSON = CA.APARTMENTS_JSON


def main():
    kapt_key = L.key(L.KAPT_KEYS)
    if not kapt_key:
        print("[K-apt] 키 없음(DATA_GO_APT_BASIC_INFO/DATA_GO_*) — 세대수 보강 건너뜀", file=sys.stderr)
        return
    data = L.load_json(APARTMENTS_JSON, default=None)
    if not data or not data.get("apartments"):
        print("apartments.json 없음/비어 있음 — 보강 생략", file=sys.stderr)
        return
    apts = data["apartments"]

    # 세대수 없는 단지를 지역(region_key)별로 묶는다.
    by_region = {}
    for a in apts:
        if a.get("households"):
            continue
        rk = a.get("region_key")
        if rk in L.LAWD:
            by_region.setdefault(rk, []).append(a)

    need = sum(len(v) for v in by_region.values())
    print(f"세대수 보강 대상 {need}개 단지 / {len(by_region)}개 지역")
    stat = {"list_ok": 0, "list_empty": 0, "codes": 0, "matched": 0, "filled": 0}

    for region, items in by_region.items():
        lawd = L.LAWD[region]
        kmap = CA.kapt_map(lawd, kapt_key)
        if kmap is None:    # 403 권한 오류 → 활용신청 필요. 더 돌려도 동일하므로 중단.
            print("‼ K-apt 권한 오류(403) — data.go.kr에서 '공동주택 단지목록(AptListService)'·"
                  "'공동주택 기본정보(AptBasisInfoService)' API를 같은 계정으로 활용신청·승인하세요. "
                  "승인 후 다시 실행하면 세대수가 채워집니다.", file=sys.stderr)
            break
        if kmap:
            stat["list_ok"] += 1
            stat["codes"] += len(kmap)
        else:
            stat["list_empty"] += 1
            continue
        for a in items:
            code = kmap.get(CA._norm_name(a["name"]))
            if not code:
                continue
            stat["matched"] += 1
            hh, yr = CA.kapt_info(code, kapt_key)
            if hh:
                a["households"] = hh
                stat["filled"] += 1
            if yr and not a.get("built_year"):
                a["built_year"] = yr
        print(f"[{region}] 매칭 진행 — 누적 세대수확보 {stat['filled']}건")

    print(f"[K-apt] 목록성공 {stat['list_ok']}/빈 {stat['list_empty']} · 단지코드 {stat['codes']}개 · "
          f"이름매칭 {stat['matched']} → 세대수확보 {stat['filled']}건")
    if need and not stat["filled"]:
        print("  ! 세대수 0건 — 위 단계 카운터로 원인 확인(권한/목록빈값/이름매칭/기본정보응답).", file=sys.stderr)
        for d in getattr(CA, "_info_diag", []):
            print(f"    · 기본정보 실패 샘플: {d}", file=sys.stderr)

    if stat["filled"]:
        L.save_json_safe(APARTMENTS_JSON, data, min_items_key="apartments")
    else:
        print("변경 없음 — 저장 생략")


if __name__ == "__main__":
    main()
