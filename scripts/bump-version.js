#!/usr/bin/env node

/**
 * Version bump utility for Utter
 * Updates version in both package.json and src/manifest.json
 *
 * Usage:
 *   npm run version:patch  - Bump patch version (1.0.0 -> 1.0.1)
 *   npm run version:minor  - Bump minor version (1.0.0 -> 1.1.0)
 *   npm run version:major  - Bump major version (1.0.0 -> 2.0.0)
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const PACKAGE_JSON = join(rootDir, 'package.json');
const MANIFEST_JSON = join(rootDir, 'src', 'manifest.json');

function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpVersion(version, type) {
  const parsed = parseVersion(version);

  switch (type) {
    case 'major':
      return formatVersion({ major: parsed.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatVersion({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
    case 'patch':
      return formatVersion({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
    default:
      throw new Error(`Invalid bump type: ${type}. Use 'major', 'minor', or 'patch'.`);
  }
}

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function main() {
  const bumpType = process.argv[2];

  if (!bumpType || !['major', 'minor', 'patch'].includes(bumpType)) {
    console.error('Usage: node bump-version.js <major|minor|patch>');
    process.exit(1);
  }

  // Read current versions
  const packageJson = readJSON(PACKAGE_JSON);
  const manifestJson = readJSON(MANIFEST_JSON);

  const currentVersion = packageJson.version;
  const newVersion = bumpVersion(currentVersion, bumpType);

  // Verify manifest version matches package.json
  if (manifestJson.version !== currentVersion) {
    console.warn(`Warning: manifest.json version (${manifestJson.version}) differs from package.json (${currentVersion})`);
    console.warn('Both will be updated to the new version.');
  }

  // Update versions
  packageJson.version = newVersion;
  manifestJson.version = newVersion;

  // Write files
  writeJSON(PACKAGE_JSON, packageJson);
  writeJSON(MANIFEST_JSON, manifestJson);

  console.log(`Version bumped: ${currentVersion} -> ${newVersion}`);
  console.log(`  Updated: package.json`);
  console.log(`  Updated: src/manifest.json`);
}

main();
