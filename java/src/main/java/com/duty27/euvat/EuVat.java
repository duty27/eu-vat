package com.duty27.euvat;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * The standard VAT rate in every EU member state on any date since 1 January 2016.
 *
 * <pre>{@code
 * EuVat.getStandardRate("DE");                 // today's rate: 19
 * EuVat.getStandardRate("DE", "2020-07-01");   // 16, Germany's temporary cut
 * EuVat.getStandardRate("FI", "2024-09-01");   // 25.5
 * }</pre>
 *
 * <p>Everything here is a static method on immutable data, so it is safe to use from any number of threads.
 *
 * <p><b>What it covers.</b> Standard rates only (reduced rates are not included), for the 27 member states, from
 * 2016-01-01. The data has an age: {@link #dataAsOf()} is the date it was last compared with the rates Duty27
 * publishes, and a rate that changed after that date is not here until a new version is released. This is
 * information, not tax advice.
 *
 * <p><b>Errors.</b> Nothing guesses. An unknown or non-EU country throws {@link UnknownCountryException}; a date
 * before 2016-01-01 throws {@link DateOutOfRangeException}; a malformed date string throws
 * {@link IllegalArgumentException}. All three are {@code IllegalArgumentException}s.
 */
public final class EuVat {

    /** The first day the data covers. Earlier dates throw {@link DateOutOfRangeException} instead of guessing. */
    public static final LocalDate DATA_FIRST_DATE = LocalDate.of(2016, 1, 1);

    /** The credit the data licence (CC BY 4.0) asks for. Show it where you show the rates. */
    public static final String ATTRIBUTION = "Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0";

    /**
     * A date must look exactly like {@code 2020-07-01}. {@link LocalDate#parse(CharSequence)} alone is not strict
     * enough: it also accepts forms such as {@code +2020-07-01}, and we want the same strictness as the Node and
     * Python libraries.
     */
    private static final Pattern ISO_DAY = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    /** One country's name and its rate windows, parsed from the generated strings. */
    private static final class Entry {
        final String name;
        final List<RateWindow> windows;

        Entry(String name, List<RateWindow> windows) {
            this.name = name;
            this.windows = windows;
        }
    }

    // The generated data (Data.java) is plain strings, so it has no logic and is easy to diff and review. It is
    // turned into real dates and exact BigDecimals once, here, when the class loads, indexed by country code.
    // The map keeps the generated order, which is by country code.
    private static final Map<String, Entry> COUNTRIES;
    private static final LocalDate DATA_AS_OF = LocalDate.parse(Data.AS_OF);

    static {
        Map<String, Entry> byCode = new LinkedHashMap<>();
        for (int i = 0; i < Data.COUNTRIES.length; i++) {
            String[] flat = Data.WINDOWS[i];
            List<RateWindow> windows = new ArrayList<>();
            // The generated array alternates date, rate, date, rate, ...
            for (int j = 0; j < flat.length; j += 2) {
                windows.add(new RateWindow(LocalDate.parse(flat[j]), new BigDecimal(flat[j + 1])));
            }
            // RateWindow is immutable, so this one list can be handed out directly, wrapped so it cannot be modified.
            byCode.put(Data.COUNTRIES[i][0], new Entry(Data.COUNTRIES[i][1], Collections.unmodifiableList(windows)));
        }
        COUNTRIES = Collections.unmodifiableMap(byCode);
    }

    private EuVat() {
        // Not instantiable: this class is only static methods.
    }

    /**
     * The date the data was last compared with the rates Duty27 publishes. A rate that changed after this date is
     * not in here until a new version is released, so anything that must be right today should check the source.
     *
     * @return the as-of date
     */
    public static LocalDate dataAsOf() {
        return DATA_AS_OF;
    }

    /**
     * The EU member state code for a country code. Case-insensitive and trimmed. {@code "GR"} is accepted for Greece
     * because it is the ISO code people reach for, while the EU itself uses {@code "EL"}; either way the result is
     * {@code "EL"}.
     *
     * @param code a country code such as {@code "de"} or {@code "GR"}
     * @return the EU code, for example {@code "DE"} or {@code "EL"}
     * @throws UnknownCountryException if it is null or not one of the 27 member states (GB, US, CH, ...)
     */
    public static String normalizeCountry(String code) {
        if (code == null) {
            throw new UnknownCountryException(null);
        }
        String normalized = code.trim().toUpperCase(Locale.ROOT); // ROOT: the Turkish dotless-i rule must not apply
        // The EU writes Greece as EL (from Ελλάδα, its name in Greek), not the ISO code GR: EL is the prefix on Greek
        // VAT numbers and in VIES, and the code in the EU's own style guide, so EL is what every method returns.
        if (normalized.equals("GR")) {
            normalized = "EL";
        }
        if (!COUNTRIES.containsKey(normalized)) {
            throw new UnknownCountryException(code);
        }
        return normalized;
    }

    /**
     * The standard VAT rate today (UTC, so the answer does not depend on the machine's time zone).
     *
     * @param country an EU member state code
     * @return the rate as a percentage, for example {@code 19}
     * @throws UnknownCountryException if the country is not an EU member state
     */
    public static BigDecimal getStandardRate(String country) {
        return getStandardRate(country, LocalDate.now(ZoneOffset.UTC));
    }

    /**
     * The standard VAT rate in force on a date, given as {@code YYYY-MM-DD}.
     *
     * @param country an EU member state code
     * @param isoDate the date, exactly {@code YYYY-MM-DD} and a real day
     * @return the rate as a percentage, for example {@code 16}
     * @throws UnknownCountryException if the country is not an EU member state
     * @throws DateOutOfRangeException if the date is before 2016-01-01
     * @throws IllegalArgumentException if the string is null, malformed, or not a real day (2020-02-30)
     */
    public static BigDecimal getStandardRate(String country, String isoDate) {
        return getStandardRate(country, parseDay(isoDate));
    }

    /**
     * The standard VAT rate in force on a date. A date after the last known change returns the latest known rate:
     * the library cannot know about changes made after its data was generated (see {@link #dataAsOf()}).
     *
     * @param country an EU member state code
     * @param date the date; must not be null (use {@link #getStandardRate(String)} for today)
     * @return the rate as a percentage, for example {@code 25.5}
     * @throws UnknownCountryException if the country is not an EU member state
     * @throws DateOutOfRangeException if the date is before 2016-01-01
     * @throws NullPointerException if the date is null
     */
    public static BigDecimal getStandardRate(String country, LocalDate date) {
        String code = normalizeCountry(country);
        Objects.requireNonNull(date, "date");
        if (date.isBefore(DATA_FIRST_DATE)) {
            throw new DateOutOfRangeException(date);
        }

        // Windows are in ascending date order (the generator validates this), so walk them and keep the last one
        // that started on or before the date. The first window always starts on DATA_FIRST_DATE, so once the range
        // check above has passed there is always an answer.
        List<RateWindow> windows = COUNTRIES.get(code).windows;
        BigDecimal rate = windows.get(0).rate();
        for (RateWindow window : windows) {
            if (!window.effectiveFrom().isAfter(date)) {
                rate = window.rate();
            } else {
                break;
            }
        }
        return rate;
    }

    /**
     * Every rate a country has had since 2016, in order.
     *
     * @param country an EU member state code
     * @return an unmodifiable list of immutable windows
     * @throws UnknownCountryException if the country is not an EU member state
     */
    public static List<RateWindow> getRateHistory(String country) {
        return COUNTRIES.get(normalizeCountry(country)).windows;
    }

    /**
     * Every change of a standard rate since 2016, newest first.
     *
     * @return an unmodifiable list
     */
    public static List<RateChange> getRateChanges() {
        return getRateChanges(null, null);
    }

    /**
     * Every change of a standard rate since 2016, newest first, optionally narrowed. A "change" is the first day of a
     * new rate, with the rate before and after it.
     *
     * @param country only this country, or {@code null} for all
     * @param since only changes on or after this date, or {@code null} for all
     * @return an unmodifiable list
     * @throws UnknownCountryException if a country is given and is not an EU member state
     */
    public static List<RateChange> getRateChanges(String country, LocalDate since) {
        String only = country == null ? null : normalizeCountry(country);
        List<RateChange> changes = new ArrayList<>();
        for (Map.Entry<String, Entry> entry : COUNTRIES.entrySet()) {
            if (only != null && !entry.getKey().equals(only)) {
                continue;
            }
            List<RateWindow> windows = entry.getValue().windows;
            // Window 0 is the starting rate, not a change. Every later window is a change from the one before it.
            for (int i = 1; i < windows.size(); i++) {
                RateWindow window = windows.get(i);
                if (since != null && window.effectiveFrom().isBefore(since)) {
                    continue;
                }
                changes.add(new RateChange(entry.getKey(), window.effectiveFrom(), windows.get(i - 1).rate(), window.rate()));
            }
        }
        // Newest first; two changes on the same day are ordered by country code so the output is stable.
        changes.sort(Comparator.comparing(RateChange::date).reversed().thenComparing(RateChange::country));
        return Collections.unmodifiableList(changes);
    }

    /**
     * The 27 member states with their EU codes (Greece is {@code "EL"}) and English names, sorted by name.
     *
     * @return an unmodifiable list
     */
    public static List<Country> listCountries() {
        List<Country> countries = new ArrayList<>();
        for (Map.Entry<String, Entry> entry : COUNTRIES.entrySet()) {
            countries.add(new Country(entry.getKey(), entry.getValue().name));
        }
        countries.sort(Comparator.comparing(Country::name));
        return Collections.unmodifiableList(countries);
    }

    /**
     * A rate as a localised percentage: {@code formatRate(25.5, Locale.ENGLISH)} is {@code "25.5%"}.
     *
     * <p>Uses the JDK's own locale data, so any locale it knows works. The exact space the JDK puts before the percent
     * sign in German, French and Spanish (no-break or narrow no-break) depends on the JDK version.
     *
     * @param rate the rate as a percentage, for example {@code 19}
     * @param locale the locale to format for
     * @return the formatted rate
     */
    public static String formatRate(BigDecimal rate, Locale locale) {
        // NumberFormat's percent style multiplies by 100, so move the decimal point first. Two decimals is enough for
        // every real rate. A new NumberFormat per call because NumberFormat is not thread-safe.
        NumberFormat format = NumberFormat.getPercentInstance(locale);
        format.setMinimumFractionDigits(0);
        format.setMaximumFractionDigits(2);
        return format.format(rate.movePointLeft(2));
    }

    /** Parses exactly {@code YYYY-MM-DD}, or throws IllegalArgumentException. */
    private static LocalDate parseDay(String isoDate) {
        if (isoDate == null || !ISO_DAY.matcher(isoDate).matches()) {
            throw new IllegalArgumentException("Expected a date as YYYY-MM-DD, got " + (isoDate == null ? "null" : "\"" + isoDate + "\"") + ".");
        }
        try {
            return LocalDate.parse(isoDate);
        } catch (DateTimeParseException e) {
            // The shape was right but the day does not exist: 2020-02-30, 2020-13-01.
            throw new IllegalArgumentException("Not a real date: \"" + isoDate + "\".", e);
        }
    }
}
