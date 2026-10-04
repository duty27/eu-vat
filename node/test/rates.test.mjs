import test from 'node:test';
import assert from 'node:assert';
import {
  getStandardRate, getRateHistory, getRateChanges, listCountries, formatRate, normalizeCountry,
  UnknownCountryError, DateOutOfRangeError, DATA_FIRST_DATE, dataAsOf, ATTRIBUTION,
} from '../dist/esm/index.js';

const rate = (c, d) => getStandardRate(c, d);

test('the day a rate changes is the first day of the new rate (Germany 2020: 19, 16, 19)', () => {
  assert.strictEqual(rate('DE', '2020-06-30'), 19);
  assert.strictEqual(rate('DE', '2020-07-01'), 16);
  assert.strictEqual(rate('DE', '2020-12-31'), 16);
  assert.strictEqual(rate('DE', '2021-01-01'), 19);
});

test('other real changes land on the right day', () => {
  assert.strictEqual(rate('EL', '2016-05-31'), 23);
  assert.strictEqual(rate('EL', '2016-06-01'), 24);
  assert.strictEqual(rate('IE', '2020-08-31'), 23);
  assert.strictEqual(rate('IE', '2020-09-01'), 21);
  assert.strictEqual(rate('IE', '2021-02-28'), 21);
  assert.strictEqual(rate('IE', '2021-03-01'), 23);
  assert.strictEqual(rate('LU', '2022-12-31'), 17);
  assert.strictEqual(rate('LU', '2023-06-15'), 16);
  assert.strictEqual(rate('LU', '2024-01-01'), 17);
  assert.strictEqual(rate('FI', '2024-08-31'), 24);
  assert.strictEqual(rate('FI', '2024-09-01'), 25.5);
  assert.strictEqual(rate('RO', '2025-07-31'), 19);
  assert.strictEqual(rate('RO', '2025-08-01'), 21);
});

test('the first day of the data', () => {
  assert.strictEqual(rate('AT', '2016-01-01'), 20);
  assert.strictEqual(DATA_FIRST_DATE, '2016-01-01');
});

test('a date after the last known change returns the latest known rate', () => {
  // Derived from the data, not hard-coded: a new rate change must not break this test (see the shared vectors for exact values).
  assert.strictEqual(rate('RO', '2035-01-01'), getRateHistory('RO').at(-1).rate);
});

test('country codes are case-insensitive, trimmed, and Greece answers to both GR and EL', () => {
  assert.strictEqual(rate('de', '2020-07-01'), 16);
  assert.strictEqual(rate(' DE ', '2020-07-01'), 16);
  assert.strictEqual(rate('GR', '2016-06-01'), 24);
  assert.strictEqual(rate('gr', '2016-06-01'), 24);
  assert.strictEqual(rate('EL', '2016-06-01'), 24);
  assert.strictEqual(normalizeCountry('gr'), 'EL');
});

test('an unknown or non-EU country is an error, not a guess', () => {
  for (const bad of ['XX', 'GB', 'US', 'CH', '', 'GERMANY', 'D']) {
    assert.throws(() => rate(bad, '2020-01-01'), UnknownCountryError, bad);
  }
  assert.throws(() => rate(undefined, '2020-01-01'), UnknownCountryError);
  assert.throws(() => rate(19, '2020-01-01'), UnknownCountryError);
  try { rate('GB', '2020-01-01'); } catch (e) { assert.match(e.message, /GB/); assert.ok(e instanceof Error); }
});

test('a date before the data starts is an error, never a made-up rate', () => {
  assert.throws(() => rate('DE', '2015-12-31'), DateOutOfRangeError);
  assert.throws(() => rate('DE', '2015-12-31'), RangeError);
  assert.throws(() => rate('DE', '2000-01-01'), /2016-01-01/);
});

test('a malformed or impossible date is a TypeError', () => {
  for (const bad of ['2020-02-30', '2020-13-01', '20200701', '2020-7-1', 'banana', '', '2020-07-01T00:00:00Z']) {
    assert.throws(() => rate('DE', bad), TypeError, bad);
  }
  assert.throws(() => rate('DE', 20200701), TypeError);
  assert.throws(() => rate('DE', new Date('nonsense')), TypeError);
  assert.throws(() => rate('DE', null), TypeError);
});

test('a Date object is read as its UTC calendar day', () => {
  // 00:30 on 1 July in Paris is still 30 June in UTC.
  assert.strictEqual(rate('DE', new Date('2020-07-01T00:30:00+02:00')), 19);
  assert.strictEqual(rate('DE', new Date('2020-07-01T00:00:00Z')), 16);
});

test('with no date it uses today (UTC)', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.strictEqual(getStandardRate('DE'), getStandardRate('DE', today));
  assert.strictEqual(getStandardRate('DE', undefined), getStandardRate('DE', today));
});

test('getRateHistory returns every window in order, as copies the caller cannot use to change the data', () => {
  const h = getRateHistory('DE');
  // The known history is a floor: a later change adds a window at the end, it never alters these.
  assert.deepStrictEqual(h.slice(0, 3), [{ from: '2016-01-01', rate: 19 }, { from: '2020-07-01', rate: 16 }, { from: '2021-01-01', rate: 19 }]);
  const latest = h.at(-1).rate;
  h.push({ from: '2030-01-01', rate: 99 });
  h[0].rate = 1;
  assert.deepStrictEqual(getRateHistory('DE')[0], { from: '2016-01-01', rate: 19 });
  assert.strictEqual(rate('DE', '2030-06-01'), latest);
  assert.deepStrictEqual(getRateHistory('gr').slice(0, 2), [{ from: '2016-01-01', rate: 23 }, { from: '2016-06-01', rate: 24 }]);
});

test('getRateChanges lists every change, newest first, and can be filtered', () => {
  const all = getRateChanges();
  assert.ok(all.length >= 13, `${all.length} changes`);   // the 13 known changes are a floor; new ones add to it
  assert.deepStrictEqual(all.find(c => c.country === 'RO' && c.date === '2025-08-01'), { country: 'RO', date: '2025-08-01', from: 19, to: 21 });
  const dates = all.map(c => c.date);
  assert.deepStrictEqual(dates, [...dates].sort().reverse());
  assert.deepStrictEqual(getRateChanges({ country: 'de' }).map(c => [c.date, c.from, c.to]).slice(-2), [['2021-01-01', 16, 19], ['2020-07-01', 19, 16]]);
  const since2025 = getRateChanges({ since: '2025-01-01' }).map(c => c.country);
  for (const known of ['RO', 'EE', 'SK']) assert.ok(since2025.includes(known), known);
  const austria = getRateChanges({ country: 'AT' });          // a country filter returns only that country, one change per extra window
  assert.ok(austria.every(c => c.country === 'AT'));
  assert.strictEqual(austria.length, getRateHistory('AT').length - 1);
  assert.throws(() => getRateChanges({ country: 'XX' }), UnknownCountryError);
  assert.throws(() => getRateChanges({ since: 'soon' }), TypeError);
});

test('listCountries gives the 27 member states, sorted by name, with EU codes', () => {
  const c = listCountries();
  assert.strictEqual(c.length, 27);
  assert.strictEqual(new Set(c.map(x => x.code)).size, 27);
  assert.ok(c.some(x => x.code === 'EL' && x.name === 'Greece'));
  assert.ok(!c.some(x => x.code === 'GR'));
  const names = c.map(x => x.name);
  assert.deepStrictEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
});

test('formatRate formats for a locale', () => {
  assert.strictEqual(formatRate(25.5), '25.5%');
  assert.strictEqual(formatRate(19), '19%');
  assert.match(formatRate(19, 'de'), /^19\s%$/);
  assert.match(formatRate(25.5, 'fr'), /^25,5\s%$/);
});

test('the data carries its coverage, its as-of date and its attribution', () => {
  assert.match(dataAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(ATTRIBUTION, /duty27\.com\/vat-rates\/history/);
  assert.match(ATTRIBUTION, /CC BY 4\.0/);
});

test('data integrity: every country starts on the first date, ascends, and never repeats a rate', () => {
  for (const { code } of listCountries()) {
    const h = getRateHistory(code);
    assert.strictEqual(h[0].from, '2016-01-01', code);
    assert.deepStrictEqual(h.map(w => w.from), h.map(w => w.from).sort(), code);
    for (let i = 1; i < h.length; i++) assert.notStrictEqual(h[i].rate, h[i - 1].rate, `${code} ${h[i].from}`);
    for (const w of h) assert.ok(w.rate >= 5 && w.rate <= 30, `${code} ${w.from}`);
  }
});
