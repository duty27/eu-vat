package com.duty27.euvat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Tests for {@link EuVat}. They mirror the Node and Python tests in this repository, so the three libraries are
 * held to the same behaviour; {@link SharedVectorsTest} checks all three against the same expected answers.
 */
class EuVatTest {

    private static BigDecimal d(String value) {
        return new BigDecimal(value);
    }

    private static void assertRate(String expected, String country, String date) {
        assertEquals(0, d(expected).compareTo(EuVat.getStandardRate(country, date)),
                country + " on " + date + ": expected " + expected + " but got " + EuVat.getStandardRate(country, date));
    }

    @Test
    void theDayARateChangesIsTheFirstDayOfTheNewRateGermany2020() {
        assertRate("19", "DE", "2020-06-30");
        assertRate("16", "DE", "2020-07-01");
        assertRate("16", "DE", "2020-12-31");
        assertRate("19", "DE", "2021-01-01");
    }

    @Test
    void otherRealChangesLandOnTheRightDay() {
        assertRate("23", "EL", "2016-05-31");
        assertRate("24", "EL", "2016-06-01");
        assertRate("23", "IE", "2020-08-31");
        assertRate("21", "IE", "2020-09-01");
        assertRate("21", "IE", "2021-02-28");
        assertRate("23", "IE", "2021-03-01");
        assertRate("17", "LU", "2022-12-31");
        assertRate("16", "LU", "2023-06-15");
        assertRate("17", "LU", "2024-01-01");
        assertRate("24", "FI", "2024-08-31");
        assertRate("25.5", "FI", "2024-09-01");
        assertRate("19", "RO", "2025-07-31");
        assertRate("21", "RO", "2025-08-01");
    }

    @Test
    void ratesAreExactBigDecimalsNotDoubles() {
        BigDecimal rate = EuVat.getStandardRate("FI", "2024-09-01");
        assertEquals(d("25.5"), rate);
        // the point of BigDecimal: no floating point noise when the rate is used in a calculation
        assertEquals(0, d("25.5").compareTo(d("100").multiply(rate).divide(d("100"))));
    }

    @Test
    void firstDayOfTheDataAndACountryThatNeverChanged() {
        assertRate("20", "AT", "2016-01-01");
        assertEquals(LocalDate.of(2016, 1, 1), EuVat.DATA_FIRST_DATE);
    }

    @Test
    void aDateAfterTheLastKnownChangeReturnsTheLatestKnownRate() {
        // Derived from the data, not hard-coded: a new rate change must not break this test (the shared vectors hold exact values).
        List<RateWindow> ro = EuVat.getRateHistory("RO");
        assertEquals(0, ro.get(ro.size() - 1).rate().compareTo(EuVat.getStandardRate("RO", "2035-01-01")));
    }

    @Test
    void countryCodesAreCaseInsensitiveTrimmedAndGreeceAnswersToGrAndEl() {
        assertRate("16", "de", "2020-07-01");
        assertRate("16", " DE ", "2020-07-01");
        assertRate("24", "GR", "2016-06-01");
        assertRate("24", "gr", "2016-06-01");
        assertRate("24", "EL", "2016-06-01");
        assertEquals("EL", EuVat.normalizeCountry("gr"));
    }

    @Test
    void anUnknownOrNonEuCountryIsAnErrorNotAGuess() {
        for (String bad : Arrays.asList("XX", "GB", "US", "CH", "", "GERMANY", "D", null)) {
            assertThrows(UnknownCountryException.class, () -> EuVat.getStandardRate(bad, "2020-01-01"), String.valueOf(bad));
        }
        // it is also a plain IllegalArgumentException, and it names the code that was rejected
        UnknownCountryException e = assertThrows(UnknownCountryException.class, () -> EuVat.getStandardRate("GB", "2020-01-01"));
        assertTrue(e.getMessage().contains("GB"));
        assertTrue(e instanceof IllegalArgumentException);
    }

    @Test
    void aDateBeforeTheDataStartsIsAnErrorNeverAMadeUpRate() {
        assertThrows(DateOutOfRangeException.class, () -> EuVat.getStandardRate("DE", "2015-12-31"));
        DateOutOfRangeException e = assertThrows(DateOutOfRangeException.class, () -> EuVat.getStandardRate("DE", LocalDate.of(2000, 1, 1)));
        assertTrue(e.getMessage().contains("2016-01-01"));
        assertTrue(e instanceof IllegalArgumentException);
    }

    @Test
    void aMalformedOrImpossibleDateStringIsAnIllegalArgumentException() {
        for (String bad : Arrays.asList("2020-02-30", "2020-13-01", "20200701", "2020-7-1", "banana", "", "2020-07-01T00:00:00Z", "+2020-07-01")) {
            assertThrows(IllegalArgumentException.class, () -> EuVat.getStandardRate("DE", bad), bad);
        }
        assertThrows(IllegalArgumentException.class, () -> EuVat.getStandardRate("DE", (String) null));
    }

    @Test
    void aNullLocalDateIsANullPointerExceptionNotSilentlyToday() {
        assertThrows(NullPointerException.class, () -> EuVat.getStandardRate("DE", (LocalDate) null));
    }

    @Test
    void withNoDateItUsesTodayUtc() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        assertEquals(EuVat.getStandardRate("DE", today), EuVat.getStandardRate("DE"));
    }

    @Test
    void getRateHistoryReturnsEveryWindowInOrder() {
        List<RateWindow> history = EuVat.getRateHistory("DE");
        assertTrue(history.size() >= 3, "the known history is a floor: a later change adds a window at the end");
        assertEquals(new RateWindow(LocalDate.of(2016, 1, 1), d("19")), history.get(0));
        assertEquals(new RateWindow(LocalDate.of(2020, 7, 1), d("16")), history.get(1));
        assertEquals(new RateWindow(LocalDate.of(2021, 1, 1), d("19")), history.get(2));
        assertTrue(EuVat.getRateHistory("gr").size() >= 2);
    }

    @Test
    void theCallerCannotChangeTheDataThroughTheResult() {
        List<RateWindow> history = EuVat.getRateHistory("DE");
        assertThrows(UnsupportedOperationException.class, () -> history.add(new RateWindow(LocalDate.of(2030, 1, 1), d("99"))));
        assertThrows(UnsupportedOperationException.class, history::clear);
        assertEquals(history.size(), EuVat.getRateHistory("DE").size());
        assertEquals(0, history.get(history.size() - 1).rate().compareTo(EuVat.getStandardRate("DE", "2030-06-01")));
    }

    @Test
    void getRateChangesListsEveryChangeNewestFirstAndCanBeFiltered() {
        List<RateChange> all = EuVat.getRateChanges();
        assertTrue(all.size() >= 13, "the 13 known changes are a floor; new ones add to it");
        assertTrue(all.contains(new RateChange("RO", LocalDate.of(2025, 8, 1), d("19"), d("21"))));
        List<LocalDate> dates = all.stream().map(RateChange::date).collect(Collectors.toList());
        List<LocalDate> sortedDescending = new ArrayList<>(dates);
        sortedDescending.sort(Collections.reverseOrder());
        assertEquals(sortedDescending, dates);

        List<RateChange> germany = EuVat.getRateChanges("de", null);
        assertTrue(germany.size() >= 2);
        assertEquals(LocalDate.of(2021, 1, 1), germany.get(germany.size() - 2).date());
        assertEquals(LocalDate.of(2020, 7, 1), germany.get(germany.size() - 1).date());

        List<String> since2025 = EuVat.getRateChanges(null, LocalDate.of(2025, 1, 1)).stream().map(RateChange::country).collect(Collectors.toList());
        assertTrue(since2025.containsAll(Arrays.asList("RO", "EE", "SK")));
        List<RateChange> austria = EuVat.getRateChanges("AT", null);   // a country filter returns only that country, one change per extra window
        assertTrue(austria.stream().allMatch(c -> c.country().equals("AT")));
        assertEquals(EuVat.getRateHistory("AT").size() - 1, austria.size());
        assertThrows(UnknownCountryException.class, () -> EuVat.getRateChanges("XX", null));
        assertThrows(UnsupportedOperationException.class, () -> all.add(all.get(0)));
    }

    @Test
    void listCountriesGivesThe27MemberStatesSortedByName() {
        List<Country> countries = EuVat.listCountries();
        assertEquals(27, countries.size());
        assertEquals(27, countries.stream().map(Country::code).distinct().count());
        assertTrue(countries.contains(new Country("EL", "Greece")));
        assertFalse(countries.stream().anyMatch(c -> c.code().equals("GR")));
        List<String> names = countries.stream().map(Country::name).collect(Collectors.toList());
        List<String> sorted = new ArrayList<>(names);
        Collections.sort(sorted);
        assertEquals(sorted, names);
    }

    @Test
    void formatRateEnglish() {
        assertEquals("25.5%", EuVat.formatRate(d("25.5"), Locale.ENGLISH));
        assertEquals("19%", EuVat.formatRate(d("19"), Locale.ENGLISH));
        assertEquals("20%", EuVat.formatRate(d("20"), Locale.ENGLISH));
    }

    @Test
    void formatRateGermanFrenchAndSpanishUseADecimalCommaAndASpaceBeforeThePercentSign() {
        // The exact space is a no-break space (U+00A0) or a narrow one (U+202F) depending on the JDK's locale data
        // (CLDR version), so accept either; the comma and the order are what matter.
        for (Locale locale : Arrays.asList(Locale.GERMAN, Locale.FRENCH, new Locale("es"))) {
            assertTrue(EuVat.formatRate(d("19"), locale).matches("19[\\u00a0\\u202f ]%"), locale + ": " + EuVat.formatRate(d("19"), locale));
            assertTrue(EuVat.formatRate(d("25.5"), locale).matches("25,5[\\u00a0\\u202f ]%"), locale + ": " + EuVat.formatRate(d("25.5"), locale));
        }
    }

    @Test
    void theDataCarriesItsAsOfDateAndItsAttribution() {
        assertTrue(EuVat.dataAsOf().getYear() >= 2026);
        assertTrue(EuVat.ATTRIBUTION.contains("duty27.com/vat-rates/history"));
        assertTrue(EuVat.ATTRIBUTION.contains("CC BY 4.0"));
    }

    @Test
    void dataIntegrityEveryCountryStartsOnTheFirstDateAscendsAndNeverRepeatsARate() {
        for (Country country : EuVat.listCountries()) {
            List<RateWindow> history = EuVat.getRateHistory(country.code());
            assertEquals(EuVat.DATA_FIRST_DATE, history.get(0).effectiveFrom(), country.code());
            for (int i = 1; i < history.size(); i++) {
                assertTrue(history.get(i).effectiveFrom().isAfter(history.get(i - 1).effectiveFrom()), country.code());
                assertNotEquals(0, history.get(i).rate().compareTo(history.get(i - 1).rate()), country.code() + " repeats a rate");
            }
            for (RateWindow window : history) {
                assertTrue(window.rate().compareTo(d("5")) >= 0 && window.rate().compareTo(d("30")) <= 0, country.code());
            }
        }
    }
}
