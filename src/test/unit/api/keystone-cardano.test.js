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
  KEYSTONE_CARDANO_ACCOUNT_SLOTS,
  cip1852AccountPath,
  formatKeystoneCardanoAccountLabel,
  generateCardanoKeystoneKeyDerivationUr,
} = require('../../../api/keystone-cardano');

describe('keystone-cardano', () => {
  test('cip1852AccountPath', () => {
    expect(cip1852AccountPath(0)).toBe("m/1852'/1815'/0'");
    expect(cip1852AccountPath(7)).toBe("m/1852'/1815'/7'");
  });

  test('formatKeystoneCardanoAccountLabel', () => {
    expect(formatKeystoneCardanoAccountLabel(0)).toBe(
      "Keystone · Account 1 · CIP-1852 m/1852'/1815'/0'"
    );
    expect(formatKeystoneCardanoAccountLabel(2)).toBe(
      "Keystone · Account 3 · CIP-1852 m/1852'/1815'/2'"
    );
  });

  test('generateCardanoKeystoneKeyDerivationUr payload scales with account count', () => {
    const one = generateCardanoKeystoneKeyDerivationUr({ accountCount: 1 });
    const all = generateCardanoKeystoneKeyDerivationUr();
    expect(one.type).toBeTruthy();
    expect(all.type).toBe(one.type);
    expect(all.cbor.length).toBeGreaterThan(one.cbor.length);
    expect(KEYSTONE_CARDANO_ACCOUNT_SLOTS).toBeGreaterThanOrEqual(2);
  });
});
