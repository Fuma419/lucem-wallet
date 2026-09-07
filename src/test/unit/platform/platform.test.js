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
    expect(createPopupSrc).toContain('url: chrome.runtime.getURL');
    expect(createPopupSrc).toContain("type: 'popup'");
    expect(createPopupSrc).not.toContain('chrome.tabs.create');
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
    expect(extSrc).toContain('?next=');
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
});
