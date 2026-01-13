import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';

const DIST_DIR = 'dist';
const SRC_DIR = 'src';

async function build() {
  // Clean dist directory
  if (existsSync(DIST_DIR)) {
    await rm(DIST_DIR, { recursive: true });
  }
  await mkdir(DIST_DIR);

  // Copy static files
  await cp(`${SRC_DIR}/manifest.json`, `${DIST_DIR}/manifest.json`);

  if (existsSync(`${SRC_DIR}/icons`)) {
    await cp(`${SRC_DIR}/icons`, `${DIST_DIR}/icons`, { recursive: true });
  }

  if (existsSync(`${SRC_DIR}/popup`)) {
    await cp(`${SRC_DIR}/popup`, `${DIST_DIR}/popup`, { recursive: true });
  }

  // Bundle JavaScript files
  const entryPoints = [];

  if (existsSync(`${SRC_DIR}/background.js`)) {
    entryPoints.push(`${SRC_DIR}/background.js`);
  }

  if (existsSync(`${SRC_DIR}/content.js`)) {
    entryPoints.push(`${SRC_DIR}/content.js`);
  }

  if (entryPoints.length > 0) {
    await esbuild.build({
      entryPoints,
      bundle: true,
      outdir: DIST_DIR,
      format: 'esm',
      target: 'esnext',
      minify: false,
    });
  }

  console.log('Build complete: dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
