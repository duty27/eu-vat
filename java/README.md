# eu-vat (Java)

The standard VAT rate in every EU member state, **on any date since 1 January 2016**. No dependencies, works
offline. Java 11 and later.

```java
import com.duty27.euvat.EuVat;

EuVat.getStandardRate("DE");                 // today's rate: 19
EuVat.getStandardRate("DE", "2020-07-01");   // 16, Germany's temporary cut
EuVat.getStandardRate("FI", "2024-09-01");   // 25.5
```

Rates change, sometimes for a few months only, and a hardcoded table silently goes wrong. This library keeps the
dated history in one place so "what was the rate on the day of this sale?" has a real answer. Rates are exact
`BigDecimal` values, not doubles, so `price * rate / 100` has no rounding noise.

## Install

Maven:

```xml
<dependency>
  <groupId>com.duty27</groupId>
  <artifactId>eu-vat</artifactId>
  <version>0.1.0</version>
</dependency>
```

Gradle: `implementation("com.duty27:eu-vat:0.1.0")`

## Use

```java
import com.duty27.euvat.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

EuVat.getStandardRate("GR", LocalDate.of(2016, 6, 1));   // 24; GR is accepted for Greece (the EU code is EL)

List<RateWindow> history = EuVat.getRateHistory("DE");
// RateWindow[effectiveFrom=2016-01-01, rate=19], RateWindow[effectiveFrom=2020-07-01, rate=16], ...

List<RateChange> changes = EuVat.getRateChanges(null, LocalDate.of(2025, 1, 1));   // newest first
EuVat.getRateChanges("DE", null);                // one country, all years
EuVat.listCountries();                           // the 27 member states: Country[code=AT, name=Austria], ...
EuVat.formatRate(new BigDecimal("25.5"), Locale.ENGLISH);   // "25.5%"
EuVat.dataAsOf();                                // the date the data was last checked
```

| Method | Returns |
|---|---|
| `getStandardRate(country)` | Today's rate (UTC). |
| `getStandardRate(country, "YYYY-MM-DD")` / `getStandardRate(country, LocalDate)` | The rate in force on a date. A date after the last known change returns the latest known rate. |
| `getRateHistory(country)` | Every rate the country has had since 2016, in order (unmodifiable). |
| `getRateChanges()` / `getRateChanges(country, since)` | Every change, newest first. Either argument may be `null`. |
| `listCountries()` | The 27 member states, with EU codes (Greece is `EL`; `GR` is accepted) and English names. |
| `formatRate(rate, locale)` | The rate as a localised percentage, using the JDK's locale data. |
| `normalizeCountry(code)` | The EU code for a country code, case-insensitive. |

Errors are never guesses. An unknown or non-EU country throws `UnknownCountryException`; a date before 2016-01-01
throws `DateOutOfRangeException`; a malformed date string throws `IllegalArgumentException`; a `null`
`LocalDate` throws `NullPointerException`. The first two are `IllegalArgumentException`s too. Everything is a static
method on immutable data, so it is safe to use from any number of threads.

## What it covers, and what it does not

- **Standard rates only.** Reduced rates (for example e-books, newspapers and periodicals) are not included.
- **Lookup, not calculation.** It returns the rate. It does not work out net or gross amounts, rounding, whether a
  sale is reverse-charged, or OSS reports: those are in the Duty27 API (see below).
- **27 EU member states, from 2016-01-01.**
- **The data has an age.** `dataAsOf()` is the date it was last compared with the rates Duty27 publishes. A rate
  that changed after that date will not be here until a new version is released. For anything that must be
  right today, check the source, or use the API below.
- The rates are compiled from the European Commission's TEDB service and cross-checked against the
  Commission's own historical rate tables and national sources. The dataset is at
  https://duty27.com/vat-rates/history, and the same data is available there as CSV and JSON.

This library provides standard VAT rate data for information. It is not tax advice.

## Need more than a rate?

Knowing the rate is the easy part. Deciding what to charge, and keeping the proof, is the rest: whether a sale
is B2B and reverse-charged, whether the EU €10,000 threshold has been passed, whether a VAT number is valid, and
an archive and OSS report for your filings. That is what the Duty27 API does, and it is free to try (500
calculations a month, no credit card).

- Sign up: https://duty27.com/signup
- API docs: https://duty27.com/docs
- Guides: [B2B sales and reverse charge](https://duty27.com/guides/reverse-charge-b2b-sales),
  [checking a VAT number with VIES](https://duty27.com/guides/vies-vat-number-check),
  [OSS registration and returns](https://duty27.com/guides/oss-registration-and-returns),
  [the €10,000 threshold](https://duty27.com/oss-threshold)
- Reduced-rate categories (e-books, newspapers, periodicals) are available through the API.

## Working on it

This folder is self-contained: `mvn verify` compiles for Java 11, runs the tests and builds the jar. The rate data in
`src/main/java/com/duty27/euvat/Data.java` and the test file `src/test/resources/test-vectors.csv` are generated
from the shared source at the repository root (`./build.sh data`), not edited by hand.

## Licence

- Code: [MIT](LICENSE).
- Bundled rate data: [CC BY 4.0](DATA-LICENSE.md). Please credit it as
  `Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0`. The library exports this text as
  `EuVat.ATTRIBUTION`.
