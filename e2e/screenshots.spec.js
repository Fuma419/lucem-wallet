/**
 * Headless visual capture for full-page tab / PWA entry HTML.
 *
 * Outputs PNGs under e2e/screenshots/output/ (gitignored). Override dir:
 *   LUCEM_SCREENSHOT_DIR=/tmp/lucem-shots npm run test:screenshots
 *
 * Each shot uses a fresh page so createWalletTab bootstrap (?type=…) is not stale.
 *
 * Requires a production build and Chromium:
 *   LUCEM_SKIP_SERVE=1 npm run build:webpack
 *   npm run test:e2e:install
 *   npm run test:screenshots
 */

const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');

const defaultOut = path.join(__dirname, 'screenshots', 'output');
const OUT_DIR = process.env.LUCEM_SCREENSHOT_DIR || defaultOut;

/** @param {import('@playwright/test').Page} page */
async function waitFonts(page) {
  await page.evaluate(() => document.fonts.ready);
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {{ fullPage?: boolean }} [opts]
 */
async function shot(page, name, opts = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: opts.fullPage !== false,
  });
  // eslint-disable-next-line no-console
  console.log(`Wrote ${file}`);
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.describe('capture static entry UIs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('01 welcome', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
    await page.getByText('Wallet Setup').waitFor({ state: 'visible', timeout: 60_000 });
    await waitFonts(page);
    await shot(page, '01-welcome');
  });

  test('01b welcome — hardware wallet modal', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
    await page.getByText('Wallet Setup').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('button', { name: /hardware wallet/i }).click();
    await page.getByRole('dialog').getByText('Hardware wallet').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await waitFonts(page);
    await shot(page, '01b-welcome-hardware-modal');
  });

  test('02 create wallet — generate', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=generate', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('New Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    await waitFonts(page);
    await shot(page, '02-create-wallet-generate');
  });

  test('03 create wallet — import', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=import&length=24', {
      waitUntil: 'load',
    });
    await page.getByText('Import Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    await waitFonts(page);
    await shot(page, '03-create-wallet-import');
  });

  test('04 HW connect tab', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/hwTab.html', { waitUntil: 'domcontentloaded' });
    await page.getByText('Connect Hardware Wallet').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await waitFonts(page);
    await shot(page, '04-hw-connect');
  });

  test('05 Keystone sign tab shell', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/keystoneTx.html', { waitUntil: 'domcontentloaded' });
    await page
      .getByText(/Preparing Keystone|Missing sign session|Sign session expired/i)
      .first()
      .waitFor({ state: 'visible', timeout: 60_000 });
    await waitFonts(page);
    await shot(page, '05-keystone-tx-tab');
  });
});
