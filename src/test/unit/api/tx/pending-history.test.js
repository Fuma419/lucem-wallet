const STORAGE = {
  accounts: 'accounts',
};

const store = {
  currentAccount: 0,
  network: { id: 'mainnet' },
  accounts: {
    0: {
      mainnet: {
        history: { confirmed: ['old_tx'], details: {} },
      },
    },
  },
};

jest.mock('../../../../api/extension/storage', () => ({
  getCurrentAccountIndex: async () => store.currentAccount,
  getNetwork: async () => store.network,
  getStorage: async (key) => store[key],
  setStorage: async (item) => {
    Object.assign(store, item);
  },
}));

jest.mock('../../../../api/loader', () => ({
  __esModule: true,
  default: { load: jest.fn(), Cardano: {} },
}));

jest.mock('../../../../platform', () => ({
  __esModule: true,
  default: { events: { broadcastToTabs: jest.fn() } },
}));

jest.mock('../../../../config/config', () => ({
  EVENT: { utxoChange: 'utxoChange' },
  SENDER: { extension: 'extension' },
  STORAGE,
  TARGET: 'lucem-wallet',
}));

const {
  prependPendingHash,
  normalizeSubmittedHash,
} = require('../../../../api/tx/pending-history');

describe('pending history', () => {
  beforeEach(() => {
    store.accounts[0].mainnet.history = { confirmed: ['old_tx'], details: {} };
  });

  test('normalizeSubmittedHash accepts a 64-char hex string', () => {
    const hash = 'ab'.repeat(32);
    expect(normalizeSubmittedHash(`"${hash}"`)).toBe(hash);
    expect(normalizeSubmittedHash({ txHash: hash })).toBe(hash);
    expect(normalizeSubmittedHash('nope')).toBe('');
  });

  test('prependPendingHash puts a pending stub at the head of history', async () => {
    const hash = 'cd'.repeat(32);
    await prependPendingHash(hash, ['delegation']);
    const history = store.accounts[0].mainnet.history;
    expect(history.confirmed[0]).toBe(hash);
    expect(history.confirmed).toContain('old_tx');
    expect(history.details[hash]).toMatchObject({
      pending: true,
      extra: ['delegation'],
    });
  });
});
