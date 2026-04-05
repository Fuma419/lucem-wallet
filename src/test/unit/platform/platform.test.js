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
});
