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

async function mockAllKoios(page) {
  const paymentAddr = 'addr_test1qq02xt0z2e7cyd8dg05zlpclhqnpdx6eektgegdsq7nq0whmnjrwgrd2f8txn9g78zh5futgtyn4ctjekjdu9wdpkk8qcz65ed';
  const pool = {
    pool_id_bech32: 'pool1hodlrtest',
    pool_id_hex: '11'.repeat(28),
    margin: '0.02',
    fixed_cost: '340000000',
    pledge: '1000000000',
    active_stake: '5000000000',
    live_saturation: '0.2',
    block_count: 42,
    meta_json: {
      ticker: 'HODLR',
      name: 'THE HODLR',
      description: 'For long-term holders.',
      homepage: 'https://example.com',
    },
  };

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const requestUrl = decodeURIComponent(url);
    if (!url.includes('koios.rest') && !url.includes('/api/koios') && !url.includes('blockfrost.io')) {
      await route.continue();
      return;
    }

    let body = [];
    if (requestUrl.includes('/tip') || requestUrl.includes('/blocks/latest')) {
      body = requestUrl.includes('blockfrost') ? { slot: 1000000, height: 500000, hash: 'aa'.repeat(32), epoch: 100, epoch_slot: 5000, time: Math.floor(Date.now()/1000) } : [{ abs_slot: '1000000', block_height: 500000 }];
    } else if (requestUrl.includes('/epoch_params') || requestUrl.includes('/epochs/latest/parameters')) {
      const p = { min_fee_a: 44, min_fee_b: 155381, pool_deposit: '500000000', key_deposit: '2000000', coins_per_utxo_size: '4310', max_val_size: 5000, max_tx_size: '16384', collateral_percent: 150, max_collateral_inputs: 3, price_mem: '0.0577', price_step: '0.0000721' };
      body = requestUrl.includes('blockfrost') ? p : [p];
    } else if (requestUrl.includes('/account_info') || requestUrl.includes('/accounts/stake')) {
      body = requestUrl.includes('blockfrost') ? { active: true, pool_id: pool.pool_id_bech32, controlled_amount: '100000000', withdrawable_amount: '5000000' } : [{ delegated_pool: pool.pool_id_bech32, status: 'registered', withdrawable_amount: '5000000', controlled_amount: '100000000' }];
    } else if (requestUrl.includes('/address_utxos') || (requestUrl.includes('/addresses/') && requestUrl.includes('/utxos'))) {
      body = [{ tx_hash: 'aa'.repeat(32), tx_index: 0, output_index: 0, value: '95000000', asset_list: [], address: paymentAddr }];
    } else if (requestUrl.includes('/address_info')) {
      body = [{ address: paymentAddr, balance: '95000000', utxo_set: [{ tx_hash: 'aa'.repeat(32), output_index: 0, value: '95000000', asset_list: [] }] }];
    } else if (requestUrl.includes('/account_txs') || (requestUrl.includes('/accounts/') && requestUrl.includes('/transactions'))) {
      body = [{ tx_hash: 'bb'.repeat(32), block_height: 499990 }];
    } else if (requestUrl.includes('/address_txs') || (requestUrl.includes('/addresses/') && requestUrl.includes('/transactions'))) {
      body = [{ tx_hash: 'bb'.repeat(32) }];
    } else if (requestUrl.includes('/tx_info') || (requestUrl.includes('/txs/') && !requestUrl.includes('/utxos') && !requestUrl.includes('/metadata'))) {
      body = requestUrl.includes('blockfrost') ? { hash: 'bb'.repeat(32), block_height: 499990, block_time: Math.floor(Date.now()/1000) - 3600, fees: '170121', deposit: '0', size: 300, index: 0, output_amount: [{ unit: 'lovelace', quantity: '5000000' }], valid_contract: true } : [{ tx_hash: 'bb'.repeat(32), block_height: 499990, tx_timestamp: Math.floor(Date.now()/1000) - 3600, fee: '170121', deposit: '0', tx_size: 300 }];
    } else if (requestUrl.includes('/tx_utxos') || (requestUrl.includes('/txs/') && requestUrl.includes('/utxos'))) {
      const txUtxo = { tx_hash: 'bb'.repeat(32), inputs: [{ tx_hash: 'aa'.repeat(32), tx_index: 0, address: paymentAddr, value: '100000000', asset_list: [] }], outputs: [{ tx_hash: 'bb'.repeat(32), tx_index: 0, address: 'addr_test1qexternal', value: '5000000', asset_list: [] }, { tx_hash: 'bb'.repeat(32), tx_index: 1, address: paymentAddr, value: '94829879', asset_list: [] }] };
      body = requestUrl.includes('blockfrost') ? txUtxo : [txUtxo];
    } else if (requestUrl.includes('/tx_metadata') || (requestUrl.includes('/txs/') && requestUrl.includes('/metadata'))) {
      body = requestUrl.includes('blockfrost') ? [] : [{ tx_hash: 'bb'.repeat(32), metadata: [] }];
    } else if (requestUrl.includes('/tx_status')) {
      body = [{ tx_hash: 'bb'.repeat(32), num_confirmations: 10 }];
    } else if (requestUrl.includes('/pool_list') || requestUrl.match(/\/pools(\?|$)/)) {
      body = [{ pool_id_bech32: pool.pool_id_bech32 }];
    } else if (requestUrl.includes('/pool_info') || requestUrl.includes('/pools/pool1')) {
      body = requestUrl.includes('/metadata') ? pool.meta_json : requestUrl.includes('blockfrost') ? pool : [pool];
    } else if (requestUrl.includes('/blocks')) {
      body = requestUrl.includes('blockfrost') ? { hash: 'cc'.repeat(32), height: 499990, epoch: 100, epoch_slot: 4900, slot: 999900, time: Math.floor(Date.now()/1000) - 3600 } : [{ hash: 'cc'.repeat(32), block_height: 499990, epoch_no: 100, epoch_slot: 4900, absolute_slot: 999900, block_time: Math.floor(Date.now()/1000) - 3600 }];
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

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
    await page.getByRole('button', { name: /import hw/i }).click();
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

test.describe('capture seeded wallet pages', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('10 wallet home with balance', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/wallet');
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(2000);
    await waitFonts(page);
    await shot(page, '10-wallet-home');
  });

  test('11 wallet — history tab', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/wallet');
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    const historyTab = page.locator('[role="tab"]').nth(3);
    if (await historyTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await historyTab.click();
      await page.waitForTimeout(2000);
    }
    await waitFonts(page);
    await shot(page, '11-wallet-history');
  });

  test('12 send page', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/wallet');
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('wallet-send').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('wallet-send').click();
    await page.waitForTimeout(2000);
    await waitFonts(page);
    await shot(page, '12-send-page');
  });

  test('13 receive / QR', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/wallet');
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('wallet-receive').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByTestId('wallet-receive').click();
    await page.waitForTimeout(1500);
    await waitFonts(page);
    await shot(page, '13-receive-qr');
  });

  test('14 settings page', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/settings');
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(3000);
    await waitFonts(page);
    await shot(page, '14-settings');
  });

  test('15 staking — delegated state', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/staking');
    await page.goto('/staking', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('stake-center-page').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(3000);
    await waitFonts(page);
    await shot(page, '15-staking-delegated');
  });

  test('16 governance page', async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllKoios(page);
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/governance');
    await page.goto('/governance', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(3000);
    await waitFonts(page);
    await shot(page, '16-governance');
  });
});
