/**
 * Tests for Keystone implementation stability fixes.
 *
 * Covers:
 * 1. HW config — HW.trezor and HW.keystone exist, isHW recognizes all 3
 * 2. Wallet reset — idbClear deletes DB and resets dbPromise on web
 * 3. HW tab — mobile layout, WebUSB guards, text responsive widths
 * 4. signTxHW / initHW — Keystone guards throw clear errors
 * 5. deleteAccount — switches to valid remaining account key
 */
const fs = require('fs');
const path = require('path');

// ── 1. HW Config ────────────────────────────────────────────────────

describe('HW config constants', () => {
  test('HW object includes keystone, ledger, and trezor', () => {
    const { HW } = require('../../config/config');
    expect(HW.keystone).toBe('keystone');
    expect(HW.ledger).toBe('ledger');
    expect(HW.trezor).toBe('trezor');
  });
});

// ── 2. isHW recognizes all hardware wallet prefixes ─────────────────

describe('isHW with all device types', () => {
  const { HW } = require('../../config/config');

  const isHW = (accountIndex) =>
    accountIndex != null &&
    accountIndex != undefined &&
    accountIndex != 0 &&
    typeof accountIndex !== 'number' &&
    typeof accountIndex === 'string' &&
    (accountIndex.startsWith(HW.ledger) ||
      accountIndex.startsWith(HW.trezor) ||
      accountIndex.startsWith(HW.keystone));

  test('recognizes ledger account index', () => {
    expect(isHW('ledger-abc-0')).toBe(true);
  });

  test('recognizes trezor account index', () => {
    expect(isHW('trezor-xyz-1')).toBe(true);
  });

  test('recognizes keystone account index', () => {
    expect(isHW('keystone-qr-0')).toBe(true);
  });

  test('rejects native numeric index', () => {
    expect(isHW(0)).toBe(false);
    expect(isHW(1)).toBe(false);
  });

  test('rejects null/undefined', () => {
    expect(isHW(null)).toBe(false);
    expect(isHW(undefined)).toBe(false);
  });

  test('rejects arbitrary string prefix', () => {
    expect(isHW('unknown-device-0')).toBe(false);
  });

  test('isHW in index.js source matches expected pattern', () => {
    const indexSrc = fs.readFileSync(
      path.join(__dirname, '../../api/extension/index.js'),
      'utf8'
    );
    expect(indexSrc).toMatch(/HW\.ledger/);
    expect(indexSrc).toMatch(/HW\.trezor/);
    expect(indexSrc).toMatch(/HW\.keystone/);
  });
});

// ── 3. Web adapter idbClear ──────────────────────────────────────────

describe('web adapter storage.clear()', () => {
  test('idbClear resets dbPromise and deletes the database', () => {
    const webSrc = fs.readFileSync(
      path.join(__dirname, '../../platform/web.js'),
      'utf8'
    );
    expect(webSrc).toMatch(/dbPromise\s*=\s*null/);
    expect(webSrc).toMatch(/deleteDatabase/);
  });
});

// ── 4. HW tab mobile layout ─────────────────────────────────────────

describe('hw.jsx mobile layout and Ledger Web Bluetooth', () => {
  const hwSrc = fs.readFileSync(
    path.join(__dirname, '../../ui/app/tabs/hw.jsx'),
    'utf8'
  );

  test('text elements use maxWidth instead of fixed width for mobile', () => {
    expect(hwSrc).toMatch(/maxWidth=["']320px["']/);
  });

  test('percentage-width rows pair with maxWidth caps', () => {
    const width90 = hwSrc.match(/width=["']90%["']/g) || [];
    const max320 = hwSrc.match(/maxWidth=["']320px["']/g) || [];
    expect(width90.length).toBeGreaterThan(0);
    expect(max320.length).toBeGreaterThanOrEqual(1);
  });

  test('Web Bluetooth is used for Ledger (requestDevice + service UUIDs)', () => {
    expect(hwSrc).toMatch(/navigator\.bluetooth/);
    expect(hwSrc).toMatch(/getBluetoothServiceUuids/);
    expect(hwSrc).toMatch(/requestDevice/);
  });

  test('ledger flow checks for requestDevice capability (not only navigator.bluetooth)', () => {
    expect(hwSrc).toMatch(/const hasWebBluetoothRequestDevice/);
    expect(hwSrc).toMatch(/!hasWebBluetoothRequestDevice\(\)/);
  });

  test('continue button stays clickable and unsupported ledger is handled in click path', () => {
    expect(hwSrc).not.toMatch(
      /\(selected === HW\.ledger && isIosLikeWithoutWebBluetooth\(\)\)/
    );
    expect(hwSrc).toMatch(/setError\(ledgerBluetoothUnavailableMessage\(\)\)/);
  });

  test('Ledger BLE options helper is defined', () => {
    expect(hwSrc).toMatch(/ledgerBleRequestOptions/);
  });

  test('Keystone typo "Keysone" is not present', () => {
    expect(hwSrc).not.toMatch(/Keysone/);
  });

  test('Keystone confirm shows the send review before opening the QR tab', () => {
    const modalSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/confirmModal.jsx'),
      'utf8'
    );
    expect(modalSrc).toMatch(/onOpenHW\(\)/);
    expect(modalSrc).not.toMatch(
      /parsed\.device === HW\.keystone[\s\S]{0,120}onHwKeystone\(parsed\)/
    );
    expect(modalSrc).toMatch(/Keystone uses <b>QR only<\/b>/);
    expect(modalSrc).toMatch(/Tap Confirm to open the\s+signing tab/);
    expect(modalSrc).not.toMatch(/change back to\s+you is a separate output/);
    const keystoneTxSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/keystoneTx.jsx'),
      'utf8'
    );
    expect(keystoneTxSrc).toMatch(/summarizeUnsignedPaymentTx/);
    expect(keystoneTxSrc).toMatch(/data-testid="keystone-tx-summary"/);
    expect(keystoneTxSrc).toMatch(/data-testid="keystone-tx-error"/);
    expect(keystoneTxSrc).toMatch(/Copy error/);
    expect(keystoneTxSrc).toMatch(/openMainRoute\('\/send'\)/);
    expect(keystoneTxSrc).toMatch(/assertKeystoneWitnessesCover/);
    expect(keystoneTxSrc).toMatch(/formatKeystoneSubmitError/);
    expect(keystoneTxSrc).not.toMatch(/} finally \{/);
    expect(keystoneTxSrc).not.toMatch(/title: 'Transaction failed'/);
  });

  test('Keystone sign payload is readable after remount (not deleted on take)', () => {
    const indexSrc = fs.readFileSync(
      path.join(__dirname, '../../api/extension/index.js'),
      'utf8'
    );
    expect(indexSrc).toMatch(/Does not delete/);
    expect(indexSrc).toMatch(/clearKeystoneSignPayload/);
    expect(indexSrc).toMatch(
      /export const takeKeystoneSignPayload = async \(signId\) => \{\s*const prev = \(await getStorage\(STORAGE\.keystoneTxPending\)\) \|\| \{\};\s*return prev\[signId\] \|\| null;/
    );
  });

  test('web createTab does not resolve Keystone html under /send', () => {
    const webSrc = fs.readFileSync(
      path.join(__dirname, '../../platform/web.js'),
      'utf8'
    );
    expect(webSrc).toMatch(/location\.origin\}\/\$\{tab\}\.html/);
    expect(webSrc).not.toMatch(/location\.href = tab \+ '\.html'/);
  });

  test('connect QR uses the shared slow Keystone frames', () => {
    expect(hwSrc).toMatch(/KEYSTONE_ANIMATED_QR_OPTIONS/);
    expect(hwSrc).not.toMatch(/interval:\s*110/);
    expect(hwSrc).not.toMatch(/Math\.min\(900/);
    expect(hwSrc).not.toMatch(/keystoneQrCapacity/);
  });

  test('hardware picker shows Keystone and Ledger names next to the marks', () => {
    expect(hwSrc).toMatch(/alt="Keystone"/);
    expect(hwSrc).toMatch(/alt="Ledger"/);
    expect(hwSrc).toMatch(/>\s*Keystone\s*</);
    expect(hwSrc).toMatch(/>\s*Ledger\s*</);
    expect(hwSrc).toMatch(/preferredKeystoneImportRowKeys/);
    expect(hwSrc).toMatch(/keystoneConnectNeedsProfileChoice/);
    expect(hwSrc).toMatch(/applyKeystoneFallbackProfile/);
    expect(hwSrc).toMatch(/keystone-profile-ledger/);
    expect(hwSrc).toMatch(/keystone-profile-native/);
    expect(hwSrc).toMatch(/KeystoneDerivationPicker/);
    expect(hwSrc).toMatch(/labelProfile/);
    expect(hwSrc).not.toMatch(/forceExportProfile/);
    expect(hwSrc).not.toMatch(/device ⋮ menu must match/);
    expect(hwSrc).not.toMatch(/initLocalWalletSecretIfAbsent/);
    expect(hwSrc).not.toMatch(/needsKeystonePassword/);
    expect(hwSrc).not.toMatch(/Set a wallet password for this browser/);
  });

  test('Keystone e2e step-1 shot does not pick Native/Ledger before Continue', () => {
    const e2eSrc = fs.readFileSync(
      path.join(__dirname, '../../../e2e/screenshots.spec.js'),
      'utf8'
    );
    expect(e2eSrc).toMatch(/Step 1 — Keystone scans Lucem/);
    expect(e2eSrc).not.toMatch(/keystone-profile-native/);
  });
});

// ── 5. signTxHW / initHW Keystone guards ─────────────────────────────

describe('Keystone guards in extension signing / index', () => {
  const indexSrc = fs.readFileSync(
    path.join(__dirname, '../../api/extension/index.js'),
    'utf8'
  );
  const signingSrc = fs.readFileSync(
    path.join(__dirname, '../../api/extension/signing.js'),
    'utf8'
  );

  test('signTxHW has Keystone guard before WASM loading', () => {
    expect(signingSrc).toMatch(
      /hw\.device\s*===\s*HW\.keystone[\s\S]*?throw new Error/
    );
  });

  test('initHW handles Keystone device type', () => {
    expect(indexSrc).toMatch(
      /device\s*==\s*HW\.keystone[\s\S]*?throw new Error/
    );
  });
});

// ── 6. deleteAccount flow ────────────────────────────────────────────

describe('deleteAccount flow in accounts.jsx', () => {
  const accountsSrc = fs.readFileSync(
    path.join(__dirname, '../../ui/app/pages/accounts.jsx'),
    'utf8'
  );

  test('after deleteAccount, discovers remaining accounts dynamically', () => {
    expect(accountsSrc).toMatch(/deleteAccount\(\)[\s\S]*?getAccounts\(\)/);
    expect(accountsSrc).toMatch(/Object\.keys\(remaining\)/);
  });

  test('does NOT hardcode switchAccount(0) after delete', () => {
    const deleteSection = accountsSrc.match(
      /deleteAccount\(\)[\s\S]*?onClose\(\)/
    );
    expect(deleteSection).toBeTruthy();
    expect(deleteSection[0]).not.toMatch(/switchAccount\(0\)/);
  });
});
