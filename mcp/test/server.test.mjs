import test, { before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, call, MCP_DIR } from './helpers.mjs';

let client;
before(async () => { client = await connect(); });
after(async () => { await client.close(); });

test('it lists exactly four tools, each described and marked read-only', async () => {
  const { tools } = await client.listTools();
  assert.deepStrictEqual(tools.map(t => t.name).sort(), ['get_rate_history', 'get_standard_rate', 'list_countries', 'list_rate_changes']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 40, `${t.name} needs a real description, the model reads it to decide when to call the tool`);
    assert.strictEqual(t.annotations?.readOnlyHint, true, `${t.name} must be marked read-only`);
    assert.strictEqual(t.annotations?.openWorldHint, false, `${t.name} makes no network calls`);
  }
  assert.ok(!tools.some(t => /[—]/.test(t.description)), 'no em dashes in descriptions');
});

test('get_standard_rate answers with the rate, the date, and the attribution the data licence asks for', async () => {
  const r = await call(client, 'get_standard_rate', { country: 'DE', date: '2020-07-01' });
  assert.strictEqual(r.isError, false, r.text);
  assert.strictEqual(r.data.country, 'DE');
  assert.strictEqual(r.data.date, '2020-07-01');
  assert.strictEqual(r.data.rate, 16);
  assert.match(r.text, /16%/);
  assert.match(r.text, /duty27\.com/);
  assert.match(r.data.dataAsOf, /^\d{4}-\d{2}-\d{2}$/);
});

test('the day before a change is the old rate, the day of it is the new rate', async () => {
  assert.strictEqual((await call(client, 'get_standard_rate', { country: 'DE', date: '2020-06-30' })).data.rate, 19);
  assert.strictEqual((await call(client, 'get_standard_rate', { country: 'DE', date: '2020-07-01' })).data.rate, 16);
});

test('country codes are forgiving (case, GR for Greece) and the answer says which code it used', async () => {
  const r = await call(client, 'get_standard_rate', { country: ' gr ', date: '2016-06-01' });
  assert.strictEqual(r.isError, false, r.text);
  assert.strictEqual(r.data.country, 'EL');
  assert.strictEqual(r.data.rate, 24);
});

test('without a date it uses today (UTC)', async () => {
  const r = await call(client, 'get_standard_rate', { country: 'DE' });
  assert.strictEqual(r.data.date, new Date().toISOString().slice(0, 10));
});

test('a decimal rate stays exact', async () => {
  assert.strictEqual((await call(client, 'get_standard_rate', { country: 'FI', date: '2024-09-01' })).data.rate, 25.5);
});

test('bad input is an error the model can read and recover from, never a crash or a guess', async () => {
  for (const [args, pattern] of [
    [{ country: 'GB', date: '2020-01-01' }, /GB|EU member/i],
    [{ country: 'DE', date: '2015-12-31' }, /2016-01-01/],
    [{ country: 'DE', date: '2020-02-30' }, /date/i],
    [{ country: 'DE', date: 'banana' }, /date/i],
    [{ country: '', date: '2020-01-01' }, /country/i],
  ]) {
    const r = await call(client, 'get_standard_rate', args);
    assert.strictEqual(r.isError, true, JSON.stringify(args));
    assert.match(r.text, pattern, JSON.stringify(args));
  }
  // and the server is still alive afterwards
  assert.strictEqual((await call(client, 'get_standard_rate', { country: 'DE', date: '2021-01-01' })).data.rate, 19);
});

test('get_rate_history lists every window in order and ends with the latest rate', async () => {
  const r = await call(client, 'get_rate_history', { country: 'DE' });
  assert.strictEqual(r.isError, false, r.text);
  assert.deepStrictEqual(r.data.windows.slice(0, 3), [{ from: '2016-01-01', rate: 19 }, { from: '2020-07-01', rate: 16 }, { from: '2021-01-01', rate: 19 }]);
  assert.match(r.text, /2020-07-01/);
});

test('list_rate_changes: all, by country, and since a date; newest first', async () => {
  const all = await call(client, 'list_rate_changes', {});
  assert.ok(all.data.changes.length >= 13);
  const dates = all.data.changes.map(c => c.date);
  assert.deepStrictEqual(dates, [...dates].sort().reverse());
  assert.ok(all.data.changes.some(c => c.country === 'RO' && c.date === '2025-08-01' && c.from === 19 && c.to === 21));
  const de = await call(client, 'list_rate_changes', { country: 'de' });
  assert.ok(de.data.changes.every(c => c.country === 'DE'));
  const since = await call(client, 'list_rate_changes', { since: '2025-01-01' });
  assert.ok(since.data.changes.every(c => c.date >= '2025-01-01'));
  const bad = await call(client, 'list_rate_changes', { country: 'XX' });
  assert.strictEqual(bad.isError, true);
});

test('list_countries returns the 27 member states with Greece as EL', async () => {
  const r = await call(client, 'list_countries', {});
  assert.strictEqual(r.data.countries.length, 27);
  assert.deepStrictEqual(r.data.countries.find(c => c.code === 'EL'), { code: 'EL', name: 'Greece' });
  assert.ok(!r.data.countries.some(c => c.code === 'GR'));
});

test('every row of the shared test vectors gives the same answer through the server', async () => {
  const lines = readFileSync(join(MCP_DIR, 'test', 'test-vectors.csv'), 'utf-8').trim().split('\n').slice(1);
  assert.ok(lines.length >= 27 * 5, `only ${lines.length} vectors: is the file generated?`);
  const wrong = [];
  for (const line of lines) {
    const [country, date, expected] = line.split(',');
    const r = await call(client, 'get_standard_rate', { country, date });
    if (r.isError || r.data.rate !== Number(expected)) wrong.push(`${country} ${date}: expected ${expected}, got ${r.isError ? r.text : r.data.rate}`);
  }
  assert.deepStrictEqual(wrong, []);
});
