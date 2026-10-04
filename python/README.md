# duty27-eu-vat

The standard VAT rate in every EU member state, **on any date since 1 January 2016**. No dependencies, works
offline, fully typed. Python 3.9 and later.

```python
from duty27_eu_vat import get_standard_rate

get_standard_rate("DE")                 # today's rate: Decimal('19')
get_standard_rate("DE", "2020-07-01")   # Decimal('16'), Germany's temporary cut
get_standard_rate("FI", "2024-09-01")   # Decimal('25.5')
```

Rates change, sometimes for a few months only, and a hardcoded table silently goes wrong. This package keeps
the dated history in one place so "what was the rate on the day of this sale?" has a real answer. Rates are
exact `Decimal` values, not floats, so `price * rate / 100` has no rounding noise.

## Install

```sh
pip install duty27-eu-vat
```

## Use

```python
from datetime import date
from duty27_eu_vat import (
    get_standard_rate, get_rate_history, get_rate_changes, list_countries, format_rate, DATA_AS_OF,
)

get_standard_rate("GR", date(2016, 6, 1))   # Decimal('24'); GR is accepted for Greece (the EU code is EL)

get_rate_history("DE")
# [RateWindow(effective_from=datetime.date(2016, 1, 1), rate=Decimal('19')),
#  RateWindow(effective_from=datetime.date(2020, 7, 1), rate=Decimal('16')),
#  RateWindow(effective_from=datetime.date(2021, 1, 1), rate=Decimal('19'))]

get_rate_changes(since="2025-01-01")        # RateChange(country='RO', date=date(2025, 8, 1), from_rate=19, to_rate=21), ...
list_countries()                            # the 27 member states: Country(code='AT', name='Austria'), ...
format_rate(Decimal("25.5"), "de")          # '25,5 %'
DATA_AS_OF                                  # the date the data was last checked
```

| Function | Returns |
|---|---|
| `get_standard_rate(country, on=None)` | The rate in force on a date (`date`, `datetime`, or `"YYYY-MM-DD"`). Today (UTC) if omitted. A date after the last known change returns the latest known rate. |
| `get_rate_history(country)` | Every rate the country has had since 2016, in order. |
| `get_rate_changes(country=None, since=None)` | Every change, newest first. |
| `list_countries()` | The 27 member states, with EU codes (Greece is `EL`; `GR` is accepted) and English names. |
| `format_rate(rate, locale="en")` | The rate as a localised percentage. Supports `en`, `de`, `fr`, `es`. |
| `normalize_country(code)` | The EU code for a country code, case-insensitive. |

Errors are never guesses. An unknown or non-EU country raises `UnknownCountryError`; a date before 2016-01-01
raises `DateOutOfRangeError`; a malformed date string raises `ValueError`; a date of the wrong type raises
`TypeError`. (`UnknownCountryError` and `DateOutOfRangeError` are both `ValueError`s.) An aware `datetime` is
converted to UTC first; a naive one is read as its own calendar day.

## What it covers, and what it does not

- **Standard rates only.** Reduced rates (for example e-books, newspapers and periodicals) are not included.
- **27 EU member states, from 2016-01-01.**
- **The data has an age.** `DATA_AS_OF` is the date it was last compared with the rates Duty27 publishes. A rate
  that changed after that date will not be here until a new version is released. For anything that must be
  right today, check the source, or use the API below.
- The rates are compiled from the European Commission's TEDB service and cross-checked against the
  Commission's own historical rate tables and national sources. The dataset, with its sources, is at
  https://duty27.com/vat-rates/history, and the same data is available there as CSV and JSON.

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

This folder is self-contained: `PYTHONPATH=src python -m unittest discover -s tests` runs the tests with nothing to
install. The rate data in `src/duty27_eu_vat/_data.py` and the test file `tests/test-vectors.csv` are generated from
the shared source at the repository root (`./build.sh data`), not edited by hand.

## Licence

- Code: [MIT](LICENSE).
- Bundled rate data: [CC BY 4.0](DATA-LICENSE.md). Please credit it as
  `Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0`. The package exports this text as `ATTRIBUTION`.
