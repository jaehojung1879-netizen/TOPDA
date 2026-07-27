#!/usr/bin/env python3
"""커버리지 리포트 판정 지표 테스트.

2026-07-27 리포트가 `kapt_list(11,542) >= target(9,164)`이라 '이름 표기 차이'로 읽혔으나,
target은 잔여 보강대상이라 분모가 아니었다. 실제 분모인 전체 단지(16,241) 대비로는 0.71로
수록범위 한계가 절반 이상이었다. 분모를 다시 틀리면 정반대 조치를 하게 되므로 고정한다.
"""
import unittest

import collect_households as H


class RegionCoverageTests(unittest.TestCase):
    def test_denominator_is_total_not_residue(self):
        """target만 보면 목록이 남아도는 듯 보이는 지역도, 기보강분을 더하면 부족하다."""
        # 인천 미추홀구 실측: 잔여 261 · 기보강 69 · K-apt 117
        cov = H.region_coverage(target=261, filled=69, kapt_list=117)
        self.assertEqual(cov["total"], 330)
        self.assertEqual(cov["kapt_ratio"], 0.35)   # target 대비였다면 0.45로 과대평가
        self.assertEqual(cov["name_gap"], 48)       # min(117,330) - 69

    def test_ample_list_region_is_name_limited(self):
        """목록이 전체 단지보다 많으면 못 붙인 몫이 전부 표기 차이로 잡힌다."""
        # 경기 화성시 실측: 잔여 133 · 기보강 222 · K-apt 428
        cov = H.region_coverage(target=133, filled=222, kapt_list=428)
        self.assertEqual(cov["total"], 355)
        self.assertEqual(cov["kapt_ratio"], 1.21)
        # 목록이 total을 넘어도 회수 여지는 total 기준으로 잘린다(거래 없는 단지 제외).
        self.assertEqual(cov["name_gap"], 133)

    def test_name_gap_never_exceeds_remaining_target(self):
        """회수 여지가 잔여 대상보다 클 수는 없다 — 부풀면 엉뚱한 지역을 먼저 손댄다."""
        for target, filled, kapt in ((261, 69, 117), (133, 222, 428),
                                     (85, 213, 271), (284, 125, 211), (0, 40, 500)):
            cov = H.region_coverage(target, filled, kapt)
            self.assertLessEqual(cov["name_gap"], target,
                                 f"target={target} filled={filled} kapt={kapt}")

    def test_coverage_limited_region_has_small_name_gap(self):
        """수록범위가 모자란 지역은 이름 규칙을 고쳐도 회수 여지가 작아야 한다."""
        limited = H.region_coverage(target=268, filled=87, kapt_list=151)   # 서울 강동구
        ample = H.region_coverage(target=85, filled=213, kapt_list=271)     # 대구 수성구
        self.assertLess(limited["kapt_ratio"], 0.5)
        self.assertGreater(ample["kapt_ratio"], 0.9)
        self.assertEqual(limited["name_gap"], 64)
        self.assertEqual(ample["name_gap"], 58)

    def test_fully_enriched_region_has_no_gap(self):
        cov = H.region_coverage(target=0, filled=120, kapt_list=200)
        self.assertEqual(cov["total"], 120)
        self.assertEqual(cov["name_gap"], 0)

    def test_empty_region_does_not_divide_by_zero(self):
        cov = H.region_coverage(target=0, filled=0, kapt_list=0)
        self.assertEqual(cov["total"], 0)
        self.assertIsNone(cov["kapt_ratio"])
        self.assertEqual(cov["name_gap"], 0)

    def test_missing_kapt_list_yields_no_recoverable_gap(self):
        """목록이 비면(죽은 LAWD 코드 등) 회수 여지 0 — 이름 규칙이 아니라 코드 문제다."""
        cov = H.region_coverage(target=190, filled=0, kapt_list=0)
        self.assertEqual(cov["kapt_ratio"], 0.0)
        self.assertEqual(cov["name_gap"], 0)


if __name__ == "__main__":
    unittest.main()
