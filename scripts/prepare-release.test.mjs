import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describeChanges } from './prepare-release.mjs';

// prepare-release.mjs runs against a THROWAWAY COPY of the repo, never the real files: it copies scripts/ and the
// few files it touches into a temp folder (its root is wherever the script file lives).
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-release-'));
  fs.cpSync(path.join(REPO, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['data/eu-standard-vat-rates.json', 'node/package.json', 'node/package-lock.json', 'node/src/data.ts', 'python/pyproject.toml', 'java/pom.xml']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
  }
  // Pin the starting point, so these tests do not depend on today's rates or version: after a real release is
  // merged the repo's own data and version have moved on, and the tests must still pass.
  const snapPath = path.join(dir, 'data/eu-standard-vat-rates.json');
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
  snap.countries.find(c => c.code === 'AT').windows = [{ from: '2016-01-01', rate: 20 }];
  snap.countries.find(c => c.code === 'BE').windows = [{ from: '2016-01-01', rate: 21 }];
  fs.writeFileSync(snapPath, JSON.stringify(snap, null, 2) + '\n');
  const edit = (f, fn) => fs.writeFileSync(path.join(dir, f), fn(fs.readFileSync(path.join(dir, f), 'utf-8')));
  edit('node/package.json', t => t.replace(/("version":\s*")[^"]+(")/, '$10.1.0$2'));
  edit('node/package-lock.json', t => { const l = JSON.parse(t); l.version = '0.1.0'; l.packages[''].version = '0.1.0'; return JSON.stringify(l, null, 2) + '\n'; });
  edit('python/pyproject.toml', t => t.replace(/^(version = ")[^"]+(")/m, '$10.1.0$2'));
  edit('java/pom.xml', t => t.replace(/(<artifactId>eu-vat<\/artifactId>\s*<version>)[^<]+(<\/version>)/, '$10.1.0$2'));
  return dir;
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf-8');
const snapshot = (dir) => JSON.parse(read(dir, 'data/eu-standard-vat-rates.json'));
const published = (dir, mutate = () => {}) => {   // what the website would publish: the snapshot without our own snapshotAsOf
  const { snapshotAsOf, ...src } = snapshot(dir); mutate(src);
  const file = path.join(dir, 'published.json'); fs.writeFileSync(file, JSON.stringify(src)); return file;
};
function run(dir, args = []) {
  const out = path.join(dir, 'gh-output'); const notes = path.join(dir, 'notes.md');
  fs.writeFileSync(out, '');
  const r = spawnSync(process.execPath, [path.join(dir, 'scripts', 'prepare-release.mjs'), ...args], {
    encoding: 'utf-8', env: { ...process.env, GITHUB_OUTPUT: out, RELEASE_NOTES: notes } });
  return { ...r, output: read(dir, 'gh-output'), notes: fs.existsSync(notes) ? fs.readFileSync(notes, 'utf-8') : null };
}
const austriaMoves = (src) => { src.countries.find(c => c.code === 'AT').windows.push({ from: '2026-11-01', rate: 21 }); };
const versionsIn = (dir) => ({
  node: JSON.parse(read(dir, 'node/package.json')).version,
  lock: JSON.parse(read(dir, 'node/package-lock.json')).version,
  lockRoot: JSON.parse(read(dir, 'node/package-lock.json')).packages[''].version,
  python: read(dir, 'python/pyproject.toml').match(/^version = "([^"]+)"/m)[1],
  java: read(dir, 'java/pom.xml').match(/<artifactId>eu-vat<\/artifactId>\s*<version>([^<]+)<\/version>/)[1],
});

test('describeChanges names a new window, a corrected rate and a removed window in plain words', () => {
  const old = { countries: [{ code: 'AT', windows: [{ from: '2016-01-01', rate: 20 }] }, { code: 'DE', windows: [{ from: '2016-01-01', rate: 19 }, { from: '2020-07-01', rate: 16 }] }] };
  const next = { countries: [{ code: 'AT', windows: [{ from: '2016-01-01', rate: 20 }, { from: '2026-11-01', rate: 21 }] }, { code: 'DE', windows: [{ from: '2016-01-01', rate: 19 }, { from: '2020-07-01', rate: 17 }] }] };
  const lines = describeChanges(old, next);
  assert.ok(lines.some(l => /AT: 20% to 21% from 2026-11-01/.test(l)), lines.join('|'));
  assert.ok(lines.some(l => /DE: .*2020-07-01.*corrected.*16% to 17%/.test(l)), lines.join('|'));
  assert.deepStrictEqual(describeChanges(old, old), []);
  const removed = describeChanges(next, old);
  assert.ok(removed.some(l => /AT: .*2026-11-01.*removed/.test(l)), removed.join('|'));
});

test('nothing changed: exits 0, says so, and modifies no file', () => {
  const dir = workspace();
  const before = [read(dir, 'data/eu-standard-vat-rates.json'), read(dir, 'node/package.json'), read(dir, 'python/pyproject.toml'), read(dir, 'java/pom.xml')];
  const r = run(dir, ['--from', published(dir)]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.output, /changed=false/);
  assert.match(r.stdout, /up to date/i);
  assert.deepStrictEqual([read(dir, 'data/eu-standard-vat-rates.json'), read(dir, 'node/package.json'), read(dir, 'python/pyproject.toml'), read(dir, 'java/pom.xml')], before);
  assert.strictEqual(r.notes, null);
  assert.ok(!fs.existsSync(path.join(dir, 'CHANGELOG.md')));
});

test('a rate changed: the snapshot and all three libraries get it, with the same new patch version everywhere', () => {
  const dir = workspace();
  const r = run(dir, ['--from', published(dir, austriaMoves), '--as-of', '2026-11-02']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.output, /changed=true/);
  assert.match(r.output, /version=0\.1\.1/);
  assert.strictEqual(snapshot(dir).snapshotAsOf, '2026-11-02');
  for (const f of ['node/src/data.ts', 'python/src/duty27_eu_vat/_data.py', 'java/src/main/java/com/duty27/euvat/Data.java']) {
    assert.match(read(dir, f), /2026-11-01/, f);
  }
  assert.deepStrictEqual(versionsIn(dir), { node: '0.1.1', lock: '0.1.1', lockRoot: '0.1.1', python: '0.1.1', java: '0.1.1' });
});

test('the generated vectors and every data module carry the same new source hash', () => {
  const realFile = path.join(REPO, 'node/src/data.ts');
  const realBefore = fs.readFileSync(realFile, 'utf-8');
  const dir = workspace(); run(dir, ['--from', published(dir, austriaMoves)]);
  const hashes = new Set([
    read(dir, 'node/src/data.ts').match(/DATA_SOURCE_SHA256 = "([0-9a-f]+)"/)[1],
    read(dir, 'python/src/duty27_eu_vat/_data.py').match(/DATA_SOURCE_SHA256 = "([0-9a-f]+)"/)[1],
    read(dir, 'java/src/main/java/com/duty27/euvat/Data.java').match(/SOURCE_SHA256 = "([0-9a-f]+)"/)[1],
  ]);
  assert.strictEqual(hashes.size, 1);
  assert.strictEqual(fs.readFileSync(realFile, 'utf-8'), realBefore, 'the REAL repo must be untouched');
});

test('the release notes and the changelog say what changed, in the same words', () => {
  const dir = workspace();
  const r = run(dir, ['--from', published(dir, austriaMoves), '--as-of', '2026-11-02']);
  assert.match(r.notes, /AT: 20% to 21% from 2026-11-01/);
  assert.match(r.notes, /0\.1\.1/);
  assert.match(r.notes, /node-v0\.1\.1/);       // the tags to push after merging
  assert.match(r.notes, /python-v0\.1\.1/);
  assert.match(r.notes, /java-v0\.1\.1/);
  assert.match(r.notes, /verify/i);             // a change is a claim about the law: review it
  const log = read(dir, 'CHANGELOG.md');
  assert.match(log, /## 0\.1\.1 \(2026-11-02\)/);
  assert.match(log, /AT: 20% to 21% from 2026-11-01/);
});

test('a second change adds a new changelog entry above the first and bumps from the new version', () => {
  const dir = workspace();
  run(dir, ['--from', published(dir, austriaMoves), '--as-of', '2026-11-02']);
  const second = published(dir, (src) => { src.countries.find(c => c.code === 'BE').windows.push({ from: '2027-01-01', rate: 22 }); });
  const r = run(dir, ['--from', second, '--as-of', '2026-12-01']);
  assert.match(r.output, /version=0\.1\.2/);
  const log = read(dir, 'CHANGELOG.md');
  assert.ok(log.indexOf('## 0.1.2') < log.indexOf('## 0.1.1'), 'newest first');
});

test('running it again on the same source changes nothing more (idempotent)', () => {
  const dir = workspace(); const src = published(dir, austriaMoves);
  run(dir, ['--from', src, '--as-of', '2026-11-02']);
  const again = run(dir, ['--from', src, '--as-of', '2026-11-03']);
  assert.match(again.output, /changed=false/);
  assert.deepStrictEqual(versionsIn(dir).node, '0.1.1');
  assert.strictEqual(snapshot(dir).snapshotAsOf, '2026-11-02');
});

test('--bump minor bumps the minor version', () => {
  const dir = workspace();
  const r = run(dir, ['--from', published(dir, austriaMoves), '--bump', 'minor']);
  assert.match(r.output, /version=0\.2\.0/);
  assert.strictEqual(versionsIn(dir).java, '0.2.0');
});

test('a bad source (a country missing, an absurd rate) is rejected with a non-zero exit and nothing is modified', () => {
  for (const mutate of [(s) => s.countries.pop(), (s) => { s.countries[0].windows[0].rate = 99; }]) {
    const dir = workspace();
    const before = [read(dir, 'data/eu-standard-vat-rates.json'), read(dir, 'node/package.json'), read(dir, 'node/src/data.ts')];
    const r = run(dir, ['--from', published(dir, mutate)]);
    assert.notStrictEqual(r.status, 0);
    assert.doesNotMatch(r.output, /changed=true/);
    assert.deepStrictEqual([read(dir, 'data/eu-standard-vat-rates.json'), read(dir, 'node/package.json'), read(dir, 'node/src/data.ts')], before);
  }
});

test('a source that is not JSON at all is rejected cleanly', () => {
  const dir = workspace(); const bad = path.join(dir, 'bad.json'); fs.writeFileSync(bad, '<html>502 Bad Gateway</html>');
  const r = run(dir, ['--from', bad]);
  assert.notStrictEqual(r.status, 0);
  assert.doesNotMatch(r.output, /changed=true/);
});
