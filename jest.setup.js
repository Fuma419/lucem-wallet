Object.assign(global, require('jest-chrome'));

// Treat Jest as the extension environment so `src/platform` uses the adapter with
// mocked chrome.storage (not IndexedDB / web adapter).
global.chrome.runtime.id = 'jest-extension-id';

// mocking the chrome.storage.local API
global.mockStore = {};
global.chrome.storage.local.get = (key, callback) =>
  callback(key ? { [key]: global.mockStore[key] } : global.mockStore);
global.chrome.storage.local.set = (item, callback) => {
  global.mockStore = { ...global.mockStore, ...item };
  callback();
};
global.chrome.storage.local.clear = (callback) => {
  global.mockStore = {};
  if (typeof callback === 'function') callback();
};

const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Unit tests must not reach the network. A live call makes the suite depend on
// a third-party rate limit, and its failures surface as console warnings from
// production error handling rather than as failed assertions — which is how
// Koios 429s ended up looking like the cause of unrelated CI failures. Suites
// that need HTTP replace this with their own mock. The integration suite opts
// out, since live submits are the point of it.
const realFetch = global.fetch;

/**
 * Opt a suite back into real HTTP. Deliberate live checks call this so that
 * reaching the network is a visible choice rather than an accident.
 */
global.allowRealNetwork = () => {
  global.fetch = realFetch;
};

if (process.env.LUCEM_RUN_INTEGRATION !== '1') {
  global.fetch = jest.fn((resource) => {
    const url =
      typeof resource === 'string'
        ? resource
        : (resource && resource.url) || String(resource);
    return Promise.reject(
      new Error(
        `unit tests must not use the network (fetch ${url}); mock the module that calls it`
      )
    );
  });
}
