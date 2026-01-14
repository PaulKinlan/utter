import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js', 'src/**/*.spec.js'],
    exclude: ['node_modules', 'dist'],
  },
});
