import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Definition of done (CLAUDE.md §8): at least 80% coverage for the agent pipeline.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text-summary'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
