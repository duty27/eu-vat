import { DATA, DATA_AS_OF } from './data.js';

/** One rate and the day it began to apply. A window runs until the next one starts. */
export interface RateWindow { readonly from: string; readonly rate: number }
/** A change of the standard rate: `date` is the first day of the new rate. */
export interface RateChange { readonly country: string; readonly date: string; readonly from: number; readonly to: number }
export interface Country { readonly code: string; readonly name: string }

/** The first day the data covers. Earlier dates are an error, not a guess. */
export const DATA_FIRST_DATE = '2016-01-01';
/** The date the data was last compared with the rates Duty27 publishes. Rates can change after it. */
export const dataAsOf: string = DATA_AS_OF;
/** The credit the data licence (CC BY 4.0) asks for. */
export const ATTRIBUTION = 'Rate data: Duty27 (https://duty27.com/vat-rates/history), CC BY 4.0';

export class UnknownCountryError extends Error {
  readonly country: string;
  constructor(country: unknown) {
    super(`Unknown or non-EU country code: ${JSON.stringify(country)}. Use an EU member state code such as DE (Greece is EL; GR also works).`);
    this.name = 'UnknownCountryError';
    this.country = String(country);
  }
}

export class DateOutOfRangeError extends RangeError {
  readonly date: string;
  constructor(date: string) {
    super(`${date} is before the first date covered (${DATA_FIRST_DATE}).`);
    this.name = 'DateOutOfRangeError';
    this.date = date;
  }
}

const BY_CODE = new Map(DATA.map(c => [c.code as string, c]));

/** The EU member state code for a country code, case-insensitive; GR is accepted for Greece (EL). */
export function normalizeCountry(code: unknown): string {
  if (typeof code !== 'string') throw new UnknownCountryError(code);
  let c = code.trim().toUpperCase();
  if (c === 'GR') c = 'EL';
  if (!BY_CODE.has(c)) throw new UnknownCountryError(code);
  return c;
}

function isoDate(date: unknown): string {
  if (date === undefined) return new Date().toISOString().slice(0, 10);
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new TypeError('Invalid Date');
    return date.toISOString().slice(0, 10); // the UTC calendar day
  }
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00Z`);
    // An impossible day (2020-02-30, 2020-13-01) is an Invalid Date, whose toISOString() would throw a RangeError.
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date;
  }
  throw new TypeError(`Expected a date as YYYY-MM-DD or a Date, got ${JSON.stringify(date)}.`);
}

/**
 * The standard VAT rate (a percentage, e.g. 19 or 25.5) in force in a member state on a date.
 * With no date it is today (UTC). A date after the last known change returns the latest known rate.
 */
export function getStandardRate(country: string, date?: string | Date): number {
  const code = normalizeCountry(country);
  const day = isoDate(date);
  if (day < DATA_FIRST_DATE) throw new DateOutOfRangeError(day);
  const windows = BY_CODE.get(code)!.windows;
  let rate: number = windows[0]!.rate;
  for (const w of windows) {
    if (w.from <= day) rate = w.rate;
    else break;
  }
  return rate;
}

/** Every rate a country has had since 2016, in order. A copy: changing it does not change the data. */
export function getRateHistory(country: string): RateWindow[] {
  return BY_CODE.get(normalizeCountry(country))!.windows.map(w => ({ from: w.from, rate: w.rate }));
}

/** Every change of a standard rate since 2016, newest first. Optionally one country, and/or from a date on. */
export function getRateChanges(options: { country?: string; since?: string | Date } = {}): RateChange[] {
  const only = options.country === undefined ? undefined : normalizeCountry(options.country);
  const since = options.since === undefined ? undefined : isoDate(options.since);
  const changes: RateChange[] = [];
  for (const c of DATA) {
    if (only && c.code !== only) continue;
    for (let i = 1; i < c.windows.length; i++) {
      const w = c.windows[i]!;
      if (since && w.from < since) continue;
      changes.push({ country: c.code, date: w.from, from: c.windows[i - 1]!.rate, to: w.rate });
    }
  }
  return changes.sort((a, b) => b.date.localeCompare(a.date) || a.country.localeCompare(b.country));
}

/** The 27 member states with their EU codes (Greece is EL) and English names, sorted by name. */
export function listCountries(): Country[] {
  return DATA.map(c => ({ code: c.code, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** A rate as a localised percentage: formatRate(25.5) is "25.5%", formatRate(19, 'de') is "19 %". */
export function formatRate(rate: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 }).format(rate / 100);
}
