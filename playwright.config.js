// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Layout regression tests for the popup UI. They need a production build and an unlocked wallet.
 *
 * Typical local run:
 *   npm run build:webpack
 *   LUCEM_E2E_SERVE=1 npm run test:e2e
 *
 * Or serve `build/` yourself on 4179 and:
 *   LUCEM_E2E_SKIP_SERVE=1 npm run test:e2e
 */
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Pixel 5'] } }],
  use: {
    baseURL: process.env.LUCEM_E2E_BASE_URL || 'http://127.0.0.1:4179',
    trace: 'off',
  },
  webServer:
    process.env.LUCEM_E2E_SKIP_SERVE === '1'
      ? undefined
      : {
          command: 'npx serve build -l 4179',
          url: 'http://127.0.0.1:4179',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
