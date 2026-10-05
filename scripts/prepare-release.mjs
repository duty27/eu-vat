// Prepares a data release when the published rates have changed. It is what the daily freshness workflow runs.
//
//   node scripts/prepare-release.mjs                 fetch https://duty27.com/data/eu-standard-vat-rates.json
//     --from <file>      use a local file instead of the URL
//     --as-of <date>     the snapshot date (default: today, UTC)
//     --bump patch|minor how far to raise the version of all three libraries (default: patch)
//
// If the published rates are the same as data/eu-standard-vat-rates.json, it says so and changes nothing.
//
// If they differ, it:
//   1. validates the published file (a bad file is rejected before anything is written),
//   2. updates the snapshot, then regenerates every library's data through scripts/sync-data.mjs (one code path),
//   3. gives node, python, java and mcp the SAME new version (they are released together from one data source),
//   4. adds an entry to CHANGELOG.md and writes the notes for the pull request (RELEASE_NOTES, default release-notes.md),
//   5. reports changed=true and version=<new> through GITHUB_OUTPUT, for the workflow.
//
// It never commits, pushes, tags or publishes. A person reviews the pull request: a rate change is a claim
// about the law, so the diff must be checked against the source before the release tags are pushed.
import { readFileSync, writeFileSync, appendFileSync, existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCE_URL, validateSource, validDate, sourceSha256 } from './data-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'data', 'eu-standard-vat-rates.json');
const FILES = {
  nodePkg: join(ROOT, 'node', 'package.json'),
  nodeLock: join(ROOT, 'node', 'package-lock.json'),
  mcpPkg: join(ROOT, 'mcp', 'package.json'),
  mcpLock: join(ROOT, 'mcp', 'package-lock.json'),
  mcpServer: join(ROOT, 'mcp', 'server.json'),
  python: join(ROOT, 'python', 'pyproject.toml'),
  java: join(ROOT, 'java', 'pom.xml'),
  changelog: join(ROOT, 'CHANGELOG.md'),
};

const rateText = (r) => `${r}%`;

/**
 * Plain-English lines describing what differs between two versions of the data: a new window (a rate change),
 * a window whose rate was corrected, and a window that disappeared. Empty when the rates are identical.
 */
export function describeChanges(oldSrc, newSrc) {
  const lines = [];
  const byCode = (src) => new Map(src.countries.map(c => [c.code, c.windows]));
  const before = byCode(oldSrc);
  const after = byCode(newSrc);
  for (const code of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const was = before.get(code) ?? [];
    const now = after.get(code) ?? [];
    const wasByDate = new Map(was.map(w => [w.from, w.rate]));
    const nowByDate = new Map(now.map(w => [w.from, w.rate]));
    now.forEach((w, i) => {
      if (!wasByDate.has(w.from)) {
        const previous = i > 0 ? rateText(now[i - 1].rate) : 'no rate';
        lines.push(`${code}: ${previous} to ${rateText(w.rate)} from ${w.from}`);
      } else if (wasByDate.get(w.from) !== w.rate) {
        lines.push(`${code}: the window starting ${w.from} was corrected, ${rateText(wasByDate.get(w.from))} to ${rateText(w.rate)}`);
      }
    });
    for (const w of was) {
      if (!nowByDate.has(w.from)) lines.push(`${code}: the window starting ${w.from} was removed (it was ${rateText(w.rate)})`);
    }
  }
  return lines;
}

function bump(version, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`cannot bump version "${version}"`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`--bump must be patch or minor, got "${kind}"`);
}

const POM_VERSION = /(<artifactId>eu-vat<\/artifactId>\s*<version>)([^<]+)(<\/version>)/;
const PY_VERSION = /^(version = ")([^"]+)(")/m;

function currentVersions() {
  const lock = JSON.parse(readFileSync(FILES.nodeLock, 'utf-8'));
  return {
    node: JSON.parse(readFileSync(FILES.nodePkg, 'utf-8')).version,
    lock: lock.version,
    lockRoot: lock.packages?.['']?.version,
    mcp: JSON.parse(readFileSync(FILES.mcpPkg, 'utf-8')).version,
    mcpLock: JSON.parse(readFileSync(FILES.mcpLock, 'utf-8')).packages?.['']?.version,
    mcpServer: JSON.parse(readFileSync(FILES.mcpServer, 'utf-8')).version,
    mcpServerPkg: JSON.parse(readFileSync(FILES.mcpServer, 'utf-8')).packages?.[0]?.version,
    python: PY_VERSION.exec(readFileSync(FILES.python, 'utf-8'))?.[2],
    java: POM_VERSION.exec(readFileSync(FILES.java, 'utf-8'))?.[2],
  };
}

function writeVersions(next) {
  // The three libraries are released together from one data source, so they share one version. Edit only the
  // version field of each file, leaving every other byte alone, so the pull request diff stays small.
  const pkg = readFileSync(FILES.nodePkg, 'utf-8');
  writeFileSync(FILES.nodePkg, pkg.replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
  const lock = JSON.parse(readFileSync(FILES.nodeLock, 'utf-8'));
  lock.version = next;
  lock.packages[''].version = next;
  writeFileSync(FILES.nodeLock, JSON.stringify(lock, null, 2) + '\n');
  writeFileSync(FILES.mcpPkg, readFileSync(FILES.mcpPkg, 'utf-8').replace(/("version":\s*")[^"]+(")/, `$1${next}$2`));
  const mcpLock = JSON.parse(readFileSync(FILES.mcpLock, 'utf-8'));
  mcpLock.version = next;
  mcpLock.packages[''].version = next;
  writeFileSync(FILES.mcpLock, JSON.stringify(mcpLock, null, 2) + '\n');
  // The MCP registry entry carries the version twice (the server and its npm package); both move with the package.
  const mcpServer = JSON.parse(readFileSync(FILES.mcpServer, 'utf-8'));
  mcpServer.version = next;
  mcpServer.packages[0].version = next;
  writeFileSync(FILES.mcpServer, JSON.stringify(mcpServer, null, 2) + '\n');
  writeFileSync(FILES.python, readFileSync(FILES.python, 'utf-8').replace(PY_VERSION, `$1${next}$3`));
  writeFileSync(FILES.java, readFileSync(FILES.java, 'utf-8').replace(POM_VERSION, `$1${next}$3`));
}

function addChangelogEntry(version, asOf, lines) {
  const entry = `## ${version} (${asOf})\n\n${lines.map(l => `- ${l}`).join('\n')}\n`;
  const header = '# Changelog\n\nThe rate data in all three libraries (npm, PyPI, Maven) is the same in every release.\n\n';
  const existing = existsSync(FILES.changelog) ? readFileSync(FILES.changelog, 'utf-8') : header;
  const at = existing.search(/^## /m);
  const updated = at === -1 ? `${existing.trimEnd()}\n\n${entry}` : `${existing.slice(0, at)}${entry}\n${existing.slice(at)}`;
  writeFileSync(FILES.changelog, updated);
}

function releaseNotes(version, asOf, lines) {
  return `# VAT rate data update: ${version}\n\n` +
    `The rates published at ${SOURCE_URL} changed (snapshot as of ${asOf}).\n\n` +
    `## What changed\n\n${lines.map(l => `- ${l}`).join('\n')}\n\n` +
    `## Before merging\n\n` +
    `- [ ] Verify each change above against a primary source (the European Commission's TEDB or the national tax authority). A rate change is a claim about the law.\n` +
    `- [ ] CI is green: node, python and java all passed, and all three carry the same source hash.\n\n` +
    `## After merging\n\n` +
    `Nothing is published by merging. To release, push the four tags (each starts its own publish workflow):\n\n` +
    '```\n' +
    `git tag node-v${version} python-v${version} java-v${version} mcp-v${version}\n` +
    `git push origin node-v${version} python-v${version} java-v${version} mcp-v${version}\n` +
    '```\n';
}

function setOutput(pairs) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join(''));
}

async function loadPublished(from) {
  if (from) return JSON.parse(readFileSync(from, 'utf-8'));
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`could not fetch ${SOURCE_URL}: HTTP ${res.status}`);
  return JSON.parse(await res.text());
}

async function main(args) {
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const asOf = opt('--as-of', new Date().toISOString().slice(0, 10));
  const kind = opt('--bump', 'patch');
  if (!validDate(asOf)) throw new Error(`bad as-of date ${asOf}`);

  // Everything that can fail runs BEFORE the first write, so a rejected source leaves the repo exactly as it was.
  const published = await loadPublished(opt('--from'));
  validateSource(published);
  const { snapshotAsOf, ...snapshot } = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'));
  if (sourceSha256(published) === sourceSha256(snapshot)) {
    console.log(`The libraries are up to date with ${SOURCE_URL} (snapshot as of ${snapshotAsOf}). Nothing to release.`);
    setOutput({ changed: 'false' });
    return;
  }

  const versions = currentVersions();
  if (new Set(Object.values(versions)).size !== 1) throw new Error(`the libraries are not on one version: ${JSON.stringify(versions)}`);
  const version = bump(versions.node, kind);
  const lines = describeChanges(snapshot, published);
  if (lines.length === 0) lines.push('Country names or their order changed; no rate changed.');

  writeFileSync(SNAPSHOT, JSON.stringify({ ...published, snapshotAsOf: asOf }, null, 2) + '\n');
  const sync = spawnSync(process.execPath, [join(ROOT, 'scripts', 'sync-data.mjs')], { encoding: 'utf-8' });
  if (sync.status !== 0) throw new Error(`regenerating the libraries failed:\n${sync.stdout}${sync.stderr}`);
  writeVersions(version);
  addChangelogEntry(version, asOf, lines);
  writeFileSync(process.env.RELEASE_NOTES ?? join(ROOT, 'release-notes.md'), releaseNotes(version, asOf, lines));

  console.log(`Prepared ${version}:\n${lines.map(l => `  ${l}`).join('\n')}`);
  setOutput({ changed: 'true', version });
}

// Compare real paths: on macOS a temp folder is reached through the /var -> /private/var symlink, and a plain
// string comparison would then silently run nothing.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
}
