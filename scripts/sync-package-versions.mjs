// Keep the workspace packages and the Cursor plugin manifest on the same
// version as the root package.json (the monorepo releases in lockstep).
// A release that bumps only part of the set ships mismatched versions to
// npm and the plugin manager.
//
//   node scripts/sync-package-versions.mjs          # write from root package.json
//   node scripts/sync-package-versions.mjs --check  # exit 1 if anything drifted
//
// Wired into: `npm version` at the root (sync + stage) and
// scripts/prepare-publish.sh (check, runs on every prepack).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const targets = [
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/mcp/package.json',
  'plugin/.cursor-plugin/plugin.json',
];

let drifted = false;
for (const rel of targets) {
  const path = join(ROOT, rel);
  const json = JSON.parse(readFileSync(path, 'utf8'));

  // Internal workspace deps are pinned exact; a stale pin makes npm resolve
  // the REGISTRY tarball instead of the workspace link, so CI builds against
  // the previous release (bit us in v0.2.11: TS2305 on fresh core exports).
  const internalDeps = [];
  for (const section of ['dependencies', 'devDependencies']) {
    for (const dep of Object.keys(json[section] ?? {})) {
      if ((dep === 'cursor-translate' || dep.startsWith('@cursor-translate/')) && json[section][dep] !== version) {
        internalDeps.push({ section, dep });
      }
    }
  }

  if (json.version === version && internalDeps.length === 0) {
    continue;
  }
  drifted = true;
  if (check) {
    if (json.version !== version) {
      console.error(`${rel}: ${json.version} drifted from root package.json (${version})`);
    }
    for (const { section, dep } of internalDeps) {
      console.error(`${rel}: ${section}.${dep} pinned to ${json[section][dep]}, expected ${version}`);
    }
  } else {
    json.version = version;
    for (const { section, dep } of internalDeps) {
      json[section][dep] = version;
    }
    writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`${rel}: synced to ${version}${internalDeps.length ? ` (+${internalDeps.length} internal dep pins)` : ''}`);
  }
}

if (check && drifted) {
  console.error('Run `node scripts/sync-package-versions.mjs` (or `npm version …` at the root) and commit.');
  process.exit(1);
}
