/**
 * Regression: consolidated stake balance + assets.
 *
 * Input is only the payment address. The stake account is identified via
 * `/address_info` (API), then `/account_utxos` aggregates ADA + assets under
 * that stake key — not the payment address alone.
 *
 * Fixture (mainnet):
 *   payment: addr1q9n6mxkrrey8ys6vst9rr9vpt85t92xrpxe9du4al7d33cah4f889p4yrfzz6u84knuqf8vf4vkhph3u5dqnzrgxzngqnjg232
 *   stake key hash: b7aa4e7286a41a442d70f5b4f8049d89ab2d70de3ca341310d0614d0
 */
const fs = require('fs');
const path = require('path');
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

const {
  aggregateKoiosUtxosToAssets,
  stakeAddressFromAddressInfo,
  stakeControlledLovelaceFromAccountInfo,
  summarizeAddressInfo,
} = require('../../../api/extension/stake-balance');
const { KOIOS_REQUESTS } = require('../../../api/koios-endpoints');

const PRIMARY_PAYMENT =
  'addr1q9n6mxkrrey8ys6vst9rr9vpt85t92xrpxe9du4al7d33cah4f889p4yrfzz6u84knuqf8vf4vkhph3u5dqnzrgxzngqnjg232';
/** Stake credential key hash for PRIMARY_PAYMENT (not hard-coded bech32). */
const EXPECTED_STAKE_KEY_HASH =
  'b7aa4e7286a41a442d70f5b4f8049d89ab2d70de3ca341310d0614d0';

const CHANGE_WITH_ASSETS =
  'addr1qyemvyyvcqw99k4kl70esv8rcaz23ysxcj5xl04jc97srdah4f889p4yrfzz6u84knuqf8vf4vkhph3u5dqnzrgxzngq6qk6gj';

const ASSET_XSPO =
  '2654f990d88fa7ca4268ebcd745188cec37202aa74d0dc10c7f81a147873706f3431';
const ASSET_T_MINSWAP =
  '6ac5787a00e1fa8c92436ca641add73365f5a9b3802b595faf0cb871542d4d494e53574150';

const stakeKeyHashFromBech32 = (stakeBech32) => {
  const reward = CSL.RewardAddress.from_address(
    CSL.Address.from_bech32(stakeBech32)
  );
  const cred = reward.payment_cred();
  return Buffer.from(cred.to_keyhash().to_bytes()).toString('hex');
};

const stakeKeyHashFromBaseAddress = (paymentBech32) => {
  const base = CSL.BaseAddress.from_address(
    CSL.Address.from_bech32(paymentBech32)
  );
  return Buffer.from(base.stake_cred().to_keyhash().to_bytes()).toString('hex');
};

/** Snapshot shaped like Koios `/account_utxos` with `_extended: true`. */
const STAKE_UTXOS_EXTENDED = [
  {
    tx_hash: 'aa'.repeat(32),
    tx_index: 0,
    address: PRIMARY_PAYMENT,
    value: '2517884644',
    asset_list: [],
  },
  {
    tx_hash: 'bb'.repeat(32),
    tx_index: 0,
    address: CHANGE_WITH_ASSETS,
    value: '1327480',
    asset_list: [
      {
        policy_id: ASSET_XSPO.slice(0, 56),
        asset_name: ASSET_XSPO.slice(56),
        quantity: '1',
      },
      {
        policy_id: ASSET_T_MINSWAP.slice(0, 56),
        asset_name: ASSET_T_MINSWAP.slice(56),
        quantity: '1',
      },
    ],
  },
  {
    tx_hash: 'cc'.repeat(32),
    tx_index: 1,
    address: CHANGE_WITH_ASSETS,
    value: '17550482348',
    asset_list: [],
  },
];

const STAKE_UTXOS_NOT_EXTENDED = STAKE_UTXOS_EXTENDED.map((u) => ({
  ...u,
  asset_list: null,
}));

const PRIMARY_ONLY_UTXOS = [
  {
    tx_hash: 'aa'.repeat(32),
    tx_index: 0,
    address: PRIMARY_PAYMENT,
    value: '2517884644',
    asset_list: [],
  },
];

const root = path.join(__dirname, '../../..');
const readSrc = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const koiosPost = async (endpoint, body) => {
  const response = await fetch(`https://api.koios.rest/api/v1${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    const err = new Error(`Koios ${response.status}: ${text.slice(0, 200)}`);
    err.koiosStatus = response.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
};

/**
 * True for infrastructure failures (public Koios tier quota / rate limit /
 * network), as opposed to a real assertion regression. The public endpoint has
 * no API key here, so its shared quota can be exhausted (HTTP 429) — that must
 * not fail this deterministic suite. The fixture-based tests above already
 * cover the aggregation logic; the live test is a best-effort chain check.
 */
const isKoiosInfraError = (e) => {
  const status = e && e.koiosStatus;
  if (status === 429 || (status >= 500 && status <= 599)) return true;
  const msg = e && e.message ? String(e.message) : '';
  return /Exceeded Tier Limit|fetch failed|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network/i.test(
    msg
  );
};

describe('stake-consolidated balance (resolve stake from payment address)', () => {
  test('payment address stake credential matches the expected key hash', () => {
    expect(stakeKeyHashFromBaseAddress(PRIMARY_PAYMENT)).toBe(
      EXPECTED_STAKE_KEY_HASH
    );
  });

  test('stakeAddressFromAddressInfo reads stake_address from API rows', () => {
    expect(
      stakeAddressFromAddressInfo([
        {
          address: PRIMARY_PAYMENT,
          stake_address: 'stake1uxm65nnjs6jp53pdwr6mf7qynky6kttsmc72xsf3p5rpf5qvlszan',
        },
      ])
    ).toBe('stake1uxm65nnjs6jp53pdwr6mf7qynky6kttsmc72xsf3p5rpf5qvlszan');

    expect(stakeAddressFromAddressInfo({ stake_addr: 'stake1abc' })).toBe(
      'stake1abc'
    );
    expect(stakeAddressFromAddressInfo([])).toBeNull();
    expect(stakeAddressFromAddressInfo(null)).toBeNull();
  });

  test('primary-address-only total is far below stake-controlled ADA', () => {
    const primary = aggregateKoiosUtxosToAssets(PRIMARY_ONLY_UTXOS);
    const stake = aggregateKoiosUtxosToAssets(STAKE_UTXOS_EXTENDED);
    const primaryAda = BigInt(
      primary.find((a) => a.unit === 'lovelace').quantity
    );
    const stakeAda = BigInt(stake.find((a) => a.unit === 'lovelace').quantity);

    expect(primaryAda).toBe(2517884644n);
    expect(stakeAda).toBe(20069694472n);
    expect(stakeAda > primaryAda * 7n).toBe(true);
  });

  test('stake aggregation includes native assets held on change addresses', () => {
    const stake = aggregateKoiosUtxosToAssets(STAKE_UTXOS_EXTENDED);
    const units = stake.map((a) => a.unit);

    expect(units).toContain(ASSET_XSPO);
    expect(units).toContain(ASSET_T_MINSWAP);
    expect(stake.find((a) => a.unit === ASSET_XSPO).quantity).toBe('1');
    expect(stake.find((a) => a.unit === ASSET_T_MINSWAP).quantity).toBe('1');
  });

  test('non-extended Koios account_utxos drop assets (documents the bug)', () => {
    const broken = aggregateKoiosUtxosToAssets(STAKE_UTXOS_NOT_EXTENDED);
    expect(broken.find((a) => a.unit === 'lovelace').quantity).toBe(
      '20069694472'
    );
    expect(broken.some((a) => a.unit === ASSET_XSPO)).toBe(false);
    expect(broken.some((a) => a.unit === ASSET_T_MINSWAP)).toBe(false);
  });

  test('account_info helpers accept Koios total_balance/utxo and Blockfrost controlled_amount', () => {
    expect(
      stakeControlledLovelaceFromAccountInfo({
        utxo: '20069694472',
        total_balance: '20069694472',
        rewards_available: '0',
      })
    ).toBe('20069694472');

    expect(
      stakeControlledLovelaceFromAccountInfo({
        controlled_amount: '20069694472',
        withdrawable_amount: '0',
      })
    ).toBe('20069694472');
  });

  test('summarizeAddressInfo reports ADA, UTxO count, and native asset units', () => {
    const summary = summarizeAddressInfo({
      address: PRIMARY_PAYMENT,
      balance: '5000000',
      utxo_set: [
        {
          value: '3000000',
          asset_list: [
            { policy_id: 'aa', asset_name: '01', quantity: '1' },
            { policy_id: 'bb', asset_name: '02', quantity: '2' },
          ],
        },
        {
          value: '2000000',
          asset_list: [{ policy_id: 'aa', asset_name: '01', quantity: '3' }],
        },
      ],
    });
    expect(summary.lovelace).toBe('5000000');
    expect(summary.utxoCount).toBe(2);
    expect(summary.nativeAssetCount).toBe(2);
  });

  test('wallet resolves stake via address_info and uses extended account_utxos', () => {
    const src = readSrc('api/extension/index.js');
    expect(src).toMatch(/resolveStakeAddressFromPaymentAddress/);
    expect(src).toMatch(/getAccountStakeAddress/);
    expect(src).toMatch(/stakeAddressFromAddressInfo/);
    expect(src).toMatch(/getAddressInfo\(paymentAddr\)/);

    const accountUtxoCalls = [
      ...src.matchAll(/getAccountUtxos\(\s*([^)]*)\s*\)/g),
    ].map((m) => m[1].replace(/\s+/g, ' '));
    expect(accountUtxoCalls.length).toBeGreaterThan(0);
    for (const args of accountUtxoCalls) {
      expect(args).toMatch(/true/);
    }
  });

  test(
    'live: address_info → stake key → consolidated ADA/assets exceed primary',
    async () => {
      const infoReq = KOIOS_REQUESTS.getAddressInfo(PRIMARY_PAYMENT);
      expect(infoReq.endpoint).toBe('/address_info');
      expect(infoReq.body).toEqual({ _addresses: [PRIMARY_PAYMENT] });

      try {
        const info = await koiosPost(infoReq.endpoint, infoReq.body);
        const stakeAddress = stakeAddressFromAddressInfo(info);
        expect(stakeAddress).toMatch(/^stake1/);
        expect(stakeKeyHashFromBech32(stakeAddress)).toBe(
          EXPECTED_STAKE_KEY_HASH
        );

        const stakeReq = KOIOS_REQUESTS.getAccountUtxos(stakeAddress, true);
        expect(stakeReq.body._extended).toBe(true);
        const stakeUtxos = await koiosPost(stakeReq.endpoint, stakeReq.body);
        const stakeAssets = aggregateKoiosUtxosToAssets(stakeUtxos);

        const primaryReq = KOIOS_REQUESTS.getAddressesUtxos(
          [PRIMARY_PAYMENT],
          true
        );
        const primaryUtxos = await koiosPost(
          primaryReq.endpoint,
          primaryReq.body
        );
        const primaryAssets = aggregateKoiosUtxosToAssets(primaryUtxos);

        const stakeAda = BigInt(
          stakeAssets.find((a) => a.unit === 'lovelace').quantity
        );
        const primaryAda = BigInt(
          primaryAssets.find((a) => a.unit === 'lovelace').quantity
        );

        expect(stakeAda).toBeGreaterThan(primaryAda * 7n);
        expect(stakeAssets.length).toBeGreaterThan(primaryAssets.length);
        expect(stakeAssets.some((a) => a.unit === ASSET_XSPO)).toBe(true);
        expect(stakeAssets.some((a) => a.unit === ASSET_T_MINSWAP)).toBe(true);
      } catch (e) {
        // Public Koios has no API key here; a shared-tier 429 (or network
        // blip) must not fail this deterministic suite and block PRs. Skip on
        // infra errors; re-throw genuine assertion/logic regressions.
        if (isKoiosInfraError(e)) {
          console.warn(
            `Skipping live Koios stake check (infra): ${e.message}`
          );
          return;
        }
        throw e;
      }
    },
    60000
  );
});
