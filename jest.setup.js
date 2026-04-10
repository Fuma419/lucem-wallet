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
