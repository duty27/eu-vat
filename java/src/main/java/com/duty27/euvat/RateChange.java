package com.duty27.euvat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

/**
 * A change of the standard rate. {@link #date()} is the first day of the new rate.
 *
 * <p>Immutable.
 */
public final class RateChange {
    private final String country;
    private final LocalDate date;
    private final BigDecimal from;
    private final BigDecimal to;

    /**
     * Creates a change.
     *
     * @param country the EU member state code, for example {@code "DE"} (Greece is {@code "EL"})
     * @param date the first day of the new rate
     * @param from the rate before the change, as a percentage
     * @param to the rate from {@code date} on, as a percentage
     */
    public RateChange(String country, LocalDate date, BigDecimal from, BigDecimal to) {
        this.country = Objects.requireNonNull(country, "country");
        this.date = Objects.requireNonNull(date, "date");
        this.from = Objects.requireNonNull(from, "from");
        this.to = Objects.requireNonNull(to, "to");
    }

    /** The EU member state code (Greece is {@code "EL"}). */
    public String country() {
        return country;
    }

    /** The first day of the new rate. */
    public LocalDate date() {
        return date;
    }

    /** The rate before the change, as a percentage. */
    public BigDecimal from() {
        return from;
    }

    /** The rate from {@link #date()} on, as a percentage. */
    public BigDecimal to() {
        return to;
    }

    // Numeric (not scale-sensitive) equality for the rates, as in RateWindow.
    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof RateChange)) {
            return false;
        }
        RateChange that = (RateChange) other;
        return country.equals(that.country) && date.equals(that.date)
                && from.compareTo(that.from) == 0 && to.compareTo(that.to) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(country, date, from.stripTrailingZeros(), to.stripTrailingZeros());
    }

    @Override
    public String toString() {
        return "RateChange[country=" + country + ", date=" + date + ", from=" + from.toPlainString()
                + ", to=" + to.toPlainString() + "]";
    }
}
