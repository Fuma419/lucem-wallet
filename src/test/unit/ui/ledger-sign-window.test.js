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
  test('extension trusts only normal windows, and never the toolbar popup', () => {
    const src = read('platform/extension.js');
    expect(src).toMatch(/canHostDeviceChooser: async \(\) => \{/);
    expect(src).toMatch(/chrome\.windows\.getCurrent\(\)/);
    expect(src).toMatch(/current\.type === 'normal'/);
    // getCurrent() from the action popup reports the parent browser window.
    expect(src).toMatch(/querySelector\(`#\$\{POPUP\.main\}`\)/);
    expect(src).toMatch(/querySelector\(`#\$\{POPUP\.internal\}`\)/);
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

  test('opens a dedicated signing tab, never the main wallet page', () => {
    expect(indexSrc).toMatch(/export const LEDGER_SIGN_PATH = '\/ledger-sign'/);
    expect(indexSrc).toMatch(
      /openFlowWindow\(\s*TAB\.ledgerSign,\s*`\?signId=\$\{encodeURIComponent\(signId\)\}`/
    );
    expect(indexSrc).not.toMatch(/openFlowWindow\(\s*POPUP\.main/);
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
    expect(indexSrc).toMatch(/export const writeLedgerSignResult/);
    expect(indexSrc).toMatch(/export const waitForLedgerSignResult/);
    expect(indexSrc).toMatch(/mode: mode === 'witness' \? 'witness' : 'submit'/);
  });
});

describe('confirm modal', () => {
  const src = read('ui/app/components/confirmModal.jsx');

  test('the toolbar popup always hands Ledger signing to the tab', () => {
    expect(src).toMatch(/detectIsExtensionPopup/);
    expect(src).toMatch(
      /inExtensionPopup \|\| chooserHere === false/
    );
    expect(src).toMatch(/await Promise\.resolve\(props\.onHwLedgerWindow\(hw\)\)/);
  });

  test('a remembered device does not keep pairing in the popup', () => {
    // A granted BLE device used to skip the hand-off; requestDevice then
    // ran in the popup and Chrome cancelled it.
    const handler = src.slice(src.indexOf('if (hw.device === HW.ledger)'));
    const handoff = handler.indexOf('onHwLedgerWindow');
    const pickBle = handler.indexOf('pickLedgerBluetoothDevice');
    expect(handoff).toBeGreaterThan(-1);
    expect(pickBle).toBeGreaterThan(handoff);
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

  test('dApp signTx hands Ledger pairing to a witness tab; signData stays blocked', () => {
    expect(read('ui/app/pages/signTx.jsx')).toMatch(/onHwLedgerWindow/);
    expect(read('ui/app/pages/signTx.jsx')).toMatch(/mode: 'witness'/);
    expect(read('ui/app/pages/signTx.jsx')).toMatch(/waitForLedgerSignResult/);
    expect(read('ui/app/pages/signData.jsx')).not.toMatch(/onHwLedgerWindow/);
  });

  test('collateral hands off because the toolbar popup is destroyed', () => {
    const src = read('ui/app/components/transactionBuilder.jsx');
    const collateralIdx = src.indexOf('<Box>Collateral</Box>');
    expect(collateralIdx).toBeGreaterThan(-1);
    const collateralSrc = src.slice(collateralIdx, collateralIdx + 1800);
    expect(collateralSrc).toMatch(/onHwLedgerWindow/);
    expect(collateralSrc).toMatch(/purpose: 'collateral'/);
  });
});

describe('ledger signing page', () => {
  const src = read('ui/app/pages/ledgerSign.jsx');

  test('pairs from the click, then signs and submits or returns a witness', () => {
    expect(src).toMatch(/takeLedgerSignPayload/);
    expect(src).toMatch(/pickLedgerUsbDevice/);
    expect(src).toMatch(/pickLedgerBluetoothDevice/);
    expect(src).toMatch(/writeLedgerSignResult/);
    expect(src).toMatch(/signTxHW\(/);
    expect(src).toMatch(/signAndSubmitHW\(unsignedTx/);
    expect(src).toMatch(/mode === 'witness'/);
    expect(src).toMatch(/purpose === 'collateral'/);
    expect(src).toMatch(/setCollateral/);
    expect(src).toMatch(/closeLedgerApp/);
    // The chooser must open from the click, before any await on a spinner.
    expect(src.indexOf('pickLedgerUsbDevice(')).toBeLessThan(
      src.indexOf('setPhase(Phase.signing)')
    );
  });

  test('a failed attempt returns to the connect step so it can be retried', () => {
    expect(src).toMatch(/formatLedgerError\(e, 'Signing failed\.'\)/);
    expect(src).toMatch(/setPhase\(Phase\.connect\)/);
  });

  test('the web app can still deep-link the same page', () => {
    const mainSrc = read('ui/indexMain.jsx');
    expect(mainSrc).toMatch(/LEDGER_SIGN_PATH,/);
    expect(mainSrc).toMatch(/path=\{LEDGER_SIGN_PATH\}/);
  });

  test('the extension hosts signing on its own html entry', () => {
    expect(read('ui/app/tabs/ledgerSign.jsx')).toContain('TAB.ledgerSign');
    expect(read('pages/Tab/ledgerSign.html')).toContain('id="ledgerSign"');
    expect(
      fs.readFileSync(path.join(__dirname, '../../../../webpack.config.js'), 'utf8')
    ).toMatch(/filename: 'ledgerSign.html'/);
  });
});
