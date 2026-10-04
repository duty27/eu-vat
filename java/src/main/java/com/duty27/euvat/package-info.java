/**
 * The standard VAT rate in every EU member state on any date since 1 January 2016.
 *
 * <p>Start with {@link com.duty27.euvat.EuVat}:
 *
 * <pre>{@code
 * BigDecimal rate = EuVat.getStandardRate("DE", "2020-07-01");   // 16, Germany's temporary cut
 * }</pre>
 *
 * <p>How it works, for anyone reading the source:
 * <ul>
 *   <li>The data ({@code Data.java}) is generated, not written by hand. For each country it is a short list of
 *       "windows": the day a rate began to apply and the rate. A window lasts until the next one starts, so
 *       looking up a date means finding the last window that started on or before it.</li>
 *   <li>Rates are {@link java.math.BigDecimal}, not {@code double}: a VAT rate is money-adjacent, and exact decimal
 *       arithmetic avoids rounding noise.</li>
 *   <li>Nothing here guesses. An unknown country, a date before the data starts, or a malformed date is an
 *       exception, because a wrong VAT rate that looks plausible is worse than an error.</li>
 *   <li>The Node and Python libraries in this repository follow the same rules and are tested against the same
 *       expected answers ({@code data/test-vectors.csv}), so all three agree.</li>
 * </ul>
 *
 * <p>Standard rates only. Reduced rates (e-books, newspapers, ...) are deliberately not included.
 */
package com.duty27.euvat;
