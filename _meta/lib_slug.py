#!/usr/bin/env python3
"""한글 → 로마자 URL 슬러그 + 영속 슬러그 맵 (표준 라이브러리만 사용).

목적: /apt/서울-강동구.html 같은 퍼센트 인코딩 한글 URL 대신
      /apt/seoul-gangdong/godeok-geurasium/ 형태의 안정적인 슬러그 URL을 만든다.

설계 원칙 (지시서 2-1):
  · 언어학적 완벽함보다 **안정성과 재현성**이 우선이다. 음절 단위 국어의 로마자 표기법을
    그대로 적용하고, 자음동화·구개음화 같은 문맥 규칙은 적용하지 않는다.
    (예: 신림 → sinrim. 표준 표기 sillim과 다르지만 입력이 같으면 결과가 항상 같다.)
  · 한 번 발급한 슬러그는 바꾸지 않는다. data/slug-map.json에 키→슬러그를 영속화하고,
    조회는 항상 맵을 먼저 본다. 부득이 바뀌면 history에 이전 슬러그를 남긴다.
  · 충돌은 같은 네임스페이스 안에서 -2, -3 접미사로 해소하며, 선점 순서를 맵이 기억한다.

단지 키: "{시도 시군구}|{법정동}|{단지명}"
  국토부 실거래 원장에는 K-apt 단지코드가 없어 이 3중 키를 고유 키로 쓴다. 지역+단지명만
  쓰면 같은 시군구 안 동명이 단지가 한 페이지로 합쳐진다.
"""
import datetime as dt
import json
import os
import re
import unicodedata

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
SLUG_MAP = os.path.join(DATA_DIR, "slug-map.json")

# ── 국어의 로마자 표기법(문화체육관광부 고시) 음절 분해 표 ──
_CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj",
        "ch", "k", "t", "p", "h"]
_JUNG = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo",
         "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
# 종성 28자(없음 포함). 파열음 불파 규칙에 따라 k/t/p 계열로 적는다(강 → gang, 덕 → deok).
#        없   ㄱ   ㄲ   ㄳ   ㄴ   ㄵ   ㄶ   ㄷ   ㄹ   ㄺ   ㄻ   ㄼ   ㄽ   ㄾ
_JONG = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "p", "l", "l",
         #  ㄿ   ㅀ   ㅁ   ㅂ   ㅄ   ㅅ   ㅆ   ㅇ    ㅈ   ㅊ   ㅋ   ㅌ   ㅍ   ㅎ
         "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]
assert len(_JONG) == 28 and len(_CHO) == 19 and len(_JUNG) == 21

# 시도는 관용 표기를 고정한다(자동 변환보다 검색 친화적이고 흔들리지 않는다).
SIDO = {
    "서울": "seoul", "부산": "busan", "대구": "daegu", "인천": "incheon", "광주": "gwangju",
    "대전": "daejeon", "울산": "ulsan", "세종": "sejong", "경기": "gyeonggi", "강원": "gangwon",
    "충북": "chungbuk", "충남": "chungnam", "전북": "jeonbuk", "전남": "jeonnam",
    "경북": "gyeongbuk", "경남": "gyeongnam", "제주": "jeju",
}

# 행정단위 접미사 — 슬러그에서 떼어낸다(강동구 → gangdong).
_ADMIN_SUFFIX = re.compile(r"(특별자치시|특별자치도|광역시|특별시|자치구|자치시|자치군)$|([시군구읍면동가])$")


def romanize(text):
    """한글 문자열 → 로마자. 한글이 아닌 문자는 아래 slugify에서 정리한다."""
    out = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            idx = code - 0xAC00
            out.append(_CHO[idx // 588])
            out.append(_JUNG[(idx % 588) // 28])
            out.append(_JONG[idx % 28])
        else:
            out.append(ch)
    return "".join(out)


def slugify(text):
    """임의 문자열 → URL 슬러그. 한글은 로마자화, 그 외는 소문자 영숫자와 '-'만 남긴다."""
    s = unicodedata.normalize("NFC", str(text or "")).strip()
    s = romanize(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def _strip_admin(part):
    """'강동구' → '강동', '수원시' → '수원'. 한 글자만 남으면(예: '중구') 떼지 않는다."""
    stripped = _ADMIN_SUFFIX.sub("", part)
    return stripped if len(stripped) >= 2 else part


def region_slug_base(region_key):
    """'서울 강동구' → 'seoul-gangdong', '경기 수원시 팔달구' → 'gyeonggi-suwon-paldal'."""
    parts = str(region_key or "").split()
    if not parts:
        return ""
    head = SIDO.get(parts[0]) or slugify(_strip_admin(parts[0]))
    tail = [slugify(_strip_admin(p)) for p in parts[1:]]
    out = [head] + [t for t in tail if t]
    # '세종 세종시' → sejong-sejong 같은 중복 제거
    dedup = [out[0]]
    for p in out[1:]:
        if p != dedup[-1]:
            dedup.append(p)
    return "-".join(dedup)


def complex_slug_base(name):
    """단지명 → 슬러그. 빈 값이면 'complex'(맵에서 -2, -3으로 구분)."""
    return slugify(name) or "complex"


def complex_key(region_key, umd, name):
    """단지 고유 키 — '지역|법정동|단지명'."""
    return f"{region_key}|{umd or ''}|{name}"


class SlugMap:
    """data/slug-map.json 읽기/쓰기. 한 번 발급한 슬러그는 유지한다."""

    def __init__(self, path=SLUG_MAP):
        self.path = path
        raw = {}
        try:
            with open(path, encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:  # noqa: BLE001 — 최초 실행이면 없는 게 정상
            raw = {}
        self.data = {
            "_meta": raw.get("_meta") or {
                "note": "한글 지역·단지명 → URL 슬러그 매핑. 한 번 발급한 슬러그는 바꾸지 않는다. "
                        "복합 키는 '지역|법정동|단지명'.",
                "romanization": "국어의 로마자 표기법(음절 단위, 자음동화 미적용)",
            },
            "regions": raw.get("regions") or {},
            "complexes": raw.get("complexes") or {},
        }
        self._dirty = False
        # 네임스페이스별 선점 슬러그: regions는 전역, complexes는 지역 슬러그 단위.
        self._taken = {"": {v["slug"] for v in self.data["regions"].values()}}
        for k, v in self.data["complexes"].items():
            self._taken.setdefault(v.get("region_slug", ""), set()).add(v["slug"])

    # ── 내부 ──
    def _assign(self, bucket, key, base, ns, extra):
        store = self.data[bucket]
        cur = store.get(key)
        if cur and cur.get("slug"):
            # 기존 발급분 유지. 부가 정보(단지명 표기 변화 등)만 갱신한다.
            for f, v in (extra or {}).items():
                if v and cur.get(f) != v:
                    cur[f] = v
                    self._dirty = True
            return cur["slug"]
        taken = self._taken.setdefault(ns, set())
        slug, n = base, 1
        while slug in taken:
            n += 1
            slug = f"{base}-{n}"
        taken.add(slug)
        rec = {"slug": slug, "since": dt.date.today().strftime("%Y-%m-%d"), "history": []}
        rec.update({k: v for k, v in (extra or {}).items() if v})
        store[key] = rec
        self._dirty = True
        return slug

    # ── 공개 API ──
    def region(self, region_key):
        return self._assign("regions", region_key, region_slug_base(region_key), "",
                            {"name": region_key})

    def complex(self, region_key, umd, name):
        rs = self.region(region_key)
        key = complex_key(region_key, umd, name)
        return rs, self._assign("complexes", key, complex_slug_base(name), rs,
                                {"region_slug": rs, "name": name, "umd": umd})

    def rename(self, bucket, key, new_slug):
        """슬러그를 부득이 교체할 때 — 이전 값을 history에 보존한다."""
        rec = self.data[bucket].get(key)
        if not rec or rec["slug"] == new_slug:
            return
        rec.setdefault("history", []).append(
            {"slug": rec["slug"], "until": dt.date.today().strftime("%Y-%m-%d")})
        rec["slug"] = new_slug
        self._dirty = True

    def save(self, force=False):
        if not (self._dirty or force):
            return False
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.data["_meta"]["updated"] = dt.date.today().strftime("%Y-%m-%d")
        self.data["_meta"]["counts"] = {
            "regions": len(self.data["regions"]), "complexes": len(self.data["complexes"])}
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=2, sort_keys=True)
        os.replace(tmp, self.path)
        return True


if __name__ == "__main__":  # 간단 점검: python3 lib_slug.py
    for s in ["서울 강동구", "경기 수원시 팔달구", "부산 해운대구", "세종 세종시",
              "경기 성남시 분당구", "서울 중구", "대구 달서구"]:
        print(f"{s:20} → {region_slug_base(s)}")
    for s in ["고덕그라시움", "래미안퍼스티지", "e편한세상", "헬리오시티", "래미안(1차)",
              "쌍용대치아파트1동,2동", "DMC파크뷰자이"]:
        print(f"{s:20} → {complex_slug_base(s)}")
