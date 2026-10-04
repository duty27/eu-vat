// Bundles src/server.ts and the Node library it imports (../node/src, data included) into ONE file, dist/server.js.
// Result: the published package needs only the MCP SDK and zod, and its rates are exactly the shared source's
// (the generated node/src/data.ts), never a separately installed copy that could be older.
import { build } from 'esbuild';
import { readFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

await build({
  entryPoints: [join(root, 'src', 'server.ts')],
  outfile: join(root, 'dist', 'server.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  // Keep the real dependencies as normal imports; only our own code and the rate library are inlined.
  external: ['@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk/*', 'zod'],
  define: { PACKAGE_VERSION: JSON.stringify(version) },
  // The #! line comes from src/server.ts itself: esbuild keeps an entry file's own hashbang (adding a banner too would put two).
  legalComments: 'none',
  logLevel: 'warning',
});
chmodSync(join(root, 'dist', 'server.js'), 0o755);
console.log(`Built dist/server.js (version ${version})`);
