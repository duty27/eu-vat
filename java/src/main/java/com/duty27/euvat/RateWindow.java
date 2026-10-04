package com.duty27.euvat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;

/**
 * One rate and the day it began to apply. It stays in force until the next window starts.
 *
 * <p>Immutable, so handing these out cannot let a caller alter the library's data.
 */
public final class RateWindow {
    private final LocalDate effectiveFrom;
    private final BigDecimal rate;

    /**
     * Creates a window.
     *
     * @param effectiveFrom the first day the rate applies
     * @param rate the rate as a percentage, for example {@code 19} or {@code 25.5}
     */
    public RateWindow(LocalDate effectiveFrom, BigDecimal rate) {
        this.effectiveFrom = Objects.requireNonNull(effectiveFrom, "effectiveFrom");
        this.rate = Objects.requireNonNull(rate, "rate");
    }

    /** The first day this rate applies. */
    public LocalDate effectiveFrom() {
        return effectiveFrom;
    }

    /** The rate as a percentage, for example {@code 19} or {@code 25.5}. */
    public BigDecimal rate() {
        return rate;
    }

    // BigDecimal.equals() treats 19 and 19.0 as different (it compares the scale too), which is never what you
    // mean for a rate, so equality and the hash use the numeric value.
    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof RateWindow)) {
            return false;
        }
        RateWindow that = (RateWindow) other;
        return effectiveFrom.equals(that.effectiveFrom) && rate.compareTo(that.rate) == 0;
    }

    @Override
    public int hashCode() {
        return Objects.hash(effectiveFrom, rate.stripTrailingZeros());
    }

    @Override
    public String toString() {
        return "RateWindow[effectiveFrom=" + effectiveFrom + ", rate=" + rate.toPlainString() + "]";
    }
}
