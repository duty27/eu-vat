import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

test('the package name resolves for both import and require, with the same answers', async () => {
  const esm = await import('@duty27/eu-vat');
  const cjs = require('@duty27/eu-vat');
  for (const [c, d] of [['DE', '2020-07-01'], ['EL', '2016-06-01'], ['FI', '2024-09-01']]) {
    assert.strictEqual(cjs.getStandardRate(c, d), esm.getStandardRate(c, d));
  }
  assert.strictEqual(typeof cjs.getRateChanges, 'function');
  assert.strictEqual(cjs.getRateChanges().length, esm.getRateChanges().length);
});

test('zero runtime dependencies', () => {
  assert.strictEqual(pkg.dependencies, undefined);
  assert.strictEqual(pkg.peerDependencies, undefined);
});

test('the published tarball holds the built code, types and licences, and nothing else', () => {
  const out = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf-8' }));
  const files = out[0].files.map(f => f.path);
  for (const must of ['package.json', 'README.md', 'LICENSE', 'DATA-LICENSE.md', 'dist/esm/index.js', 'dist/esm/index.d.ts', 'dist/cjs/index.js', 'dist/cjs/package.json']) {
    assert.ok(files.includes(must), `missing ${must}`);
  }
  for (const f of files) assert.ok(!/^(src|test|scripts|\.github|node_modules)\//.test(f), `should not ship ${f}`);
  assert.ok(files.length < 25, `unexpectedly many files: ${files.length}`);
});

test('licence terms: MIT code, CC BY 4.0 data, and a homepage that points at the dataset page', () => {
  assert.strictEqual(pkg.license, 'MIT');
  assert.match(readFileSync(new URL('../LICENSE', import.meta.url), 'utf-8'), /MIT License/);
  assert.match(readFileSync(new URL('../DATA-LICENSE.md', import.meta.url), 'utf-8'), /CC BY 4\.0|Attribution 4\.0/);
  assert.strictEqual(pkg.homepage, 'https://duty27.com/vat-rates/history');
});

test('the package keywords include the phrases people search for dated and historical rates', () => {
  // npm search matches keywords as well as the name and description; "historical" and "by date" are what separate this
  // package from the libraries that only return today's rate.
  for (const k of ['vat-rates', 'eu-vat-rates', 'historical-vat-rates', 'vat-rate-history', 'value-added-tax']) {
    assert.ok(pkg.keywords.includes(k), `missing keyword ${k}`);
  }
  assert.strictEqual(new Set(pkg.keywords).size, pkg.keywords.length, 'duplicate keyword');
  assert.ok(pkg.keywords.length <= 15, `too many keywords (${pkg.keywords.length}): npm search rewards relevance, not volume`);
});
