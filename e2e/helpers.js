/**
 * Shared Playwright fixtures for a seeded preview wallet.
 *
 * Send spends via Koios POST /account_utxos (stake-controlled UTxOs), not
 * /address_utxos. A dummy `encryptedKey` is required so getSignableWalletIds
 * is non-empty — otherwise Send always shows “Re-enter your recovery phrase.”
 */

const E2E_PAYMENT_ADDR =
  'addr_test1qq02xt0z2e7cyd8dg05zlpclhqnpdx6eektgegdsq7nq0whmnjrwgrd2f8txn9g78zh5futgtyn4ctjekjdu9wdpkk8qcz65ed';
const E2E_REWARD_ADDR =
  'stake_test1uraeephypk4yn4nfj50r3t6y7959jf6u9evmfx7zhxsmtrssx6ehu';

/** ADA-only row shaped like Koios `/account_utxos` with `_extended: true`. */
const E2E_ACCOUNT_UTXO = {
  tx_hash: 'aa'.repeat(32),
  tx_index: 0,
  output_index: 0,
  address: E2E_PAYMENT_ADDR,
  value: '95000000',
  asset_list: [],
};

function isChainApiUrl(url) {
  return (
    url.includes('koios.rest') ||
    url.includes('/api/koios') ||
    url.includes('blockfrost.io')
  );
}

/**
 * JSON body for a mocked Koios/Blockfrost request. Exported so unit tests can
 * prove `/account_utxos` is stubbed with a spendable ADA UTxO.
 *
 * @param {string} requestUrl
 */
function koiosMockBody(requestUrl) {
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

  let body = [];
  if (requestUrl.includes('/tip') || requestUrl.includes('/blocks/latest')) {
    body = requestUrl.includes('blockfrost')
      ? {
          slot: 1000000,
          height: 500000,
          hash: 'aa'.repeat(32),
          epoch: 100,
          epoch_slot: 5000,
          time: Math.floor(Date.now() / 1000),
        }
      : [{ abs_slot: '1000000', block_height: 500000 }];
  } else if (
    requestUrl.includes('/epoch_params') ||
    requestUrl.includes('/epochs/latest/parameters')
  ) {
    const p = {
      min_fee_a: 44,
      min_fee_b: 155381,
      pool_deposit: '500000000',
      key_deposit: '2000000',
      coins_per_utxo_size: '4310',
      max_val_size: 5000,
      max_tx_size: '16384',
      collateral_percent: 150,
      max_collateral_inputs: 3,
      price_mem: '0.0577',
      price_step: '0.0000721',
    };
    body = requestUrl.includes('blockfrost') ? p : [p];
  } else if (requestUrl.includes('/account_utxos')) {
    body = [E2E_ACCOUNT_UTXO];
  } else if (
    requestUrl.includes('/accounts/') &&
    /\/utxos(\?|$)/.test(requestUrl)
  ) {
    // Blockfrost GET /accounts/{stake}/utxos — must win over /accounts/stake*.
    body = [
      {
        address: E2E_PAYMENT_ADDR,
        tx_hash: E2E_ACCOUNT_UTXO.tx_hash,
        tx_index: 0,
        output_index: 0,
        amount: [{ unit: 'lovelace', quantity: E2E_ACCOUNT_UTXO.value }],
      },
    ];
  } else if (
    requestUrl.includes('/account_info') ||
    requestUrl.includes('/accounts/stake')
  ) {
    body = requestUrl.includes('blockfrost')
      ? {
          active: true,
          pool_id: pool.pool_id_bech32,
          controlled_amount: '100000000',
          withdrawable_amount: '5000000',
        }
      : [
          {
            delegated_pool: pool.pool_id_bech32,
            status: 'registered',
            withdrawable_amount: '5000000',
            controlled_amount: '100000000',
          },
        ];
  } else if (
    requestUrl.includes('/address_utxos') ||
    (requestUrl.includes('/addresses/') && requestUrl.includes('/utxos'))
  ) {
    body = [
      {
        tx_hash: 'aa'.repeat(32),
        tx_index: 0,
        output_index: 0,
        value: '95000000',
        asset_list: [],
        address: E2E_PAYMENT_ADDR,
      },
    ];
  } else if (requestUrl.includes('/address_info')) {
    body = [
      {
        address: E2E_PAYMENT_ADDR,
        balance: '95000000',
        utxo_set: [
          {
            tx_hash: 'aa'.repeat(32),
            output_index: 0,
            value: '95000000',
            asset_list: [],
          },
        ],
      },
    ];
  } else if (
    requestUrl.includes('/account_txs') ||
    (requestUrl.includes('/accounts/') && requestUrl.includes('/transactions'))
  ) {
    body = [{ tx_hash: 'bb'.repeat(32), block_height: 499990 }];
  } else if (
    requestUrl.includes('/address_txs') ||
    (requestUrl.includes('/addresses/') && requestUrl.includes('/transactions'))
  ) {
    body = [{ tx_hash: 'bb'.repeat(32) }];
  } else if (
    requestUrl.includes('/tx_info') ||
    (requestUrl.includes('/txs/') &&
      !requestUrl.includes('/utxos') &&
      !requestUrl.includes('/metadata'))
  ) {
    body = requestUrl.includes('blockfrost')
      ? {
          hash: 'bb'.repeat(32),
          block_height: 499990,
          block_time: Math.floor(Date.now() / 1000) - 3600,
          fees: '170121',
          deposit: '0',
          size: 300,
          index: 0,
          output_amount: [{ unit: 'lovelace', quantity: '5000000' }],
          valid_contract: true,
        }
      : [
          {
            tx_hash: 'bb'.repeat(32),
            block_height: 499990,
            tx_timestamp: Math.floor(Date.now() / 1000) - 3600,
            fee: '170121',
            deposit: '0',
            tx_size: 300,
          },
        ];
  } else if (
    requestUrl.includes('/tx_utxos') ||
    (requestUrl.includes('/txs/') && requestUrl.includes('/utxos'))
  ) {
    const txUtxo = {
      tx_hash: 'bb'.repeat(32),
      inputs: [
        {
          tx_hash: 'aa'.repeat(32),
          tx_index: 0,
          address: E2E_PAYMENT_ADDR,
          value: '100000000',
          asset_list: [],
        },
      ],
      outputs: [
        {
          tx_hash: 'bb'.repeat(32),
          tx_index: 0,
          address: 'addr_test1qexternal',
          value: '5000000',
          asset_list: [],
        },
        {
          tx_hash: 'bb'.repeat(32),
          tx_index: 1,
          address: E2E_PAYMENT_ADDR,
          value: '94829879',
          asset_list: [],
        },
      ],
    };
    body = requestUrl.includes('blockfrost') ? txUtxo : [txUtxo];
  } else if (
    requestUrl.includes('/tx_metadata') ||
    (requestUrl.includes('/txs/') && requestUrl.includes('/metadata'))
  ) {
    body = requestUrl.includes('blockfrost')
      ? []
      : [{ tx_hash: 'bb'.repeat(32), metadata: [] }];
  } else if (requestUrl.includes('/tx_status')) {
    body = [{ tx_hash: 'bb'.repeat(32), num_confirmations: 10 }];
  } else if (
    requestUrl.includes('/pool_list') ||
    requestUrl.match(/\/pools(\?|$)/)
  ) {
    body = [{ pool_id_bech32: pool.pool_id_bech32 }];
  } else if (
    requestUrl.includes('/pool_info') ||
    requestUrl.includes('/pools/pool1')
  ) {
    body = requestUrl.includes('/metadata')
      ? pool.meta_json
      : requestUrl.includes('blockfrost')
        ? pool
        : [pool];
  } else if (requestUrl.includes('/blocks')) {
    body = requestUrl.includes('blockfrost')
      ? {
          hash: 'cc'.repeat(32),
          height: 499990,
          epoch: 100,
          epoch_slot: 4900,
          slot: 999900,
          time: Math.floor(Date.now() / 1000) - 3600,
        }
      : [
          {
            hash: 'cc'.repeat(32),
            block_height: 499990,
            epoch_no: 100,
            epoch_slot: 4900,
            absolute_slot: 999900,
            block_time: Math.floor(Date.now() / 1000) - 3600,
          },
        ];
  }

  return body;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} [persistedRoute]
 * @param {{ signable?: boolean }} [options] `signable: false` omits encryptedKey
 *   (watch-only / restore-seed UX).
 */
async function seedTestWallet(
  page,
  persistedRoute = '/wallet',
  options = {}
) {
  const signable = options.signable !== false;
  await page.evaluate(
    async ({ routePath, writeEncryptedKey, paymentAddr, rewardAddr }) => {
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
        if (writeEncryptedKey) {
          store.put('e2e-dummy-encrypted-key', 'encryptedKey');
        }
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
    },
    {
      routePath: persistedRoute,
      writeEncryptedKey: signable,
      paymentAddr: E2E_PAYMENT_ADDR,
      rewardAddr: E2E_REWARD_ADDR,
    }
  );
}

/** @param {import('@playwright/test').Page} page */
async function mockAllKoios(page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const requestUrl = decodeURIComponent(url);
    if (!isChainApiUrl(url)) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(koiosMockBody(requestUrl)),
    });
  });
}

/**
 * Mock chain APIs, write IndexedDB, then open a route on a fresh document
 * so the web adapter opens a new IDB connection.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [persistedRoute]
 * @param {{ signable?: boolean }} [options]
 */
async function openSeededWallet(page, persistedRoute = '/wallet', options = {}) {
  await mockAllKoios(page);
  await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
  await seedTestWallet(page, persistedRoute, options);
  const dest = persistedRoute === '/wallet' ? '/mainPopup.html' : persistedRoute;
  await page.goto(dest, { waitUntil: 'domcontentloaded' });
}

module.exports = {
  E2E_PAYMENT_ADDR,
  E2E_REWARD_ADDR,
  E2E_ACCOUNT_UTXO,
  isChainApiUrl,
  koiosMockBody,
  seedTestWallet,
  mockAllKoios,
  openSeededWallet,
};
