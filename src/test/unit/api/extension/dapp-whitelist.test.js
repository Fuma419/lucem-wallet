/**
 * Unit tests for the dApp origin allowlist module extracted from
 * api/extension/index.js. Exercises the real functions against the mocked
 * chrome.storage adapter (jest.setup) so the trust anchor for dApp
 * authorization has direct, behavioral coverage.
 */
import {
  getWhitelisted,
  isWhitelisted,
  setWhitelisted,
  removeWhitelisted,
  getDappAccountIndex,
  bindCip30AccountIfUnbound,
} from '../../../../api/extension/dapp-whitelist';
import { STORAGE } from '../../../../config/config';

const DAPP = 'https://dapp.example';
const OTHER = 'https://other.example';

beforeEach(() => {
  global.mockStore = { [STORAGE.currentAccount]: 2 };
});

describe('dApp whitelist', () => {
  test('an unknown origin is not whitelisted and the list starts empty', async () => {
    await expect(getWhitelisted()).resolves.toEqual([]);
    await expect(isWhitelisted(DAPP)).resolves.toBe(false);
  });

  test('setWhitelisted authorizes exactly the given origin', async () => {
    await setWhitelisted(DAPP);

    await expect(getWhitelisted()).resolves.toEqual([DAPP]);
    await expect(isWhitelisted(DAPP)).resolves.toBe(true);
    // A different origin must not inherit authorization.
    await expect(isWhitelisted(OTHER)).resolves.toBe(false);
  });

  test('multiple origins are tracked independently', async () => {
    await setWhitelisted(DAPP);
    await setWhitelisted(OTHER);

    await expect(getWhitelisted()).resolves.toEqual([DAPP, OTHER]);
    await expect(isWhitelisted(DAPP)).resolves.toBe(true);
    await expect(isWhitelisted(OTHER)).resolves.toBe(true);
  });

  test('removeWhitelisted revokes only the targeted origin', async () => {
    await setWhitelisted(DAPP);
    await setWhitelisted(OTHER);

    await removeWhitelisted(DAPP);

    await expect(isWhitelisted(DAPP)).resolves.toBe(false);
    await expect(isWhitelisted(OTHER)).resolves.toBe(true);
    await expect(getWhitelisted()).resolves.toEqual([OTHER]);
  });

  test('origin matching is exact (no substring / prefix bypass)', async () => {
    await setWhitelisted(DAPP);

    await expect(isWhitelisted('https://dapp.example.evil.com')).resolves.toBe(
      false
    );
    await expect(isWhitelisted('https://dapp.exampl')).resolves.toBe(false);
    await expect(isWhitelisted(`${DAPP}/path`)).resolves.toBe(false);
  });

  test('setWhitelisted does not duplicate an origin already on the list', async () => {
    await setWhitelisted(DAPP, 0);
    await setWhitelisted(DAPP, 0);
    await expect(getWhitelisted()).resolves.toEqual([DAPP]);
  });

  test('setWhitelisted binds the origin to the given account index', async () => {
    await setWhitelisted(DAPP, 1);
    await expect(getDappAccountIndex(DAPP)).resolves.toBe(1);
    await expect(getDappAccountIndex(OTHER)).resolves.toBeNull();
  });

  test('setWhitelisted without an index uses the currently selected account', async () => {
    await setWhitelisted(DAPP);
    await expect(getDappAccountIndex(DAPP)).resolves.toBe(2);
  });

  test('removeWhitelisted drops the origin and its account binding', async () => {
    await setWhitelisted(DAPP, 1);
    await removeWhitelisted(DAPP);
    await expect(getDappAccountIndex(DAPP)).resolves.toBeNull();
    await expect(isWhitelisted(DAPP)).resolves.toBe(false);
  });

  test('bindCip30AccountIfUnbound snapshots the current account only once', async () => {
    await setWhitelisted(DAPP, 0);
    global.mockStore[STORAGE.currentAccount] = 9;
    await bindCip30AccountIfUnbound(DAPP);
    await expect(getDappAccountIndex(DAPP)).resolves.toBe(0);

    await bindCip30AccountIfUnbound(OTHER);
    await expect(getDappAccountIndex(OTHER)).resolves.toBe(9);
  });
});
