import { cpSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@wes\//],
  external: [/^@electric-sql\//, 'postgres', 'drizzle-orm'],
  onSuccess: async () => {
    cpSync('../../packages/db/migrations', 'dist/migrations', { recursive: true });
  },
});
