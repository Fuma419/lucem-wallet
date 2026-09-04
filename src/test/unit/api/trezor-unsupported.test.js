/**
 * Trezor is not supported in this build. The dead `TrezorConnect` surface is
 * gone, so the remaining requirement is twofold: a stored `trezor-*` account
 * still loads as a hardware account, and asking it to sign says why it cannot
 * rather than throwing `ReferenceError: TrezorConnect is not defined`.
 */
const fs = require('fs');
const path = require('path');

const { HW, TREZOR_UNSUPPORTED } = require('../../../config/config');
const { isHardwareAccountIndex } = require('../../../api/extension/vault');

const read = (rel) =>
  fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');

describe('Trezor is declined, not crashed into', () => {
  test('the message names the alternatives', () => {
    expect(TREZOR_UNSUPPORTED).toMatch(/Trezor is not supported yet/i);
    expect(TREZOR_UNSUPPORTED).toMatch(/Keystone/);
    expect(TREZOR_UNSUPPORTED).toMatch(/Ledger/);
  });

  test('an account stored as trezor-* is still a hardware account', () => {
    // Losing this would strand the account: not hardware, no password either.
    expect(HW.trezor).toBe('trezor');
    expect(isHardwareAccountIndex('trezor-abc123-0')).toBe(true);
    expect(isHardwareAccountIndex('trezor-abc123-3')).toBe(true);
  });

  test('such an account keeps its device logo', () => {
    expect(read('ui/app/components/avatarLoader.jsx')).toMatch(
      /\[HW\.trezor\]:\s*TrezorLogo/
    );
    expect(read('api/extension/index.js')).toMatch(
      /HW_LOGO_DEVICES = \[[^\]]*HW\.trezor/
    );
  });

  test('every signing entry point refuses Trezor with the message', () => {
    for (const rel of [
      'api/extension/signing.js', // signTxHW
      'api/extension/index.js', // initHW
      'ui/app/components/confirmModal.jsx', // hardware confirm dialog
      'ui/app/pages/send.jsx',
      'ui/app/pages/staking.jsx',
      'ui/app/pages/governance.jsx',
      'ui/app/components/transactionBuilder.jsx',
    ]) {
      const src = read(rel);
      expect(src).toMatch(/HW\.trezor/);
      expect(src).toMatch(/throw new Error\(TREZOR_UNSUPPORTED\)/);
    }
  });

  test('the dead TrezorConnect surface is gone for good', () => {
    for (const rel of [
      'api/util.js',
      'api/extension/signing.js',
      'api/extension/index.js',
      'api/globals.d.ts',
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/TrezorConnect/);
      // These were declared as ambient `any`, which hid the missing binding
      // from `npm run typecheck` as well as from readers.
      expect(src).not.toMatch(/CardanoCertificateType|CardanoTxSigningMode/);
    }
    expect(read('api/util.js')).not.toMatch(/txToTrezor|outputsToTrezor/);
  });

  test('nothing ships a Trezor bundle, page, or iframe permission any more', () => {
    const webpack = read('../webpack.config.js');
    expect(webpack).not.toMatch(/trezor/i);

    const manifest = JSON.parse(read('manifest.json'));
    expect(manifest.content_security_policy.extension_pages).not.toMatch(
      /trezor/i
    );
    for (const script of manifest.content_scripts || []) {
      expect(JSON.stringify(script)).not.toMatch(/trezor/i);
    }

    for (const rel of [
      'ui/app/tabs/trezorTx.jsx',
      'ui/app/components/trezorWidget.jsx',
      'pages/Content/trezorContentScript.js',
      'pages/Tab/trezorTx.html',
    ]) {
      expect(fs.existsSync(path.join(__dirname, '../../..', rel))).toBe(false);
    }
  });
});
