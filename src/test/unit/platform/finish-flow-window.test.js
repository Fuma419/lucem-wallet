/**
 * Regression: pairing a Ledger opened a separate window, and finishing there
 * navigated that window to the wallet — so "Open Wallet" produced a second
 * browser-sized wallet window instead of the toolbar popup.
 */
const fs = require('fs');
const path = require('path');

const read = (rel) =>
  fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

describe('finishFlowWindow (extension)', () => {
  const src = read('platform/extension.js');
  const body = src.slice(
    src.indexOf('finishFlowWindow: async'),
    src.indexOf('reloadToWalletBootstrap:')
  );

  test('closes the window instead of navigating it to the wallet', () => {
    expect(body).toMatch(/chrome\.windows\.remove\(current\.id\)/);
    expect(body).toMatch(/current\.type === 'normal'/);
  });

  test('only a flow window is closed — the popup navigates in place', () => {
    expect(body).toMatch(
      /return extensionAdapter\.navigation\.openMainRoute\(path\)/
    );
  });

  test('keeps the window when it is the last one, so Chrome cannot quit', () => {
    expect(body).toMatch(/chrome\.windows\.getAll\(/);
    expect(body).toMatch(/others\.length > 0/);
  });

  test('tries to open the toolbar popup on a window that survives', () => {
    expect(body).toMatch(/chrome\.action\.openPopup\(\{ windowId: target\.id \}\)/);
    // Best effort only: a refused openPopup must still close the window.
    const openPopupIdx = body.indexOf('chrome.action.openPopup');
    const catchIdx = body.indexOf('catch', openPopupIdx);
    const removeIdx = body.indexOf('chrome.windows.remove');
    expect(catchIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(catchIdx);
  });
});

describe('finishFlowWindow (web)', () => {
  test('stays in the tab', () => {
    expect(read('platform/web.js')).toMatch(
      /finishFlowWindow: \(path = '\/wallet'\) =>\s*webAdapter\.navigation\.openMainRoute\(path\)/
    );
  });
});

describe('flow windows use it to finish', () => {
  test('hardware setup closes its window instead of becoming a wallet', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toMatch(/onClick=\{\(\) => finishFlowWindow\(\)\}/);
    expect(src).not.toMatch(/closeCurrentTab/);
  });

  test('Keystone and Ledger signing windows close after submit', () => {
    expect(read('ui/app/tabs/keystoneTx.jsx')).toMatch(
      /setTimeout\(\(\) => finishFlowWindow\(\), 2500\)/
    );
    expect(read('ui/app/pages/ledgerSign.jsx')).toMatch(
      /setTimeout\(\(\) => finishFlowWindow\(\), 2000\)/
    );
  });

  test('Cancel in a flow window closes it too', () => {
    expect(read('ui/app/components/flowCancel.jsx')).toMatch(
      /platform\.navigation\.finishFlowWindow\(safe\)/
    );
  });

  test('the API wrapper falls back for older adapters', () => {
    expect(read('api/extension/index.js')).toMatch(
      /export const finishFlowWindow = \(path = '\/wallet'\) =>/
    );
  });

  test('the setup modal closes as it hands over to the window', () => {
    const src = read('ui/app/components/walletSetupFlow.jsx');
    const continueIdx = src.indexOf('hw-import-continue');
    const handler = src.slice(continueIdx, continueIdx + 400);
    expect(handler.indexOf('onClose()')).toBeGreaterThan(-1);
    expect(handler.indexOf('onClose()')).toBeLessThan(
      handler.indexOf('openFlowWindow(')
    );
  });
});
