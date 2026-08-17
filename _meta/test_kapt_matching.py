#!/usr/bin/env python3
"""K-apt 이름·법정동 매칭 테스트.

원칙: 이름이 비슷하다는 이유만으로 붙이지 않는다. 법정동·주소가 함께 맞을 때만 확정하고,
어긋나는 증거가 있으면 반려한다 — 엉뚱한 세대수가 붙는 게 비어 있는 것보다 나쁘다.
"""
import unittest

import collect_apartments as CA


class KaptDongExtractionTests(unittest.TestCase):
    """읍·면 지역의 법정동 단위는 '리'다. 상위 단위인 읍·면을 집으면 원장과 영영 어긋난다."""

    def test_ri_beats_eup_myeon_in_address(self):
        # 2026-07-27 실측 불일치 236건이 전부 이 형태였다(남양주·평택 등).
        for addr, want in (
            ("경기도 남양주시 화도읍 묵현리 47-3 마석LIG아파트", "묵현리"),
            ("경기도 평택시 청북읍 옥길리 1137 청북이지더원 아파트", "옥길리"),
            ("경기도 평택시 진위면 견산리 27-15 한승아파트", "견산리"),
            ("경기도 평택시 고덕면 궁리 520 영화블렌하임", "궁리"),
        ):
            self.assertEqual(CA._kapt_dong({"kaptAddr": addr}), want, addr)

    def test_plain_dong_address_unchanged(self):
        for addr, want in (
            ("서울특별시 양천구 신월동 1055 신정뉴타운두산위브", "신월동"),
            ("부산광역시 해운대구 우동 496-1 우동신동아아파트", "우동"),
            ("인천광역시 미추홀구 숭의동 159-1 광해리드빌", "숭의동"),
        ):
            self.assertEqual(CA._kapt_dong({"kaptAddr": addr}), want, addr)

    def test_building_name_after_beonji_is_not_mistaken_for_dong(self):
        """번지 뒤는 단지명이다. '… 249-11 염창현대2차아파트'에서 단지명을 집으면 안 된다."""
        self.assertEqual(
            CA._kapt_dong({"kaptAddr": "서울특별시 강서구 염창동 249-11 염창현대2차아파트"}),
            "염창동")
        # 단지명에 '동'이 들어가도 마찬가지
        self.assertEqual(
            CA._kapt_dong({"kaptAddr": "경기도 수원시 영통구 영통동 111 두산위브트레지움"}),
            "영통동")

    def test_eup_used_only_when_no_ri_present(self):
        self.assertEqual(CA._kapt_dong({"kaptAddr": "경기도 남양주시 화도읍 100"}), "화도읍")

    def test_field_path_accepts_ri(self):
        self.assertEqual(CA._kapt_dong({"umdNm": "묵현리"}), "묵현리")
        self.assertEqual(CA._kapt_dong({"as3": "신월동"}), "신월동")

    def test_no_dong_in_address_yields_empty(self):
        self.assertEqual(CA._kapt_dong({"kaptAddr": "경기도 성남시 분당구 판교로 123"}), "")
        self.assertEqual(CA._kapt_dong({}), "")


class AddrContradictionTests(unittest.TestCase):
    """주소 검증은 '어긋난다는 증거'가 있을 때만 막는다. 근거가 없으면 통과시킨다."""

    def test_contradiction_is_detected(self):
        # 실측: '목동두산위브'(목동)가 신월동의 '신정뉴타운두산위브'에 붙어 있었다.
        self.assertTrue(CA.addr_contradicts_dong(
            "서울특별시 양천구 신월동 1055 신정뉴타운두산위브", {"목동"}))
        self.assertTrue(CA.addr_contradicts_dong(
            "서울특별시 동대문구 이문동 425 이문삼성래미안아파트", {"전농동"}))

    def test_agreement_passes(self):
        self.assertFalse(CA.addr_contradicts_dong(
            "경기도 남양주시 화도읍 묵현리 47-3 마석LIG아파트", {"묵현리"}))

    def test_any_of_multiple_ledger_dongs_passes(self):
        """한 이름이 여러 법정동에 걸치면(전국 1.9%) 그중 하나만 맞아도 통과다."""
        self.assertFalse(CA.addr_contradicts_dong(
            "경기도 용인시 수지구 신봉동 12 벽산블루밍", {"상현동", "신봉동"}))

    def test_no_evidence_does_not_block(self):
        """주소가 없거나 동을 못 뽑으면 막지 않는다 — 근거 없이 막으면 멀쩡한 보강을 잃는다."""
        self.assertFalse(CA.addr_contradicts_dong("", {"목동"}))
        self.assertFalse(CA.addr_contradicts_dong(None, {"목동"}))
        self.assertFalse(CA.addr_contradicts_dong("경기도 성남시 분당구 판교로 123", {"목동"}))
        self.assertFalse(CA.addr_contradicts_dong("서울특별시 양천구 목동 1", set()))

    def test_extraction_miss_falls_back_to_substring(self):
        """동 추출이 빗나가도 원장 동이 주소 안에 있으면 통과 — 반려는 최후수단이다."""
        self.assertFalse(CA.addr_contradicts_dong(
            "경기도 남양주시 화도읍 묵현리 산 47-3", {"묵현리"}))


class MatchProvenanceTests(unittest.TestCase):
    """붙인 근거가 무엇인지(법정동인지 이름뿐인지) 호출부가 알 수 있어야 검증할 수 있다."""

    def setUp(self):
        self.kmap = {
            "sig": {"한진": "SIG"},
            "dong": {"묵현리": {"한진": "RI"}},
            "addr": {"묵현리|47-3": "ADDR"},
            "names": {"ADDR": "마석 한진아파트"},
            "n": 2, "n_dong": 1,
        }

    def test_exact_parcel_beats_different_name(self):
        self.assertEqual(CA.kapt_match_via(
            self.kmap, "인터넷표기와다른이름", "묵현리",
            "경기도 남양주시 화도읍 묵현리 47-3"), ("ADDR", "addr"))

    def test_zero_parcel_is_not_an_identity(self):
        self.assertEqual(CA._parcel_key("인천 서구 가정동 0"), "")

    def test_official_name_is_retained_by_code(self):
        self.assertEqual(CA.kapt_name(self.kmap, "ADDR"), "마석 한진아파트")

    def test_dong_scoped_match_is_reported(self):
        self.assertEqual(CA.kapt_match_via(self.kmap, "한진", "묵현리"), ("RI", "dong"))

    def test_name_only_match_is_flagged_as_sig(self):
        self.assertEqual(CA.kapt_match_via(self.kmap, "한진", "다른동"), ("SIG", "sig"))

    def test_miss_reports_empty_via(self):
        self.assertEqual(CA.kapt_match_via(self.kmap, "없는단지", "묵현리"), (None, ""))

    def test_legacy_kapt_match_still_returns_bare_code(self):
        """collect_apartments.py 본체가 그대로 쓰므로 시그니처를 유지한다."""
        self.assertEqual(CA.kapt_match(self.kmap, "한진"), "SIG")
        self.assertEqual(CA.kapt_match(self.kmap, "한진", "묵현리"), "RI")
        self.assertIsNone(CA.kapt_match(self.kmap, "없는단지"))

    def test_ambiguous_name_is_not_attached(self):
        """같은 키를 두 단지가 주장하면('') 붙이지 않는다 — 추측 금지 원칙."""
        kmap = {"sig": {"삼성": ""}, "dong": {"목동": {"삼성": "OK"}}, "n": 2, "n_dong": 2}
        self.assertEqual(CA.kapt_match_via(kmap, "삼성", "없는동"), (None, ""))
        # 법정동으로 좁히면 유일해지므로 그때는 붙는다.
        self.assertEqual(CA.kapt_match_via(kmap, "삼성", "목동"), ("OK", "dong"))


if __name__ == "__main__":
    unittest.main()
