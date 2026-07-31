#!/usr/bin/env python3
"""공시가격 수집 테스트.

건축HUB 주택가격(getBrHsprcInfo)은 지번으로 직접 조회한다. 조회키가 하나라도 어긋나면
엉뚱한 지번의 가격이 붙으므로, 키가 온전할 때만 부른다.
"""
import datetime as dt
import math
import unittest
from unittest import mock

import collect_official_price as C


class LookupKeyTests(unittest.TestCase):
    def test_bun_and_ji_are_zero_padded(self):
        """본번·부번은 4자리 0채움이 규약이다('12' → '0012')."""
        self.assertEqual(
            C.lookup_keys({"sgg": "11680", "umd": "10300", "bun": "12", "ji": "0"}),
            {"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0000"})

    def test_already_padded_values_are_kept(self):
        self.assertEqual(
            C.lookup_keys({"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0001"})["bun"],
            "0012")

    def test_missing_ji_defaults_to_zero(self):
        """부번은 없을 수 있다 — 0000으로 조회하는 게 규약이다."""
        self.assertEqual(
            C.lookup_keys({"sgg": "11680", "umd": "10300", "bun": "0012"})["ji"], "0000")

    def test_incomplete_keys_are_refused(self):
        """시군구·법정동·본번이 하나라도 없으면 부르지 않는다 — 엉뚱한 지번을 조회하게 된다."""
        for entry in ({"sgg": "11680", "umd": "10300"},          # 본번 없음
                      {"sgg": "11680", "bun": "0012"},           # 법정동 없음
                      {"umd": "10300", "bun": "0012"},           # 시군구 없음
                      {"addr": "서울 강남구 역삼동 1"},            # 주소만
                      {}):
            self.assertIsNone(C.lookup_keys(entry), entry)

    def test_legacy_string_entry_has_no_keys(self):
        """주소 문자열만 담던 초기 형식에는 조회키가 없다."""
        self.assertIsNone(C.lookup_keys("서울 강남구 역삼동 736-1"))


class SummarizeTests(unittest.TestCase):
    def test_median_is_the_representative_value(self):
        got = C.summarize({"20260101": [100, 300, 200, 400]}, dt.date(2026, 7, 28))
        self.assertEqual(got, {"min": 100, "med": 250, "max": 400, "n": 4,
                               "std_day": "20260101", "v": C.REC_VERSION,
                               "fetched": "2026-07-28"})

    def test_only_the_latest_standard_day_is_summarized(self):
        """항목은 '호 × 공시연도'다. 연도를 섞으면 옛 가격이 중앙값을 끌어내린다."""
        got = C.summarize({"20130101": [100, 100, 100], "20260101": [500, 700]},
                          dt.date(2026, 7, 28))
        self.assertEqual((got["min"], got["med"], got["max"], got["n"], got["std_day"]),
                         (500, 600, 700, 2, "20260101"))

    def test_barely_entered_year_is_skipped(self):
        """공시 발표기에는 새 기준일이 몇 호에만 먼저 기재된다 — 그걸로 대표값을 내면 안 된다."""
        got = C.summarize({"20250101": [300] * 60, "20260101": [999, 999]},
                          dt.date(2026, 7, 28))
        self.assertEqual((got["med"], got["n"], got["std_day"]), (300, 60, "20250101"))

    def test_year_with_a_comparable_sample_is_used(self):
        """표본이 앞 해와 비슷하면 새 기준일을 쓴다 — 그게 정상적인 갱신이다."""
        got = C.summarize({"20250101": [300] * 60, "20260101": [999] * 55},
                          dt.date(2026, 7, 28))
        self.assertEqual((got["med"], got["std_day"]), (999, "20260101"))

    def test_dated_prices_win_over_undated_ones(self):
        """기준일이 빈 항목은 연도를 알 수 없어 최신으로 볼 수 없다."""
        got = C.summarize({"": [100], "20250101": [900]}, dt.date(2026, 7, 28))
        self.assertEqual((got["med"], got["std_day"]), (900, "20250101"))

    def test_single_unit_complex(self):
        got = C.summarize({"20260101": [500]}, dt.date(2026, 7, 28))
        self.assertEqual((got["min"], got["med"], got["max"], got["n"]), (500, 500, 500, 1))

    def test_no_prices_yields_no_record(self):
        self.assertIsNone(C.summarize({}, dt.date(2026, 7, 28)))
        self.assertIsNone(C.summarize({"20260101": []}, dt.date(2026, 7, 28)))

    def test_fetch_date_is_recorded(self):
        """재조회 간격을 재려면 마지막 조회일이 있어야 한다."""
        self.assertEqual(C.summarize({"": [1]}, dt.date(2026, 7, 28))["fetched"], "2026-07-28")


class RefreshPolicyTests(unittest.TestCase):
    """공시가격은 연 1회 갱신이지만, 건축물대장의 기재는 그보다 늦을 수 있다.

    대장은 공시가격을 '전재'한 값이라 몇 해 전 기준일에 머물러 있을 수 있다(활용가이드
    샘플의 stdDay가 20200101이다). 기준연도만 보고 판단하면 그런 단지를 매 실행 다시
    부르게 되고, 16,000개 단지면 영원히 헛돈다.
    """
    TODAY = dt.date(2026, 7, 28)

    V = C.REC_VERSION

    def test_current_year_is_skipped(self):
        self.assertFalse(C.needs_refresh({"std_day": "20260101", "v": self.V},
                                         2026, self.TODAY))

    def test_stale_record_is_not_refetched_before_the_interval(self):
        """대장이 몇 해 전 값만 들고 있어도 재조회 간격 전에는 부르지 않는다."""
        rec = {"std_day": "20200101", "fetched": "2026-07-20", "v": self.V}   # 8일 전
        self.assertFalse(C.needs_refresh(rec, 2026, self.TODAY))

    def test_stale_record_is_refetched_after_the_interval(self):
        rec = {"std_day": "20200101", "fetched": "2026-05-01", "v": self.V}   # 88일 전
        self.assertTrue(C.needs_refresh(rec, 2026, self.TODAY))

    def test_record_without_fetch_date_is_checked_once(self):
        """조회일 기록 전 데이터는 한 번은 다시 본다."""
        self.assertTrue(C.needs_refresh({"std_day": "20250101", "v": self.V},
                                        2026, self.TODAY))

    def test_missing_or_malformed_record_is_refetched(self):
        self.assertTrue(C.needs_refresh(None, 2026, self.TODAY))
        self.assertTrue(C.needs_refresh({}, 2026, self.TODAY))
        self.assertTrue(C.needs_refresh({"std_day": "", "v": self.V}, 2026, self.TODAY))
        self.assertTrue(C.needs_refresh({"std_day": "20200101", "fetched": "엉망",
                                         "v": self.V}, 2026, self.TODAY))

    def test_current_year_wins_over_fetch_interval(self):
        """올해 기준일을 확보했으면 조회일이 아무리 오래됐어도 부르지 않는다."""
        rec = {"std_day": "20260101", "fetched": "2026-01-02", "v": self.V}
        self.assertFalse(C.needs_refresh(rec, 2026, self.TODAY))

    def test_old_format_record_is_refetched_even_for_this_year(self):
        """판이 낮은 레코드는 공시연도를 섞어 요약한 값이라 기준연도와 무관하게 다시 부른다."""
        self.assertTrue(C.needs_refresh({"std_day": "20260101", "fetched": "2026-07-28"},
                                        2026, self.TODAY))


class SamplePagesTests(unittest.TestCase):
    """페이지 표본. 앞에서부터 몇 장만 읽으면 동·호 순서 탓에 저층 편향이 생긴다."""

    def test_small_complex_is_read_in_full(self):
        self.assertEqual(C.sample_pages(250, rows=100, want=6), [1, 2, 3])

    def test_single_page(self):
        self.assertEqual(C.sample_pages(40, rows=100, want=6), [1])

    def test_empty_still_asks_for_the_first_page(self):
        self.assertEqual(C.sample_pages(0, rows=100, want=6), [1])

    def test_large_complex_is_sampled_across_the_whole_range(self):
        pages = C.sample_pages(10000, rows=100, want=6)   # 100페이지
        self.assertEqual(len(pages), 6)
        self.assertEqual((pages[0], pages[-1]), (1, 100))
        self.assertEqual(pages, sorted(set(pages)))

    def test_sample_never_exceeds_the_page_count(self):
        for total in (1, 99, 100, 101, 599, 601, 12345):
            pages = C.sample_pages(total, rows=100, want=6)
            self.assertLessEqual(max(pages), math.ceil(total / 100) or 1, total)
            self.assertGreaterEqual(min(pages), 1, total)


class FetchPricesTests(unittest.TestCase):
    KEYS = {"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0000"}

    @mock.patch("collect_official_price.L.get_items_total")
    def test_prices_are_grouped_by_standard_day(self, get_items_total):
        """항목 하나는 '호 × 공시연도'다 — 연도별로 나눠 담아야 최신만 골라 쓸 수 있다."""
        get_items_total.return_value = ([{"hsprc": "100", "stdDay": "20130101"},
                                         {"hsprc": "900", "stdDay": "20260101"},
                                         {"hsprc": "700", "stdDay": "20260101"}], 3)
        self.assertEqual(C.fetch_prices(self.KEYS, "key"),
                         {"20130101": [100], "20260101": [900, 700]})

    @mock.patch("collect_official_price.L.get_items_total")
    def test_total_count_bounds_the_page_reads(self, get_items_total):
        """전량 페이징은 단지당 60회였다 — totalCount로 표본 페이지만 읽는다."""
        get_items_total.return_value = ([{"hsprc": "100", "stdDay": "20260101"}] * C.ROWS,
                                        1000000)   # 10,000페이지
        C.fetch_prices(self.KEYS, "key")
        self.assertEqual(get_items_total.call_count, C.SAMPLE_PAGES)

    @mock.patch("collect_official_price.L.get_items_total")
    def test_short_first_page_needs_no_more_calls(self, get_items_total):
        get_items_total.return_value = ([{"hsprc": "100", "stdDay": "20260101"}] * 7, 7)
        C.fetch_prices(self.KEYS, "key")
        self.assertEqual(get_items_total.call_count, 1)

    @mock.patch("collect_official_price.L.get_items_total")
    def test_zero_and_missing_prices_are_dropped(self, get_items_total):
        get_items_total.return_value = ([{"hsprc": "0"}, {"hsprc": ""}, {},
                                         {"hsprc": "500", "stdDay": "20260101"}], 4)
        self.assertEqual(C.fetch_prices(self.KEYS, "key"), {"20260101": [500]})

    @mock.patch("collect_official_price.L.get_items_total")
    def test_empty_response_yields_nothing(self, get_items_total):
        get_items_total.return_value = ([], 0)
        self.assertEqual(C.fetch_prices(self.KEYS, "key"), {})
        self.assertEqual(get_items_total.call_count, 1)

    @mock.patch("collect_official_price.L.get_items_total")
    def test_request_carries_the_lookup_keys(self, get_items_total):
        get_items_total.return_value = ([], 0)
        C.fetch_prices(self.KEYS, "SVCKEY")
        params = get_items_total.call_args.args[1]
        self.assertEqual(params["sigunguCd"], "11680")
        self.assertEqual(params["bjdongCd"], "10300")
        self.assertEqual(params["bun"], "0012")
        self.assertEqual(params["ji"], "0000")
        self.assertEqual(params["serviceKey"], "SVCKEY")

    @mock.patch("collect_official_price.L.get_items_total")
    def test_page_loop_is_bounded_without_total_count(self, get_items_total):
        """totalCount를 안 주는 응답이 계속 가득 차도 무한 루프에 빠지지 않아야 한다."""
        get_items_total.return_value = ([{"hsprc": "100"}] * C.ROWS, None)
        C.fetch_prices(self.KEYS, "key")
        self.assertEqual(get_items_total.call_count, C.MAX_PAGES)


if __name__ == "__main__":
    unittest.main()
