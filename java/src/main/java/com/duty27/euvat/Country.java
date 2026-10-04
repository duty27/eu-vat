package com.duty27.euvat;

import java.util.Objects;

/**
 * An EU member state: its EU code (Greece is {@code "EL"}) and its English name.
 *
 * <p>Immutable.
 */
public final class Country {
    private final String code;
    private final String name;

    /**
     * Creates a country.
     *
     * @param code the EU member state code, for example {@code "DE"}
     * @param name the English name, for example {@code "Germany"}
     */
    public Country(String code, String name) {
        this.code = Objects.requireNonNull(code, "code");
        this.name = Objects.requireNonNull(name, "name");
    }

    /** The EU member state code (Greece is {@code "EL"}). */
    public String code() {
        return code;
    }

    /** The English name. */
    public String name() {
        return name;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Country)) {
            return false;
        }
        Country that = (Country) other;
        return code.equals(that.code) && name.equals(that.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(code, name);
    }

    @Override
    public String toString() {
        return "Country[code=" + code + ", name=" + name + "]";
    }
}
