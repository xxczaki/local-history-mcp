#!/usr/bin/env node

import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.cjs',
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: [],
  banner: {
    js: '#!/usr/bin/env node\n'
  },
  minify: false,
  sourcemap: false,
  treeShaking: true,
  metafile: false,
  packages: 'bundle'
});
