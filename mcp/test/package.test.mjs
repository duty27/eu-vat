import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { MCP_DIR } from './helpers.mjs';

const shaOf = (text, name) => text.match(new RegExp(`${name}\\s*=\\s*"([0-9a-f]{64})"`))?.[1];

test('the bundle carries the SAME rate data as the three libraries (same source hash)', () => {
  const bundle = readFileSync(join(MCP_DIR, 'dist', 'server.js'), 'utf-8');
  const fromBundle = shaOf(bundle, 'DATA_SOURCE_SHA256');
  const fromNode = shaOf(readFileSync(join(MCP_DIR, '..', 'node', 'src', 'data.ts'), 'utf-8'), 'DATA_SOURCE_SHA256');
  assert.ok(fromBundle, 'no source hash found in dist/server.js');
  assert.strictEqual(fromBundle, fromNode);
});

test('the bin is a runnable script and the package ships only what it should', () => {
  const server = join(MCP_DIR, 'dist', 'server.js');
  assert.match(readFileSync(server, 'utf-8').split('\n')[0], /^#!\/usr\/bin\/env node/);
  assert.ok(statSync(server).mode & 0o111, 'dist/server.js must be executable');
  // npm 11 prints a list, npm 12 an object keyed by package name.
  const packed = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: MCP_DIR, encoding: 'utf-8' }));
  const pack = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
  const files = pack.files.map(f => f.path).sort();
  assert.ok(files.includes('dist/server.js') && files.includes('package.json') && files.includes('README.md') && files.includes('LICENSE') && files.includes('DATA-LICENSE.md'), files.join(', '));
  assert.deepStrictEqual(files.filter(f => /^(src|test|scripts)\//.test(f) || f.endsWith('.map') || f.includes('node_modules')), []);
});

test('the only runtime dependencies are the MCP SDK and zod, so the library is bundled, not required', () => {
  const pkg = JSON.parse(readFileSync(join(MCP_DIR, 'package.json'), 'utf-8'));
  assert.deepStrictEqual(Object.keys(pkg.dependencies).sort(), ['@modelcontextprotocol/sdk', 'zod']);
});

test('server.json (the MCP registry entry) names this package and matches its version and mcpName', () => {
  const pkg = JSON.parse(readFileSync(join(MCP_DIR, 'package.json'), 'utf-8'));
  const server = JSON.parse(readFileSync(join(MCP_DIR, 'server.json'), 'utf-8'));
  assert.strictEqual(server.name, pkg.mcpName);
  assert.match(server.name, /^io\.github\.duty27\//);
  assert.strictEqual(server.version, pkg.version);
  assert.strictEqual(server.packages.length, 1);
  assert.deepStrictEqual(
    { registryType: server.packages[0].registryType, identifier: server.packages[0].identifier, version: server.packages[0].version, transport: server.packages[0].transport },
    { registryType: 'npm', identifier: pkg.name, version: pkg.version, transport: { type: 'stdio' } });
  assert.ok(server.description.length <= 100, `description is ${server.description.length} characters`);
});
