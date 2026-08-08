#!/usr/bin/env python3
"""실거래 원장을 시·도 단위로 쪼개고, 데이터 상태 요약본을 만든다.

■ 왜 필요한가 (2026-08-08 감사)

  site/assets/transactions.json 은 원본 56MB(gzip 7.0MB)에 거래 297,890건이다.
  이것을 다음 두 곳이 통째로, 그것도 **캐시를 무효화하며** 내려받고 있었다.

    · /calculators/transactions.html — 색인 허용 + AdSense 게재 페이지.
      `?t=' + Date.now()` 로 URL을 매번 바꾸고 `cache:'no-store'` 까지 걸어
      재방문에도 7MB를 다시 받았다. 사용자가 실제로 보는 것은 시·군·구 하나다.
    · /market.html (+ i18n 5벌) — 최신 거래일 문자열 하나와 건수 하나를 얻으려고
      297,890건을 받아 순회했다.

  같은 문제를 파인더(/calculators/search.html)는 이미 finder_index.json 사전집계본으로
  해결했다. 이 스크립트는 그 선례를 실거래 조회 화면에도 적용한다.

■ 왜 시·도 단위인가

  화면의 1차 축이 시·도 드롭다운이고 기본값이 '서울'이다(fillSido). 지도 뷰는 선택된
  시·도 전체를 그리므로 최초 로드에 시·도 하나가 통째로 필요하다. 더 잘게(시·군·구 79개)
  쪼개도 최초 로드 바이트는 같고 요청 수만 늘어난다. 또 원장은 매일 갱신돼 모든 조각이
  함께 바뀌므로, 잘게 나눠도 캐시 적중률은 오르지 않는다.

    서울 1,591KB · 경기 3,829KB · 인천 459KB · 부산 281KB
    대전 181KB · 대구 186KB · 세종 80KB · 울산 78KB   (gzip 실측)

  기본값 서울 기준 7,153KB → 1,591KB (78% 감소). 'all' 을 고르면 오늘과 같은 양을
  받지만, 그것은 사용자가 명시적으로 요청한 경우다.

■ 파일명에 해시를 넣는 이유

  내용이 바뀔 때만 URL이 바뀌므로 브라우저가 조각을 사실상 영구 캐시할 수 있다.
  manifest.json 만 재검증(ETag)하면 된다. 배포마다 tx/ 디렉터리를 통째로 다시 만들어
  옛 해시 파일은 사라지는데, 오래된 manifest 를 든 클라이언트가 사라진 파일을 요청하면
  404 가 난다 — 그래서 **클라이언트는 반드시 원장 폴백을 유지해야 한다**(아래 계약).

■ 클라이언트 계약 (깨뜨리지 말 것)

  1) tx/manifest.json 을 읽는다. 실패하면 transactions.json 원장으로 폴백한다.
  2) manifest.sido[].file 을 필요한 시·도만 받는다. 실패하면 원장으로 폴백한다.
  3) 집계 기간(window)은 manifest 값을 쓴다 — 조각마다 다시 계산하면 시·도별로
     기간 라벨이 달라진다. manifest 는 **전체 데이터** 기준으로 한 번 계산한다.

■ 산출물은 커밋하지 않는다

  단지 페이지와 같은 이유다(.gitignore 참고). 원장이 매일 바뀌면 조각도 매일 전부
  바뀌어 커밋하면 이력이 하루 7MB씩 늘어난다. 배포(deploy-pages.yml)가 매번 만든다.
  생성에 몇 초면 끝나고, 입력(transactions.json)은 커밋돼 있어 결과는 재현 가능하다.

사용법
  python build_tx_shards.py            # 생성
  python build_tx_shards.py --check    # 생성하지 않고 크기만 보고
"""
import argparse
import gzip
import hashlib
import json
import os
import shutil

from lib_slug import SIDO

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "site", "assets")
LEDGER = os.path.join(ASSETS, "transactions.json")
APARTMENTS = os.path.join(ASSETS, "apartments.json")
OUT_DIR = os.path.join(ASSETS, "tx")
STATUS = os.path.join(ASSETS, "data_status.json")

# region.js 의 normSido 와 같은 정규화. 원장은 '서울 강남구' 형태로 이미 축약형을 쓰지만,
# 수집기가 바뀌어 '서울특별시' 가 섞여 들어와도 조각이 갈라지지 않게 방어한다.
_LONG_TO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
    "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
    "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
}


def norm_sido(s):
    return _LONG_TO_SHORT.get(s, s)


def sido_of(deal):
    key = deal.get("region_key") or deal.get("region") or ""
    return norm_sido(key.split(" ")[0]) if key else ""


def sigungu_of(deal):
    parts = (deal.get("region_key") or "").split(" ")
    return " ".join(parts[1:]) if len(parts) >= 2 else ""


def window_of(deals):
    """원장이 실제로 담고 있는 기간. 선언된 수집 창이 아니라 실측 최소~최대 거래월.

    transactions.html 의 computeWindow 와 같은 계산이다. 다만 여기서는 **전체 거래**로
    한 번 계산해 manifest 에 박는다 — 클라이언트가 시·도 조각만으로 다시 계산하면
    "최근 12개월"이 시·도에 따라 "최근 11개월"로 흔들린다.
    """
    lo = hi = ""
    for d in deals:
        mo = (d.get("date") or "")[:7]
        if not mo:
            continue
        if not lo or mo < lo:
            lo = mo
        if not hi or mo > hi:
            hi = mo
    if not lo:
        return {"months": 0, "from": "", "to": ""}
    months = (int(hi[:4]) - int(lo[:4])) * 12 + (int(hi[5:7]) - int(lo[5:7])) + 1
    return {"months": months, "from": lo, "to": hi}


def dump(obj):
    # separators: 조각이 수백 KB 단위라 공백 한 칸도 누적된다.
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="생성하지 않고 크기만 보고")
    args = ap.parse_args()

    with open(LEDGER, encoding="utf-8") as f:
        ledger = json.load(f)
    deals = ledger.get("deals") or []
    if not deals:
        print("! transactions.json 에 deals 가 없다 — 중단(기존 산출물을 지우지 않는다)")
        return 1

    groups = {}
    for d in deals:
        s = sido_of(d)
        if not s:
            continue
        groups.setdefault(s, []).append(d)
    if not groups:
        print("! region_key 로 시·도를 판별할 수 없다 — 중단")
        return 1

    window = window_of(deals)
    latest = max((d.get("date") or "") for d in deals)

    # 산출 디렉터리는 통째로 다시 만든다. 남겨 두면 옛 해시 파일이 배포본에 계속 쌓인다.
    if not args.check:
        shutil.rmtree(OUT_DIR, ignore_errors=True)
        os.makedirs(OUT_DIR, exist_ok=True)

    sido_entries, total_gz = [], 0
    for name in sorted(groups, key=lambda k: -len(groups[k])):
        items = groups[name]
        payload = dump({"sido": name, "deals": items})
        digest = hashlib.sha256(payload).hexdigest()[:8]
        slug = SIDO.get(name) or "etc"
        fname = f"{slug}.{digest}.json"
        if not args.check:
            with open(os.path.join(OUT_DIR, fname), "wb") as f:
                f.write(payload)
        gz = len(gzip.compress(payload, 6))
        total_gz += gz
        sigungu = sorted({g for g in (sigungu_of(d) for d in items) if g})
        sido_entries.append({
            "name": name,
            "slug": slug,
            "file": fname,
            "count": len(items),
            "sigungu": sigungu,
            "bytes": len(payload),
        })
        print(f"  · {name:4} 거래 {len(items):7,}  gzip {gz / 1024:7.0f}KB  {fname}")

    manifest = {
        "_readme": "시·도별 실거래 조각 목록. 이 파일이 없거나 조각 요청이 실패하면 "
                   "클라이언트는 assets/transactions.json 원장으로 폴백해야 한다.",
        "as_of": ledger.get("as_of"),
        "updated": ledger.get("updated"),
        "source": (ledger.get("_meta") or {}).get("source"),
        "currency_unit": (ledger.get("_meta") or {}).get("currency_unit"),
        "note": (ledger.get("_meta") or {}).get("note"),
        "window": window,
        "latest_date": latest,
        "total": len(deals),
        "sido": sido_entries,
    }
    if not args.check:
        with open(os.path.join(OUT_DIR, "manifest.json"), "wb") as f:
            f.write(dump(manifest))

    # ── 데이터 상태 요약 (market.html + i18n 5벌 전용)
    #
    # 이 페이지들이 원하는 값은 '최신 거래일'과 '총 건수' 두 개뿐이다. 그것을 위해
    # 7MB 원장을 받고 있었다. 같은 값을 1KB 파일로 낸다.
    apt_as_of = None
    try:
        with open(APARTMENTS, encoding="utf-8") as f:
            apt_as_of = (json.load(f).get("_meta") or {}).get("as_of")
    except (OSError, ValueError):
        pass
    status = {
        "_readme": "화면에 데이터 기준일만 표시하기 위한 요약본. 원장(transactions.json)을 "
                   "받지 않고도 최신 거래일·건수를 알 수 있게 한다.",
        "transactions": {
            "latest_date": latest,
            "count": len(deals),
            "as_of": ledger.get("as_of"),
            "updated": ledger.get("updated"),
            "window": window,
        },
        "apartments": {"as_of": apt_as_of},
    }
    if not args.check:
        with open(STATUS, "wb") as f:
            f.write(dump(status))

    print(f"[ok] 시·도 조각 {len(sido_entries)}개 · 거래 {len(deals):,}건 · "
          f"전체 gzip {total_gz / 1048576:.1f}MB")
    print(f"     최초 로드(기본 서울) gzip "
          f"{gzip.compress(dump({'sido': '서울', 'deals': groups.get('서울', [])}), 6).__len__() / 1024:,.0f}KB"
          f" ← 원장 전체 {gzip.compress(open(LEDGER, 'rb').read(), 6).__len__() / 1024:,.0f}KB")
    print(f"     data_status.json {os.path.getsize(STATUS) if not args.check else 0:,}B "
          f"(최신 {latest} · {len(deals):,}건)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
