/**
 * CIP-30 getUsedAddresses must list every spendable payment address
 * (enabled external + internal), unique, with external index 0 first.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: async () => {},
    Cardano: require('@emurgo/cardano-serialization-lib-nodejs'),
  },
}));

jest.mock('../../../api/extension/multi-address', () => {
  const actual = jest.requireActual('../../../api/extension/multi-address');
  return {
    __esModule: true,
    ...actual,
    listEnabledPaymentAddresses: jest.fn(),
  };
});

jest.mock('../../../api/extension/storage', () => ({
  getCurrentAccount: jest.fn(),
  getNetwork: jest.fn(),
  getStorage: jest.fn(),
  setStorage: jest.fn(),
  getCurrentAccountIndex: jest.fn(),
}));

jest.mock('../../../api/cache', () => ({
  invalidateAll: jest.fn(),
}));

const {
  getCurrentAccount,
  getNetwork,
} = require('../../../api/extension/storage');
const {
  listEnabledPaymentAddresses,
} = require('../../../api/extension/multi-address');
const {
  getCip30UsedAddresses,
  getCip30Address,
} = require('../../../api/extension/addresses');
const { toCip30AddressHex } = require('../../../api/extension/cip30-address');

const enterpriseBech32 = (keyHashHex) =>
  CSL.EnterpriseAddress.new(
    0,
    CSL.Credential.from_keyhash(
      CSL.Ed25519KeyHash.from_bytes(Buffer.from(keyHashHex, 'hex'))
    )
  )
    .to_address()
    .to_bech32();

describe('getCip30UsedAddresses', () => {
  const primary = enterpriseBech32('aa'.repeat(28));
  const extraExternal = enterpriseBech32('bb'.repeat(28));
  const extraInternal = enterpriseBech32('cc'.repeat(28));

  beforeEach(() => {
    getCurrentAccount.mockReset().mockResolvedValue({
      paymentAddr: primary,
      paymentKeyHash: 'aa'.repeat(28),
      publicKey: 'pub',
      externalIndices: [0, 1],
      internalIndices: [0],
    });
    getNetwork.mockReset().mockResolvedValue({ id: 'preprod' });
    listEnabledPaymentAddresses.mockReset().mockReturnValue([
      { role: 0, index: 0, paymentAddr: primary },
      { role: 0, index: 1, paymentAddr: extraExternal },
      { role: 1, index: 0, paymentAddr: extraInternal },
      { role: 0, index: 0, paymentAddr: primary },
    ]);
  });

  test('returns unique CIP-30 hex for extra external and internal indices, index 0 first', async () => {
    const used = await getCip30UsedAddresses();
    expect(used[0]).toBe(toCip30AddressHex(primary));
    expect(used).toEqual([
      toCip30AddressHex(primary),
      toCip30AddressHex(extraExternal),
      toCip30AddressHex(extraInternal),
    ]);
    expect(listEnabledPaymentAddresses).toHaveBeenCalled();
  });

  test('getCip30Address remains the primary receive address only', async () => {
    await expect(getCip30Address()).resolves.toBe(toCip30AddressHex(primary));
  });
});
