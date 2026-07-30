#!/usr/bin/env python3
"""건축물대장 세대수 보강 테스트.

이 수집기가 틀리면 화면에 '엉뚱한 세대수'가 붙는다. 비어 있는 것보다 나쁘므로
값을 붙이지 않는 판단(총괄표제부 우선·상한 초과 버림·기존값 보존)을 집중적으로 굳힌다.
"""
import datetime as dt
import unittest
from unittest import mock

import collect_building_ledger as C


class LookupKeyTests(unittest.TestCase):
    def test_bun_and_ji_are_zero_padded(self):
        self.assertEqual(
            C.lookup_keys({"sgg": "11680", "umd": "10300", "bun": "12", "ji": "0"}),
            {"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0000"})

    def test_missing_ji_defaults_to_zero(self):
        self.assertEqual(
            C.lookup_keys({"sgg": "11680", "umd": "10300", "bun": "0012"})["ji"], "0000")

    def test_incomplete_keys_are_refused(self):
        """시군구·법정동·본번이 하나라도 없으면 부르지 않는다 — 엉뚱한 지번을 조회하게 된다."""
        for entry in ({"sgg": "11680", "umd": "10300"},
                      {"sgg": "11680", "bun": "0012"},
                      {"umd": "10300", "bun": "0012"},
                      {"addr": "서울 강남구 역삼동 1"},
                      {}):
            self.assertIsNone(C.lookup_keys(entry), entry)

    def test_legacy_string_entry_has_no_keys(self):
        self.assertIsNone(C.lookup_keys("서울 강남구 역삼동 736-1"))


class HouseholdsOfTests(unittest.TestCase):
    def test_recap_wins_over_title(self):
        """총괄표제부가 단지 총계다. 표제부만 보면 한 동을 단지 전체로 착각한다."""
        recap = [{"hhldCnt": "1059"}]
        title = [{"hhldCnt": "128", "mainPurpsCdNm": "공동주택(아파트)"}]
        self.assertEqual(C.households_of(recap, title), (1059, "recap.hhldCnt"))

    def test_title_sums_residential_buildings_when_recap_missing(self):
        """총괄표제부가 없는 단지는 주거용 동을 합산한다."""
        title = [{"hhldCnt": "128", "mainPurpsCdNm": "공동주택(아파트)"},
                 {"hhldCnt": "140", "mainPurpsCdNm": "공동주택(아파트)"}]
        self.assertEqual(C.households_of([], title), (268, "title.hhldCnt"))

    def test_commercial_building_is_excluded_from_sum(self):
        """부속 상가동을 더하면 안 된다."""
        title = [{"hhldCnt": "300", "mainPurpsCdNm": "공동주택(아파트)"},
                 {"hhldCnt": "12", "mainPurpsCdNm": "제2종근린생활시설"}]
        self.assertEqual(C.households_of([], title), (300, "title.hhldCnt"))

    def test_family_count_is_the_fallback_field(self):
        """오래된 대장은 세대수 칸을 비우고 가구수만 적는 경우가 있다."""
        self.assertEqual(C.households_of([{"hhldCnt": "0", "fmlyCnt": "48"}], []),
                         (48, "recap.fmlyCnt"))

    def test_household_count_wins_over_family_count(self):
        self.assertEqual(C.households_of([{"hhldCnt": "50", "fmlyCnt": "48"}], [])[0], 50)

    def test_ho_count_is_never_used(self):
        """호수는 오피스텔·도시형생활주택에서 세대수와 어긋난다 — 쓰지 않는다."""
        self.assertEqual(C.households_of([{"hoCnt": "300"}], []), (0, ""))

    def test_nothing_found(self):
        self.assertEqual(C.households_of([], []), (0, ""))
        self.assertEqual(C.households_of([{}], [{}]), (0, ""))


class IsResidentialTests(unittest.TestCase):
    def test_apartment_purposes_pass(self):
        for p in ("공동주택(아파트)", "아파트", "연립주택", "다세대주택", "주거시설"):
            self.assertTrue(C.is_residential({"mainPurpsCdNm": p, "hhldCnt": "10"}), p)

    def test_commercial_purposes_fail(self):
        for p in ("제1종근린생활시설", "제2종근린생활시설", "판매시설", "업무시설"):
            self.assertFalse(C.is_residential({"mainPurpsCdNm": p, "hhldCnt": "0"}), p)

    def test_missing_purpose_falls_back_to_household_count(self):
        """주용도가 비어 있으면 세대수 유무로 판단한다."""
        self.assertTrue(C.is_residential({"hhldCnt": "120"}))
        self.assertFalse(C.is_residential({"hhldCnt": "0"}))

    def test_etc_purpose_is_read_when_main_is_absent(self):
        self.assertTrue(C.is_residential({"etcPurps": "공동주택", "hhldCnt": "0"}))


class PlausibleTests(unittest.TestCase):
    def test_zero_and_negative_are_rejected(self):
        self.assertFalse(C.plausible(0))
        self.assertFalse(C.plausible(-5))

    def test_largest_real_complex_is_accepted(self):
        """국내 최대 단지는 9,510세대(헬리오시티)다."""
        self.assertTrue(C.plausible(9510))

    def test_absurd_value_is_rejected(self):
        """조회키가 어긋나면 다른 지번이 붙는다 — 상한으로 걸러낸다."""
        self.assertFalse(C.plausible(C.MAX_HOUSEHOLDS + 1))

    def test_boundary_is_inclusive(self):
        self.assertTrue(C.plausible(C.MAX_HOUSEHOLDS))


class BuildYearTests(unittest.TestCase):
    def test_earliest_approval_year_wins(self):
        """단지 연식은 첫 준공을 기준으로 본다."""
        items = [{"useAprDay": "20051130"}, {"useAprDay": "20030415"}]
        self.assertEqual(C.build_year_of(items), 2003)

    def test_out_of_range_years_are_dropped(self):
        """대장 오기(1070년 준공 등)를 그대로 쓰면 연식 조건이 망가진다."""
        far_future = str(dt.date.today().year + 50)
        self.assertIsNone(C.build_year_of([{"useAprDay": "10701231"},
                                           {"useAprDay": far_future + "0101"}]))

    def test_malformed_and_empty_values_are_ignored(self):
        self.assertIsNone(C.build_year_of([{"useAprDay": ""}, {"useAprDay": "엉망"},
                                           {"useAprDay": "20"}, {}]))

    def test_valid_value_survives_alongside_malformed(self):
        self.assertEqual(C.build_year_of([{"useAprDay": "엉망"}, {"useAprDay": "19981201"}]),
                         1998)


class StaleMissTests(unittest.TestCase):
    TODAY = dt.date(2026, 7, 30)

    def test_never_missed_is_a_target(self):
        self.assertTrue(C.stale_miss(None, self.TODAY))

    def test_recent_miss_is_skipped(self):
        """대장에 없는 지번을 매 실행 다시 부르면 예산을 전부 헛쓴다."""
        self.assertFalse(C.stale_miss("2026-07-20", self.TODAY))

    def test_old_miss_is_retried(self):
        self.assertTrue(C.stale_miss("2026-05-01", self.TODAY))

    def test_malformed_record_is_retried(self):
        self.assertTrue(C.stale_miss("엉망", self.TODAY))

    def test_boundary_day_is_retried(self):
        due = self.TODAY - dt.timedelta(days=C.MISS_RECHECK_DAYS)
        self.assertTrue(C.stale_miss(due.isoformat(), self.TODAY))


class TargetsTests(unittest.TestCase):
    TODAY = dt.date(2026, 7, 30)
    ADDR = {
        "서울 강남구|A": {"sgg": "11680", "umd": "10300", "bun": "1"},
        "서울 강남구|B": {"sgg": "11680", "umd": "10300", "bun": "2"},
        "서울 강남구|C": {"sgg": "11680", "umd": "10300", "bun": "3"},
        "서울 강남구|D": {"addr": "조회키 없음"},
    }

    def test_complex_with_households_is_skipped(self):
        """이미 채운 단지는 부르지 않는다 — K-apt 값을 덮어쓰면 서로 밀어낸다."""
        got = C.targets(self.ADDR, {"서울 강남구|A": {"households": 500}}, {}, self.TODAY)
        self.assertEqual([k for k, _ in got], ["서울 강남구|B", "서울 강남구|C"])

    def test_recent_miss_is_skipped(self):
        got = C.targets(self.ADDR, {}, {"서울 강남구|B": "2026-07-25"}, self.TODAY)
        self.assertEqual([k for k, _ in got], ["서울 강남구|A", "서울 강남구|C"])

    def test_entry_without_lookup_keys_is_skipped(self):
        got = C.targets(self.ADDR, {}, {}, self.TODAY)
        self.assertNotIn("서울 강남구|D", [k for k, _ in got])

    def test_location_only_entry_is_still_a_target(self):
        """좌표만 있고 세대수가 없는 항목은 보강 대상이다(세대수 유무로 판단해야 한다)."""
        hh = {"서울 강남구|A": {"lat": 37.5, "lng": 127.0}}
        self.assertIn("서울 강남구|A", [k for k, _ in C.targets(self.ADDR, hh, {}, self.TODAY)])

    def test_curated_complex_with_households_is_skipped(self):
        """apartments.json에 이미 세대수가 있으면 부르지 않는다 — 실측 1,300개가 낭비였다."""
        got = C.targets(self.ADDR, {}, {}, self.TODAY, {"서울 강남구|A"})
        self.assertEqual([k for k, _ in got], ["서울 강남구|B", "서울 강남구|C"])


class CuratedFilledTests(unittest.TestCase):
    def test_key_is_region_key_and_name(self):
        got = C.curated_filled([{"region_key": "서울 강남구", "name": "A", "households": 500}])
        self.assertEqual(got, {"서울 강남구|A"})

    def test_complex_without_households_is_not_counted(self):
        self.assertEqual(C.curated_filled([{"region_key": "서울 강남구", "name": "A"}]), set())

    def test_missing_region_key_still_produces_a_key(self):
        """지역키가 비면 파인더도 빈 문자열로 병합한다 — 같은 규약을 따른다."""
        self.assertEqual(C.curated_filled([{"name": "A", "households": 1}]), {"|A"})

    def test_empty_and_none_are_safe(self):
        self.assertEqual(C.curated_filled([]), set())
        self.assertEqual(C.curated_filled(None), set())


class ApplyResultTests(unittest.TestCase):
    def test_fills_empty_entry_and_records_source(self):
        hh = {}
        self.assertTrue(C.apply_result(hh, "서울 강남구|A", 500, "recap.hhldCnt", 2003))
        self.assertEqual(hh["서울 강남구|A"],
                         {"households": 500, "hh_src": "recap.hhldCnt", "built_year": 2003})

    def test_existing_households_are_never_overwritten(self):
        """K-apt 값이 정본에 가깝다. 덮어쓰면 매 실행 서로 값을 밀어낸다."""
        hh = {"서울 강남구|A": {"households": 300}}
        C.apply_result(hh, "서울 강남구|A", 999, "recap.hhldCnt", None)
        self.assertEqual(hh["서울 강남구|A"]["households"], 300)
        self.assertNotIn("hh_src", hh["서울 강남구|A"])

    def test_existing_build_year_is_never_overwritten(self):
        hh = {"서울 강남구|A": {"built_year": 1999}}
        C.apply_result(hh, "서울 강남구|A", 0, "", 2003)
        self.assertEqual(hh["서울 강남구|A"]["built_year"], 1999)

    def test_other_fields_are_preserved(self):
        """좌표·역·학교는 다른 수집기가 채운 값이다 — 건드리면 안 된다."""
        hh = {"서울 강남구|A": {"lat": 37.5, "lng": 127.0, "subway": {"station": "역"}}}
        C.apply_result(hh, "서울 강남구|A", 500, "recap.hhldCnt", None)
        self.assertEqual(hh["서울 강남구|A"]["lat"], 37.5)
        self.assertEqual(hh["서울 강남구|A"]["subway"], {"station": "역"})

    def test_build_year_alone_is_a_change(self):
        """세대수를 못 구해도 준공연도는 파인더의 연식 조건이 쓴다."""
        hh = {}
        self.assertTrue(C.apply_result(hh, "서울 강남구|A", 0, "", 2003))
        self.assertEqual(hh["서울 강남구|A"], {"built_year": 2003})

    def test_no_new_information_is_not_a_change(self):
        hh = {"서울 강남구|A": {"households": 300, "built_year": 1999}}
        self.assertFalse(C.apply_result(hh, "서울 강남구|A", 500, "recap.hhldCnt", 2003))


class FetchComplexTests(unittest.TestCase):
    KEYS = {"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0000"}

    @mock.patch("collect_building_ledger.L.get_items")
    def test_title_is_not_called_when_recap_is_complete(self, get_items):
        """총괄표제부로 끝나면 표제부는 부르지 않는다 — 호출을 절반으로 줄인다."""
        get_items.return_value = [{"hhldCnt": "1059", "useAprDay": "20200401"}]
        self.assertEqual(C.fetch_complex(self.KEYS, "key"), (1059, "recap.hhldCnt", 2020))
        self.assertEqual(get_items.call_count, 1)

    @mock.patch("collect_building_ledger.L.get_items")
    def test_title_is_called_when_recap_is_empty(self, get_items):
        get_items.side_effect = [
            [],
            [{"hhldCnt": "128", "mainPurpsCdNm": "공동주택(아파트)", "useAprDay": "19981101"}],
        ]
        self.assertEqual(C.fetch_complex(self.KEYS, "key"), (128, "title.hhldCnt", 1998))
        self.assertEqual(get_items.call_count, 2)

    @mock.patch("collect_building_ledger.L.get_items")
    def test_title_supplies_missing_build_year(self, get_items):
        """총괄표제부에 사용승인일이 비어 있으면 표제부에서 연도를 가져온다."""
        get_items.side_effect = [
            [{"hhldCnt": "1059"}],
            [{"hhldCnt": "500", "useAprDay": "20200401"}],
        ]
        households, src, year = C.fetch_complex(self.KEYS, "key")
        self.assertEqual((households, src, year), (1059, "recap.hhldCnt", 2020))

    @mock.patch("collect_building_ledger.L.get_items")
    def test_request_carries_the_lookup_keys(self, get_items):
        get_items.return_value = []
        C.fetch_complex(self.KEYS, "SVCKEY")
        params = get_items.call_args.args[1]
        self.assertEqual(params["sigunguCd"], "11680")
        self.assertEqual(params["bjdongCd"], "10300")
        self.assertEqual(params["bun"], "0012")
        self.assertEqual(params["ji"], "0000")
        self.assertEqual(params["serviceKey"], "SVCKEY")

    @mock.patch("collect_building_ledger.L.get_items")
    def test_recap_url_is_tried_first(self, get_items):
        get_items.return_value = []
        C.fetch_complex(self.KEYS, "key")
        self.assertEqual(get_items.call_args_list[0].args[0], C.RECAP_URL)
        self.assertEqual(get_items.call_args_list[-1].args[0], C.TITLE_URL)

    @mock.patch("collect_building_ledger.L.get_items")
    def test_empty_everywhere(self, get_items):
        get_items.return_value = []
        self.assertEqual(C.fetch_complex(self.KEYS, "key"), (0, "", None))


class FetchLedgerTests(unittest.TestCase):
    KEYS = {"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0000"}

    @mock.patch("collect_building_ledger.L.get_items")
    def test_pages_until_short_page(self, get_items):
        get_items.side_effect = [[{"hhldCnt": "1"}] * C.ROWS, [{"hhldCnt": "2"}] * 3]
        self.assertEqual(len(C.fetch_ledger(C.TITLE_URL, self.KEYS, "key")), C.ROWS + 3)
        self.assertEqual(get_items.call_count, 2)

    @mock.patch("collect_building_ledger.L.get_items")
    def test_page_loop_is_bounded(self, get_items):
        """응답이 계속 가득 차도 무한 루프에 빠지지 않아야 한다."""
        get_items.return_value = [{"hhldCnt": "1"}] * C.ROWS
        C.fetch_ledger(C.TITLE_URL, self.KEYS, "key")
        self.assertEqual(get_items.call_count, C.MAX_PAGES)


if __name__ == "__main__":
    unittest.main()
