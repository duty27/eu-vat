/**
 * @duty27/eu-vat: the standard VAT rate in every EU member state on any date since 1 January 2016.
 *
 * How it works, for anyone reading the source:
 *
 *  - The data (./data.ts) is generated, not written by hand. It is a short list per country of "windows": the
 *    day a rate began to apply and the rate. A window lasts until the next one starts, so looking up a date
 *    means finding the last window that started on or before it.
 *  - Dates are plain "YYYY-MM-DD" strings internally. ISO dates sort the same alphabetically as
 *    chronologically, so comparing them as strings is correct and avoids every time zone problem a Date
 *    object brings.
 *  - Nothing here guesses. An unknown country, a date before the data starts, or a malformed date is an
 *    error, because a wrong VAT rate that looks plausible is worse than an exception.
 *  - The Python and Java libraries in this repository follow the same rules and are tested against the same
 *    expected answers (data/test-vectors.csv), so all three agree.
 *
 * Standard rates only. Reduced rates (e-books, newspapers, ...) are deliberately not included.
 */
import { DATA, DATA_AS_OF } from './data.js';

/** One rate and the day it began to apply. A window runs until the next one starts. */
export interface RateWindow { readonly from: string; readonly rate: number }

/** A change of the standard rate: `date` is the first day of the new rate. */
export interface RateChange { readonly country: string; readonly date: string; readonly from: number; readonly to: number }

/** A member state: its EU code (Greece is "EL") and its English name. */
export interface Country { readonly code: string; readonly name: string }

/** The first day the data covers. Earlier dates are an error, not a guess. */
export const DATA_FIRST_DATE = '2016-01-01';

/**
 * The date the data was last compared with the rates Duty27 publishes. A rate that changed after this date is
 * not in here until a new version is released, so anything that must be right today should check the source.
 */
export const dataAsOf: string = DATA_AS_OF;

/** The credit the data licence (CC BY 4.0) asks for. Show it where you show the rates. */
export const ATTRIBUTION = 'Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0';

/** Thrown for a country code that is not one of the 27 EU member states. */
export class UnknownCountryError extends Error {
  readonly country: string;
  constructor(country: unknown) {
    super(`Unknown or non-EU country code: ${JSON.stringify(country)}. Use an EU member state code such as DE (Greece is EL; GR also works).`);
    this.name = 'UnknownCountryError';
    this.country = String(country);
  }
}

/**
 * Thrown for a date before the data starts. It extends RangeError because the value is well formed but outside
 * the range we can answer for.
 */
export class DateOutOfRangeError extends RangeError {
  readonly date: string;
  constructor(date: string) {
    super(`${date} is before the first date covered (${DATA_FIRST_DATE}).`);
    this.name = 'DateOutOfRangeError';
    this.date = date;
  }
}

// An index of the generated data by country code. Built once when the module loads.
const BY_CODE = new Map(DATA.map(c => [c.code as string, c]));

/**
 * The EU member state code for a country code. Case-insensitive and trimmed. "GR" is accepted for Greece
 * because it is the ISO code people reach for, while the EU itself uses "EL"; either way the result is "EL".
 * Anything else that is not one of the 27 member states (GB, US, CH, ...) throws.
 */
export function normalizeCountry(code: unknown): string {
  if (typeof code !== 'string') throw new UnknownCountryError(code);
  let c = code.trim().toUpperCase();
  if (c === 'GR') c = 'EL';
  if (!BY_CODE.has(c)) throw new UnknownCountryError(code);
  return c;
}

/**
 * Turns whatever the caller passed into a "YYYY-MM-DD" string, or throws a TypeError.
 *
 *  - undefined means "today", read in UTC so the answer does not depend on the machine's time zone.
 *  - A Date is read as its UTC calendar day. (2020-07-01T00:30 in Paris is still 30 June in UTC.)
 *  - A string must be exactly YYYY-MM-DD and a real day: "2020-02-30" and "2020-13-01" are rejected.
 */
function isoDate(date: unknown): string {
  if (date === undefined) return new Date().toISOString().slice(0, 10);
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid Date');
    return date.toISOString().slice(0, 10);
  }
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00Z`);
    // An impossible day (2020-02-30, 2020-13-01) parses to an Invalid Date, and calling toISOString() on one
    // throws a RangeError, so check validity first. The round trip also catches "2020-02-31" rolling over.
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date;
  }
  throw new TypeError(`Expected a date as YYYY-MM-DD or a Date, got ${JSON.stringify(date)}.`);
}

/**
 * The standard VAT rate, as a percentage (19, or 25.5), in force in a member state on a date.
 *
 * With no date it is today (UTC). A date after the last known change returns the latest known rate: the
 * library cannot know about changes made after its data was generated (see `dataAsOf`).
 *
 * @throws UnknownCountryError for a country that is not an EU member state
 * @throws DateOutOfRangeError for a date before 2016-01-01
 * @throws TypeError for a malformed date
 */
export function getStandardRate(country: string, date?: string | Date): number {
  const code = normalizeCountry(country);
  const day = isoDate(date);
  if (day < DATA_FIRST_DATE) throw new DateOutOfRangeError(day);

  // Windows are in ascending date order (the generator validates this), so walk them and keep the last one
  // that started on or before the day. The first window always starts on DATA_FIRST_DATE, so there is always
  // an answer once the range check above has passed.
  const windows = BY_CODE.get(code)!.windows;
  let rate: number = windows[0]!.rate;
  for (const w of windows) {
    if (w.from <= day) rate = w.rate;
    else break;
  }
  return rate;
}

/**
 * Every rate a country has had since 2016, in order. Returns copies: changing the result does not change the
 * data the library answers from.
 */
export function getRateHistory(country: string): RateWindow[] {
  return BY_CODE.get(normalizeCountry(country))!.windows.map(w => ({ from: w.from, rate: w.rate }));
}

/**
 * Every change of a standard rate since 2016, newest first. Optionally only one country, and/or only changes
 * on or after a date. A "change" is the first day of a new rate, with the rate before and after it.
 */
export function getRateChanges(options: { country?: string; since?: string | Date } = {}): RateChange[] {
  const only = options.country === undefined ? undefined : normalizeCountry(options.country);
  const since = options.since === undefined ? undefined : isoDate(options.since);
  const changes: RateChange[] = [];
  for (const c of DATA) {
    if (only && c.code !== only) continue;
    // Window 0 is the starting rate, not a change. Every later window is a change from the one before it.
    for (let i = 1; i < c.windows.length; i++) {
      const w = c.windows[i]!;
      if (since && w.from < since) continue;
      changes.push({ country: c.code, date: w.from, from: c.windows[i - 1]!.rate, to: w.rate });
    }
  }
  // Newest first; two changes on the same day are ordered by country code so the output is stable.
  return changes.sort((a, b) => b.date.localeCompare(a.date) || a.country.localeCompare(b.country));
}

/** The 27 member states with their EU codes (Greece is "EL") and English names, sorted by name. */
export function listCountries(): Country[] {
  return DATA.map(c => ({ code: c.code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/**
 * A rate as a localised percentage: formatRate(25.5) is "25.5%", formatRate(19, 'de') is "19 %".
 * Uses the platform's Intl, so any locale it knows works.
 */
export function formatRate(rate: number, locale = 'en'): string {
  // Intl's percent style multiplies by 100, so divide first. Two decimals is enough for every real rate.
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(rate / 100);
}
