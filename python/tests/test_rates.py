"""Tests for duty27_eu_vat. Standard library only (unittest): `python -m unittest discover -s tests`.

These mirror the Node tests in ../node/test, so the three libraries are held to the same behaviour, and
test_vectors.py checks them against the same shared expected answers.
"""
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from duty27_eu_vat import (
    ATTRIBUTION, DATA_AS_OF, DATA_FIRST_DATE, Country, DateOutOfRangeError, RateChange, RateWindow,
    UnknownCountryError, format_rate, get_rate_changes, get_rate_history, get_standard_rate,
    list_countries, normalize_country,
)


class StandardRate(unittest.TestCase):
    def test_the_day_a_rate_changes_is_the_first_day_of_the_new_rate_germany_2020(self):
        self.assertEqual(get_standard_rate("DE", "2020-06-30"), 19)
        self.assertEqual(get_standard_rate("DE", "2020-07-01"), 16)
        self.assertEqual(get_standard_rate("DE", "2020-12-31"), 16)
        self.assertEqual(get_standard_rate("DE", "2021-01-01"), 19)

    def test_other_real_changes_land_on_the_right_day(self):
        cases = [
            ("EL", "2016-05-31", 23), ("EL", "2016-06-01", 24),
            ("IE", "2020-08-31", 23), ("IE", "2020-09-01", 21), ("IE", "2021-02-28", 21), ("IE", "2021-03-01", 23),
            ("LU", "2022-12-31", 17), ("LU", "2023-06-15", 16), ("LU", "2024-01-01", 17),
            ("FI", "2024-08-31", 24), ("FI", "2024-09-01", Decimal("25.5")),
            ("RO", "2025-07-31", 19), ("RO", "2025-08-01", 21),
        ]
        for country, day, expected in cases:
            with self.subTest(country=country, day=day):
                self.assertEqual(get_standard_rate(country, day), expected)

    def test_rates_are_exact_decimals_not_floats(self):
        rate = get_standard_rate("FI", "2024-09-01")
        self.assertIsInstance(rate, Decimal)
        self.assertEqual(rate, Decimal("25.5"))
        # the point of Decimal: no float noise when the rate is used in a calculation
        self.assertEqual(Decimal("100") * rate / 100, Decimal("25.5"))

    def test_first_day_of_the_data_and_a_country_that_never_changed(self):
        self.assertEqual(get_standard_rate("AT", "2016-01-01"), 20)
        self.assertEqual(DATA_FIRST_DATE, date(2016, 1, 1))

    def test_a_date_after_the_last_known_change_returns_the_latest_known_rate(self):
        # Derived from the data, not hard-coded: a new rate change must not break this test (the shared vectors hold exact values).
        self.assertEqual(get_standard_rate("RO", "2035-01-01"), get_rate_history("RO")[-1].rate)

    def test_country_codes_are_case_insensitive_trimmed_and_greece_answers_to_gr_and_el(self):
        self.assertEqual(get_standard_rate("de", "2020-07-01"), 16)
        self.assertEqual(get_standard_rate(" DE ", "2020-07-01"), 16)
        self.assertEqual(get_standard_rate("GR", "2016-06-01"), 24)
        self.assertEqual(get_standard_rate("gr", "2016-06-01"), 24)
        self.assertEqual(get_standard_rate("EL", "2016-06-01"), 24)
        self.assertEqual(normalize_country("gr"), "EL")

    def test_an_unknown_or_non_eu_country_is_an_error_not_a_guess(self):
        for bad in ["XX", "GB", "US", "CH", "", "GERMANY", "D"]:
            with self.subTest(bad=bad):
                with self.assertRaises(UnknownCountryError):
                    get_standard_rate(bad, "2020-01-01")
        for bad in [None, 19, 1.5, b"DE"]:
            with self.subTest(bad=bad):
                with self.assertRaises(UnknownCountryError):
                    get_standard_rate(bad, "2020-01-01")
        with self.assertRaises(ValueError):  # the error is also a plain ValueError
            get_standard_rate("GB", "2020-01-01")
        with self.assertRaisesRegex(UnknownCountryError, "GB"):
            get_standard_rate("GB", "2020-01-01")

    def test_a_date_before_the_data_starts_is_an_error_never_a_made_up_rate(self):
        with self.assertRaises(DateOutOfRangeError):
            get_standard_rate("DE", "2015-12-31")
        with self.assertRaises(ValueError):
            get_standard_rate("DE", "2015-12-31")
        with self.assertRaisesRegex(DateOutOfRangeError, "2016-01-01"):
            get_standard_rate("DE", date(2000, 1, 1))

    def test_a_malformed_or_impossible_date_string_is_a_value_error(self):
        for bad in ["2020-02-30", "2020-13-01", "20200701", "2020-7-1", "banana", "", "2020-07-01T00:00:00Z", "2020-W27-3"]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    get_standard_rate("DE", bad)

    def test_a_date_of_the_wrong_type_is_a_type_error(self):
        for bad in [20200701, 1.5, b"2020-07-01", True, ["2020-07-01"]]:
            with self.subTest(bad=bad):
                with self.assertRaises(TypeError):
                    get_standard_rate("DE", bad)

    def test_date_and_datetime_objects(self):
        self.assertEqual(get_standard_rate("DE", date(2020, 7, 1)), 16)
        # a naive datetime is read as its own calendar day
        self.assertEqual(get_standard_rate("DE", datetime(2020, 7, 1, 0, 30)), 16)
        # an aware datetime is converted to UTC first: 00:30 on 1 July in Paris is still 30 June in UTC
        paris = timezone(timedelta(hours=2))
        self.assertEqual(get_standard_rate("DE", datetime(2020, 7, 1, 0, 30, tzinfo=paris)), 19)
        self.assertEqual(get_standard_rate("DE", datetime(2020, 7, 1, 0, 0, tzinfo=timezone.utc)), 16)

    def test_with_no_date_it_uses_today_utc(self):
        today = datetime.now(timezone.utc).date()
        self.assertEqual(get_standard_rate("DE"), get_standard_rate("DE", today))
        self.assertEqual(get_standard_rate("DE", None), get_standard_rate("DE", today))


class History(unittest.TestCase):
    def test_get_rate_history_returns_every_window_in_order(self):
        # The known history is a floor: a later change adds a window at the end, it never alters these.
        self.assertEqual(
            get_rate_history("DE")[:3],
            [RateWindow(date(2016, 1, 1), Decimal(19)), RateWindow(date(2020, 7, 1), Decimal(16)), RateWindow(date(2021, 1, 1), Decimal(19))],
        )
        self.assertEqual(
            get_rate_history("gr")[:2],
            [RateWindow(date(2016, 1, 1), Decimal(23)), RateWindow(date(2016, 6, 1), Decimal(24))],
        )

    def test_the_caller_cannot_change_the_data_through_the_result(self):
        history = get_rate_history("DE")
        windows, latest = len(history), history[-1].rate
        history.append(RateWindow(date(2030, 1, 1), Decimal(99)))
        history.clear()
        self.assertEqual(len(get_rate_history("DE")), windows)
        with self.assertRaises(Exception):  # the windows themselves are immutable
            get_rate_history("DE")[0].rate = Decimal(1)
        self.assertEqual(get_standard_rate("DE", "2030-06-01"), latest)

    def test_get_rate_changes_lists_every_change_newest_first_and_can_be_filtered(self):
        everything = get_rate_changes()
        self.assertGreaterEqual(len(everything), 13)  # the 13 known changes are a floor; new ones add to it
        self.assertIn(RateChange("RO", date(2025, 8, 1), Decimal(19), Decimal(21)), everything)
        dates = [c.date for c in everything]
        self.assertEqual(dates, sorted(dates, reverse=True))
        self.assertEqual([(c.date, c.from_rate, c.to_rate) for c in get_rate_changes(country="de")][-2:],
                         [(date(2021, 1, 1), 16, 19), (date(2020, 7, 1), 19, 16)])
        since_2025 = [c.country for c in get_rate_changes(since="2025-01-01")]
        for known in ("RO", "EE", "SK"):
            self.assertIn(known, since_2025)
        austria = get_rate_changes(country="AT")  # a country filter returns only that country, one change per extra window
        self.assertTrue(all(c.country == "AT" for c in austria))
        self.assertEqual(len(austria), len(get_rate_history("AT")) - 1)
        with self.assertRaises(UnknownCountryError):
            get_rate_changes(country="XX")
        with self.assertRaises(ValueError):
            get_rate_changes(since="soon")

    def test_list_countries_gives_the_27_member_states_sorted_by_name(self):
        countries = list_countries()
        self.assertEqual(len(countries), 27)
        self.assertEqual(len({c.code for c in countries}), 27)
        self.assertIn(Country("EL", "Greece"), countries)
        self.assertNotIn("GR", [c.code for c in countries])
        names = [c.name for c in countries]
        self.assertEqual(names, sorted(names))


class Formatting(unittest.TestCase):
    def test_english(self):
        self.assertEqual(format_rate(Decimal("25.5")), "25.5%")
        self.assertEqual(format_rate(Decimal(19)), "19%")
        self.assertEqual(format_rate(Decimal(20)), "20%")  # not "2E+1": Decimal's scientific form must not leak
        self.assertEqual(format_rate(19), "19%")

    def test_german_french_and_spanish_use_a_decimal_comma_and_a_no_break_space(self):
        # The same strings the JavaScript library produces with Intl.
        for locale in ("de", "fr", "es"):
            with self.subTest(locale=locale):
                self.assertEqual(format_rate(Decimal(19), locale), "19 %")
                self.assertEqual(format_rate(Decimal("25.5"), locale), "25,5 %")
                self.assertEqual(format_rate(Decimal("0.5"), locale), "0,5 %")

    def test_an_unsupported_locale_is_an_error_rather_than_a_silent_english_fallback(self):
        with self.assertRaises(ValueError):
            format_rate(Decimal(19), "ja")


class Metadata(unittest.TestCase):
    def test_the_data_carries_its_as_of_date_and_its_attribution(self):
        self.assertIsInstance(DATA_AS_OF, date)
        self.assertIn("duty27.com/vat-rates/history", ATTRIBUTION)
        self.assertIn("CC BY 4.0", ATTRIBUTION)

    def test_data_integrity_every_country_starts_on_the_first_date_ascends_and_never_repeats_a_rate(self):
        for country in list_countries():
            history = get_rate_history(country.code)
            with self.subTest(country=country.code):
                self.assertEqual(history[0].effective_from, DATA_FIRST_DATE)
                self.assertEqual([w.effective_from for w in history], sorted(w.effective_from for w in history))
                for before, after in zip(history, history[1:]):
                    self.assertNotEqual(before.rate, after.rate)
                for window in history:
                    self.assertTrue(5 <= window.rate <= 30)


if __name__ == "__main__":
    unittest.main()
