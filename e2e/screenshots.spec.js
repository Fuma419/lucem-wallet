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
const { test, expect } = require('@playwright/test');
const { openSeededWallet, seedTestWallet } = require('./helpers');

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

/** Assert Cancel is present and scrolled into the shot (card content scrolls). */
async function assertSetupCancelVisible(page) {
  const cancel = page.getByTestId('setup-cancel-button');
  await cancel.waitFor({ state: 'attached', timeout: 15_000 });
  await cancel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
}

async function mockSendKoios(page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const requestUrl = decodeURIComponent(url);
    if (!url.includes('koios.rest') && !url.includes('/api/koios')) {
      await route.continue();
      return;
    }

    let body = [];
    if (requestUrl.includes('/tip')) {
      body = [{ abs_slot: '1000000' }];
    } else if (requestUrl.includes('/epoch_params/latest')) {
      body = [{
        min_fee_a: 44,
        min_fee_b: 155381,
        pool_deposit: '500000000',
        key_deposit: '2000000',
        coins_per_utxo_size: '4310',
        max_val_size: 5000,
        max_tx_size: '16384',
        collateral_percent: 150,
        max_collateral_inputs: 3,
      }];
    } else if (requestUrl.includes('/account_info')) {
      body = [{
        active: false,
        controlled_amount: '100000000',
        rewards_sum: '0',
        withdrawable_amount: '0',
      }];
    } else if (requestUrl.includes('/account_utxos')) {
      body = [];
    } else if (requestUrl.includes('/address_info')) {
      body = [{
        utxo_set: [{
          tx_hash: '22'.repeat(32),
          output_index: 0,
          value: '100000000',
          asset_list: [],
        }],
      }];
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function mockStakeCenterKoios(page) {
  const pool = {
    pool_id_bech32: 'pool1lucemtest',
    pool_id_hex: '11'.repeat(28),
    margin: '0.02',
    fixed_cost: '340000000',
    pledge: '1000000000',
    active_stake: '5000000000',
    live_saturation: '0.2',
    block_count: 12,
    meta_json: {
      ticker: 'LUCEM',
      name: 'Lucem Pool',
      description: 'A test stake pool for functional coverage.',
      homepage: 'https://example.com',
    },
  };

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const requestUrl = decodeURIComponent(url);
    if (!url.includes('koios.rest') && !url.includes('/api/koios')) {
      await route.continue();
      return;
    }

    let body = [];
    if (requestUrl.includes('/tip')) {
      body = [{ abs_slot: '1000000' }];
    } else if (requestUrl.includes('/epoch_params/latest')) {
      body = [{
        min_fee_a: 44,
        min_fee_b: 155381,
        pool_deposit: '500000000',
        key_deposit: '2000000',
        coins_per_utxo_size: '4310',
        max_val_size: 5000,
        max_tx_size: '16384',
        collateral_percent: 150,
        max_collateral_inputs: 3,
      }];
    } else if (requestUrl.includes('/account_info')) {
      body = [];
    } else if (requestUrl.includes('/account_utxos')) {
      body = [];
    } else if (requestUrl.includes('/pool_list')) {
      body = [{ pool_id_bech32: pool.pool_id_bech32 }];
    } else if (requestUrl.includes('/pool_info')) {
      body = [pool];
    } else if (requestUrl.includes('/address_info')) {
      body = [{ utxo_set: [] }];
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.describe('capture static entry UIs', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('00 main popup launches', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await Promise.race([
      page.getByText('Wallet Setup').waitFor({ state: 'visible', timeout: 60_000 }),
      page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 }),
    ]);

    await waitFonts(page);
    await shot(page, '00-main-popup-launch');
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
    await page.getByRole('button', { name: /connect hardware/i }).click();
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
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '02-create-wallet-generate');
  });

  test('02b create wallet — verify', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=generate', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('New Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('checkbox').click({ force: true });
    await page.getByRole('button', { name: /^Next$/i }).click();
    await page.getByText('Verify Seed Phrase').waitFor({ state: 'visible', timeout: 30_000 });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '02b-create-wallet-verify');
  });

  test('02c create wallet — account', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=generate', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('New Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('checkbox').click({ force: true });
    await page.getByRole('button', { name: /^Next$/i }).click();
    await page.getByText('Verify Seed Phrase').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /^Skip$/i }).click();
    await page
      .getByText(/Create Wallet|Restore Wallet|Add Wallet/i)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '02c-create-wallet-account');
  });

  test('03 create wallet — import', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=import&length=24', {
      waitUntil: 'load',
    });
    await page.getByText('Restore Wallet').waitFor({ state: 'visible', timeout: 60_000 });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '03-create-wallet-import');
  });

  test('03b create wallet — import account', async ({ page }) => {
    test.setTimeout(90_000);
    // Valid 12-word BIP-39 phrase (test vector).
    const phrase =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    await page.goto('/createWalletTab.html?type=import&length=12', {
      waitUntil: 'load',
    });
    await page.getByText('Restore Wallet').waitFor({ state: 'visible', timeout: 60_000 });
    await page.locator('#lucem-seed-import-paste').fill(phrase);
    await page.getByRole('button', { name: /^Next$/i }).click();
    await page
      .getByText(/Create Wallet|Restore Wallet|Add Wallet/i)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '03b-create-wallet-import-account');
  });

  test('04 HW connect tab', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/hwTab.html', { waitUntil: 'domcontentloaded' });
    await page.getByText('Connect Hardware Wallet').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '04-hw-connect');
  });

  test('04b HW connect — Keystone selected', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/hwTab.html', { waitUntil: 'domcontentloaded' });
    await page.getByText('Connect Hardware Wallet').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    // Keystone tile is the first device card (logo image inside a button).
    await page.locator('button').filter({ has: page.locator('img') }).first().click();
    await page
      .getByRole('button', { name: /Advanced options/i })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '04b-hw-connect-keystone');
  });

  test('04c HW connect — Keystone step 1 QR', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/hwTab.html', { waitUntil: 'domcontentloaded' });
    await page.getByText('Connect Hardware Wallet').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.locator('button').filter({ has: page.locator('img') }).first().click();
    await page.getByRole('button', { name: /^Continue$/i }).click();
    await page
      .getByText(/Step 1 — Keystone scans Lucem/i)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await assertSetupCancelVisible(page);
    await waitFonts(page);
    await shot(page, '04c-hw-keystone-step1');
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

  test('06 stake center route does not blank', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/staking', { waitUntil: 'domcontentloaded' });

    await Promise.any([
      page.getByTestId('stake-center-page').waitFor({ state: 'visible', timeout: 60_000 }),
      page.getByText('Wallet Setup').waitFor({ state: 'visible', timeout: 60_000 }),
    ]);

    await waitFonts(page);
    await shot(page, '06-stake-center-route');
  });

  test('07 stake center pool selection keeps details on tx failure', async ({ page }) => {
    test.setTimeout(90_000);
    await mockStakeCenterKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/staking');
    await page.goto('/staking', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('stake-center-page').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByRole('button', { name: /LUCEM Lucem Pool/i }).click();

    await page
      .getByTestId('stake-pool-details')
      .getByText('LUCEM', { exact: true })
      .waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page.getByText(/No UTxOs available|Unable to prepare delegation|Staking data is still loading/i).waitFor({
      state: 'visible',
      timeout: 15_000,
    });

    await waitFonts(page);
    await shot(page, '07-stake-center-pool-selection-failure');
  });

  test('08 send page keeps action label when preparation fails', async ({ page }) => {
    test.setTimeout(90_000);
    await mockSendKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('wallet-send').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('wallet-send').click();
    await page.getByTestId('send-page').waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByTestId('send-error-alert').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page
      .getByTestId('send-primary-action')
      .getByText(/Review transaction/i)
      .waitFor({ state: 'visible', timeout: 5_000 });

    await waitFonts(page);
    await shot(page, '08-send-page-preparation-error');
  });
});

test.describe('capture seeded wallet pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('10 wallet home with balance', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(2000);
    await waitFonts(page);
    await shot(page, '10-wallet-home');
  });

  test('11 wallet — history tab', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    const historyTab = page.locator('[role="tab"]').nth(3);
    if (await historyTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(2000);
    }
    await waitFonts(page);
    await shot(page, '11-wallet-history');
  });

  test('12 send page is spendable', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('wallet-send').click();
    await page.getByTestId('send-page').waitFor({ state: 'visible', timeout: 30_000 });

    await expect(page.getByTestId('send-needs-seed-alert')).toHaveCount(0);
    await expect
      .poll(async () => page.getByTestId('send-available-balance').innerText(), {
        timeout: 15_000,
      })
      .toMatch(/Available 100(\.0+)?\s/);
    await expect(page.getByTestId('send-percent-max')).toBeEnabled({
      timeout: 15_000,
    });

    await waitFonts(page);
    await shot(page, '12-send-page');
  });

  test('12b send page — restore seed (sterilized)', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet', { signable: false });

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('wallet-send').click();
    await page.getByTestId('send-page').waitFor({ state: 'visible', timeout: 30_000 });
    await expect(page.getByTestId('send-needs-seed-alert')).toBeVisible({
      timeout: 15_000,
    });

    await waitFonts(page);
    await shot(page, '12b-send-page-needs-seed');
  });

  test('13 receive / QR', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');

    await page.getByTestId('wallet-receive').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('wallet-receive').click();
    await page.waitForTimeout(1500);
    await waitFonts(page);
    await shot(page, '13-receive-qr');
  });

  test('14 settings page', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/settings');

    await page.waitForTimeout(3000);
    await waitFonts(page);
    await shot(page, '14-settings');
  });

  test('14b accounts — display name rename', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/accounts');

    await page.getByTestId('accounts-rename-input').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    // Field must load readonly (Face ID / AutoFill guard).
    await expect
      .poll(async () =>
        page.getByTestId('accounts-rename-input').getAttribute('readonly')
      )
      .not.toBe(null);
    await waitFonts(page);
    await shot(page, '14b-accounts-display-name');
  });

  test('15 staking — delegated state', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/staking');

    await page.getByTestId('stake-center-page').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(3000);
    await waitFonts(page);
    await shot(page, '15-staking-delegated');
  });

  test('16 governance page', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/governance');

    await page.waitForTimeout(3000);
    await waitFonts(page);
    await shot(page, '16-governance');
  });
});
