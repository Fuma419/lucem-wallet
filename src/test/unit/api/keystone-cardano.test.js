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
  KEYSTONE_ANIMATED_QR_OPTIONS,
  KEYSTONE_SIGN_ANIMATED_QR_OPTIONS,
  KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX,
  KEYSTONE_DERIVATION,
  cip1852AccountPath,
  filterKeystoneKeysForRequestedAccount,
  filterKeystoneKeysForRequestedAccounts,
  formatKeystoneCardanoAccountLabel,
  isCip1852AccountNodePath,
  preferredKeystoneImportRowKeys,
  generateCardanoKeystoneKeyDerivationUr,
  inferKeystoneDerivationProfile,
  inferKeystoneDerivationProfileOrNull,
  resolveKeystoneConnectProfile,
  keystoneConnectNeedsProfileChoice,
  applyKeystoneFallbackProfile,
  parseCip1852AccountIndexFromPath,
  trimKeystoneConnectKeysToOne,
} = require('../../../api/keystone-cardano');

describe('keystone-cardano', () => {
  test('animated QR is sparse and slow enough for a device camera', () => {
    expect(KEYSTONE_ANIMATED_QR_OPTIONS.capacity).toBeLessThanOrEqual(400);
    expect(KEYSTONE_ANIMATED_QR_OPTIONS.interval).toBeGreaterThanOrEqual(200);
    expect(KEYSTONE_SIGN_ANIMATED_QR_OPTIONS).toBe(KEYSTONE_ANIMATED_QR_OPTIONS);
  });

  test('cip1852AccountPath', () => {
    expect(cip1852AccountPath(0)).toBe("m/1852'/1815'/0'");
    expect(cip1852AccountPath(7)).toBe("m/1852'/1815'/7'");
  });

  test('parseCip1852AccountIndexFromPath', () => {
    expect(parseCip1852AccountIndexFromPath("m/1852'/1815'/5'")).toBe(5);
    expect(parseCip1852AccountIndexFromPath("M/1852'/1815'/2'/0/0")).toBe(2);
    expect(parseCip1852AccountIndexFromPath("m/44'/1815'/0'")).toBe(null);
  });

  test('isCip1852AccountNodePath rejects payment/stake leaves', () => {
    expect(isCip1852AccountNodePath("m/1852'/1815'/0'")).toBe(true);
    expect(isCip1852AccountNodePath("m/1852'/1815'/2'/0/0")).toBe(false);
    expect(isCip1852AccountNodePath("m/1852'/1815'/0'/2/0")).toBe(false);
  });

  test('inferKeystoneDerivationProfile', () => {
    expect(inferKeystoneDerivationProfile('Ledger Live', '')).toBe(
      KEYSTONE_DERIVATION.ledger
    );
    expect(inferKeystoneDerivationProfile('account.ledger_live', '')).toBe(
      KEYSTONE_DERIVATION.ledger
    );
    expect(inferKeystoneDerivationProfile('account.ledger_legacy', '')).toBe(
      KEYSTONE_DERIVATION.ledger
    );
    expect(inferKeystoneDerivationProfile('account.standard', '')).toBe(
      KEYSTONE_DERIVATION.standard
    );
    expect(inferKeystoneDerivationProfile('', 'Yoroi export')).toBe(
      KEYSTONE_DERIVATION.standard
    );
    expect(inferKeystoneDerivationProfile('', 'Cardano Native')).toBe(
      KEYSTONE_DERIVATION.standard
    );
    expect(inferKeystoneDerivationProfile('', 'Cardano wallet')).toBe(
      KEYSTONE_DERIVATION.standard
    );
    expect(inferKeystoneDerivationProfile('', '')).toBe(
      KEYSTONE_DERIVATION.standard
    );
  });

  test('inferKeystoneDerivationProfileOrNull is null when UR has no hint', () => {
    expect(inferKeystoneDerivationProfileOrNull('', '')).toBe(null);
    expect(inferKeystoneDerivationProfileOrNull('', 'Cardano')).toBe(null);
  });

  test('resolveKeystoneConnectProfile uses device metadata when present', () => {
    expect(
      resolveKeystoneConnectProfile(
        KEYSTONE_DERIVATION.ledger,
        KEYSTONE_DERIVATION.standard
      )
    ).toBe(KEYSTONE_DERIVATION.ledger);
    expect(
      resolveKeystoneConnectProfile(
        KEYSTONE_DERIVATION.standard,
        KEYSTONE_DERIVATION.ledger
      )
    ).toBe(KEYSTONE_DERIVATION.standard);
    expect(
      resolveKeystoneConnectProfile(null, KEYSTONE_DERIVATION.ledger)
    ).toBe(KEYSTONE_DERIVATION.ledger);
    expect(resolveKeystoneConnectProfile(null, null)).toBe(
      KEYSTONE_DERIVATION.standard
    );
  });

  test('keystoneConnectNeedsProfileChoice is true only for unlabeled rows', () => {
    expect(
      keystoneConnectNeedsProfileChoice([
        { profile: KEYSTONE_DERIVATION.ledger },
      ])
    ).toBe(false);
    expect(
      keystoneConnectNeedsProfileChoice([
        { profile: KEYSTONE_DERIVATION.standard },
      ])
    ).toBe(false);
    expect(keystoneConnectNeedsProfileChoice([{ profile: null }])).toBe(true);
    expect(keystoneConnectNeedsProfileChoice([])).toBe(false);
  });

  test('applyKeystoneFallbackProfile labels only unlabeled rows', () => {
    const keys = [
      {
        account: 0,
        publicKey: 'aa',
        profile: KEYSTONE_DERIVATION.ledger,
        rowKey: '0-ledger',
        name: 'Keystone 0 · Ledger',
      },
      {
        account: 1,
        publicKey: 'bb',
        profile: null,
        rowKey: '1-unlabeled-bb',
        name: 'Keystone 1',
      },
    ];
    const out = applyKeystoneFallbackProfile(keys, KEYSTONE_DERIVATION.standard);
    expect(out[0].profile).toBe(KEYSTONE_DERIVATION.ledger);
    expect(out[1].profile).toBe(KEYSTONE_DERIVATION.standard);
    expect(out[1].rowKey).toBe('1-standard');
    expect(out[1].name).toBe('Keystone 1 · Cardano Native');
  });

  test('parseKeystoneCardanoConnectUr does not take a Lucem profile override', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/keystone-cardano.js'),
      'utf8'
    );
    expect(src).toContain('const profile = r.inferred');
    expect(src).toContain('keystoneConnectNeedsProfileChoice');
    expect(src).not.toMatch(/forceExportProfile/);
    expect(src).not.toMatch(/You picked .* in Lucem Advanced/);
  });

  test('formatKeystoneCardanoAccountLabel', () => {
    expect(formatKeystoneCardanoAccountLabel(0, KEYSTONE_DERIVATION.standard)).toBe(
      'Keystone 0 · Cardano Native'
    );
    expect(formatKeystoneCardanoAccountLabel(23, KEYSTONE_DERIVATION.standard)).toBe(
      'Keystone 23 · Cardano Native'
    );
    expect(formatKeystoneCardanoAccountLabel(0, KEYSTONE_DERIVATION.ledger)).toBe(
      'Keystone 0 · Ledger'
    );
  });

  test('generateCardanoKeystoneKeyDerivationUr encodes requested single account', () => {
    const ur = generateCardanoKeystoneKeyDerivationUr({ accountIndex: 4 });
    expect(ur.type).toBeTruthy();
    expect(Buffer.isBuffer(ur.cbor) || ur.cbor instanceof Uint8Array).toBe(
      true
    );
  });

  test('generateCardanoKeystoneKeyDerivationUr default is single path account 0', () => {
    const def = generateCardanoKeystoneKeyDerivationUr();
    const zero = generateCardanoKeystoneKeyDerivationUr({ accountIndex: 0 });
    expect(def.type).toBe(zero.type);
    expect(Buffer.from(def.cbor).equals(Buffer.from(zero.cbor))).toBe(true);
  });

  test('generateCardanoKeystoneKeyDerivationUr multiple indices larger than one', () => {
    const one = generateCardanoKeystoneKeyDerivationUr({ accountIndices: [0] });
    const two = generateCardanoKeystoneKeyDerivationUr({
      accountIndices: [0, 3],
    });
    expect(two.cbor.length).toBeGreaterThan(one.cbor.length);
  });

  test('generateCardanoKeystoneKeyDerivationUr rejects out-of-range index', () => {
    expect(() =>
      generateCardanoKeystoneKeyDerivationUr({
        accountIndex: KEYSTONE_CARDANO_MAX_ACCOUNT_INDEX + 1,
      })
    ).toThrow(/Invalid Keystone account index/);
  });

  test('trimKeystoneConnectKeysToOne', () => {
    const a = { rowKey: '0-standard', account: 0 };
    const b = { rowKey: '1-standard', account: 1 };
    expect(trimKeystoneConnectKeysToOne([])).toEqual([]);
    expect(trimKeystoneConnectKeysToOne([a])).toEqual([a]);
    expect(trimKeystoneConnectKeysToOne([a, b])).toEqual([a]);
  });

  test('filterKeystoneKeysForRequestedAccounts', () => {
    const keys = [
      { account: 0, rowKey: '0-standard', publicKey: 'a' },
      { account: 2, rowKey: '2-standard', publicKey: 'b' },
    ];
    expect(filterKeystoneKeysForRequestedAccounts(keys, [0, 2])).toEqual(keys);
    expect(filterKeystoneKeysForRequestedAccounts(keys, [2, 0])).toEqual([
      keys[0],
      keys[1],
    ]);
    expect(() =>
      filterKeystoneKeysForRequestedAccounts(keys, [0, 1])
    ).toThrow(/did not return account 1/);
  });

  test('filterKeystoneKeysForRequestedAccounts keeps Native and Ledger for the same account', () => {
    const keys = [
      { account: 0, rowKey: '0-ledger', profile: KEYSTONE_DERIVATION.ledger },
      { account: 0, rowKey: '0-standard', profile: KEYSTONE_DERIVATION.standard },
    ];
    expect(filterKeystoneKeysForRequestedAccounts(keys, [0])).toEqual([
      keys[1],
      keys[0],
    ]);
  });

  test('preferredKeystoneImportRowKeys defaults to Cardano Native', () => {
    const keys = [
      { account: 0, rowKey: '0-ledger', profile: KEYSTONE_DERIVATION.ledger },
      { account: 0, rowKey: '0-standard', profile: KEYSTONE_DERIVATION.standard },
      { account: 1, rowKey: '1-ledger', profile: KEYSTONE_DERIVATION.ledger },
    ];
    expect(preferredKeystoneImportRowKeys(keys)).toEqual([
      '0-standard',
      '1-ledger',
    ]);
  });

  test('preferredKeystoneImportRowKeys honors an explicit Ledger choice', () => {
    const keys = [
      { account: 0, rowKey: '0-ledger', profile: KEYSTONE_DERIVATION.ledger },
      { account: 0, rowKey: '0-standard', profile: KEYSTONE_DERIVATION.standard },
    ];
    expect(
      preferredKeystoneImportRowKeys(keys, KEYSTONE_DERIVATION.ledger)
    ).toEqual(['0-ledger']);
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

  test('sign request resolves HD paths for enabled change addresses', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/keystone-cardano.js'),
      'utf8'
    );
    expect(src).toMatch(/findEnabledPaymentByAddress/);
    expect(src).toMatch(/cip1852PaymentPath/);
    expect(src).not.toMatch(
      /does not treat as its primary payment address/
    );
    expect(src).not.toMatch(/hdPath: `\$\{paymentBase\}\/0`/);
  });
});
