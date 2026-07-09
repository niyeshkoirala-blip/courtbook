import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (blueprint §11). Runs against a locally-running stack
 * (docker compose + dev:server + dev:client) with seed data loaded:
 *   docker compose up -d && npm run seed
 *   npm run dev:server &  npm run dev:client &
 *   npm run e2e
 * Kept out of GitHub CI (which has no mongo/mailhog) — it's a local/manual
 * release gate, listed in docs/runbooks/launch.md.
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false, // shared seed DB — serialize to keep slot state sane
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
