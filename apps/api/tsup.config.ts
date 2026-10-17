import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Bundle workspace packages (they ship TypeScript source); keep npm dependencies external.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@wes\//],
  // PGlite loads its WASM and extension bundles relative to its own files: never bundle it.
  external: [/^@electric-sql\//, 'postgres', 'drizzle-orm'],
  // Ship database migrations with the bundle (resolved by @wes/db at runtime).
  onSuccess: async () => {
    cpSync('../../packages/db/migrations', 'dist/migrations', { recursive: true });
  },
});
