package com.duty27.euvat;

import java.time.LocalDate;

/**
 * The date is before the first date the data covers ({@link EuVat#DATA_FIRST_DATE}, 2016-01-01).
 *
 * <p>The date is well formed but outside the range the library can answer for, so this is an error and not a
 * guess.
 */
public final class DateOutOfRangeException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    private final transient LocalDate date;

    DateOutOfRangeException(LocalDate date) {
        super(date + " is before the first date covered (" + EuVat.DATA_FIRST_DATE + ").");
        this.date = date;
    }

    /** The date that was rejected. */
    public LocalDate date() {
        return date;
    }
}
