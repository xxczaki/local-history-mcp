#!/usr/bin/env node

import { build } from 'esbuild';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs',
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: [],
  define: {
    // Inject package version
    '__VERSION__': JSON.stringify(packageJson.version)
  },
  banner: {
    js: '#!/usr/bin/env node\n'
  },
  minify: false,
  sourcemap: false,
  treeShaking: true,
  metafile: false,
  packages: 'bundle'
});
