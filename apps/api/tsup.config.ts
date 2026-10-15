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
});
