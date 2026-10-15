import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each file spins up its own database; PGlite startup + migrations take a few seconds.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      FIELD_ENCRYPTION_KEY: 'dGVzdC1vbmx5LWZpZWxkLWtleS0zMi1ieXRlcy1vayE=',
      BLIND_INDEX_KEY: 'dGVzdC1vbmx5LWJsaW5kLWlkeC1rZXktMzJieXRlcyE=',
    },
  },
});
