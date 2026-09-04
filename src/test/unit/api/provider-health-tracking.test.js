/**
 * @jest-environment node
 *
 * koiosRequest is the single chokepoint for chain reads, so it is where the
 * "which provider answered, and did one fail?" verdict has to be recorded.
 */
jest.mock('../../../api/extension', () => ({
  getNetwork: jest.fn().mockResolvedValue({ id: 'preview', name: 'preview' }),
}));

const { koiosRequest } = require('../../../api/util');
const {
  getProviderHealth,
  resetProviderHealth,
} = require('../../../api/provider-health');

const TIP = [{ abs_slot: 1, block_height: 2, hash: 'ab' }];

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
  };
}

const isBlockfrost = (url) => String(url).includes('blockfrost.io');

describe('provider health recorded through koiosRequest', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.BLOCKFROST_PROJECT_ID_PREVIEW;

  beforeEach(() => {
    resetProviderHealth();
    process.env.BLOCKFROST_PROJECT_ID_PREVIEW = 'preview_test_project_id';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.BLOCKFROST_PROJECT_ID_PREVIEW;
    } else {
      process.env.BLOCKFROST_PROJECT_ID_PREVIEW = originalKey;
    }
  });

  test('Blockfrost serving the request marks it connected', async () => {
    global.fetch = jest.fn(async (url) =>
      isBlockfrost(url)
        ? jsonResponse(200, { slot: 1, height: 2, hash: 'ab' })
        : jsonResponse(500, 'koios should not be called')
    );

    await koiosRequest('/tip', {}, undefined, undefined, 'preview');

    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('ok');
    expect(health.overall).toBe('ok');
  });

  // The bug this fixes: the fallback succeeded, the Blockfrost error was
  // dropped, and the user had no way to know one provider was down.
  test('a silent fallback to Koios reports degraded, not ok', async () => {
    global.fetch = jest.fn(async (url) =>
      isBlockfrost(url)
        ? jsonResponse(503, 'Service Unavailable')
        : jsonResponse(200, TIP)
    );

    const result = await koiosRequest('/tip', {}, undefined, undefined, 'preview');

    expect(result).toEqual(TIP);
    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('failing');
    expect(health.blockfrost.lastError).toMatch(/503|Service Unavailable/);
    expect(health.koios.state).toBe('ok');
    expect(health.overall).toBe('degraded');
  });

  test('both providers failing reports down', async () => {
    global.fetch = jest.fn(async () => jsonResponse(500, 'boom'));

    await expect(
      koiosRequest('/tip', {}, undefined, undefined, 'preview')
    ).rejects.toThrow(/Blockfrost failed then Koios failed/);

    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('failing');
    expect(health.koios.state).toBe('failing');
    expect(health.overall).toBe('down');
  });

  test('no project id reports Blockfrost unconfigured, not failing', async () => {
    delete process.env.BLOCKFROST_PROJECT_ID_PREVIEW;
    global.fetch = jest.fn(async (url) => {
      if (isBlockfrost(url)) throw new Error('Blockfrost must not be called');
      return jsonResponse(200, TIP);
    });

    await koiosRequest('/tip', {}, undefined, undefined, 'preview');

    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('unconfigured');
    expect(health.koios.state).toBe('ok');
    // A build without a Blockfrost key is healthy, not degraded.
    expect(health.overall).toBe('ok');
  });

  // A ticker-filtered pool search is PostgREST-only, so the adapter declines it
  // and returns undefined. Declining is not a fault.
  test('an endpoint with no Blockfrost mapping does not blame Blockfrost', async () => {
    global.fetch = jest.fn(async (url) => {
      if (isBlockfrost(url)) throw new Error('unmapped endpoint must not fetch');
      return jsonResponse(200, [{ pool_id_bech32: 'pool1' }]);
    });

    await koiosRequest(
      '/pool_list?ticker=eq.LUCEM',
      {},
      undefined,
      undefined,
      'preview'
    );

    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('unknown');
    expect(health.koios.state).toBe('ok');
  });
});
