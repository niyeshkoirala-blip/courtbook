import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Force test env before src/core/config.ts is imported (silent logger,
    // rate limiter disarmed).
    env: { NODE_ENV: 'test' },
    // mongodb-memory-server may download a binary on first run
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
