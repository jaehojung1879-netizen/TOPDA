#!/usr/bin/env python3
import unittest

import complex_identity as CI


class AddressIdentityTests(unittest.TestCase):
    def test_building_suffix_aliases_share_identity(self):
        addr = {
            "서울 강동구|광남캐스빌": {"addr": "서울 강동구 암사동 435-4", "sgg": "11740", "umd": "10600", "bun": "0435", "ji": "0004"},
            "서울 강동구|광남캐스빌105동": {"addr": "서울 강동구 암사동 435-4", "sgg": "11740", "umd": "10600", "bun": "0435", "ji": "0004"},
        }
        ids = CI.build_identities(addr, {"서울 강동구|광남캐스빌": {"households": 28}}, [])
        self.assertEqual(len(ids), 1)
        self.assertEqual(ids[0]["households"], 28)
        self.assertEqual(len(ids[0]["keys"]), 2)

    def test_same_address_different_complexes_are_ambiguous(self):
        common = {"addr": "경기 평택시 현덕면 화양리 1", "sgg": "41220", "umd": "37023", "bun": "0001", "ji": "0000"}
        ids = CI.build_identities({"경기 평택시|퍼스트시티": common,
                                   "경기 평택시|라씨엘로": common}, {}, [])
        self.assertEqual(len(ids), 2)
        self.assertTrue(all(x["address_ambiguous"] for x in ids))

    def test_numbered_phases_are_not_aliases(self):
        common = {"addr": "서울 마포구 아현동 777", "sgg": "11440", "umd": "10100", "bun": "0777", "ji": "0000"}
        ids = CI.build_identities({"서울 마포구|마포래미안푸르지오1단지": common,
                                   "서울 마포구|마포래미안푸르지오2단지": common}, {}, [])
        self.assertEqual(len(ids), 2)
        self.assertTrue(all(x["address_ambiguous"] for x in ids))

    def test_zero_main_number_is_not_registry_identity(self):
        self.assertEqual(CI.registry_id({"sgg": "28275", "umd": "10600", "bun": "0000", "ji": "0000"}), "")

    def test_conflicting_values_are_never_collapsed(self):
        addr = {"서울 강남구|A": {"addr": "서울 강남구 역삼동 1", "sgg": "11680", "umd": "10100", "bun": "0001", "ji": "0000"},
                "서울 강남구|A101동": {"addr": "서울 강남구 역삼동 1", "sgg": "11680", "umd": "10100", "bun": "0001", "ji": "0000"}}
        hh = {"서울 강남구|A": {"households": 100}, "서울 강남구|A101동": {"households": 10}}
        ident = CI.build_identities(addr, hh, [])[0]
        self.assertTrue(ident["household_conflict"])
        self.assertIsNone(ident["households"])


if __name__ == "__main__":
    unittest.main()
