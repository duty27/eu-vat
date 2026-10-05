"""duty27_eu_vat: the standard VAT rate in every EU member state on any date since 1 January 2016.

How it works, for anyone reading the source:

* The data (``_data.py``) is generated, not written by hand. For each country it is a short list of "windows":
  the day a rate began to apply, and the rate. A window lasts until the next one starts, so looking up a date
  means finding the last window that started on or before it.
* Rates are ``decimal.Decimal``, not ``float``. A VAT rate is money-adjacent; ``25.5`` is fine as a float but
  ``float`` arithmetic on it (price * rate / 100) is not exact, and ``Decimal`` is.
* Dates are ``datetime.date`` objects. Strings (``"2020-07-01"``) are accepted for convenience and must be exactly
  that format and a real day.
* Nothing here guesses. An unknown country, a date before the data starts, or a malformed date is an error,
  because a wrong VAT rate that looks plausible is worse than an exception.
* The Node and Java libraries in this repository follow the same rules and are tested against the same expected
  answers (``data/test-vectors.csv``), so all three agree.

Standard rates only. Reduced rates (e-books, newspapers, ...) are deliberately not included.

Quick start::

    >>> from duty27_eu_vat import get_standard_rate
    >>> get_standard_rate("DE", "2020-07-01")
    Decimal('16')
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional, Tuple, Union

from ._data import DATA, DATA_AS_OF as _DATA_AS_OF

__all__ = [
    "ATTRIBUTION", "DATA_AS_OF", "DATA_FIRST_DATE", "Country", "DateOutOfRangeError", "RateChange", "RateWindow",
    "UnknownCountryError", "format_rate", "get_rate_changes", "get_rate_history", "get_standard_rate",
    "list_countries", "normalize_country",
]

# Anything the functions accept as "a date": a date, a datetime, or a "YYYY-MM-DD" string.
DateLike = Union[date, datetime, str]

#: The first day the data covers. Earlier dates raise DateOutOfRangeError instead of guessing.
DATA_FIRST_DATE: date = date(2016, 1, 1)

#: The date the data was last compared with the rates Duty27 publishes. A rate that changed after this date is
#: not in here until a new version is released, so anything that must be right today should check the source.
DATA_AS_OF: date = date.fromisoformat(_DATA_AS_OF)

#: The credit the data licence (CC BY 4.0) asks for. Show it where you show the rates.
ATTRIBUTION = "Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0"


class UnknownCountryError(ValueError):
    """The country code is not one of the 27 EU member states.

    It is a ``ValueError`` because the argument has the right type but an unacceptable value.
    """

    def __init__(self, country: object) -> None:
        super().__init__(
            f"Unknown or non-EU country code: {country!r}. "
            "Use an EU member state code such as DE (Greece is EL; GR also works)."
        )
        self.country = country


class DateOutOfRangeError(ValueError):
    """The date is before the first date the data covers (2016-01-01)."""

    def __init__(self, day: date) -> None:
        super().__init__(f"{day.isoformat()} is before the first date covered ({DATA_FIRST_DATE.isoformat()}).")
        self.date = day


@dataclass(frozen=True)
class RateWindow:
    """One rate and the day it began to apply. It stays in force until the next window starts.

    Frozen: an instance cannot be changed, so handing these out cannot let a caller alter the library's data.
    """

    effective_from: date
    rate: Decimal


@dataclass(frozen=True)
class RateChange:
    """A change of the standard rate. ``date`` is the first day of the new rate (``to_rate``)."""

    country: str
    date: date
    from_rate: Decimal
    to_rate: Decimal


@dataclass(frozen=True)
class Country:
    """A member state: its EU code (Greece is ``"EL"``) and its English name."""

    code: str
    name: str


# --------------------------------------------------------------------------------------------------------------
# The generated data, parsed once when the module is imported.
#
# _data.DATA is plain strings (so the generated file has no imports and is easy to diff and review). Here the
# strings become real dates and exact Decimals, indexed by country code.
# --------------------------------------------------------------------------------------------------------------
_COUNTRIES: dict = {
    code: (name, tuple((date.fromisoformat(start), Decimal(rate)) for start, rate in windows))
    for code, name, windows in DATA
}

# A date must look exactly like 2020-07-01. date.fromisoformat() alone is not strict enough: from Python 3.11 it
# also accepts forms like "20200701" and "2020-W27-3", and we want the same strictness on every Python version.
_ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def normalize_country(code: object) -> str:
    """The EU member state code for a country code.

    Case-insensitive and trimmed. ``"GR"`` is accepted for Greece because it is the ISO code people reach for,
    while the EU itself uses ``"EL"``; either way the result is ``"EL"``. Anything else that is not one of the 27
    member states (GB, US, CH, ...) raises UnknownCountryError, as does a value that is not a string.
    """
    if not isinstance(code, str):
        raise UnknownCountryError(code)
    normalized = code.strip().upper()
    # The EU writes Greece as EL (from Ελλάδα, its name in Greek), not the ISO code GR: EL is the prefix on Greek VAT
    # numbers and in VIES, and the code in the EU's own style guide, so EL is what every function returns.
    if normalized == "GR":
        normalized = "EL"
    if normalized not in _COUNTRIES:
        raise UnknownCountryError(code)
    return normalized


def _to_date(value: Optional[DateLike]) -> date:
    """Turn whatever the caller passed into a ``date``.

    * ``None`` means "today", read in UTC so the answer does not depend on the machine's time zone.
    * A ``datetime`` is converted to UTC first if it has a time zone (00:30 on 1 July in Paris is still 30 June in
      UTC); a naive one is taken at its word and its calendar day is used.
    * A ``str`` must be exactly ``YYYY-MM-DD`` and a real day, else ValueError.
    * Anything else (an int, a float, ...) is a TypeError. ``bool`` is rejected too, although it is an ``int``.
    """
    if value is None:
        return datetime.now(timezone.utc).date()
    if isinstance(value, datetime):  # check before date: datetime is a subclass of date
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc)
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        if not _ISO_DAY.match(value):
            raise ValueError(f"Expected a date as YYYY-MM-DD, got {value!r}.")
        return date.fromisoformat(value)  # raises ValueError for an impossible day such as 2020-02-30
    raise TypeError(f"Expected a date, a datetime or a YYYY-MM-DD string, got {type(value).__name__}.")


def get_standard_rate(country: str, on: Optional[DateLike] = None) -> Decimal:
    """The standard VAT rate, as a percentage (``Decimal('19')``, ``Decimal('25.5')``), on a date.

    With no date it is today (UTC). A date after the last known change returns the latest known rate: the library
    cannot know about changes made after its data was generated (see ``DATA_AS_OF``).

    Raises:
        UnknownCountryError: the country is not an EU member state.
        DateOutOfRangeError: the date is before 2016-01-01.
        ValueError: a date string is malformed or not a real day.
        TypeError: the date is not a date, a datetime, a string or None.
    """
    code = normalize_country(country)
    day = _to_date(on)
    if day < DATA_FIRST_DATE:
        raise DateOutOfRangeError(day)

    # Windows are in ascending date order (the generator validates this), so walk them and keep the last one that
    # started on or before the day. The first window always starts on DATA_FIRST_DATE, so once the range check above
    # has passed there is always an answer.
    windows = _COUNTRIES[code][1]
    rate = windows[0][1]
    for start, window_rate in windows:
        if start <= day:
            rate = window_rate
        else:
            break
    return rate


def get_rate_history(country: str) -> List[RateWindow]:
    """Every rate a country has had since 2016, in order, as a new list of immutable ``RateWindow`` objects."""
    windows = _COUNTRIES[normalize_country(country)][1]
    return [RateWindow(start, rate) for start, rate in windows]


def get_rate_changes(country: Optional[str] = None, since: Optional[DateLike] = None) -> List[RateChange]:
    """Every change of a standard rate since 2016, newest first.

    Optionally only one ``country``, and/or only changes on or after ``since``. A "change" is the first day of a
    new rate, with the rate before and after it.
    """
    only = None if country is None else normalize_country(country)
    cutoff = None if since is None else _to_date(since)
    changes: List[RateChange] = []
    for code, (_name, windows) in _COUNTRIES.items():
        if only is not None and code != only:
            continue
        # Window 0 is the starting rate, not a change. Every later window is a change from the one before it.
        for index in range(1, len(windows)):
            start, rate = windows[index]
            if cutoff is not None and start < cutoff:
                continue
            changes.append(RateChange(code, start, windows[index - 1][1], rate))
    # Newest first; two changes on the same day are ordered by country code so the output is stable.
    changes.sort(key=lambda change: change.country)
    changes.sort(key=lambda change: change.date, reverse=True)
    return changes


def list_countries() -> List[Country]:
    """The 27 member states with their EU codes (Greece is ``"EL"``) and English names, sorted by name."""
    return sorted((Country(code, name) for code, (name, _windows) in _COUNTRIES.items()), key=lambda c: c.name)


# How each supported locale writes a percentage: (decimal separator, text between the number and the "%").
# These are the same strings the JavaScript library gets from Intl. Python's standard library has no portable
# locale data, so rather than depend on the machine's OS locales (which differ and are often not installed),
# the four languages Duty27 publishes in are built in, and any other locale is an error, not a silent fallback.
_PERCENT_STYLES = {
    "en": (".", ""),
    "de": (",", " "),  # U+00A0 NO-BREAK SPACE, so "19 %" never wraps between the number and the sign
    "fr": (",", " "),
    "es": (",", " "),
}


def format_rate(rate: Union[Decimal, int, float, str], locale: str = "en") -> str:
    """A rate as a localised percentage: ``format_rate(Decimal('25.5'))`` is ``"25.5%"``, in ``"de"`` ``"25,5 %"``.

    Supports ``en``, ``de``, ``fr`` and ``es``; any other locale raises ValueError.
    """
    style = _PERCENT_STYLES.get(locale.split("-")[0].split("_")[0].lower())
    if style is None:
        raise ValueError(f"Unsupported locale {locale!r}. Supported: {', '.join(sorted(_PERCENT_STYLES))}.")
    separator, gap = style
    # Two decimals is enough for every real rate. normalize() drops trailing zeros ("19.00" -> "19"), and format
    # with "f" avoids Decimal's scientific notation ("20" normalises to 2E+1, which would otherwise leak out).
    text = format(Decimal(str(rate)).quantize(Decimal("0.01")).normalize(), "f")
    return text.replace(".", separator) + gap + "%"
