/**
 * @jest-environment node
 *
 * Regression: Bluetooth import created an account the owner had never
 * approved and did not recognise. 64 arbitrary bytes parse as a
 * `Bip32PublicKey`, so a garbled BLE response became a phantom account.
 * Every import now has to match an address the device itself derived.
 *
 * Derivation is real CSL, so the comparison is genuine.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

jest.mock('../../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    Cardano: require('@emurgo/cardano-serialization-lib-nodejs'),
  },
}));

const {
  EXTENDED_PUBLIC_KEY_HEX_LENGTH,
  LEDGER_KEY_MALFORMED_MESSAGE,
  LEDGER_KEY_MISMATCH_MESSAGE,
  LEDGER_VERIFY_NETWORK,
  assertLedgerKeyMatchesDevice,
  baseAddressHexFromAccountKey,
  exportVerifiedLedgerAccounts,
  isExtendedPublicKeyHex,
  ledgerAccountPath,
  ledgerBaseAddressParams,
} = require('../../../../api/extension/ledger-account');

const HARDENED = 0x80000000;

/** Deterministic account key, as the Cardano app would export it. */
const accountKey = (accountIndex = 0) => {
  const entropy = Buffer.alloc(32, 0x42);
  const prv = CSL.Bip32PrivateKey.from_bip39_entropy(entropy, Buffer.alloc(0))
    .derive(HARDENED + 1852)
    .derive(HARDENED + 1815)
    .derive(HARDENED + accountIndex);
  const pub = prv.to_public();
  return {
    publicKeyHex: Buffer.from(pub.as_bytes().slice(0, 32)).toString('hex'),
    chainCodeHex: Buffer.from(pub.as_bytes().slice(32)).toString('hex'),
    extendedHex: Buffer.from(pub.as_bytes()).toString('hex'),
  };
};

/** What a healthy Ledger answers for `deriveAddress`. */
const deviceAddressHex = (accountIndex = 0) =>
  baseAddressHexFromAccountKey(accountKey(accountIndex).extendedHex);

const fakeAppAda = ({ accountIndexes = [0], addressFor } = {}) => {
  const showAddress = jest.fn(async () => {});
  const deriveAddress = jest.fn(async ({ address }) => ({
    addressHex: addressFor
      ? addressFor(address)
      : deviceAddressHex(
          (address.params.spendingPath[2] - HARDENED) | 0
        ),
  }));
  const getExtendedPublicKeys = jest.fn(async () =>
    accountIndexes.map((i) => {
      const k = accountKey(i);
      return { publicKeyHex: k.publicKeyHex, chainCodeHex: k.chainCodeHex };
    })
  );
  return { getExtendedPublicKeys, deriveAddress, showAddress };
};

describe('ledger account derivation params', () => {
  test('account path is CIP-1852 hardened', () => {
    expect(ledgerAccountPath(3)).toEqual([
      HARDENED + 1852,
      HARDENED + 1815,
      HARDENED + 3,
    ]);
    expect(ledgerAccountPath('3')).toEqual(ledgerAccountPath(3));
  });

  test('base address params match what createHWAccounts stores', () => {
    const { type, params } = ledgerBaseAddressParams(0);
    expect(type).toBe(0);
    expect(params.spendingPath).toEqual([
      HARDENED + 1852,
      HARDENED + 1815,
      HARDENED + 0,
      0,
      0,
    ]);
    expect(params.stakingPath).toEqual([
      HARDENED + 1852,
      HARDENED + 1815,
      HARDENED + 0,
      2,
      0,
    ]);
  });

  test('verification network is mainnet so the active network cannot change trust', () => {
    expect(LEDGER_VERIFY_NETWORK).toEqual({
      protocolMagic: 764824073,
      networkId: 1,
    });
  });
});

describe('extended public key shape', () => {
  test('accepts a 64-byte key, rejects anything else', () => {
    const { extendedHex } = accountKey();
    expect(extendedHex).toHaveLength(EXTENDED_PUBLIC_KEY_HEX_LENGTH);
    expect(isExtendedPublicKeyHex(extendedHex)).toBe(true);
    expect(isExtendedPublicKeyHex(extendedHex.slice(0, 100))).toBe(false);
    expect(isExtendedPublicKeyHex(`zz${extendedHex.slice(2)}`)).toBe(false);
    expect(isExtendedPublicKeyHex(undefined)).toBe(false);
  });

  test('a malformed key never reaches CSL', () => {
    expect(() => baseAddressHexFromAccountKey('deadbeef')).toThrow(
      LEDGER_KEY_MALFORMED_MESSAGE
    );
  });
});

describe('assertLedgerKeyMatchesDevice', () => {
  test('passes when the device address matches the exported key', () => {
    const { extendedHex } = accountKey();
    expect(
      assertLedgerKeyMatchesDevice({
        extendedPublicKeyHex: extendedHex,
        deviceAddressHex: deviceAddressHex(),
      })
    ).toBe(deviceAddressHex());
  });

  test('rejects a key the device does not own', () => {
    const { extendedHex } = accountKey();
    expect(() =>
      assertLedgerKeyMatchesDevice({
        extendedPublicKeyHex: extendedHex,
        deviceAddressHex: deviceAddressHex(1),
      })
    ).toThrow(LEDGER_KEY_MISMATCH_MESSAGE);
  });

  test('rejects a missing device answer instead of trusting the key', () => {
    const { extendedHex } = accountKey();
    expect(() =>
      assertLedgerKeyMatchesDevice({
        extendedPublicKeyHex: extendedHex,
        deviceAddressHex: '',
      })
    ).toThrow(LEDGER_KEY_MISMATCH_MESSAGE);
  });
});

describe('exportVerifiedLedgerAccounts', () => {
  test('returns the exported keys once the device confirms them', async () => {
    const appAda = fakeAppAda({ accountIndexes: [0, 1] });
    const verified = await exportVerifiedLedgerAccounts({
      appAda,
      accountIndexes: ['0', '1'],
    });

    expect(verified).toEqual([
      { accountIndex: '0', publicKey: accountKey(0).extendedHex },
      { accountIndex: '1', publicKey: accountKey(1).extendedHex },
    ]);
    expect(appAda.deriveAddress).toHaveBeenCalledTimes(2);
  });

  test('shows the first address on the device so the owner approves it', async () => {
    const appAda = fakeAppAda({ accountIndexes: [0, 1] });
    await exportVerifiedLedgerAccounts({
      appAda,
      accountIndexes: ['0', '1'],
    });
    expect(appAda.showAddress).toHaveBeenCalledTimes(1);
    expect(appAda.showAddress.mock.calls[0][0].address).toEqual(
      ledgerBaseAddressParams('0')
    );
  });

  test('a garbled response cannot become an account', async () => {
    const appAda = fakeAppAda();
    // 64 bytes of noise. CSL rejects it mid-derivation by throwing a bare
    // wasm value, which must still surface as a refused import.
    appAda.getExtendedPublicKeys = jest.fn(async () => [
      {
        publicKeyHex: 'ab'.repeat(32),
        chainCodeHex: 'cd'.repeat(32),
      },
    ]);

    await expect(
      exportVerifiedLedgerAccounts({ appAda, accountIndexes: ['0'] })
    ).rejects.toThrow(LEDGER_KEY_MALFORMED_MESSAGE);
    expect(appAda.showAddress).not.toHaveBeenCalled();
  });

  test('a key for another account cannot become this account', async () => {
    const appAda = fakeAppAda();
    // Device answers for account 0; the export claims account 1's key.
    appAda.getExtendedPublicKeys = jest.fn(async () => {
      const k = accountKey(1);
      return [{ publicKeyHex: k.publicKeyHex, chainCodeHex: k.chainCodeHex }];
    });

    await expect(
      exportVerifiedLedgerAccounts({ appAda, accountIndexes: ['0'] })
    ).rejects.toThrow(LEDGER_KEY_MISMATCH_MESSAGE);
    expect(appAda.showAddress).not.toHaveBeenCalled();
  });

  test('a short key list is rejected rather than padded', async () => {
    const appAda = fakeAppAda({ accountIndexes: [0] });
    await expect(
      exportVerifiedLedgerAccounts({ appAda, accountIndexes: ['0', '1'] })
    ).rejects.toThrow(LEDGER_KEY_MALFORMED_MESSAGE);
  });

  test('requires at least one account', async () => {
    await expect(
      exportVerifiedLedgerAccounts({
        appAda: fakeAppAda(),
        accountIndexes: [],
      })
    ).rejects.toThrow('No accounts selected');
  });
});
