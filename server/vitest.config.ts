import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Force test env before src/core/config.ts is imported (silent logger,
    // rate limiter disarmed).
    env: {
      NODE_ENV: 'test',
      // fake Cloudinary creds so the photo-signing path is testable
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      CLOUDINARY_API_KEY: 'test-key',
      CLOUDINARY_API_SECRET: 'test-secret',
    },
    // mongodb-memory-server may download a binary on first run
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
