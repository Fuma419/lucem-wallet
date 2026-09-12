/**
 * Regression: a Ledger send from the toolbar popup failed with "Chrome closed
 * the Ledger device list". Chrome cancels a USB/Bluetooth chooser in `popup`
 * windows — the action popup and the dApp prompt both are — so pairing can
 * only happen in a `normal` window. Signing is handed to one.
 */
const fs = require('fs');
const path = require('path');

const read = (rel) =>
  fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

describe('canHostDeviceChooser', () => {
  test('extension trusts only normal windows', () => {
    const src = read('platform/extension.js');
    expect(src).toMatch(/canHostDeviceChooser: async \(\) => \{/);
    expect(src).toMatch(/chrome\.windows\.getCurrent\(\)/);
    expect(src).toMatch(/current\.type === 'normal'/);
    // A failed lookup must not be read as "pairing is fine here".
    expect(src).toMatch(/catch[\s\S]{0,80}return false;/);
  });

  test('the web app can always pair in its tab', () => {
    expect(read('platform/web.js')).toMatch(
      /canHostDeviceChooser: async \(\) => true/
    );
  });

  test('the API wrapper assumes pairing works when the adapter is older', () => {
    const src = read('api/extension/index.js');
    expect(src).toMatch(/export const canHostDeviceChooser = async \(\) => \{/);
    expect(src).toMatch(
      /typeof platform\.navigation\.canHostDeviceChooser !== 'function'/
    );
  });
});

describe('ledger sign session hand-off', () => {
  const indexSrc = read('api/extension/index.js');

  test('opens the signing route in a full-page flow window', () => {
    expect(indexSrc).toMatch(/export const LEDGER_SIGN_PATH = '\/ledger-sign'/);
    expect(indexSrc).toMatch(
      /openFlowWindow\(\s*POPUP\.main,[\s\S]{0,240}next=\$\{encodeURIComponent\(LEDGER_SIGN_PATH\)\}/
    );
    expect(indexSrc).toMatch(/signId=\$\{encodeURIComponent\(signId\)\}/);
  });

  test('the payload lives under its own storage key', () => {
    expect(read('config/config.js')).toMatch(/ledgerTxPending: 'ledgerTxPending'/);
    expect(indexSrc).toMatch(
      /pushSignPayload\(STORAGE\.ledgerTxPending, payload\)/
    );
    expect(indexSrc).toMatch(
      /takeSignPayload\(STORAGE\.ledgerTxPending, signId\)/
    );
    expect(indexSrc).toMatch(
      /clearSignPayload\(STORAGE\.ledgerTxPending, signId\)/
    );
  });
});

describe('confirm modal', () => {
  const src = read('ui/app/components/confirmModal.jsx');

  test('hands off only when a chooser is needed and cannot run here', () => {
    expect(src).toMatch(
      /needsPicker &&\s*chooserHere === false &&\s*typeof props\.onHwLedgerWindow === 'function'/
    );
    expect(src).toMatch(/await Promise\.resolve\(props\.onHwLedgerWindow\(hw\)\)/);
  });

  test('an already-granted device still signs in place', () => {
    // needsPicker is false when Chrome remembers the device, so the popup
    // signs without opening a window.
    expect(src).toMatch(
      /const needsPicker = isLedgerUsbId\(hw\.id\)\s*\?\s*forceUsbPicker \|\| !grantedUsbPick\s*:\s*forceBlePicker \|\| !grantedBleDevice;/
    );
  });

  test('the check is resolved per open, not assumed', () => {
    expect(src).toMatch(/setChooserHere\(null\)/);
    expect(src).toMatch(/canHostDeviceChooser\(\)/);
  });
});

describe('pages that can hand off', () => {
  test('wallet-initiated transactions opt in', () => {
    expect(read('ui/app/pages/send.jsx')).toMatch(
      /onHwLedgerWindow=\{startLedgerWindowSign\}/
    );
    expect(read('ui/app/pages/staking.jsx')).toMatch(/onHwLedgerWindow=\{/);
    expect(read('ui/app/pages/governance.jsx')).toMatch(/onHwLedgerWindow=\{/);
    expect(read('ui/app/components/transactionBuilder.jsx')).toMatch(
      /onHwLedgerWindow=\{\(\) => ledgerWindowSign\(\{ includeStake: true \}\)\}/
    );
  });

  test('dApp prompts do not, since the window cannot return a witness', () => {
    expect(read('ui/app/pages/signTx.jsx')).not.toMatch(/onHwLedgerWindow/);
    expect(read('ui/app/pages/signData.jsx')).not.toMatch(/onHwLedgerWindow/);
  });

  test('collateral does not, since it needs the submitted hash back', () => {
    const src = read('ui/app/components/transactionBuilder.jsx');
    const collateralIdx = src.indexOf('<Box>Collateral</Box>');
    expect(collateralIdx).toBeGreaterThan(-1);
    const collateralSrc = src.slice(collateralIdx, collateralIdx + 1200);
    expect(collateralSrc).not.toMatch(/onHwLedgerWindow/);
  });
});

describe('ledger signing page', () => {
  const src = read('ui/app/pages/ledgerSign.jsx');

  test('pairs from the click, then signs and submits', () => {
    expect(src).toMatch(/takeLedgerSignPayload/);
    expect(src).toMatch(/pickLedgerUsbDevice/);
    expect(src).toMatch(/pickLedgerBluetoothDevice/);
    expect(src).toMatch(/clearLedgerSignPayload/);
    // signAndSubmitHW rebuilds the body from the tx, so it needs the CSL
    // object — the stored hex would throw on `.body()`.
    expect(src).toMatch(
      /Transaction\.from_bytes\([\s\S]{0,120}\)\s*\);\s*await signAndSubmitHW\(unsignedTx, \{/
    );
    // The chooser must open from the click, before any await on a spinner.
    expect(src.indexOf('pickLedgerUsbDevice(')).toBeLessThan(
      src.indexOf('setPhase(Phase.signing)')
    );
  });

  test('a failed attempt returns to the connect step so it can be retried', () => {
    expect(src).toMatch(/formatLedgerError\(e, 'Signing failed\.'\)/);
    expect(src).toMatch(/setPhase\(Phase\.connect\)/);
  });

  test('the route is reachable as a deep link', () => {
    const mainSrc = read('ui/indexMain.jsx');
    expect(mainSrc).toMatch(/LEDGER_SIGN_PATH,/);
    expect(mainSrc).toMatch(/path=\{LEDGER_SIGN_PATH\}/);
  });
});
