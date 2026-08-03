const fs = require('fs');
const path = require('path');

describe('duplicate import UX', () => {
  test('createWallet detects existing mnemonic before clearing storage', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/index.js'),
      'utf8'
    );
    expect(src).toMatch(/findExistingAccountForMnemonic/);
    expect(src).toMatch(/walletAlreadyExists/);
    // Duplicate check must run before the createWallet storage clear.
    const createWalletIdx = src.indexOf('export const createWallet');
    const createWalletSrc = src.slice(createWalletIdx, createWalletIdx + 2500);
    const checkIdx = createWalletSrc.indexOf('findExistingAccountForMnemonic');
    const clearIdx = createWalletSrc.indexOf('platform.storage.clear()');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(checkIdx);
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
    const createWalletSrc = src.slice(createWalletIdx, createWalletIdx + 4500);
    expect(createWalletSrc).toMatch(/await switchAccount\(index\)/);
  });
});
