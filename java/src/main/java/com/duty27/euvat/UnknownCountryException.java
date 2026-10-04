package com.duty27.euvat;

/**
 * The country code is not one of the 27 EU member states.
 *
 * <p>It is an {@link IllegalArgumentException} because the argument has the right type but an unacceptable value.
 */
public final class UnknownCountryException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    private final String country;

    UnknownCountryException(String country) {
        super("Unknown or non-EU country code: " + (country == null ? "null" : "\"" + country + "\"")
                + ". Use an EU member state code such as DE (Greece is EL; GR also works).");
        this.country = country;
    }

    /** The code that was rejected, exactly as it was passed in (may be {@code null}). */
    public String country() {
        return country;
    }
}
