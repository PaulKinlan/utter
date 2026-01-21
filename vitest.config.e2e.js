import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000,
    hookTimeout: 60000,
    // E2E tests run sequentially to avoid browser conflicts
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
  },
});
