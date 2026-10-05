# @duty27/eu-vat

The standard VAT rate in every EU member state, **on any date since 1 January 2016**. Zero dependencies,
works offline, in Node and in the browser, with TypeScript types.

```js
import { getStandardRate } from '@duty27/eu-vat';

getStandardRate('DE');                 // today's rate: 19
getStandardRate('DE', '2020-07-01');   // 16 (Germany's temporary cut)
getStandardRate('FI', '2024-09-01');   // 25.5
```

Rates change, sometimes for a few months only, and a hardcoded table silently goes wrong. This package
keeps the dated history in one place so "what was the rate on the day of this sale?" has a real answer.

## Install

```sh
npm install @duty27/eu-vat
```

ESM and CommonJS are both supported. Node 18 or later.

## Use

```js
import {
  getStandardRate, getRateHistory, getRateChanges, listCountries, formatRate, dataAsOf,
} from '@duty27/eu-vat';

getRateHistory('DE');
// [{ from: '2016-01-01', rate: 19 }, { from: '2020-07-01', rate: 16 }, { from: '2021-01-01', rate: 19 }]

getRateChanges({ since: '2025-01-01' });
// [{ country: 'RO', date: '2025-08-01', from: 19, to: 21 }, { country: 'EE', ... }, { country: 'SK', ... }]

listCountries();            // 27 member states: [{ code: 'AT', name: 'Austria' }, ...]
formatRate(25.5);           // "25.5%"
formatRate(19, 'de');       // "19 %"
dataAsOf;                   // the date the data was last checked, e.g. "2026-10-04"
```

| Function | Returns |
|---|---|
| `getStandardRate(country, date?)` | The rate in force on `date` (`YYYY-MM-DD` or a `Date`, read as its UTC day). Today if omitted. A date after the last known change returns the latest known rate. |
| `getRateHistory(country)` | Every rate the country has had since 2016, in order. |
| `getRateChanges({ country?, since? })` | Every change, newest first. |
| `listCountries()` | The 27 member states, with EU codes (Greece is `EL`; `GR` is accepted) and English names. |
| `formatRate(rate, locale?)` | The rate as a localised percentage. |
| `normalizeCountry(code)` | The EU code for a country code, case-insensitive. |

Errors are never guesses. An unknown or non-EU country throws `UnknownCountryError`. A date before 2016-01-01
throws `DateOutOfRangeError` (a `RangeError`). A malformed date throws `TypeError`.

## What it covers, and what it does not

- **Standard rates only.** Reduced rates (for example e-books, newspapers and periodicals) are not included.
- **Lookup, not calculation.** It returns the rate. It does not work out net or gross amounts, rounding, whether a
  sale is reverse-charged, or OSS reports: those are in the Duty27 API (see below).
- **27 EU member states, from 2016-01-01.**
- **The data has an age.** `dataAsOf` is the date it was last compared with the rates Duty27 publishes. A rate
  that changed after that date will not be here until a new version is released. For anything that must be
  right today, check the source, or use the API below.
- The rates are compiled from the European Commission's TEDB service and cross-checked against the
  Commission's own historical rate tables and national sources. Every change since 2016 cites the law or
  tax-authority notice that made it, and the 2016 starting rates cite the Commission's rate table. The citations are
  not bundled in this package: they are listed at https://duty27.com/vat-rates/history, and the CSV and JSON there
  carry them for every row.

This package provides standard VAT rate data for information. It is not tax advice.

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

This folder is self-contained: `npm ci && npm test` builds the ESM and CommonJS outputs and runs the tests. The rate
data in `src/data.ts` and the test file `test/test-vectors.csv` are generated from the shared source at the
repository root (`./build.sh data`), not edited by hand.

## Licence

- Code: [MIT](LICENSE).
- Bundled rate data: [CC BY 4.0](DATA-LICENSE.md). Please credit it as
  `Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0`. The package exports this text as `ATTRIBUTION`.
