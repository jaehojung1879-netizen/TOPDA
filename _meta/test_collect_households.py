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


class MigrateBuildingSuffixTests(unittest.TestCase):
    """동 병합으로 옛 이름이 되면 애써 모은 세대수·좌표가 고아가 된다 — 옮겨야 한다."""

    def test_orphaned_entry_moves_to_merged_complex(self):
        # 실측: '동문2차아파트501동'이 세대수 128과 좌표를 들고 있었다.
        hh = {"경기 파주시|동문2차아파트501동": {"households": 128, "lat": 37.77}}
        moved = H.migrate_building_suffix_entries(hh, {"경기 파주시|동문2차아파트"})
        self.assertEqual(moved, ["경기 파주시|동문2차아파트501동"])
        self.assertEqual(hh, {"경기 파주시|동문2차아파트": {"households": 128, "lat": 37.77}})

    def test_entry_still_in_ledger_is_untouched(self):
        """원장에 옛 이름이 그대로 있으면 병합 대상이 아니었다는 뜻이다."""
        hh = {"서울 은평구|우공101동": {"households": 50}}
        self.assertEqual(H.migrate_building_suffix_entries(hh, {"서울 은평구|우공101동"}), [])
        self.assertIn("서울 은평구|우공101동", hh)

    def test_no_move_when_merged_complex_absent_from_ledger(self):
        """기본명이 원장에 없으면 옮길 곳이 없다 — 근거 없이 개명하지 않는다."""
        hh = {"서울 은평구|우공101동": {"households": 50}}
        self.assertEqual(H.migrate_building_suffix_entries(hh, {"서울 은평구|다른단지"}), [])
        self.assertIn("서울 은평구|우공101동", hh)

    def test_existing_values_are_not_overwritten(self):
        """합칠 곳에 이미 값이 있으면 덮지 않고 빈 항목만 채운다."""
        hh = {"경기 화성시|진명": {"households": 300},
              "경기 화성시|진명101동": {"households": 128, "lat": 37.1}}
        H.migrate_building_suffix_entries(hh, {"경기 화성시|진명"})
        self.assertEqual(hh["경기 화성시|진명"], {"households": 300, "lat": 37.1})

    def test_siblings_both_migrate(self):
        hh = {"경기 화성시|진명101동": {"households": 128},
              "경기 화성시|진명102동": {"built_year": 1995}}
        moved = H.migrate_building_suffix_entries(hh, {"경기 화성시|진명"})
        self.assertEqual(len(moved), 2)
        self.assertEqual(hh["경기 화성시|진명"], {"households": 128, "built_year": 1995})

    def test_non_building_names_are_ignored(self):
        hh = {"서울 강남구|래미안": {"households": 100}}
        self.assertEqual(H.migrate_building_suffix_entries(hh, {"서울 강남구|다른곳"}), [])
        self.assertIn("서울 강남구|래미안", hh)


class UnlockBadAddrTests(unittest.TestCase):
    """옛 geocode_kakao는 네트워크 오류·429까지 '결과 없음'과 뭉뚱그렸고, 호출부가 그걸
    영구 표식으로 남겼다(실측 274건). 두 경우를 구분하게 됐으니 한 번은 풀어 준다."""

    def test_marker_is_cleared_and_counted(self):
        hh = {"a": {"addr_bad": True}, "b": {"addr_bad": True}}
        data = {}
        self.assertEqual(H.unlock_bad_addr_once(data, hh), 2)
        self.assertNotIn("addr_bad", hh["a"])
        self.assertEqual(data["_meta"]["addr_bad_reset"], "2026-07-28")

    def test_runs_only_once(self):
        """매 실행 반복하면 진짜 불량 주소를 계속 다시 부르게 된다."""
        data = {"_meta": {"addr_bad_reset": "2026-07-28"}}
        hh = {"a": {"addr_bad": True}}
        self.assertEqual(H.unlock_bad_addr_once(data, hh), 0)
        self.assertTrue(hh["a"]["addr_bad"])   # 그대로 둔다

    def test_already_geocoded_entry_is_not_counted(self):
        """좌표를 이미 얻었으면 되살릴 게 없다."""
        hh = {"a": {"addr_bad": True, "lat": 37.5, "lng": 127.0}}
        self.assertEqual(H.unlock_bad_addr_once({}, hh), 0)

    def test_entries_without_marker_are_untouched(self):
        hh = {"a": {"households": 100, "addr": "서울 강남구 역삼동 1"}}
        H.unlock_bad_addr_once({}, hh)
        self.assertEqual(hh["a"], {"households": 100, "addr": "서울 강남구 역삼동 1"})

    def test_unlocked_entry_becomes_seedable_again(self):
        """표식만 지운다 — 주소는 지번 시딩이 다시 채운다."""
        hh = {"서울 강남구|가": {"addr_bad": True}}
        H.unlock_bad_addr_once({}, hh)
        n = H.seed_jibun_addrs(hh, {"서울 강남구|가": {"addr": "서울 강남구 역삼동 1"}}, [])
        self.assertEqual((n, hh["서울 강남구|가"]["addr"]), (1, "서울 강남구 역삼동 1"))


class SeedJibunAddrTests(unittest.TestCase):
    """실거래 지번은 거래가 있으면 항상 온다 — K-apt 수록 여부와 무관하게 위치를 확보한다."""

    def test_object_shaped_entry_is_read(self):
        """complex_addr.json 값은 {addr, sgg, umd, bun, ji} 객체다(건축물대장 조회키 포함)."""
        hh = {}
        addr_map = {"서울 강남구|더샵": {"addr": "서울 강남구 역삼동 736-1",
                                        "sgg": "11680", "umd": "10100",
                                        "bun": "0736", "ji": "0001"}}
        self.assertEqual(H.seed_jibun_addrs(hh, addr_map, []), 1)
        self.assertEqual(hh["서울 강남구|더샵"], {"addr": "서울 강남구 역삼동 736-1"})

    def test_legacy_string_entry_still_works(self):
        """주소 문자열만 담던 초기 형식도 받아 준다."""
        hh = {}
        self.assertEqual(H.seed_jibun_addrs(hh, {"서울 강남구|더샵": "서울 강남구 역삼동 736-1"}, []), 1)
        self.assertEqual(hh["서울 강남구|더샵"]["addr"], "서울 강남구 역삼동 736-1")

    def test_entry_without_addr_field_is_skipped(self):
        hh = {}
        self.assertEqual(H.seed_jibun_addrs(hh, {"서울 강남구|더샵": {"sgg": "11680"}}, []), 0)
        self.assertEqual(hh, {})

    def test_unmatched_complex_gets_location_only_entry(self):
        """K-apt에 없어 항목 자체가 없던 단지도 주소를 얻는다(전국 단지의 약 30%)."""
        hh = {}
        n = H.seed_jibun_addrs(hh, {"서울 강남구|더샵": "서울 강남구 역삼동 736-1"}, [])
        self.assertEqual(n, 1)
        self.assertEqual(hh["서울 강남구|더샵"], {"addr": "서울 강남구 역삼동 736-1"})
        self.assertNotIn("households", hh["서울 강남구|더샵"])

    def test_existing_entry_missing_addr_is_filled(self):
        """세대수는 있는데 주소가 없던 항목 — K-apt 재조회 없이 지번으로 해결된다."""
        hh = {"서울 송파구|가": {"households": 1945}}
        n = H.seed_jibun_addrs(hh, {"서울 송파구|가": "서울 송파구 거여동 1"}, [])
        self.assertEqual(n, 1)
        self.assertEqual(hh["서울 송파구|가"]["households"], 1945)
        self.assertEqual(hh["서울 송파구|가"]["addr"], "서울 송파구 거여동 1")

    def test_existing_addr_is_not_overwritten(self):
        """K-apt 주소가 이미 있으면 그대로 둔다 — 지번보다 단지 위치에 가깝다."""
        hh = {"서울 송파구|가": {"addr": "서울특별시 송파구 거여동 100 시그니처"}}
        self.assertEqual(H.seed_jibun_addrs(hh, {"서울 송파구|가": "서울 송파구 거여동 1"}, []), 0)
        self.assertEqual(hh["서울 송파구|가"]["addr"], "서울특별시 송파구 거여동 100 시그니처")

    def test_already_geocoded_entry_is_left_alone(self):
        hh = {"서울 송파구|가": {"households": 1, "lat": 37.5, "lng": 127.1}}
        self.assertEqual(H.seed_jibun_addrs(hh, {"서울 송파구|가": "서울 송파구 거여동 1"}, []), 0)
        self.assertNotIn("addr", hh["서울 송파구|가"])

    def test_ungeocodable_marker_is_respected(self):
        """지오코딩 불가로 표식이 붙은 항목에 같은 동네 지번을 다시 넣지 않는다."""
        hh = {"서울 송파구|가": {"households": 1, "addr_bad": True}}
        self.assertEqual(H.seed_jibun_addrs(hh, {"서울 송파구|가": "서울 송파구 거여동 1"}, []), 0)

    def test_curated_complex_with_coords_is_skipped(self):
        """apartments.json에서 이미 좌표를 가진 단지는 건드리지 않는다."""
        apts = [{"region_key": "경기 성남시 분당구", "name": "판교", "lat": 37.38, "lng": 127.11}]
        hh = {}
        n = H.seed_jibun_addrs(hh, {"경기 성남시 분당구|판교": "경기 성남시 분당구 백현동 1"}, apts)
        self.assertEqual((n, hh), (0, {}))

    def test_location_only_entries_do_not_count_as_enriched(self):
        """위치 전용 항목이 세대수 보강분으로 세어지면 커버리지 분모가 오염된다."""
        hh = {"서울 강남구|가": {"addr": "서울 강남구 역삼동 1"},
              "서울 강남구|나": {"households": 500, "addr": "서울 강남구 역삼동 2"}}
        filled = sum(1 for v in hh.values() if v.get("households"))
        self.assertEqual(filled, 1)

    def test_location_only_entry_stays_a_households_target(self):
        """주소만 심었다고 세대수 보강 대상에서 빠지면 안 된다."""
        hh = {"서울 강남구|가": {"addr": "서울 강남구 역삼동 1"}}
        entries = [("가", "역삼동", {"역삼동"}), ("나", "역삼동", {"역삼동"})]
        remaining = [e for e in entries
                     if not (hh.get(f"서울 강남구|{e[0]}") or {}).get("households")]
        self.assertEqual([e[0] for e in remaining], ["가", "나"])


if __name__ == "__main__":
    unittest.main()
