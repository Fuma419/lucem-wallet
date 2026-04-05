/**
 * @jest-environment node
 */

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    Cardano: {},
  },
}));

const {
  KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX,
  KEYSTONE_DERIVATION,
  cip1852AccountPath,
  filterKeystoneKeysForRequestedAccount,
  formatKeystoneCardanoAccountLabel,
  generateCardanoKeystoneKeyDerivationUr,
  inferKeystoneDerivationProfile,
  parseCip1852AccountIndexFromPath,
} = require('../../../api/keystone-cardano');

describe('keystone-cardano', () => {
  test('cip1852AccountPath', () => {
    expect(cip1852AccountPath(0)).toBe("m/1852'/1815'/0'");
    expect(cip1852AccountPath(7)).toBe("m/1852'/1815'/7'");
  });

  test('parseCip1852AccountIndexFromPath', () => {
    expect(parseCip1852AccountIndexFromPath("m/1852'/1815'/5'")).toBe(5);
    expect(parseCip1852AccountIndexFromPath("M/1852'/1815'/2'/0/0")).toBe(2);
    expect(parseCip1852AccountIndexFromPath("m/44'/1815'/0'")).toBe(null);
  });

  test('inferKeystoneDerivationProfile', () => {
    expect(inferKeystoneDerivationProfile('Ledger Live', '')).toBe(
      KEYSTONE_DERIVATION.ledger
    );
    expect(inferKeystoneDerivationProfile('', 'Yoroi export')).toBe(
      KEYSTONE_DERIVATION.standard
    );
    expect(inferKeystoneDerivationProfile('', '')).toBe(
      KEYSTONE_DERIVATION.standard
    );
  });

  test('formatKeystoneCardanoAccountLabel', () => {
    expect(formatKeystoneCardanoAccountLabel(0, KEYSTONE_DERIVATION.standard)).toBe(
      "Keystone · Account 0 · m/1852'/1815'/0' · Cardano standard"
    );
    expect(formatKeystoneCardanoAccountLabel(23, KEYSTONE_DERIVATION.standard)).toBe(
      "Keystone · Account 23 · m/1852'/1815'/23' · Cardano standard"
    );
    expect(formatKeystoneCardanoAccountLabel(0, KEYSTONE_DERIVATION.ledger)).toBe(
      "Keystone · Account 0 · m/1852'/1815'/0' · Ledger-compatible"
    );
  });

  test('generateCardanoKeystoneKeyDerivationUr encodes requested account', () => {
    const ur = generateCardanoKeystoneKeyDerivationUr({ accountIndex: 4 });
    expect(ur.type).toBeTruthy();
    expect(Buffer.isBuffer(ur.cbor) || ur.cbor instanceof Uint8Array).toBe(
      true
    );
  });

  test('generateCardanoKeystoneKeyDerivationUr rejects out-of-range index', () => {
    expect(() =>
      generateCardanoKeystoneKeyDerivationUr({
        accountIndex: KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX + 1,
      })
    ).toThrow(/Invalid Keystone account index/);
  });

  test('filterKeystoneKeysForRequestedAccount', () => {
    const keys = [
      { account: 0, rowKey: '0-standard', publicKey: 'a' },
      { account: 2, rowKey: '2-standard', publicKey: 'b' },
    ];
    expect(filterKeystoneKeysForRequestedAccount(keys, 2)).toEqual([keys[1]]);
    expect(() => filterKeystoneKeysForRequestedAccount(keys, 1)).toThrow(
      /Keystone did not return account 1/
    );
  });
});
