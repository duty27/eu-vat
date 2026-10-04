// The package is "type": "module", so the CommonJS build needs its own package.json to be read as CommonJS.
import { writeFileSync } from 'node:fs';
writeFileSync('dist/cjs/package.json', '{ "type": "commonjs" }\n');
writeFileSync('dist/esm/package.json', '{ "type": "module" }\n');
