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


class PurgeContradictingTests(unittest.TestCase):
    """주소 검증은 새로 붙이는 건에만 걸리므로, 그 전에 잘못 붙은 항목은 따로 걷어내야 한다."""

    def _extra(self, rows):
        out = {}
        for rk, name, dongs in rows:
            out.setdefault(rk, []).append((name, next(iter(dongs), ""), dongs))
        return out

    def test_contradicting_entry_is_removed(self):
        # 실측: '목동두산위브'(목동)에 신월동의 '신정뉴타운두산위브'가 붙어 있었다.
        hh = {"서울 양천구|목동두산위브": {
            "households": 300,
            "addr": "서울특별시 양천구 신월동 1055 신정뉴타운두산위브"}}
        extra = self._extra([("서울 양천구", "목동두산위브", {"목동"})])
        self.assertEqual(H.purge_contradicting(hh, extra), ["서울 양천구|목동두산위브"])
        self.assertEqual(hh, {})

    def test_agreeing_entry_is_kept(self):
        hh = {"경기 남양주시|마석LIG아파트": {
            "households": 200,
            "addr": "경기도 남양주시 화도읍 묵현리 47-3 마석LIG아파트"}}
        extra = self._extra([("경기 남양주시", "마석LIG아파트", {"묵현리"})])
        self.assertEqual(H.purge_contradicting(hh, extra), [])
        self.assertIn("경기 남양주시|마석LIG아파트", hh)

    def test_multi_dong_complex_is_not_removed(self):
        """원장이 여러 법정동에 거래를 가진 단지는 그중 하나만 맞아도 남긴다.

        단일 동으로 판정하면 실측 69건이 걸리지만 10건은 멀쩡한 매칭이었다
        (예: 안산 '두산위브' 신길동·초지동, 주소는 초지동)."""
        hh = {"경기 안산시 단원구|두산위브": {
            "households": 500,
            "addr": "경기도 안산단원구 초지동 604 안산초지두산위브"}}
        extra = self._extra([("경기 안산시 단원구", "두산위브", {"신길동", "초지동"})])
        self.assertEqual(H.purge_contradicting(hh, extra), [])
        self.assertIn("경기 안산시 단원구|두산위브", hh)

    def test_entry_without_addr_is_left_alone(self):
        """판정 근거가 없으면 건드리지 않는다 — 근거 없이 지우면 멀쩡한 세대수를 잃는다."""
        hh = {"서울 강남구|무명": {"households": 100}}
        extra = self._extra([("서울 강남구", "무명", {"역삼동"})])
        self.assertEqual(H.purge_contradicting(hh, extra), [])
        self.assertIn("서울 강남구|무명", hh)

    def test_entry_with_no_ledger_dong_is_left_alone(self):
        hh = {"대전 유성구|운암네오미아": {
            "households": 100, "addr": "대전광역시 유성구 덕명동 524 운암네오미아아파트"}}
        self.assertEqual(H.purge_contradicting(hh, {}), [])
        self.assertIn("대전 유성구|운암네오미아", hh)

    def test_purged_entries_become_targets_again(self):
        """걷어낸 자리는 hh_map에서 빠져 같은 실행에서 재매칭 대상이 된다."""
        key = "서울 양천구|목동두산위브"
        hh = {key: {"households": 300, "addr": "서울특별시 양천구 신월동 1055 신정뉴타운두산위브"}}
        extra = self._extra([("서울 양천구", "목동두산위브", {"목동"})])
        H.purge_contradicting(hh, extra)
        remaining = [e for e in extra["서울 양천구"] if f"서울 양천구|{e[0]}" not in hh]
        self.assertEqual([e[0] for e in remaining], ["목동두산위브"])


class AddrBackfillQueueTests(unittest.TestCase):
    """세대수는 있는데 주소가 없어 역거리·초등학교를 못 붙인 항목을 다시 물어보게 한다."""

    def _extra(self, *names):
        return {"서울 강남구": [(n, "역삼동", {"역삼동"}) for n in names]}

    def test_entry_missing_addr_is_queued(self):
        # 실측: households.json 5,710건 중 2,549건이 주소가 없어 영영 '정보 없음'이었다.
        hh = {"서울 강남구|가": {"households": 300}}
        q = H.addr_backfill_queue(hh, self._extra("가"))
        self.assertEqual([n for n, _d, _ds in q["서울 강남구"]], ["가"])

    def test_entry_with_addr_is_not_queued(self):
        """주소가 이미 있으면 위치 보강 패스가 처리한다 — 다시 물어볼 이유가 없다."""
        hh = {"서울 강남구|가": {"households": 300, "addr": "서울특별시 강남구 역삼동 1"}}
        self.assertEqual(H.addr_backfill_queue(hh, self._extra("가")), {})

    def test_known_no_addr_is_not_retried(self):
        """K-apt가 주소를 안 주는 단지로 확인된 건 매 실행 같은 호출을 반복하지 않는다."""
        hh = {"서울 강남구|가": {"households": 300, "no_addr": True}}
        self.assertEqual(H.addr_backfill_queue(hh, self._extra("가")), {})

    def test_ungeocodable_addr_is_not_retried(self):
        """지오코딩 불가로 주소가 제거된 항목(addr_bad)은 다시 받아도 같은 결과다."""
        hh = {"서울 강남구|가": {"households": 300, "addr_bad": True}}
        self.assertEqual(H.addr_backfill_queue(hh, self._extra("가")), {})

    def test_complex_not_in_households_is_not_queued(self):
        """아직 세대수도 못 붙인 단지는 일반 보강 대상이지 백필 대상이 아니다."""
        self.assertEqual(H.addr_backfill_queue({}, self._extra("가")), {})

    def test_queue_is_grouped_by_region(self):
        hh = {"서울 강남구|가": {"households": 1}, "부산 동래구|나": {"households": 2}}
        extra = {"서울 강남구": [("가", "역삼동", {"역삼동"})],
                 "부산 동래구": [("나", "온천동", {"온천동"})]}
        q = H.addr_backfill_queue(hh, extra)
        self.assertEqual(sorted(q), ["부산 동래구", "서울 강남구"])


if __name__ == "__main__":
    unittest.main()
