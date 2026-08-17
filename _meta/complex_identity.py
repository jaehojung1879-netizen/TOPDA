#!/usr/bin/env python3
"""주소 우선 단지 identity/별칭 묶음.

실거래 원장의 단지명은 신고자가 적은 표기를 따르므로 포털·K-apt 이름과 다를 수 있다.
그 이름을 데이터 키로 계속 쓰되, 검증과 보강은 지번을 첫 번째 축으로 묶는다.

주의: 같은 지번에 서로 다른 단지가 함께 잡히는 신축 택지·복합 대지가 실제로 있다.
따라서 ``주소만 같으면 같은 단지``로 합치지 않고, 주소 안에서 이름 계열까지 유사한
항목만 하나의 identity로 만든다. 서로 다른 계열이 같은 주소를 공유하면
``address_ambiguous``로 표시해 자동 전파·포털 확정을 막는다.
"""
from collections import defaultdict
from difflib import SequenceMatcher
import hashlib
import re

import collect_apartments as CA


BUILDING_SUFFIX_RE = re.compile(r"(?:제?\s*)?\d{3,4}\s*동$")


def _pad(v):
    s = str(v or "").strip()
    return s.zfill(4) if s.isdigit() else s


def registry_id(entry):
    """건축물대장 조회코드 기반 주소 ID. 임시 본번 0000은 identity로 쓰지 않는다."""
    if not isinstance(entry, dict):
        return ""
    sgg = str(entry.get("sgg") or "").strip()
    umd = str(entry.get("umd") or "").strip()
    bun, ji = _pad(entry.get("bun")), _pad(entry.get("ji")) or "0000"
    if not (sgg and umd and bun) or bun == "0000":
        return ""
    return f"{sgg}:{umd}:{bun}:{ji}"


def address_id(source_key, entry):
    """행정코드 우선, 없으면 시군구+주소문자열의 지번을 보조 ID로 쓴다."""
    rid = registry_id(entry)
    if rid:
        return rid
    addr = entry.get("addr") if isinstance(entry, dict) else entry
    parcel = CA._parcel_key(addr)
    region = str(source_key).split("|", 1)[0]
    return f"{region}:{parcel}" if region and parcel else ""


def name_family(name):
    s = BUILDING_SUFFIX_RE.sub("", str(name or "")).strip()
    return CA._norm_name(s).lower().replace("`", "'")


def names_related(a, b):
    """동별 표기·띄어쓰기 차이처럼 같은 단지라고 볼 근거가 충분한가."""
    aa, bb = name_family(a), name_family(b)
    if not (aa and bb):
        return False
    # '자이1단지'와 '자이2단지'는 같은 대지에 있어도 별도 단지일 수 있다. 개별동
    # 접미사는 name_family에서 이미 제거됐으므로, 여기 남은 서로 다른 숫자는 차수·블록의
    # 차이라는 양성 증거다. 문자열 유사도가 높다는 이유로 합치지 않는다.
    na, nb = re.findall(r"\d+", aa), re.findall(r"\d+", bb)
    if na and nb and na != nb:
        return False
    if aa == bb or set(CA._name_keys(aa)) & set(CA._name_keys(bb)):
        return True
    short, long = sorted((aa, bb), key=len)
    if len(short) >= 5 and short in long and len(short) / len(long) >= 0.72:
        return True
    return min(len(aa), len(bb)) >= 6 and SequenceMatcher(None, aa, bb).ratio() >= 0.9


def _components(keys):
    """같은 주소 안의 이름들을 유사 이름 연결요소로 분리."""
    todo, out = list(keys), []
    while todo:
        comp = [todo.pop(0)]
        changed = True
        while changed:
            changed = False
            for key in list(todo):
                name = key.split("|", 1)[-1]
                if any(names_related(name, x.split("|", 1)[-1]) for x in comp):
                    comp.append(key)
                    todo.remove(key)
                    changed = True
        out.append(sorted(comp))
    return out


def _record_maps(hh_map, apartments):
    records = {k: dict(v) for k, v in (hh_map or {}).items() if isinstance(v, dict)}
    for apt in apartments or []:
        key = f"{apt.get('region_key') or ''}|{apt.get('name') or ''}"
        if key != "|":
            rec = records.setdefault(key, {})
            # 파인더 화면에서는 apartments.json 값이 우선한다. 주소·좌표만 든 hh 항목이
            # 있다고 큐레이션의 세대수·대표명을 가리면 identity가 미상으로 오판한다.
            for field in ("households", "hh_src", "display_name", "name_src"):
                if apt.get(field) is not None:
                    rec[field] = apt[field]
    return records


def _best_name(keys, records, deal_counts):
    displayed = []
    for key in keys:
        rec = records.get(key) or {}
        if rec.get("display_name"):
            rank = 3 if "portal" in str(rec.get("name_src", "")).lower() else 2
            displayed.append((rank, int(deal_counts.get(key, 0)), rec["display_name"], rec.get("name_src")))
    if displayed:
        _, _, name, src = max(displayed)
        return name, src or "검증된 별칭"

    def score(key):
        name = key.split("|", 1)[-1]
        building = bool(BUILDING_SUFFIX_RE.search(name))
        # 거래가 많은 실제 표기를 우선하되, 101동 같은 개별동 표기는 대표명으로 피한다.
        return (0 if building else 1, int(deal_counts.get(key, 0)), -len(name), name)

    key = max(keys, key=score)
    return key.split("|", 1)[-1], "국토부 실거래 신고명"


def build_identities(addr_map, hh_map=None, apartments=None, deal_counts=None):
    """주소+이름계열 기반 identity 목록. 입력을 수정하지 않는다."""
    deal_counts = deal_counts or {}
    records = _record_maps(hh_map or {}, apartments or [])
    by_addr = defaultdict(list)
    for key, entry in (addr_map or {}).items():
        aid = address_id(key, entry)
        if aid:
            by_addr[aid].append(key)

    identities = []
    for aid, address_keys in by_addr.items():
        comps = _components(sorted(address_keys))
        ambiguous = len(comps) > 1
        for comp in comps:
            suffix = ""
            if ambiguous:
                raw = "|".join(name_family(k.split("|", 1)[-1]) for k in comp)
                suffix = "~" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:8]
            values, sources = set(), []
            for key in comp:
                rec = records.get(key) or {}
                if rec.get("households"):
                    values.add(int(rec["households"]))
                    sources.append((key, rec.get("hh_src") or "기존 자료"))
            first_entry = addr_map.get(comp[0]) or {}
            addr = first_entry.get("addr") if isinstance(first_entry, dict) else first_entry
            cname, csrc = _best_name(comp, records, deal_counts)
            identities.append({
                "id": aid + suffix,
                "address_id": aid,
                "address": addr or "",
                "keys": comp,
                "aliases": [k.split("|", 1)[-1] for k in comp],
                "canonical_name": cname,
                "canonical_source": csrc,
                "address_ambiguous": ambiguous,
                "households": next(iter(values)) if len(values) == 1 else None,
                "household_conflict": len(values) > 1,
                "household_values": sorted(values),
                "household_sources": sources,
                "deal_count": sum(int(deal_counts.get(k, 0)) for k in comp),
            })
    return sorted(identities, key=lambda x: (-x["deal_count"], x["id"]))
