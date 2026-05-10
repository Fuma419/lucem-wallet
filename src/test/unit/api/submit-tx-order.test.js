/**
 * Verifies that koiosSubmitTransaction tries Blockfrost first and falls
 * back to Koios only when Blockfrost fails or is unavailable.
 */

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: { load: jest.fn(), Cardano: {} },
}));
jest.mock('../../../platform', () => ({
  __esModule: true,
  default: { storage: { get: jest.fn(), set: jest.fn() } },
}));

const FAKE_TX_HEX = 'aa'.repeat(200);
const FAKE_TX_HASH = 'bb'.repeat(32);

let mockFetch;

beforeEach(() => {
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

describe('koiosSubmitTransaction provider order', () => {
  test('tries Blockfrost first when project ID is configured', async () => {
    jest.doMock('../../../config/provider', () => ({
      __esModule: true,
      default: {
        api: {
          key: () => ({
            blockfrost_project_id: 'preprodREALKEY123',
            koios_key: 'test-koios-key',
          }),
        },
      },
    }));

    const { koiosSubmitTransaction } = require('../../../api/util');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(`"${FAKE_TX_HASH}"`),
    });

    const result = await koiosSubmitTransaction(FAKE_TX_HEX);
    expect(result).toBe(FAKE_TX_HASH);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('blockfrost.io');
  });

  test('falls back to Koios when Blockfrost returns error', async () => {
    jest.doMock('../../../config/provider', () => ({
      __esModule: true,
      default: {
        api: {
          key: () => ({
            blockfrost_project_id: 'preprodREALKEY123',
            koios_key: 'test-koios-key',
          }),
        },
      },
    }));

    jest.resetModules();
    jest.doMock('../../../api/loader', () => ({
      __esModule: true,
      default: { load: jest.fn(), Cardano: {} },
    }));
    jest.doMock('../../../platform', () => ({
      __esModule: true,
      default: { storage: { get: jest.fn(), set: jest.fn() } },
    }));
    const { koiosSubmitTransaction } = require('../../../api/util');

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('server error'),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(`"${FAKE_TX_HASH}"`),
      });

    await koiosSubmitTransaction(FAKE_TX_HEX);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][0]).toContain('blockfrost.io');
    expect(mockFetch.mock.calls[1][0]).toContain('koios.rest');
  });

  test('skips Blockfrost entirely when project ID is a placeholder', async () => {
    jest.resetModules();
    jest.doMock('../../../api/loader', () => ({
      __esModule: true,
      default: { load: jest.fn(), Cardano: {} },
    }));
    jest.doMock('../../../platform', () => ({
      __esModule: true,
      default: { storage: { get: jest.fn(), set: jest.fn() } },
    }));
    jest.doMock('../../../config/provider', () => ({
      __esModule: true,
      default: {
        api: {
          key: () => ({
            blockfrost_project_id: 'DUMMY_PREVIEW',
            koios_key: null,
          }),
        },
      },
    }));
    const { koiosSubmitTransaction } = require('../../../api/util');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(`"${FAKE_TX_HASH}"`),
    });

    await koiosSubmitTransaction(FAKE_TX_HEX);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('koios.rest');
  });
});
