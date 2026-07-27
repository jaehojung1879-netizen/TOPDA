#!/usr/bin/env python3
"""공시가격 수집 테스트.

건축HUB 주택가격(getBrHsprcInfo)은 지번으로 직접 조회한다. 조회키가 하나라도 어긋나면
엉뚱한 지번의 가격이 붙으므로, 키가 온전할 때만 부른다.
"""
import datetime as dt
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
        got = C.summarize([100, 300, 200, 400], "20260101", dt.date(2026, 7, 28))
        self.assertEqual(got, {"min": 100, "med": 250, "max": 400, "n": 4,
                               "std_day": "20260101", "fetched": "2026-07-28"})

    def test_single_unit_complex(self):
        got = C.summarize([500], "20260101", dt.date(2026, 7, 28))
        self.assertEqual((got["min"], got["med"], got["max"], got["n"]), (500, 500, 500, 1))

    def test_fetch_date_is_recorded(self):
        """재조회 간격을 재려면 마지막 조회일이 있어야 한다."""
        self.assertEqual(C.summarize([1], "", dt.date(2026, 7, 28))["fetched"], "2026-07-28")


class RefreshPolicyTests(unittest.TestCase):
    """공시가격은 연 1회 갱신이지만, 건축물대장의 기재는 그보다 늦을 수 있다.

    대장은 공시가격을 '전재'한 값이라 몇 해 전 기준일에 머물러 있을 수 있다(활용가이드
    샘플의 stdDay가 20200101이다). 기준연도만 보고 판단하면 그런 단지를 매 실행 다시
    부르게 되고, 16,000개 단지면 영원히 헛돈다.
    """
    TODAY = dt.date(2026, 7, 28)

    def test_current_year_is_skipped(self):
        self.assertFalse(C.needs_refresh({"std_day": "20260101"}, 2026, self.TODAY))

    def test_stale_record_is_not_refetched_before_the_interval(self):
        """대장이 몇 해 전 값만 들고 있어도 재조회 간격 전에는 부르지 않는다."""
        rec = {"std_day": "20200101", "fetched": "2026-07-20"}   # 8일 전
        self.assertFalse(C.needs_refresh(rec, 2026, self.TODAY))

    def test_stale_record_is_refetched_after_the_interval(self):
        rec = {"std_day": "20200101", "fetched": "2026-05-01"}   # 88일 전
        self.assertTrue(C.needs_refresh(rec, 2026, self.TODAY))

    def test_record_without_fetch_date_is_checked_once(self):
        """조회일 기록 전 데이터는 한 번은 다시 본다."""
        self.assertTrue(C.needs_refresh({"std_day": "20250101"}, 2026, self.TODAY))

    def test_missing_or_malformed_record_is_refetched(self):
        self.assertTrue(C.needs_refresh(None, 2026, self.TODAY))
        self.assertTrue(C.needs_refresh({}, 2026, self.TODAY))
        self.assertTrue(C.needs_refresh({"std_day": ""}, 2026, self.TODAY))
        self.assertTrue(C.needs_refresh({"std_day": "20200101", "fetched": "엉망"},
                                        2026, self.TODAY))

    def test_current_year_wins_over_fetch_interval(self):
        """올해 기준일을 확보했으면 조회일이 아무리 오래됐어도 부르지 않는다."""
        rec = {"std_day": "20260101", "fetched": "2026-01-02"}
        self.assertFalse(C.needs_refresh(rec, 2026, self.TODAY))


class FetchPricesTests(unittest.TestCase):
    KEYS = {"sgg": "11680", "umd": "10300", "bun": "0012", "ji": "0000"}

    @mock.patch("collect_official_price.L.get_items")
    def test_pages_until_short_page(self, get_items):
        """전유부를 끝까지 읽는다. 첫 페이지만 보면 동·호 순서 탓에 저층 편향이 생긴다."""
        get_items.side_effect = [
            [{"hsprc": "100", "stdDay": "20260101"}] * C.ROWS,
            [{"hsprc": "900", "stdDay": "20260101"}] * 3,
        ]
        prices, std = C.fetch_prices(self.KEYS, "key")
        self.assertEqual(len(prices), C.ROWS + 3)
        self.assertEqual((min(prices), max(prices), std), (100, 900, "20260101"))
        self.assertEqual(get_items.call_count, 2)

    @mock.patch("collect_official_price.L.get_items")
    def test_zero_and_missing_prices_are_dropped(self, get_items):
        get_items.return_value = [{"hsprc": "0"}, {"hsprc": ""}, {}, {"hsprc": "500",
                                                                     "stdDay": "20260101"}]
        prices, std = C.fetch_prices(self.KEYS, "key")
        self.assertEqual((prices, std), ([500], "20260101"))

    @mock.patch("collect_official_price.L.get_items")
    def test_empty_response_yields_nothing(self, get_items):
        get_items.return_value = []
        self.assertEqual(C.fetch_prices(self.KEYS, "key"), ([], ""))

    @mock.patch("collect_official_price.L.get_items")
    def test_request_carries_the_lookup_keys(self, get_items):
        get_items.return_value = []
        C.fetch_prices(self.KEYS, "SVCKEY")
        params = get_items.call_args.args[1]
        self.assertEqual(params["sigunguCd"], "11680")
        self.assertEqual(params["bjdongCd"], "10300")
        self.assertEqual(params["bun"], "0012")
        self.assertEqual(params["ji"], "0000")
        self.assertEqual(params["serviceKey"], "SVCKEY")

    @mock.patch("collect_official_price.L.get_items")
    def test_page_loop_is_bounded(self, get_items):
        """응답이 계속 가득 차도 무한 루프에 빠지지 않아야 한다."""
        get_items.return_value = [{"hsprc": "100"}] * C.ROWS
        C.fetch_prices(self.KEYS, "key")
        self.assertEqual(get_items.call_count, C.MAX_PAGES)


if __name__ == "__main__":
    unittest.main()
