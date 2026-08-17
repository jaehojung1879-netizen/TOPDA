#!/usr/bin/env python3
import unittest

import collect_portal_households as P


class PortalEvidenceTests(unittest.TestCase):
    def test_extracts_korean_household_expression(self):
        self.assertEqual(P.extract_households("총 2,990세대 · 2023년 준공"), {2990})

    def test_two_trusted_portals_with_same_value_are_accepted(self):
        docs = [
            {"url": "https://new.land.naver.com/complexes/1", "title": "래미안퍼스티지 2,444세대", "contents": "서울 서초구 반포동 18-1"},
            {"url": "https://hogangnono.com/apt/1", "title": "래미안퍼스티지", "contents": "총 2,444세대"},
        ]
        chosen, _ = P.choose_household_candidate(docs, ["래미안퍼스티지"], "서울 서초구 반포동 18-1")
        self.assertEqual(chosen["households"], 2444)

    def test_untrusted_blog_is_ignored(self):
        docs = [{"url": "https://random.example/blog", "title": "래미안 2,444세대", "contents": ""}]
        chosen, rows = P.choose_household_candidate(docs, ["래미안"], "서울 서초구 반포동 18-1")
        self.assertIsNone(chosen)
        self.assertEqual(rows, [])

    def test_conflicting_verified_values_are_not_auto_selected(self):
        docs = [
            {"url": "https://new.land.naver.com/a", "title": "A아파트 500세대", "contents": "서울 강남구 역삼동 1"},
            {"url": "https://hogangnono.com/a", "title": "A아파트 500세대", "contents": ""},
            {"url": "https://realestate.daum.net/b", "title": "A아파트 600세대", "contents": "서울 강남구 역삼동 1"},
            {"url": "https://kbland.kr/b", "title": "A아파트 600세대", "contents": ""},
        ]
        chosen, rows = P.choose_household_candidate(docs, ["A아파트"], "서울 강남구 역삼동 1")
        self.assertIsNone(chosen)
        self.assertEqual(len(rows), 2)

    def test_local_place_requires_exact_parcel(self):
        docs = [{"place_name": "광남캐스빌아파트", "category_name": "가정,생활 > 아파트",
                 "address_name": "서울 강동구 암사동 435-4", "place_url": "https://place.map.kakao.com/1"}]
        got = P.exact_place_candidate(docs, "서울 강동구 암사동 435-4")
        self.assertEqual(got["name"], "광남캐스빌아파트")
        self.assertIsNone(P.exact_place_candidate(docs, "서울 강동구 암사동 999"))

    def test_portal_never_overwrites_public_source_value(self):
        ident = {"keys": ["서울 강남구|A"]}
        hh = {"서울 강남구|A": {"households": 100, "hh_src": "recap.hhldCnt"}}
        apts = []
        changed = P._apply(ident, 999, "portal.kakao_search", ["https://kbland.kr/a"], hh, apts)
        self.assertEqual(changed, 0)
        self.assertEqual(hh["서울 강남구|A"]["households"], 100)

    def test_curated_value_is_not_duplicated_into_household_map(self):
        ident = {"keys": ["서울 강남구|A"]}
        hh = {}
        apts = [{"region_key": "서울 강남구", "name": "A", "households": 100}]
        P._apply(ident, 100, "address_alias:K-apt", [], hh, apts)
        self.assertEqual(hh, {})

    def test_verified_display_name_keeps_internal_key(self):
        ident = {"keys": ["서울 강남구|신고명"]}
        hh = {"서울 강남구|신고명": {}}
        apts = []
        P._apply_name(ident, "포털 대표명", "https://place.map.kakao.com/1", hh, apts)
        self.assertIn("서울 강남구|신고명", hh)
        self.assertEqual(hh["서울 강남구|신고명"]["display_name"], "포털 대표명")
        self.assertEqual(hh["서울 강남구|신고명"]["name_src"], "portal.kakao_local")


if __name__ == "__main__":
    unittest.main()
