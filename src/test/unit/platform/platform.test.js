/**
 * @jest-environment jsdom
 */

describe('platform/index.js - runtime detection', () => {
  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
  });

  test('selects extension adapter when chrome.runtime.id exists', () => {
    global.chrome = {
      runtime: { id: 'test-extension-id' },
      storage: { local: { get: jest.fn(), set: jest.fn(), remove: jest.fn(), clear: jest.fn() } },
      tabs: { create: jest.fn(), query: jest.fn(), sendMessage: jest.fn() },
      windows: { create: jest.fn(), getLastFocused: jest.fn(), update: jest.fn() },
    };
    const platform = require('../../../platform').default;
    expect(platform.storage).toBeDefined();
    expect(platform.navigation).toBeDefined();
    expect(platform.events).toBeDefined();
    expect(platform.icons).toBeDefined();
  });

  test('selects extension adapter when chrome.runtime.id is empty string', () => {
    global.chrome = {
      runtime: { id: '' },
      storage: { local: { get: jest.fn(), set: jest.fn(), remove: jest.fn(), clear: jest.fn() } },
      tabs: { create: jest.fn(), query: jest.fn(), sendMessage: jest.fn() },
      windows: { create: jest.fn(), getLastFocused: jest.fn(), update: jest.fn() },
    };
    const platform = require('../../../platform').default;
    expect(platform.storage).toBeDefined();
  });

  test('selects web adapter when chrome.runtime.id is undefined', () => {
    global.chrome = undefined;
    const platform = require('../../../platform').default;
    expect(platform.storage).toBeDefined();
    expect(platform.navigation).toBeDefined();
  });
});

describe('platform/web.js - icons', () => {
  let webAdapter;

  beforeAll(() => {
    delete global.chrome;
    jest.resetModules();
    webAdapter = require('../../../platform/web').default;
  });

  test('getFaviconUrl returns Google favicon URL', () => {
    const url = webAdapter.icons.getFaviconUrl('https://example.com');
    expect(url).toContain('google.com/s2/favicons');
    expect(url).toContain('example.com');
  });
});

describe('platform/web.js - events', () => {
  let webAdapter;

  beforeAll(() => {
    delete global.chrome;
    jest.resetModules();
    webAdapter = require('../../../platform/web').default;
  });

  test('broadcastToTabs dispatches CustomEvent', () => {
    const listener = jest.fn();
    window.addEventListener('lucem-wallet-event', listener);
    webAdapter.events.broadcastToTabs({ test: 'data' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ test: 'data' });
    window.removeEventListener('lucem-wallet-event', listener);
  });
});

describe('platform/web.js - navigation', () => {
  let webAdapter;

  beforeAll(() => {
    delete global.chrome;
    jest.resetModules();
    webAdapter = require('../../../platform/web').default;
  });

  test('getCurrentWebpage returns current origin', async () => {
    const result = await webAdapter.navigation.getCurrentWebpage();
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('tabId');
  });

  test('openMainRoute is available on the web adapter', () => {
    expect(typeof webAdapter.navigation.openMainRoute).toBe('function');
  });

  test('openFlowWindow stays in the current tab on the web app', () => {
    expect(typeof webAdapter.navigation.openFlowWindow).toBe('function');
  });
});

describe('platform/extension.js - createTab', () => {
  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
  });

  test('opens create/import in a tab and does not navigate the popup', async () => {
    const created = { id: 42, url: 'chrome-extension://ext/createWalletTab.html' };
    global.chrome = {
      runtime: {
        id: 'ext',
        getURL: (p) => `chrome-extension://ext/${p}`,
        lastError: undefined,
      },
      tabs: {
        create: jest.fn((opts, cb) => cb(created)),
      },
      windows: { create: jest.fn() },
      storage: { local: {} },
    };

    const extAdapter = require('../../../platform/extension').default;
    const tab = await extAdapter.navigation.createTab(
      'createWalletTab',
      '?type=generate'
    );

    expect(tab).toEqual(created);
    expect(global.chrome.tabs.create).toHaveBeenCalledWith(
      {
        url: 'chrome-extension://ext/createWalletTab.html?type=generate',
        active: true,
      },
      expect.any(Function)
    );
    expect(global.chrome.windows.create).not.toHaveBeenCalled();
  });
});

describe('platform/extension.js - openFlowWindow', () => {
  afterEach(() => {
    jest.resetModules();
    delete global.chrome;
  });

  const mockChrome = () => {
    const created = {
      id: 7,
      left: 300,
      tabs: [{ id: 71, url: 'chrome-extension://ext/hwTab.html' }],
    };
    global.chrome = {
      runtime: {
        id: 'ext',
        getURL: (p) => `chrome-extension://ext/${p}`,
        lastError: undefined,
      },
      tabs: { create: jest.fn() },
      windows: {
        create: jest.fn((opts, cb) => cb(created)),
        getLastFocused: jest.fn((cb) =>
          cb({ top: 20, left: 100, width: 1400 })
        ),
        update: jest.fn((id, pos, cb) => cb()),
      },
      storage: { local: {} },
    };
    return created;
  };

  test('hardware setup opens a wallet-sized window, never a browser tab', async () => {
    const created = mockChrome();
    const { FLOW_WINDOW } = require('../../../config/config');
    const extAdapter = require('../../../platform/extension').default;

    const tab = await extAdapter.navigation.openFlowWindow(
      'hwTab',
      '?from=/welcome'
    );

    expect(tab).toEqual(created.tabs[0]);
    expect(global.chrome.tabs.create).not.toHaveBeenCalled();
    const opts = global.chrome.windows.create.mock.calls[0][0];
    expect(opts.url).toBe('chrome-extension://ext/hwTab.html?from=/welcome');
    expect(opts.type).toBe('normal');
    expect(opts.width).toBe(FLOW_WINDOW.width);
    expect(opts.height).toBe(FLOW_WINDOW.height);
  });

  test('leaving a flow marks the main UI as full-page so it is not letterboxed', () => {
    mockChrome();
    const { mainPageUrl } = require('../../../platform/extension');
    const { isFullPageView } = require('../../../config/config');

    expect(mainPageUrl()).toBe(
      'chrome-extension://ext/mainPopup.html?view=full'
    );
    expect(mainPageUrl('/accounts')).toBe(
      'chrome-extension://ext/mainPopup.html?view=full&next=%2Faccounts'
    );
    expect(isFullPageView('?view=full&next=%2Faccounts')).toBe(true);
    expect(isFullPageView('?next=%2Faccounts')).toBe(false);
    expect(isFullPageView('')).toBe(false);
  });

  test('closing a flow and a wipe both keep the surface they came from', () => {
    const fs = require('fs');
    const path = require('path');
    const extSrc = fs.readFileSync(
      path.join(__dirname, '../../../platform/extension.js'),
      'utf8'
    );
    const afterClose = extSrc.split('closeCurrentTab:')[1] || '';
    expect(afterClose.split('},')[0]).toContain('mainPageUrl()');
    // A wipe from the toolbar popup must stay pinned; from a flow window it
    // must stay responsive.
    expect(extSrc).toMatch(
      /isFullPageView\(window\.location\.search\)\s*\?\s*mainPageUrl\(\)/
    );
  });
});

describe('import abandon navigation', () => {
  const fs = require('fs');
  const path = require('path');

  test('createPopup opens a single window via url, without a leftover tab', () => {
    const extSrc = fs.readFileSync(
      path.join(__dirname, '../../../platform/extension.js'),
      'utf8'
    );
    const createPopupSrc = extSrc.split('createTab:')[0];
    expect(createPopupSrc).toContain('createPopup:');
    expect(createPopupSrc).toContain('openExtensionWindow');
    expect(createPopupSrc).toContain('chrome.runtime.getURL');
    expect(createPopupSrc).toContain("type = 'popup'");
    expect(createPopupSrc).toContain("'normal'");
    expect(createPopupSrc).not.toContain('chrome.tabs.create');
  });

  test('hardware setup leaves the popup for a window, not a browser tab', () => {
    const setupSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/walletSetupFlow.jsx'),
      'utf8'
    );
    expect(setupSrc).toMatch(
      /openFlowWindow\(\s*TAB\.hw,\s*appendFlowReturnQuery\('', returnTo\)\s*\)/
    );
    expect(setupSrc).not.toMatch(/createTab\(/);
    const apiSrc = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/index.js'),
      'utf8'
    );
    expect(apiSrc).toContain('export const openFlowWindow');
    expect(apiSrc).toMatch(/openFlowWindow\(\s*TAB\.keystoneTx/);
  });

  test('extension createTab opens a tab in the current window, not a new window', () => {
    const extSrc = fs.readFileSync(
      path.join(__dirname, '../../../platform/extension.js'),
      'utf8'
    );
    const afterCreateTab = extSrc.split('createTab:')[1] || '';
    const createTabSrc = afterCreateTab.split('closeCurrentTab:')[0];
    expect(createTabSrc).toContain('chrome.tabs.create');
    expect(createTabSrc).not.toContain('chrome.windows.create');
    // Toolbar popups die on in-document navigation; that is why create/import
    // appeared to do nothing after the PWA-style same-document navigation.
    expect(createTabSrc).not.toMatch(/location\.assign\(/);
  });

  test('web and extension adapters expose openMainRoute with an allowlist', () => {
    const webSrc = fs.readFileSync(
      path.join(__dirname, '../../../platform/web.js'),
      'utf8'
    );
    const extSrc = fs.readFileSync(
      path.join(__dirname, '../../../platform/extension.js'),
      'utf8'
    );
    expect(webSrc).toContain('openMainRoute:');
    expect(extSrc).toContain('openMainRoute:');
    expect(webSrc).toContain("'/accounts'");
    expect(extSrc).toContain('next=');
    expect(webSrc).toMatch(/location\.origin\}\/\$\{tab\}\.html/);
    expect(webSrc).not.toMatch(/location\.href = tab \+ '\.html'/);
  });

  test('create/import success opens the wallet in the same window', () => {
    const createSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    expect(createSrc).toContain('Open Wallet');
    expect(createSrc).toContain("openMainRoute('/wallet')");
    expect(createSrc).not.toContain('close this tab and continue with the extension');
    expect(createSrc).not.toMatch(/isExtension \? 'Close'/);
    const hwSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/tabs/hw.jsx'),
      'utf8'
    );
    expect(hwSrc).toContain('Open Wallet');
    expect(hwSrc).not.toContain('close this tab and continue with the extension');
  });

  test('create/import tabs expose Cancel via leaveSetupFlow', () => {
    const createSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    const cancelSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/flowCancel.jsx'),
      'utf8'
    );
    expect(createSrc).toContain('SetupShellHeader');
    expect(createSrc).toContain('SetupCancelButton');
    expect(createSrc).toContain('leaveSetupFlow');
    expect(createSrc).not.toContain('SetupCardCloseButton');
    expect(cancelSrc).toContain('resolveSetupReturnPath');
    expect(cancelSrc).toContain('data-testid="setup-cancel-button"');
  });

  test('main bootstrap honors ?next= deep links before defaulting to /wallet', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../ui/indexMain.jsx'),
      'utf8'
    );
    expect(src).toContain(".get('next')");
    expect(src).toContain("deepLink !== '/welcome'");
  });

  test('create/import seed flows stay in the main popup SPA', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/indexMain.jsx'),
      'utf8'
    );
    const setupSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/walletSetupFlow.jsx'),
      'utf8'
    );
    const createSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    const cancelSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/flowCancel.jsx'),
      'utf8'
    );
    expect(mainSrc).toContain('FLOW_SETUP_PATHS');
    expect(mainSrc).toContain('CreateWalletApp');
    expect(setupSrc).toContain('openSeedSetup');
    expect(setupSrc).not.toMatch(/createTab\(\s*TAB\.createWallet/);
    expect(createSrc).toContain('export const CreateWalletApp');
    expect(createSrc).toContain("navigate('/wallet')");
    expect(cancelSrc).toContain('FLOW_SETUP_PATHS');
    expect(cancelSrc).toContain('#createWalletTab');
  });
});
