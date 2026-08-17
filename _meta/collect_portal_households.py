#!/usr/bin/env python3
"""공공데이터 미확보 단지를 포털 검색결과로 보조 보강한다.

HTML 페이지를 직접 크롤링하면 약관·로봇 차단·마크업 변경에 취약하다. TOPDA가 이미
사용하는 Kakao REST 키로 공식 Local/Daum 검색 API만 호출한다.

  1) Local 키워드 검색: 지번이 정확히 같은 아파트 장소의 대표명을 후보로 채택
  2) Web 검색: 허용한 부동산 포털 검색결과의 'N세대' 문구 수집
  3) 주소·이름 검증 또는 서로 다른 포털 2곳의 일치가 있을 때만 자동 반영
  4) 애매하거나 값이 충돌하면 data/portal_household_candidates.json에만 남김

포털 값은 K-apt·건축물대장보다 후순위다. 기존 세대수를 절대 덮어쓰지 않는다.
"""
import datetime as dt
import html
import os
import re
import sys
from collections import defaultdict
from urllib.parse import urlparse

import collect_apartments as CA
import complex_identity as CI
import lib_pdata as L


COMPLEX_ADDR_JSON = os.path.join(L.SITE_ASSETS, "complex_addr.json")
HOUSEHOLDS_JSON = os.path.join(L.SITE_ASSETS, "households.json")
APARTMENTS_JSON = os.path.join(L.SITE_ASSETS, "apartments.json")
FINDER_JSON = os.path.join(L.SITE_ASSETS, "finder_index.json")
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
CANDIDATES_JSON = os.path.join(DATA_DIR, "portal_household_candidates.json")
MISSES_JSON = os.path.join(DATA_DIR, "portal_household_misses.json")

LOCAL_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
WEB_URL = "https://dapi.kakao.com/v2/search/web"
TRUSTED_DOMAINS = (
    "new.land.naver.com", "land.naver.com", "realestate.daum.net",
    "kbland.kr", "hogangnono.com", "asil.kr",
)
HOUSEHOLD_RE = re.compile(r"(?:총\s*)?(\d{1,2}(?:,\d{3})|\d{1,5})\s*세대")
MISS_RECHECK_DAYS = 30
MAX_HOUSEHOLDS = 20000


def _text(raw):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(str(raw or "")))).strip()


def _domain(url):
    host = (urlparse(str(url or "")).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def _trusted(url):
    host = _domain(url)
    return any(host == d or host.endswith("." + d) for d in TRUSTED_DOMAINS)


def extract_households(text):
    vals = set()
    for raw in HOUSEHOLD_RE.findall(_text(text)):
        n = int(raw.replace(",", ""))
        if 1 < n <= MAX_HOUSEHOLDS:
            vals.add(n)
    return vals


def _name_hit(text, names):
    hay = CA._norm_name(_text(text)).lower()
    return any(len(n) >= 3 and n in hay for n in (CI.name_family(x) for x in names))


def _address_hit(text, address):
    expected = CA._parcel_key(address)
    return bool(expected and CA._parcel_key(_text(text)) == expected)


def exact_place_candidate(documents, address):
    """지번과 주거 카테고리가 정확히 같은 Kakao 장소명 하나만 채택."""
    expected = CA._parcel_key(address)
    if not expected:
        return None
    hits = []
    for doc in documents or []:
        got = CA._parcel_key(doc.get("address_name") or "")
        category = str(doc.get("category_name") or "")
        name = _text(doc.get("place_name"))
        if got == expected and name and any(k in category + name for k in ("아파트", "주상복합", "공동주택")):
            hits.append({"name": name, "url": doc.get("place_url") or "", "address": doc.get("address_name") or ""})
    unique = {x["name"]: x for x in hits}
    return next(iter(unique.values())) if len(unique) == 1 else None


def choose_household_candidate(documents, names, address, place_name=""):
    """검색결과 묶음 → 검증된 세대수 또는 None과 감사용 후보 목록."""
    evidence = defaultdict(lambda: {"urls": set(), "domains": set(), "name_hits": 0,
                                     "address_hits": 0})
    probe_names = list(names) + ([place_name] if place_name else [])
    for doc in documents or []:
        url = doc.get("url") or ""
        if not _trusted(url):
            continue
        text = _text((doc.get("title") or "") + " " + (doc.get("contents") or ""))
        vals = extract_households(text)
        if not vals:
            continue
        nh, ah = _name_hit(text, probe_names), _address_hit(text, address)
        for n in vals:
            e = evidence[n]
            e["urls"].add(url)
            e["domains"].add(_domain(url))
            e["name_hits"] += int(nh)
            e["address_hits"] += int(ah)

    rows = []
    for n, e in evidence.items():
        verified = ((len(e["domains"]) >= 2 and e["name_hits"] >= 1)
                    or (e["address_hits"] >= 1 and e["name_hits"] >= 1)
                    or (bool(place_name) and e["name_hits"] >= 1 and len(e["domains"]) >= 1))
        score = len(e["domains"]) * 2 + e["name_hits"] + e["address_hits"] * 2
        rows.append({"households": n, "verified": verified, "score": score,
                     "domains": sorted(e["domains"]), "urls": sorted(e["urls"])})
    rows.sort(key=lambda x: (-x["score"], -len(x["domains"]), x["households"]))
    verified = [r for r in rows if r["verified"]]
    # 서로 다른 세대수가 동시에 검증되면 어느 쪽도 자동 선택하지 않는다.
    return (verified[0] if len(verified) == 1 else None), rows


def stale_miss(recorded, today=None, min_days=MISS_RECHECK_DAYS):
    if not recorded:
        return True
    try:
        return ((today or dt.date.today()) - dt.date.fromisoformat(str(recorded))).days >= min_days
    except ValueError:
        return True


def _finder_counts(data):
    return {f"{c.get('rk') or ''}|{c.get('n') or ''}": int(c.get("c") or 0)
            for c in (data or {}).get("complexes", [])}


def _apply(identity, households, source, evidence, hh_map, apartments):
    """검증된 identity 값을 모든 관련 원장 키에 전파. 기존 값은 보존."""
    apt_by_key = {f"{a.get('region_key') or ''}|{a.get('name') or ''}": a for a in apartments}
    changed = 0
    checked = dt.date.today().isoformat()
    for key in identity["keys"]:
        target = apt_by_key.get(key)
        if target is not None and not target.get("households"):
            target["households"] = households
            target["hh_src"] = source
            target["hh_confidence"] = "high"
            target["hh_checked_at"] = checked
            target["hh_evidence"] = list(evidence)[:3]
            changed += 1
        # 큐레이션 단지는 apartments.json이 화면 정본이다. 그 키가 households.json에
        # 원래 없었다면 같은 값을 굳이 복제해 파일을 수천 건 부풀리지 않는다.
        rec = hh_map.get(key)
        if rec is None and target is None:
            rec = hh_map.setdefault(key, {})
        if rec is not None and not rec.get("households"):
            rec["households"] = households
            rec["hh_src"] = source
            rec["hh_confidence"] = "high"
            rec["hh_checked_at"] = checked
            rec["hh_evidence"] = list(evidence)[:3]
            changed += 1
    return changed


def _apply_name(identity, display_name, evidence_url, hh_map, apartments,
                source="portal.kakao_local"):
    """정확 지번으로 확인한 포털 대표명만 반영. 내부 원장 key/name은 바꾸지 않는다."""
    if not display_name:
        return 0
    apt_by_key = {f"{a.get('region_key') or ''}|{a.get('name') or ''}": a for a in apartments}
    changed = 0
    checked = dt.date.today().isoformat()
    for key in identity["keys"]:
        if display_name == key.split("|", 1)[-1]:
            continue
        target = apt_by_key.get(key)
        rec = hh_map.get(key)
        if rec is None and target is None:
            rec = hh_map.setdefault(key, {})
        for obj in (target, rec):
            if obj is None:
                continue
            if obj.get("display_name") != display_name or obj.get("name_src") != source:
                obj["display_name"] = display_name
                obj["name_src"] = source
                obj["name_checked_at"] = checked
                if evidence_url:
                    obj["name_evidence"] = evidence_url
                changed += 1
    return changed


def _save(hh_data, apt_data, miss_data, candidate_data):
    today = dt.date.today().isoformat()
    hh_data["as_of"] = today
    apt_data.setdefault("_meta", {})["portal_checked_at"] = today
    miss_data["as_of"] = today
    candidate_data["as_of"] = today
    os.makedirs(DATA_DIR, exist_ok=True)
    L.save_json_safe(HOUSEHOLDS_JSON, hh_data)
    L.save_json_safe(APARTMENTS_JSON, apt_data, min_items_key="apartments")
    L.save_json_safe(MISSES_JSON, miss_data)
    L.save_json_safe(CANDIDATES_JSON, candidate_data)


def main():
    has_kakao = bool(L.key(L.KAKAO_KEYS))
    addr_map = (L.load_json(COMPLEX_ADDR_JSON, default={}) or {}).get("map", {})
    hh_data = L.load_json(HOUSEHOLDS_JSON, default={}) or {"map": {}}
    hh_map = hh_data.setdefault("map", {})
    apt_data = L.load_json(APARTMENTS_JSON, default={}) or {"apartments": []}
    apartments = apt_data.setdefault("apartments", [])
    finder = L.load_json(FINDER_JSON, default={}) or {}
    identities = CI.build_identities(addr_map, hh_map, apartments, _finder_counts(finder))
    miss_data = L.load_json(MISSES_JSON, default={}) or {"map": {}}
    misses = miss_data.setdefault("map", {})
    candidate_data = L.load_json(CANDIDATES_JSON, default={}) or {"map": {}}
    candidates = candidate_data.setdefault("map", {})
    today = dt.date.today()

    # 같은 주소+이름계열에서 이미 검증된 값이 하나뿐이면 포털을 부르기 전에 별칭으로 전파.
    propagated = names_updated = 0
    for ident in identities:
        if ident["households"] and not ident["household_conflict"] and not ident["address_ambiguous"]:
            src = (ident["household_sources"][0][1] if ident["household_sources"] else "주소 별칭 검증")
            propagated += _apply(ident, ident["households"], f"address_alias:{src}", [],
                                 hh_map, apartments)
            if ident["canonical_source"] != "국토부 실거래 신고명":
                names_updated += _apply_name(ident, ident["canonical_name"], "", hh_map, apartments,
                                             source=ident["canonical_source"])

    if not has_kakao:
        print("[포털보강] KAKAO_REST_API_KEY 없음 — 주소별칭 전파만 수행", file=sys.stderr)
        if propagated or names_updated:
            _save(hh_data, apt_data, miss_data, candidate_data)
        return

    limit = int(os.environ.get("MAX_PORTAL_COMPLEXES", "150") or 150)
    deadline = L.deadline_from_env(default_min=10)
    todo = [i for i in identities
            if not i["households"] and not i["household_conflict"]
            and not i["address_ambiguous"] and i["address"]
            and stale_miss(misses.get("hh:" + i["id"]), today)]
    accepted = checked = 0
    locally_checked = set()
    for ident in todo[:limit]:
        if L.out_of_time(deadline, margin_sec=30):
            break
        checked += 1
        try:
            local = L.get_json(LOCAL_URL, {"query": f"{ident['address']} 아파트", "size": 15},
                               headers=L.kakao_headers())
            place = exact_place_candidate(local.get("documents") or [], ident["address"])
            pname = place["name"] if place else ""
            locally_checked.add(ident["id"])
            if place:
                names_updated += _apply_name(ident, pname, place.get("url") or "", hh_map, apartments)
                misses.pop("name:" + ident["id"], None)
            else:
                misses["name:" + ident["id"]] = today.isoformat()
            queries = [f"{pname or ident['canonical_name']} {ident['address']} 세대수"]
            if ident["aliases"] and ident["aliases"][0] not in queries[0]:
                queries.append(f"{ident['aliases'][0]} {CA._parcel_key(ident['address']).replace('|', ' ')} 총 세대")
            docs = []
            for q in queries:
                result = L.get_json(WEB_URL, {"query": q, "size": 10}, headers=L.kakao_headers())
                docs.extend(result.get("documents") or [])
            chosen, rows = choose_household_candidate(docs, ident["aliases"], ident["address"], pname)
        except L.AuthError as e:
            print(f"[포털보강] Kakao 인증 오류 — 중단 ({e})", file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001 — 개별 검색 실패는 다음 실행에서 재시도
            print(f"  ! {ident['canonical_name']} 검색 실패: {e}", file=sys.stderr)
            continue

        candidates[ident["id"]] = {
            "address": ident["address"], "aliases": ident["aliases"],
            "place_name": pname or None, "candidates": rows[:5], "checked_at": today.isoformat(),
        }
        if chosen:
            changed = _apply(ident, chosen["households"], "portal.kakao_search",
                             chosen["urls"], hh_map, apartments)
            if changed:
                accepted += 1
            misses.pop("hh:" + ident["id"], None)
        else:
            misses["hh:" + ident["id"]] = today.isoformat()

        if checked % 25 == 0:
            _save(hh_data, apt_data, miss_data, candidate_data)

    # 세대수가 이미 있어 위 대기열에서 빠진 단지도 대표명은 별도 검증한다. 거래가 많은
    # 순서로 조금씩 진행하며, 한 번 portal.kakao_local로 확정된 항목은 다음 실행에서 빠진다.
    name_limit = int(os.environ.get("MAX_PORTAL_NAMES", "150") or 150)
    name_todo = [i for i in identities
                 if i["id"] not in locally_checked and not i["address_ambiguous"] and i["address"]
                 and i["canonical_source"] != "portal.kakao_local"
                 and stale_miss(misses.get("name:" + i["id"]), today)]
    name_checked = 0
    for ident in name_todo[:name_limit]:
        if L.out_of_time(deadline, margin_sec=30):
            break
        name_checked += 1
        try:
            local = L.get_json(LOCAL_URL, {"query": f"{ident['address']} 아파트", "size": 15},
                               headers=L.kakao_headers())
            place = exact_place_candidate(local.get("documents") or [], ident["address"])
        except L.AuthError as e:
            print(f"[대표명보강] Kakao 인증 오류 — 중단 ({e})", file=sys.stderr)
            break
        except Exception as e:  # noqa: BLE001
            print(f"  ! {ident['canonical_name']} 대표명 검색 실패: {e}", file=sys.stderr)
            continue
        if place:
            names_updated += _apply_name(ident, place["name"], place.get("url") or "",
                                         hh_map, apartments)
            misses.pop("name:" + ident["id"], None)
        else:
            misses["name:" + ident["id"]] = today.isoformat()
        if name_checked % 50 == 0:
            _save(hh_data, apt_data, miss_data, candidate_data)

    print(f"[포털보강] 주소별칭 전파 {propagated:,}필드 · 검색 {checked:,}/{len(todo):,}개 · "
          f"고신뢰 세대수 확정 {accepted:,}개 · 대표명 검증 {checked + name_checked:,}개"
          f"/갱신 {names_updated:,}필드"
          f" · 애매한 값은 후보 파일에만 저장")
    if propagated or checked or name_checked:
        _save(hh_data, apt_data, miss_data, candidate_data)


if __name__ == "__main__":
    main()
