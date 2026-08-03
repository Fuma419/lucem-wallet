const fs = require('fs');
const path = require('path');

describe('duplicate import UX', () => {
  test('createWallet detects an existing mnemonic and never wipes the vault', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/index.js'),
      'utf8'
    );
    expect(src).toMatch(/findExistingAccountForMnemonic/);
    expect(src).toMatch(/walletAlreadyExists/);
    const createWalletIdx = src.indexOf('export const createWallet');
    const createWalletSrc = src.slice(createWalletIdx, createWalletIdx + 6500);
    // Importing/creating a mnemonic must NOT clear existing wallets anymore —
    // additional seeds are added alongside the current ones.
    expect(createWalletSrc).not.toMatch(/platform\.storage\.clear\(\)/);
    // The duplicate-seed guard still runs before any key material is written.
    const checkIdx = createWalletSrc.indexOf('findExistingAccountForMnemonic');
    const writeIdx = createWalletSrc.indexOf('encryptedRootKey');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(checkIdx);
  });

  test('createHWAccounts always selects the first newly added account', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/index.js'),
      'utf8'
    );
    const hwIdx = src.indexOf('export const createHWAccounts');
    const hwSrc = src.slice(hwIdx, hwIdx + 4500);
    expect(hwSrc).toMatch(/await switchAccount\(firstNewIndex\)/);
    expect(hwSrc).not.toMatch(/needsCurrent/);
  });

  test('createWallet always switchAccount to the primary new account', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/index.js'),
      'utf8'
    );
    const createWalletIdx = src.indexOf('export const createWallet');
    const createWalletSrc = src.slice(createWalletIdx, createWalletIdx + 6500);
    expect(createWalletSrc).toMatch(/await switchAccount\(index\)/);
  });
});
