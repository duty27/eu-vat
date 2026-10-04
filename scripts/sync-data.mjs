// Keeps every library on the same rates. The one source is data/eu-standard-vat-rates.json, a copy of what
// Duty27 publishes at https://duty27.com/data/eu-standard-vat-rates.json. From it this writes:
//
//   node/src/data.ts                                   the Node library's data
//   python/src/duty27_eu_vat/_data.py                  the Python library's data
//   java/src/main/java/com/duty27/euvat/Data.java      the Java library's data
//   node/test/, python/tests/, java/src/test/resources/ test-vectors.csv
//                                                      expected answers, one identical copy per language so
//                                                      each folder's tests need nothing from outside it
//
//   node scripts/sync-data.mjs                  regenerate everything from the committed snapshot (offline)
//   node scripts/sync-data.mjs --refresh        first fetch the published file, validate it, update the snapshot
//     --from <file>   use a local file instead of the URL      --as-of <date>   (default: today, UTC)
//   node scripts/sync-data.mjs --check          change nothing; exit 1 if the PUBLISHED rates differ from the
//                                               snapshot (a rate changed: refresh and release)
//   node scripts/sync-data.mjs --check-generated  change nothing; exit 1 if any generated file is not exactly
//                                               what the snapshot produces (someone edited one, or forgot to run this)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCE_URL, validateSource, validDate, buildDataModule, buildPythonModule, buildJavaClass, buildVectors, sourceSha256 } from './data-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'data', 'eu-standard-vat-rates.json');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

async function loadPublished() {
  const from = opt('--from');
  if (from) return JSON.parse(readFileSync(from, 'utf-8'));
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`could not fetch ${SOURCE_URL}: HTTP ${res.status}`);
  return res.json();
}

const readSnapshot = () => JSON.parse(readFileSync(SNAPSHOT, 'utf-8'));
const withoutAsOf = (o) => { const { snapshotAsOf, ...rest } = o; return rest; };

function outputs(snapshot) {
  const asOf = snapshot.snapshotAsOf;
  const vectors = buildVectors(snapshot);
  return [
    [join(ROOT, 'node', 'src', 'data.ts'), buildDataModule(snapshot, asOf)],
    [join(ROOT, 'python', 'src', 'duty27_eu_vat', '_data.py'), buildPythonModule(snapshot, asOf)],
    [join(ROOT, 'java', 'src', 'main', 'java', 'com', 'duty27', 'euvat', 'Data.java'), buildJavaClass(snapshot, asOf)],
    // The same expected answers, copied into each language's own test folder, so every folder is complete by
    // itself (a developer can take just python/ or java/ and run its tests). build.sh checks the copies are identical.
    [join(ROOT, 'node', 'test', 'test-vectors.csv'), vectors],
    [join(ROOT, 'python', 'tests', 'test-vectors.csv'), vectors],
    [join(ROOT, 'java', 'src', 'test', 'resources', 'test-vectors.csv'), vectors],
  ];
}

if (args.includes('--check')) {
  const published = await loadPublished();
  validateSource(published);
  if (sourceSha256(published) !== sourceSha256(readSnapshot())) {
    console.error('The published rates differ from data/eu-standard-vat-rates.json. Run ./build.sh refresh, review the diff, and release.');
    process.exit(1);
  }
  console.log('The snapshot matches the published rates.');
} else if (args.includes('--check-generated')) {
  const stale = outputs(readSnapshot()).filter(([p, text]) => !existsSync(p) || readFileSync(p, 'utf-8') !== text).map(([p]) => p.replace(ROOT + '/', ''));
  if (stale.length) { console.error(`Not generated from the snapshot, run ./build.sh data: ${stale.join(', ')}`); process.exit(1); }
  console.log('Every generated file matches the snapshot.');
} else {
  if (args.includes('--refresh')) {
    const published = await loadPublished();
    validateSource(published);
    const asOf = opt('--as-of', new Date().toISOString().slice(0, 10));
    if (!validDate(asOf)) throw new Error(`bad as-of date ${asOf}`);
    mkdirSync(dirname(SNAPSHOT), { recursive: true });
    writeFileSync(SNAPSHOT, JSON.stringify({ ...withoutAsOf(published), snapshotAsOf: asOf }, null, 2) + '\n');
    console.log(`Updated ${SNAPSHOT.replace(ROOT + '/', '')} (as of ${asOf}).`);
  }
  const snapshot = readSnapshot();
  validateSource(snapshot);
  for (const [p, text] of outputs(snapshot)) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
    console.log(`Wrote ${p.replace(ROOT + '/', '')}`);
  }
  console.log(`Source hash ${sourceSha256(snapshot).slice(0, 16)}, as of ${snapshot.snapshotAsOf}.`);
}
