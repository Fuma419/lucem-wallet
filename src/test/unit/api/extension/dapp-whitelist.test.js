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
} from '../../../../api/extension/dapp-whitelist';

const DAPP = 'https://dapp.example';
const OTHER = 'https://other.example';

beforeEach(() => {
  global.mockStore = {};
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
});
