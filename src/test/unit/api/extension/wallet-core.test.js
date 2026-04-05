/**
 * Unit tests for wallet core functions that do NOT depend on WASM.
 * Mocks the WASM loader so the import chain resolves cleanly.
 */

// Mock the WASM modules and ESM-only deps before any imports
jest.mock('@emurgo/cardano-serialization-lib-browser', () => ({}));
jest.mock(
  '../../../../wasm/cardano_message_signing/cardano_message_signing.generated',
  () => ({ instantiate: jest.fn() })
);
jest.mock('../../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: jest.fn(),
    Cardano: {},
    Message: {},
  },
}));
jest.mock('../../../../api/extension/wallet', () => ({
  initTx: jest.fn(),
}));
jest.mock('@dicebear/collection', () => ({ shapes: {} }));
jest.mock('@dicebear/avatars', () => ({
  createAvatar: jest.fn(() => '<svg></svg>'),
}));
jest.mock('@dicebear/core', () => ({}));
jest.mock('bip39', () => ({
  mnemonicToEntropy: jest.fn(),
  generateMnemonic: jest.fn(),
  validateMnemonic: jest.fn(),
}));
jest.mock('crypto-random-string', () => jest.fn(() => 'deadbeef'));
jest.mock('../../../../platform', () => ({
  __esModule: true,
  default: {
    storage: {
      get: (key) =>
        new Promise((res) =>
          global.chrome.storage.local.get(key, (result) =>
            res(key ? result[key] : result)
          )
        ),
      set: (item) =>
        new Promise((res) =>
          global.chrome.storage.local.set(item, () => res())
        ),
      remove: (key) =>
        new Promise((res) => {
          delete global.mockStore[key];
          res();
        }),
      clear: () =>
        new Promise((res) => {
          global.chrome.storage.local.clear();
          res();
        }),
    },
    navigation: {
      createPopup: jest.fn(),
      createTab: jest.fn(),
    },
    icons: {
      getFaviconUrl: jest.fn((url) => url),
    },
    events: {
      broadcastToTabs: jest.fn(),
    },
  },
}));
jest.mock('../../../../api/util', () => ({
  koiosRequest: jest.fn(),
  koiosRequestEnhanced: jest.fn(),
  networkNameToId: jest.fn(),
  utxoFromJson: jest.fn(),
  assetsToValue: jest.fn(),
  txToLedger: jest.fn(),
  txToTrezor: jest.fn(),
  txToKeystone: jest.fn(),
  valueToAssets: jest.fn(),
}));

import {
  getStorage,
  setStorage,
  removeStorage,
  getWhitelisted,
  isWhitelisted,
  setWhitelisted,
  removeWhitelisted,
  getCurrency,
  setCurrency,
  getNetwork,
  setNetwork,
  getCurrentAccountIndex,
  switchAccount,
  deleteAccount,
  setAccountName,
  setAccountAvatar,
  getNativeAccounts,
  isHW,
  indexToHw,
  keystoneImportRowKey,
  getHwAccounts,
  displayUnit,
  toUnit,
  mnemonicToObject,
  mnemonicFromObject,
  bytesAddressToBinary,
  setCollateral,
  removeCollateral,
  setTransactions,
  updateRecentSentToAddress,
} from '../../../../api/extension';
import { ERROR, NETWORK_ID, NODE, STORAGE } from '../../../../config/config';

// ── helpers ──────────────────────────────────────────────────────────
const SEED_ACCOUNT = (index = 0, name = 'TestWallet') => ({
  index,
  name,
  avatar: 'abc123',
  publicKey: 'deadbeef',
  paymentKeyHash: 'aabb',
  paymentKeyHashBech32: 'addr_vkh1aabb',
  stakeKeyHash: 'ccdd',
  [NETWORK_ID.mainnet]: {
    lovelace: null,
    minAda: 0,
    assets: [],
    history: { confirmed: [], details: {} },
    paymentAddr: 'addr1_mainnet_test',
    rewardAddr: 'stake1_mainnet_test',
  },
  [NETWORK_ID.testnet]: {
    lovelace: null,
    minAda: 0,
    assets: [],
    history: { confirmed: [], details: {} },
    paymentAddr: 'addr_test1_testnet',
    rewardAddr: 'stake_test1_testnet',
  },
  [NETWORK_ID.preview]: {
    lovelace: null,
    minAda: 0,
    assets: [],
    history: { confirmed: [], details: {} },
    paymentAddr: 'addr_test1_preview',
    rewardAddr: 'stake_test1_preview',
  },
  [NETWORK_ID.preprod]: {
    lovelace: null,
    minAda: 0,
    assets: [],
    history: { confirmed: [], details: {} },
    paymentAddr: 'addr_test1_preprod',
    rewardAddr: 'stake_test1_preprod',
  },
});

const seedWalletState = async () => {
  global.mockStore = {};
  await setStorage({
    [STORAGE.accounts]: { 0: SEED_ACCOUNT(0) },
    [STORAGE.currentAccount]: 0,
    [STORAGE.network]: { id: NETWORK_ID.mainnet, node: NODE.mainnet },
    [STORAGE.encryptedKey]: 'encrypted_dummy_key',
    [STORAGE.currency]: 'usd',
  });
};

// ── Pure function tests ──────────────────────────────────────────────

describe('displayUnit', () => {
  test('converts lovelace to ADA (6 decimals)', () => {
    expect(displayUnit(1000000)).toBe(1);
    expect(displayUnit(2500000)).toBe(2.5);
    expect(displayUnit(0)).toBe(0);
  });

  test('supports custom decimal places', () => {
    expect(displayUnit(100, 2)).toBe(1);
    expect(displayUnit(1000, 3)).toBe(1);
  });
});

describe('toUnit', () => {
  test('converts ADA string to lovelace string', () => {
    expect(toUnit('1')).toBe('1000000');
    expect(toUnit('2.5')).toBe('2500000');
  });

  test('handles zero and falsy values', () => {
    expect(toUnit(0)).toBe('0');
    expect(toUnit('')).toBe('0');
    expect(toUnit(null)).toBe('0');
    expect(toUnit(undefined)).toBe('0');
  });

  test('strips commas and spaces', () => {
    expect(toUnit('1,000')).toBe('1000000000');
  });

  test('returns 0 for NaN input', () => {
    expect(toUnit('not_a_number')).toBe('0');
  });
});

describe('mnemonicToObject / mnemonicFromObject', () => {
  const mnemonic =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  test('converts mnemonic string to indexed object', () => {
    const obj = mnemonicToObject(mnemonic);
    expect(obj[1]).toBe('abandon');
    expect(obj[12]).toBe('about');
    expect(Object.keys(obj).length).toBe(12);
  });

  test('converts indexed object back to mnemonic string', () => {
    const obj = mnemonicToObject(mnemonic);
    expect(mnemonicFromObject(obj)).toBe(mnemonic);
  });

  test('round-trips 24-word mnemonic', () => {
    const longMnemonic =
      'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo vote';
    expect(mnemonicFromObject(mnemonicToObject(longMnemonic))).toBe(
      longMnemonic
    );
  });
});

describe('bytesAddressToBinary', () => {
  test('converts byte array to binary string', () => {
    const bytes = new Uint8Array([0xff, 0x00, 0x0a]);
    expect(bytesAddressToBinary(bytes)).toBe('111111110000000000001010');
  });

  test('handles empty array', () => {
    expect(bytesAddressToBinary(new Uint8Array([]))).toBe('');
  });

  test('handles single byte', () => {
    expect(bytesAddressToBinary(new Uint8Array([0x01]))).toBe('00000001');
  });
});

describe('isHW', () => {
  test('returns true for ledger account index', () => {
    expect(isHW('ledger-abc-0')).toBe(true);
  });

  test('returns true for trezor account index', () => {
    expect(isHW('trezor-xyz-1')).toBe(true);
  });

  test('returns true for keystone account index', () => {
    expect(isHW('keystone-a1b2c3d4-0')).toBe(true);
  });

  test('returns false for native numeric index', () => {
    expect(isHW(0)).toBe(false);
    expect(isHW(1)).toBe(false);
  });

  test('returns false for null/undefined', () => {
    expect(isHW(null)).toBe(false);
    expect(isHW(undefined)).toBe(false);
  });
});

describe('indexToHw', () => {
  test('parses ledger account index', () => {
    const hw = indexToHw('ledger-abc123-2');
    expect(hw.device).toBe('ledger');
    expect(hw.id).toBe('abc123');
    expect(hw.account).toBe(2);
  });

  test('parses trezor account index', () => {
    const hw = indexToHw('trezor-xyz-0');
    expect(hw.device).toBe('trezor');
    expect(hw.id).toBe('xyz');
    expect(hw.account).toBe(0);
  });

  test('parses keystone account index', () => {
    const hw = indexToHw('keystone-deadbeef-3');
    expect(hw.device).toBe('keystone');
    expect(hw.id).toBe('deadbeef');
    expect(hw.account).toBe(3);
    expect(hw.keystoneDerivation).toBeUndefined();
  });

  test('parses keystone account index with Ledger derivation suffix', () => {
    const hw = indexToHw('keystone-deadbeef-3-vledger');
    expect(hw.device).toBe('keystone');
    expect(hw.id).toBe('deadbeef');
    expect(hw.account).toBe(3);
    expect(hw.keystoneDerivation).toBe('ledger');
  });
});

describe('keystoneImportRowKey', () => {
  test('maps Keystone storage index to import row key', () => {
    expect(keystoneImportRowKey('keystone-abcd1234-1')).toBe('1-standard');
    expect(keystoneImportRowKey('keystone-abcd1234-1-vledger')).toBe(
      '1-ledger'
    );
  });
});

describe('getNativeAccounts', () => {
  test('filters out hardware wallet accounts', () => {
    const accounts = {
      0: { name: 'Native1' },
      1: { name: 'Native2' },
      'ledger-abc-0': { name: 'Ledger1' },
      'keystone-deadbeef-0': { name: 'Ks1' },
    };
    const native = getNativeAccounts(accounts);
    expect(Object.keys(native)).toEqual(['0', '1']);
    expect(native['ledger-abc-0']).toBeUndefined();
    expect(native['keystone-deadbeef-0']).toBeUndefined();
  });

  test('returns all accounts when none are HW', () => {
    const accounts = { 0: { name: 'A' }, 1: { name: 'B' } };
    expect(Object.keys(getNativeAccounts(accounts)).length).toBe(2);
  });

  test('returns empty object when all are HW', () => {
    const accounts = { 'ledger-a-0': { name: 'L1' } };
    expect(Object.keys(getNativeAccounts(accounts)).length).toBe(0);
  });

  test('returns empty object when accounts is null or undefined', () => {
    expect(getNativeAccounts(undefined)).toEqual({});
    expect(getNativeAccounts(null)).toEqual({});
  });
});

describe('getHwAccounts', () => {
  test('filters accounts by device and id', () => {
    const accounts = {
      0: { name: 'Native' },
      'ledger-abc-0': { name: 'L1' },
      'ledger-abc-1': { name: 'L2' },
      'ledger-xyz-0': { name: 'L3' },
      'trezor-abc-0': { name: 'T1' },
    };
    const result = getHwAccounts(accounts, { device: 'ledger', id: 'abc' });
    expect(Object.keys(result)).toEqual(['ledger-abc-0', 'ledger-abc-1']);
  });

  test('returns empty object when no match', () => {
    const accounts = { 0: { name: 'Native' } };
    const result = getHwAccounts(accounts, { device: 'ledger', id: 'nope' });
    expect(Object.keys(result).length).toBe(0);
  });

  test('returns empty object when accounts storage is missing', () => {
    expect(getHwAccounts(undefined, { device: 'ledger', id: 'abc' })).toEqual(
      {}
    );
    expect(getHwAccounts(null, { device: 'keystone', id: 'x' })).toEqual({});
  });
});

// ── Storage-backed function tests ────────────────────────────────────

describe('getStorage / setStorage / removeStorage', () => {
  beforeEach(() => {
    global.mockStore = {};
  });

  test('setStorage stores and getStorage retrieves a value', async () => {
    await setStorage({ testKey: 'testValue' });
    const val = await getStorage('testKey');
    expect(val).toBe('testValue');
  });

  test('getStorage without key returns all storage', async () => {
    await setStorage({ a: 1, b: 2 });
    const all = await getStorage();
    expect(all.a).toBe(1);
    expect(all.b).toBe(2);
  });

  test('removeStorage deletes a key', async () => {
    await setStorage({ removeMe: 'value' });
    await removeStorage('removeMe');
    const val = await getStorage('removeMe');
    expect(val).toBeUndefined();
  });

  test('setStorage merges with existing data', async () => {
    await setStorage({ keep: 'yes' });
    await setStorage({ add: 'new' });
    expect(await getStorage('keep')).toBe('yes');
    expect(await getStorage('add')).toBe('new');
  });
});

describe('Whitelist management', () => {
  beforeEach(() => {
    global.mockStore = {};
  });

  test('getWhitelisted returns empty array when none set', async () => {
    expect(await getWhitelisted()).toEqual([]);
  });

  test('setWhitelisted adds an origin', async () => {
    await setWhitelisted('https://example.com');
    const list = await getWhitelisted();
    expect(list).toContain('https://example.com');
  });

  test('isWhitelisted returns true for whitelisted origin', async () => {
    await setWhitelisted('https://example.com');
    expect(await isWhitelisted('https://example.com')).toBe(true);
    expect(await isWhitelisted('https://other.com')).toBe(false);
  });

  test('removeWhitelisted removes an origin', async () => {
    await setWhitelisted('https://a.com');
    await setWhitelisted('https://b.com');
    await removeWhitelisted('https://a.com');
    const list = await getWhitelisted();
    expect(list).not.toContain('https://a.com');
    expect(list).toContain('https://b.com');
  });

  test('multiple origins can be whitelisted', async () => {
    await setWhitelisted('https://a.com');
    await setWhitelisted('https://b.com');
    await setWhitelisted('https://c.com');
    const list = await getWhitelisted();
    expect(list.length).toBe(3);
  });
});

describe('Currency management', () => {
  beforeEach(() => {
    global.mockStore = {};
  });

  test('setCurrency / getCurrency round-trip', async () => {
    await setCurrency('eur');
    expect(await getCurrency()).toBe('eur');
  });

  test('getCurrency returns undefined when not set', async () => {
    expect(await getCurrency()).toBeUndefined();
  });
});

describe('Network management', () => {
  beforeEach(() => {
    global.mockStore = {};
  });

  test('setNetwork / getNetwork round-trip', async () => {
    const network = { id: NETWORK_ID.testnet, node: NODE.testnet };
    await setNetwork(network);
    const result = await getNetwork();
    expect(result.id).toBe(NETWORK_ID.testnet);
    expect(result.node).toBe(NODE.testnet);
  });

  test('setNetwork stores the full network object', async () => {
    const network = { id: NETWORK_ID.preview, node: NODE.preview };
    await setNetwork(network);
    const stored = await getStorage(STORAGE.network);
    expect(stored).toEqual(network);
  });
});

describe('Account switching', () => {
  beforeEach(async () => {
    await seedWalletState();
    await setStorage({
      [STORAGE.accounts]: {
        0: SEED_ACCOUNT(0, 'Wallet1'),
        1: SEED_ACCOUNT(1, 'Wallet2'),
      },
    });
  });

  test('switchAccount changes currentAccount', async () => {
    await switchAccount(1);
    expect(await getCurrentAccountIndex()).toBe(1);
  });

  test('switchAccount back to 0', async () => {
    await switchAccount(1);
    await switchAccount(0);
    expect(await getCurrentAccountIndex()).toBe(0);
  });
});

describe('Account name and avatar', () => {
  beforeEach(async () => {
    await seedWalletState();
  });

  test('setAccountName updates the current account name', async () => {
    await setAccountName('Renamed Wallet');
    const accounts = await getStorage(STORAGE.accounts);
    expect(accounts[0].name).toBe('Renamed Wallet');
  });

  test('setAccountAvatar updates the current account avatar', async () => {
    await setAccountAvatar('new-avatar-seed');
    const accounts = await getStorage(STORAGE.accounts);
    expect(accounts[0].avatar).toBe('new-avatar-seed');
  });
});

describe('deleteAccount', () => {
  beforeEach(async () => {
    global.mockStore = {};
    await setStorage({
      [STORAGE.accounts]: {
        0: SEED_ACCOUNT(0, 'W1'),
        1: SEED_ACCOUNT(1, 'W2'),
      },
      [STORAGE.currentAccount]: 1,
      [STORAGE.network]: { id: NETWORK_ID.mainnet, node: NODE.mainnet },
    });
  });

  test('deletes the current account', async () => {
    await deleteAccount();
    const accounts = await getStorage(STORAGE.accounts);
    expect(accounts[1]).toBeUndefined();
    expect(accounts[0]).toBeDefined();
  });

  test('throws when only one account exists', async () => {
    global.mockStore = {};
    await setStorage({
      [STORAGE.accounts]: { 0: SEED_ACCOUNT(0) },
      [STORAGE.currentAccount]: 0,
      [STORAGE.network]: { id: NETWORK_ID.mainnet, node: NODE.mainnet },
    });
    await expect(deleteAccount()).rejects.toThrow(ERROR.onlyOneAccount);
  });
});

describe('Collateral management', () => {
  beforeEach(async () => {
    await seedWalletState();
  });

  test('setCollateral stores collateral data', async () => {
    const collateral = { txHash: 'abc123', txId: 0, lovelace: '5000000' };
    await setCollateral(collateral);
    const accounts = await getStorage(STORAGE.accounts);
    const network = await getNetwork();
    expect(accounts[0][network.id].collateral).toEqual(collateral);
  });

  test('removeCollateral clears collateral data', async () => {
    const collateral = { txHash: 'abc123', txId: 0, lovelace: '5000000' };
    await setCollateral(collateral);
    await removeCollateral();
    const accounts = await getStorage(STORAGE.accounts);
    const network = await getNetwork();
    expect(accounts[0][network.id].collateral).toBeUndefined();
  });
});

describe('setTransactions', () => {
  beforeEach(async () => {
    await seedWalletState();
  });

  test('stores confirmed transactions for current account', async () => {
    const txs = ['tx_hash_1', 'tx_hash_2'];
    await setTransactions(txs);
    const accounts = await getStorage(STORAGE.accounts);
    const network = await getNetwork();
    expect(accounts[0][network.id].history.confirmed).toEqual(txs);
  });
});

describe('updateRecentSentToAddress', () => {
  beforeEach(async () => {
    await seedWalletState();
  });

  test('adds address to recentSendToAddresses', async () => {
    await updateRecentSentToAddress('addr_test1_recipient');
    const accounts = await getStorage(STORAGE.accounts);
    const network = await getNetwork();
    expect(accounts[0][network.id].recentSendToAddresses).toContain(
      'addr_test1_recipient'
    );
  });

  test('does not duplicate existing address', async () => {
    await updateRecentSentToAddress('addr_test1_dup');
    await updateRecentSentToAddress('addr_test1_dup');
    const accounts = await getStorage(STORAGE.accounts);
    const network = await getNetwork();
    const addrs = accounts[0][network.id].recentSendToAddresses;
    expect(addrs.filter((a) => a === 'addr_test1_dup').length).toBe(1);
  });
});

// ── Wallet Reset (storage-level behavior) ────────────────────────────

describe('resetStorage (storage-level)', () => {
  beforeEach(async () => {
    await seedWalletState();
  });

  test('storage.clear() wipes all wallet data', async () => {
    // Verify data exists before clear
    expect(await getStorage(STORAGE.accounts)).toBeDefined();
    expect(await getStorage(STORAGE.encryptedKey)).toBeDefined();
    expect(await getCurrency()).toBe('usd');

    // Simulate what resetStorage does after password verification
    global.chrome.storage.local.clear();

    // All data should be gone
    const store = await getStorage();
    expect(store).toEqual({});
    expect(await getWhitelisted()).toEqual([]);
    expect(await getCurrency()).toBeUndefined();
    expect(await getNetwork()).toBeUndefined();
    expect(await getCurrentAccountIndex()).toBeUndefined();
  });

  test('after clear, wallet should be treated as new (no accounts)', async () => {
    global.chrome.storage.local.clear();
    const accounts = await getStorage(STORAGE.accounts);
    expect(accounts).toBeFalsy();
  });
});
