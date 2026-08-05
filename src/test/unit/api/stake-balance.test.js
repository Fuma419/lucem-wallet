/**
 * Regression: consolidated stake balance + assets for a real mainnet account
 * where the primary payment address holds only ~2.5k ADA and native assets
 * live on a change address under the same stake key.
 *
 * Fixture addresses (mainnet):
 *   payment: addr1q9n6mxkrrey8ys6vst9rr9vpt85t92xrpxe9du4al7d33cah4f889p4yrfzz6u84knuqf8vf4vkhph3u5dqnzrgxzngqnjg232
 *   stake:   stake1uxm65nnjs6jp53pdwr6mf7qynky6kttsmc72xsf3p5rpf5qvlszan
 */
const fs = require('fs');
const path = require('path');

const {
  aggregateKoiosUtxosToAssets,
  stakeControlledLovelaceFromAccountInfo,
} = require('../../../api/extension/stake-balance');

const PRIMARY_PAYMENT =
  'addr1q9n6mxkrrey8ys6vst9rr9vpt85t92xrpxe9du4al7d33cah4f889p4yrfzz6u84knuqf8vf4vkhph3u5dqnzrgxzngqnjg232';
const STAKE =
  'stake1uxm65nnjs6jp53pdwr6mf7qynky6kttsmc72xsf3p5rpf5qvlszan';
const CHANGE_WITH_ASSETS =
  'addr1qyemvyyvcqw99k4kl70esv8rcaz23ysxcj5xl04jc97srdah4f889p4yrfzz6u84knuqf8vf4vkhph3u5dqnzrgxzngq6qk6gj';

const ASSET_XSPO =
  '2654f990d88fa7ca4268ebcd745188cec37202aa74d0dc10c7f81a147873706f3431';
const ASSET_T_MINSWAP =
  '6ac5787a00e1fa8c92436ca641add73365f5a9b3802b595faf0cb871542d4d494e53574150';

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

/** Same rows as Koios returns when `_extended` is omitted/false (`asset_list: null`). */
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

describe('stake-consolidated balance (addr1q9n6… / stake1uxm65…)', () => {
  test('primary-address-only total is far below stake-controlled ADA', () => {
    const primary = aggregateKoiosUtxosToAssets(PRIMARY_ONLY_UTXOS);
    const stake = aggregateKoiosUtxosToAssets(STAKE_UTXOS_EXTENDED);
    const primaryAda = BigInt(primary.find((a) => a.unit === 'lovelace').quantity);
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
        stake_address: STAKE,
        utxo: '20069694472',
        total_balance: '20069694472',
        rewards_available: '0',
      })
    ).toBe('20069694472');

    expect(
      stakeControlledLovelaceFromAccountInfo({
        stake_address: STAKE,
        controlled_amount: '20069694472',
        withdrawable_amount: '0',
      })
    ).toBe('20069694472');
  });

  test('balance and UTxO fetchers request extended account_utxos', () => {
    const src = readSrc('api/extension/index.js');
    // Wallet total (assets + ADA)
    expect(src).toMatch(
      /getAccountUtxos\(\s*stakeAddress\s*,\s*true\s*\)/
    );
    // CIP-30 getBalance and spendable getUtxos must not omit asset_list
    expect(src).toMatch(
      /getAccountUtxos\(\s*stakeAddress\s*,\s*true\s*\)/g
    );
    const accountUtxoCalls = [
      ...src.matchAll(/getAccountUtxos\(\s*([^)]*)\s*\)/g),
    ].map((m) => m[1].replace(/\s+/g, ' '));
    // Every stake UTxO fetch in index.js should pass true (extended)
    for (const args of accountUtxoCalls) {
      expect(args).toMatch(/true/);
    }
  });

  test('getBalanceExtended prefers stake path over payment addresses', () => {
    const src = readSrc('api/extension/index.js');
    expect(src).toMatch(/balance-extended-stake/);
    expect(src).toMatch(/fetchBalanceFromStake/);
    expect(src).toMatch(/aggregateKoiosUtxosToAssets/);
  });
});
