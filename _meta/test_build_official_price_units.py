#!/usr/bin/env python3
"""평형별 추정 시가표준액 빌더 테스트.

이 값은 취득세·국민주택채권 매입액의 입력이 된다. 추정이라도 다음 성질은 반드시
지켜야 한다 — 깨지면 사용자가 틀린 세액을 그대로 믿는다.

  1) 근거가 얕으면 아예 만들지 않는다 (표본 부족 · 평형 하나뿐)
  2) 실제 수집된 호별 공시가격 분포 [min, max] 밖으로 나가지 않는다
  3) 넓은 평형이 좁은 평형보다 싸게 나오지 않는다 (실거래가 그렇지 않은 한)
  4) 거래가 사라지면 옛 추정을 남기지 않는다
"""
import unittest

import build_official_price_units as B


def deals(*pairs):
    """(전용㎡, 만원) 목록 → 거래 레코드 목록."""
    return [{"area_m2": a, "price": p} for a, p in pairs]


class PyeongTests(unittest.TestCase):
    def test_known_conversions(self):
        self.assertEqual(B.pyeong(84.9), 26)
        self.assertEqual(B.pyeong(59), 18)
        self.assertEqual(B.pyeong(33.058), 10)


class BandTests(unittest.TestCase):
    def test_thin_bands_are_dropped(self):
        """한두 건짜리 중앙값은 그 평형의 대표값이 아니라 그 거래의 층·향이다."""
        d = deals((59, 100), (59, 110), (59, 120), (84, 200), (84, 210))   # 84㎡ 는 2건
        self.assertEqual(sorted(B.bands(d)), [59])

    def test_areas_round_to_one_m2(self):
        """84.9㎡ 와 84.97㎡ 는 같은 평형이다(finder_index 와 같은 규약)."""
        d = deals((84.9, 100), (84.97, 110), (85.2, 120))
        self.assertEqual(sorted(B.bands(d)), [85])

    def test_median_not_mean(self):
        d = deals((59, 100), (59, 110), (59, 900))
        self.assertEqual(B.bands(d)[59], 110)


class EstimateTests(unittest.TestCase):
    REC = {"min": 200000000, "med": 500000000, "max": 900000000, "n": 100}

    def test_scales_by_band_ratio(self):
        """평형 실거래가 단지 중앙값의 2배면 추정 공시가격도 약 2배다."""
        d = deals((59, 50000), (59, 50000), (59, 50000),
                  (114, 100000), (114, 100000), (114, 100000))
        out = B.estimate_units(self.REC, d)
        got = {u[0]: u[2] for u in out}
        # 단지 실거래 중앙값 = 75,000만. 59㎡ 는 50/75, 114㎡ 는 100/75.
        self.assertEqual(got[59], round(500000000 * 50000 / 75000 / 10000) * 10000)
        self.assertEqual(got[114], round(500000000 * 100000 / 75000 / 10000) * 10000)

    def test_clamped_to_collected_distribution(self):
        """수집된 호별 공시가격 범위 밖은 추정이 아니라 외삽이다."""
        d = deals((30, 1000), (30, 1000), (30, 1000),
                  (200, 900000), (200, 900000), (200, 900000))
        out = B.estimate_units(self.REC, d)
        for area, py, est in out:
            self.assertGreaterEqual(est, self.REC["min"], area)
            self.assertLessEqual(est, self.REC["max"], area)

    def test_monotonic_when_trades_are(self):
        d = deals((59, 50000), (59, 52000), (59, 51000),
                  (84, 70000), (84, 71000), (84, 72000),
                  (114, 90000), (114, 91000), (114, 92000))
        out = B.estimate_units(self.REC, d)
        vals = [u[2] for u in out]
        self.assertEqual(vals, sorted(vals))
        self.assertEqual([u[0] for u in out], [59, 84, 114])

    def test_single_band_gets_nothing(self):
        """평형이 하나면 중앙값이 곧 그 평형이라 추정을 덧붙일 이유가 없다."""
        d = deals((84, 70000), (84, 71000), (84, 72000),
                  (84, 73000), (84, 74000), (84, 75000))
        self.assertEqual(B.estimate_units(self.REC, d), [])

    def test_too_few_trades_gets_nothing(self):
        d = deals((59, 50000), (59, 51000), (59, 52000),
                  (84, 70000), (84, 71000))       # 합계 5건 < 6
        self.assertEqual(B.estimate_units(self.REC, d), [])

    def test_no_median_price_gets_nothing(self):
        self.assertEqual(B.estimate_units({"med": 0}, deals((59, 100))), [])

    def test_pyeong_is_included(self):
        d = deals((59, 50000), (59, 50000), (59, 50000),
                  (84, 70000), (84, 70000), (84, 70000))
        out = B.estimate_units(self.REC, d)
        self.assertEqual([(u[0], u[1]) for u in out], [(59, 18), (84, 25)])


class BuildTests(unittest.TestCase):
    def test_stale_estimate_is_removed_when_trades_vanish(self):
        """거래가 끊겨 근거가 사라졌는데 옛 추정을 남기면 아무도 그게 옛것인 줄 모른다."""
        op = {"map": {"서울 강남구|가": {"min": 1, "med": 100, "max": 200,
                                        "u": [[59, 18, 80]]}}}
        added, removed = B.build(op, {})
        self.assertEqual(removed, 1)
        self.assertNotIn("u", op["map"]["서울 강남구|가"])

    def test_estimates_are_attached(self):
        op = {"map": {"서울 강남구|가": {"min": 200000000, "med": 500000000,
                                        "max": 900000000}}}
        B.build(op, {"서울 강남구|가": deals(
            (59, 50000), (59, 50000), (59, 50000),
            (84, 70000), (84, 70000), (84, 70000))})
        self.assertEqual(len(op["map"]["서울 강남구|가"]["u"]), 2)


class ShippedDataTests(unittest.TestCase):
    """실제로 배포되는 official_price.json 이 위 성질을 지키는지."""

    @classmethod
    def setUpClass(cls):
        import json
        with open(B.OP_JSON, encoding="utf-8") as f:
            cls.map = json.load(f)["map"]

    def test_every_estimate_is_inside_the_collected_range(self):
        for key, rec in self.map.items():
            for area, py, est in rec.get("u") or []:
                self.assertGreaterEqual(est, rec["min"], f"{key} {area}㎡")
                self.assertLessEqual(est, rec["max"], f"{key} {area}㎡")

    def test_shape_is_triples_of_numbers(self):
        for key, rec in self.map.items():
            for u in rec.get("u") or []:
                self.assertEqual(len(u), 3, key)
                for v in u:
                    self.assertIsInstance(v, int, key)
                    self.assertGreater(v, 0, key)

    def test_areas_are_sorted_and_unique(self):
        for key, rec in self.map.items():
            areas = [u[0] for u in rec.get("u") or []]
            self.assertEqual(areas, sorted(set(areas)), key)


if __name__ == "__main__":
    unittest.main()
