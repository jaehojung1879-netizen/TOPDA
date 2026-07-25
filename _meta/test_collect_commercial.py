#!/usr/bin/env python3
import datetime as dt
import unittest
from unittest import mock

import collect_commercial as C


class CommercialCollectorTests(unittest.TestCase):
    def setUp(self):
        C._PROBE_CACHE.clear()

    def test_quarter_ids_use_six_digit_rone_format(self):
        self.assertEqual(
            C.quarter_ids(dt.date(2026, 7, 25), lookback=5),
            ["202603", "202602", "202601", "202504", "202503"],
        )
        self.assertEqual(C.format_quarter("202601"), "2026Q1")

    def test_current_series_is_ranked_above_older_ongoing_series(self):
        self.assertGreater(
            C.table_start_period("임대동향 지역별 임대료(2024년3분기~)_오피스"),
            C.table_start_period("임대동향 지역별 임대료(2022년~)_오피스"),
        )
        self.assertTrue(C._matches_metric("지역별 임대료(2024년3분기~)_오피스", "rent"))
        self.assertFalse(C._matches_metric("층별 임대료 및 층별효용비율_오피스", "rent"))

    @mock.patch("collect_commercial.L.get_json")
    def test_fetch_period_uses_official_quarter_parameters(self, get_json):
        get_json.return_value = {
            "SttsApiTblData": [
                {"head": [{"list_total_count": 1}, {"RESULT": {"CODE": "INFO-000"}}]},
                {"row": [{"CLS_NM": "서울", "DTA_VAL": "31.3"}]},
            ]
        }
        rows = C.fetch_period("TT1", "202601", "key")
        self.assertEqual(len(rows), 1)
        params = get_json.call_args.args[1]
        self.assertEqual(params["DTACYCLE_CD"], "QY")
        self.assertEqual(params["WRTTIME_IDTFR_ID"], "202601")
        self.assertNotIn("START_WRTTIME", params)

    @mock.patch("collect_commercial.L.get_json")
    def test_info_200_is_an_expected_empty_period(self, get_json):
        get_json.return_value = {
            "RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}
        }
        self.assertEqual(C.fetch_period("TT1", "202602", "key"), [])

    def test_rent_unit_and_investment_yield_filter(self):
        self.assertEqual(
            C.metric_value({"DTA_VAL": "31.336", "UI_NM": "천원/㎡"}, "rent"),
            31336,
        )
        self.assertIsNone(
            C.metric_value({"DTA_VAL": "1.1", "ITM_NM": "소득수익률"}, "yield")
        )
        self.assertEqual(
            C.metric_value({"DTA_VAL": "1.7", "ITM_NM": "투자수익률"}, "yield"),
            1.7,
        )

    def test_publish_guard_rejects_unconverted_rent(self):
        regions = [
            {"key": name, "data": {"office": {"rent": 31.3}}}
            for name in list(C.SIDO_COORD)[:5]
        ]
        ok, reason = C._publishable(regions)
        self.assertFalse(ok)
        self.assertIn("임대료", reason)


if __name__ == "__main__":
    unittest.main()
