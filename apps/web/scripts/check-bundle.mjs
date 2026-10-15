// Fails the build if first-load JavaScript for any route exceeds the budget (CLAUDE.md §6).
// Reads Next.js build manifests and gzips each file, so it matches what a phone downloads.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 170);
const next = join(process.cwd(), '.next');

if (!existsSync(join(next, 'build-manifest.json'))) {
  console.error('No .next build found. Run `pnpm build` first.');
  process.exit(1);
}

const build = JSON.parse(readFileSync(join(next, 'build-manifest.json'), 'utf8'));
const appManifestPath = join(next, 'app-build-manifest.json');
const app = existsSync(appManifestPath) ? JSON.parse(readFileSync(appManifestPath, 'utf8')) : { pages: {} };

const sizeCache = new Map();
const gz = (file) => {
  if (!sizeCache.has(file)) sizeCache.set(file, gzipSync(readFileSync(join(next, file))).length);
  return sizeCache.get(file);
};

const shared = [...new Set([...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])])].filter((f) =>
  f.endsWith('.js'),
);
// Polyfills load only on legacy browsers (nomodule); exclude them from the modern budget.
const modernShared = shared.filter((f) => !(build.polyfillFiles ?? []).includes(f));

let failed = false;
const rows = [];
for (const [route, files] of Object.entries(app.pages)) {
  if (!route.endsWith('/page')) continue;
  const all = [...new Set([...modernShared, ...files.filter((f) => f.endsWith('.js'))])];
  const kb = all.reduce((sum, f) => sum + gz(f), 0) / 1024;
  rows.push([route.replace(/\/page$/, '') || '/', kb]);
  if (kb > BUDGET_KB) failed = true;
}

rows.sort((a, b) => b[1] - a[1]);
console.info(`First-load JS (gzip), budget ${BUDGET_KB} KB:`);
for (const [route, kb] of rows) {
  console.info(`  ${kb > BUDGET_KB ? '✗' : '✓'} ${route.padEnd(24)} ${kb.toFixed(1)} KB`);
}
if (failed) {
  console.error(`\nOver budget. Lazy-load heavy code or move it to the server.`);
  process.exit(1);
}
