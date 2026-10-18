import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each file starts its own embedded Postgres; running them in parallel thrashes the CPU.
    fileParallelism: false,
    testTimeout: 60_000,
    // Definition of done (CLAUDE.md §8): at least 80% coverage for domain services.
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/platform/**'],
      reporter: ['text-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
    hookTimeout: 120_000,
    env: {
      FIELD_ENCRYPTION_KEY: 'dGVzdC1vbmx5LWZpZWxkLWtleS0zMi1ieXRlcy1vayE=',
      BLIND_INDEX_KEY: 'dGVzdC1vbmx5LWJsaW5kLWlkeC1rZXktMzJieXRlcyE=',
    },
  },
});
