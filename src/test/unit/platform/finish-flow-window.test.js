/**
 * Regression: pairing a Ledger opened a browser window, and finishing there
 * navigated to the main wallet — so Lucem sat in the browser instead of the
 * toolbar popup. Flows now use a temporary tab that closes itself.
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

  test('closes the tab instead of navigating it to the wallet', () => {
    expect(body).toMatch(/chrome\.tabs\.remove\(tabId\)/);
    expect(body).not.toMatch(/chrome\.windows\.remove/);
    expect(body).not.toMatch(/openMainRoute/);
  });

  test('does not close the toolbar or CIP-30 popup', () => {
    expect(body).toMatch(/currentWin\.type === 'popup'/);
  });

  test('tries to open the toolbar popup before removing the tab', () => {
    expect(body).toMatch(/chrome\.action\.openPopup\(/);
    const openPopupIdx = body.indexOf('chrome.action.openPopup');
    const catchIdx = body.indexOf('catch', openPopupIdx);
    const removeIdx = body.indexOf('chrome.tabs.remove');
    expect(catchIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(catchIdx);
  });
});

describe('standing rule', () => {
  test('forbids browser windows and the main app in the browser', () => {
    const rule = fs.readFileSync(
      path.join(__dirname, '../../../../.cursor/rules/no-browser-windows.mdc'),
      'utf8'
    );
    expect(rule).toMatch(/never.*browser window/i);
    expect(rule).toMatch(/mainPopup\.html/);
    expect(rule).toMatch(/temporary tab/);
    expect(rule).toMatch(/PWA \/ web app/);
    expect(rule).toMatch(/first-class product/);
  });
});

describe('openFlowWindow never opens a window', () => {
  const src = read('platform/extension.js');

  test('hardware flows reuse createTab', () => {
    expect(src).toMatch(
      /openFlowWindow: \(page, query = ''\) =>\s*extensionAdapter\.navigation\.createTab\(page, query\)/
    );
  });

  test('the only windows.create is the CIP-30 popup dialog', () => {
    expect(src).toMatch(/type = 'popup'/);
    expect(src).not.toMatch(/type:\s*'normal'/);
    expect(src).not.toMatch(/'normal'\s*\)/);
  });
});

describe('finishFlowWindow (web)', () => {
  test('stays in the tab — the PWA is the in-browser wallet', () => {
    const webSrc = read('platform/web.js');
    expect(webSrc).toMatch(
      /finishFlowWindow: \(path = '\/wallet'\) =>\s*webAdapter\.navigation\.openMainRoute\(path\)/
    );
    expect(webSrc).toMatch(/PWA is the in-browser product/);
    expect(webSrc).not.toMatch(/window\.open\(/);
  });
});

describe('flow tabs use it to finish', () => {
  test('hardware setup closes its tab instead of becoming a wallet', () => {
    const src = read('ui/app/tabs/hw.jsx');
    expect(src).toMatch(/onClick=\{\(\) => finishFlowWindow\(\)\}/);
    expect(src).not.toMatch(/closeCurrentTab/);
  });

  test('Keystone and Ledger signing tabs close after submit', () => {
    expect(read('ui/app/tabs/keystoneTx.jsx')).toMatch(
      /setTimeout\(\(\) => finishFlowWindow\(\), 2500\)/
    );
    expect(read('ui/app/pages/ledgerSign.jsx')).toMatch(
      /setTimeout\(\(\) => finishFlowWindow\(\), 2000\)/
    );
  });

  test('Cancel in a flow tab closes it too', () => {
    expect(read('ui/app/components/flowCancel.jsx')).toMatch(
      /platform\.navigation\.finishFlowWindow\(safe\)/
    );
  });

  test('the API wrapper falls back for older adapters', () => {
    expect(read('api/extension/index.js')).toMatch(
      /export const finishFlowWindow = \(path = '\/wallet'\) =>/
    );
  });

  test('the setup modal closes as it hands over to the tab', () => {
    const src = read('ui/app/components/walletSetupFlow.jsx');
    const continueIdx = src.indexOf('hw-import-continue');
    const handler = src.slice(continueIdx, continueIdx + 400);
    expect(handler.indexOf('onClose()')).toBeGreaterThan(-1);
    expect(handler.indexOf('onClose()')).toBeLessThan(
      handler.indexOf('openFlowWindow(')
    );
  });
});
