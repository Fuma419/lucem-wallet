const fs = require('fs');
const path = require('path');
const {
  isHardwareAccountIndex,
  hasSoftwareAccount,
  vaultRequiresExistingPasswordFrom,
} = require('../../../../api/extension/vault');

describe('vaultRequiresExistingPasswordFrom', () => {
  const hwAccount = {
    index: 'keystone-deadbeef-0',
    name: 'Keystone 1',
  };
  const softwareAccount = {
    index: 0,
    walletId: '0',
    name: 'Software',
  };

  test('hardware-only with dummy encryptedKey does not require a password', () => {
    expect(
      vaultRequiresExistingPasswordFrom(
        { 'keystone-deadbeef-0': hwAccount },
        'dummy-cipher',
        {}
      )
    ).toBe(false);
  });

  test('empty vault does not require a password', () => {
    expect(vaultRequiresExistingPasswordFrom({}, null, null)).toBe(false);
    expect(vaultRequiresExistingPasswordFrom(null, undefined, undefined)).toBe(
      false
    );
  });

  test('software account with encryptedKey requires the existing password', () => {
    expect(
      vaultRequiresExistingPasswordFrom(
        { 0: softwareAccount },
        'real-cipher',
        {}
      )
    ).toBe(true);
  });

  test('software account with encryptedKeys map requires the existing password', () => {
    expect(
      vaultRequiresExistingPasswordFrom({ 0: softwareAccount }, null, {
        0: 'real-cipher',
      })
    ).toBe(true);
  });

  test('sterilized software account without key material does not require a password', () => {
    expect(
      vaultRequiresExistingPasswordFrom({ 0: softwareAccount }, null, {})
    ).toBe(false);
  });

  test('mixed HW + software with a seed requires the existing password', () => {
    expect(
      vaultRequiresExistingPasswordFrom(
        { 0: softwareAccount, 'keystone-deadbeef-0': hwAccount },
        'real-cipher',
        {}
      )
    ).toBe(true);
  });
});

describe('hasSoftwareAccount / isHardwareAccountIndex', () => {
  test('recognizes hardware prefixes and numeric software slots', () => {
    expect(isHardwareAccountIndex('keystone-abc-0')).toBe(true);
    expect(isHardwareAccountIndex('ledger-abc-0')).toBe(true);
    expect(isHardwareAccountIndex('trezor-abc-0')).toBe(true);
    expect(isHardwareAccountIndex(0)).toBe(false);
    expect(isHardwareAccountIndex(1)).toBe(false);
    expect(hasSoftwareAccount({ 0: { index: 0 } })).toBe(true);
    expect(
      hasSoftwareAccount({ 'keystone-abc-0': { index: 'keystone-abc-0' } })
    ).toBe(false);
  });
});

describe('call sites use the software-vault password check', () => {
  test('createWallet.jsx does not treat encryptedKey alone as a vault password', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    expect(src).toMatch(/vaultRequiresExistingPasswordFrom/);
    expect(src).not.toMatch(/setVaultExists\(Boolean\(key\)\)/);
  });

  test('createWallet API uses vaultRequiresExistingPasswordFrom', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/extension/index.js'),
      'utf8'
    );
    const createWalletIdx = src.indexOf('export const createWallet');
    const createWalletSrc = src.slice(createWalletIdx, createWalletIdx + 2500);
    expect(createWalletSrc).toMatch(/vaultRequiresExistingPasswordFrom/);
    expect(createWalletSrc).not.toMatch(
      /const vaultExists = Boolean\(existingEncryptedKey\)/
    );
  });
});
