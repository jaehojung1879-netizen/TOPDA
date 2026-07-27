#!/usr/bin/env python3
"""실거래 원장 단지명 정리 테스트.

국토부는 동별로 집합건물이 등록된 단지를 '시티프라디움더강남101동'·'201동'처럼 별개
단지로 준다. 합치되, 이름 모양만 보고 자르지 않는다 — 정식 이름에 동 번호가 들어간
단지를 잘못 개명하는 게 중복이 남는 것보다 나쁘다.
"""
import unittest

import collect_transactions as C


def deal(region_key, apt, date="2026-07-01"):
    return {"region_key": region_key, "apt": apt, "date": date}


class BuildingBaseNameTests(unittest.TestCase):
    def test_plain_building_suffix_is_stripped(self):
        for name, want in (
            ("시티프라디움더강남101동", "시티프라디움더강남"),
            ("진도1103동", "진도"),
            ("가림29차103동", "가림29차"),
            ("현대홈타운 201동", "현대홈타운"),      # 공백 구분
            ("임탑(12-1)100동", "임탑(12-1)"),      # 괄호로 끝나는 기본명
            ("리라5동", "리라"),
        ):
            self.assertEqual(C.building_base_name(name), want, name)

    def test_multi_building_names_are_left_alone(self):
        """여러 동을 나열한 정식 이름 — 끝만 떼면 이름이 통째로 망가진다(실측 8건)."""
        for name in (
            "대치우성아파트1동,2동,3동,5동,6동,7동",
            "쌍용대치아파트1동,2동,3동,5동,6동",
            "유호엔시티101-103동",
            "진양101,102동",
            "무궁화아파트101동,102동,103동,105동,106동",
            "월드메르디앙201동,202동",
        ):
            self.assertIsNone(C.building_base_name(name), name)

    def test_names_without_building_suffix_are_untouched(self):
        for name in ("래미안", "상계동", "e편한세상", "개포주공6단지", "", None):
            self.assertIsNone(C.building_base_name(name), repr(name))

    def test_too_short_base_is_rejected(self):
        self.assertIsNone(C.building_base_name("가101동"))


class MergeBuildingSuffixTests(unittest.TestCase):
    def test_merges_when_base_complex_already_exists(self):
        """가장 강한 증거 — 같은 지역에 기본명 단지가 이미 있다(관악푸르지오 145건)."""
        deals = [deal("서울 관악구", "관악푸르지오"), deal("서울 관악구", "관악푸르지오102동")]
        renamed = C.merge_building_suffix_names(deals)
        self.assertEqual(renamed, {("서울 관악구", "관악푸르지오102동"): "관악푸르지오"})
        self.assertEqual([d["apt"] for d in deals], ["관악푸르지오", "관악푸르지오"])

    def test_merges_siblings_sharing_a_base(self):
        """동 항목이 둘 이상이면 합쳐야 중복이 사라진다(진명101·102·103동)."""
        deals = [deal("경기 화성시", f"진명10{i}동") for i in (1, 2, 3)]
        C.merge_building_suffix_names(deals)
        self.assertEqual({d["apt"] for d in deals}, {"진명"})

    def test_solo_entry_is_not_renamed(self):
        """형제도 기본명도 없으면 합쳐도 중복이 안 사라지고 이름만 바뀐다 — 두어야 한다."""
        deals = [deal("서울 은평구", "우공101동"), deal("서울 은평구", "다른단지")]
        self.assertEqual(C.merge_building_suffix_names(deals), {})
        self.assertEqual(deals[0]["apt"], "우공101동")

    def test_evidence_does_not_cross_regions(self):
        """다른 지역의 동명 단지를 증거로 삼으면 안 된다."""
        deals = [deal("서울 강동구", "우성"), deal("서울 관악구", "우성101동")]
        self.assertEqual(C.merge_building_suffix_names(deals), {})
        self.assertEqual(deals[1]["apt"], "우성101동")

    def test_multi_building_name_is_not_merged_even_with_sibling(self):
        deals = [deal("서울 강남구", "대치우성아파트1동,2동,3동,5동,6동,7동"),
                 deal("서울 강남구", "대치우성아파트")]
        self.assertEqual(C.merge_building_suffix_names(deals), {})

    def test_is_idempotent(self):
        """두 번 돌려도 결과가 같아야 한다 — 매 실행 원장 전체에 적용되기 때문."""
        deals = [deal("경기 화성시", f"진명10{i}동") for i in (1, 2, 3)]
        C.merge_building_suffix_names(deals)
        self.assertEqual(C.merge_building_suffix_names(deals), {})
        self.assertEqual({d["apt"] for d in deals}, {"진명"})

    def test_deal_records_are_otherwise_unchanged(self):
        deals = [deal("경기 화성시", "진명101동", date="2026-06-01"),
                 deal("경기 화성시", "진명102동", date="2026-07-02")]
        C.merge_building_suffix_names(deals)
        self.assertEqual([d["date"] for d in deals], ["2026-06-01", "2026-07-02"])
        self.assertEqual([d["region_key"] for d in deals], ["경기 화성시"] * 2)

    def test_deals_without_name_or_region_are_skipped(self):
        deals = [{"date": "2026-07-01"}, deal("경기 화성시", None), deal(None, "진명101동")]
        self.assertEqual(C.merge_building_suffix_names(deals), {})


class LocationKeyTests(unittest.TestCase):
    """건축물대장은 시군구·법정동·본번·부번으로 직접 조회한다 — 단지명을 대조하지 않는다.

    실거래 상세 자료가 이 코드들을 함께 주는데, 명세서에 영문 항목명이 안 적혀 있어
    후보를 순서대로 시도하고 실제로 값을 준 이름을 기록한다.
    """

    def setUp(self):
        C._loc_seen.clear()

    def _getter(self, fields):
        return lambda tag: fields.get(tag, "")

    def test_primary_field_names_are_picked_up(self):
        got = C._location_keys(self._getter({
            "jibun": "736-1", "sggCd": "11680", "umdCd": "10100",
            "bonbun": "0736", "bubun": "0001"}))
        self.assertEqual(got, {"jibun": "736-1", "sgg": "11680", "umd": "10100",
                               "bun": "0736", "ji": "0001"})

    def test_alternate_field_names_are_tried(self):
        """1순위 이름이 없으면 다음 후보로 넘어간다."""
        got = C._location_keys(self._getter({
            "jibun": "1", "bjdongSggCd": "11680", "bjdongCd": "10100",
            "landBonbun": "0736", "landBubun": "0000"}))
        self.assertEqual(got["sgg"], "11680")
        self.assertEqual(got["umd"], "10100")
        self.assertEqual(got["bun"], "0736")

    def test_resolved_names_are_recorded_for_diagnosis(self):
        """어떤 후보가 통했는지 남겨야 다음에 후보를 좁힐 수 있다."""
        C._location_keys(self._getter({"jibun": "1", "bjdongCd": "10100"}))
        self.assertEqual(C._loc_seen.get("umd"), "bjdongCd")

    def test_missing_codes_are_omitted_not_blanked(self):
        """코드가 안 오면 키 자체를 빼야 '조회키 보유' 집계가 정확하다."""
        got = C._location_keys(self._getter({"jibun": "736-1"}))
        self.assertEqual(got, {"jibun": "736-1"})

    def test_empty_item_yields_nothing(self):
        self.assertEqual(C._location_keys(self._getter({})), {})


if __name__ == "__main__":
    unittest.main()
