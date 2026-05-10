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

async function seedTestWallet(page, persistedRoute = '/wallet') {
  await page.evaluate(async (routePath) => {
    const DB_NAME = 'lucem-wallet';
    const STORE_NAME = 'storage';
    await new Promise((resolve) => {
      const deleteReq = indexedDB.deleteDatabase(DB_NAME);
      deleteReq.onsuccess = resolve;
      deleteReq.onerror = resolve;
      deleteReq.onblocked = resolve;
      setTimeout(resolve, 1000);
    });

    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const paymentAddr = 'addr_test1qq02xt0z2e7cyd8dg05zlpclhqnpdx6eektgegdsq7nq0whmnjrwgrd2f8txn9g78zh5futgtyn4ctjekjdu9wdpkk8qcz65ed';
    const rewardAddr = 'stake_test1uraeephypk4yn4nfj50r3t6y7959jf6u9evmfx7zhxsmtrssx6ehu';
    const account = {
      index: 0,
      name: 'Test Wallet',
      avatar: 'stake-test',
      publicKey: '00',
      paymentKeyHash: '1ea32de2567d8234ed43e82f871fb826169b59cd968ca1b007a607ba',
      stakeKeyHash: 'fb9c86e40daa49d669951e38af44f16859275c2e59b49bc2b9a1b58e',
      preview: {
        lovelace: '100000000',
        minAda: '0',
        assets: [],
        history: { confirmed: [], details: {} },
        paymentAddr,
        rewardAddr,
        collateral: null,
        recentSendToAddresses: [],
      },
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ 0: account }, 'accounts');
      store.put(0, 'currentAccount');
      store.put(1, 'acceptedLegalDocsVersion');
      store.put(
        { id: 'preview', node: 'https://preview.koios.rest/api/v1' },
        'network'
      );
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    window.localStorage.setItem(
      '[EasyPeasyStore][0][globalModel]',
      JSON.stringify({
        data: {
          routeStore: { route: routePath },
        },
      })
    );
  }, persistedRoute);
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
