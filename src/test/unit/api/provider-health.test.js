/**
 * @jest-environment node
 *
 * Chain reads prefer Blockfrost and fall back to Koios, so a Blockfrost outage
 * used to be invisible: the fallback succeeded and the error was dropped. These
 * tests pin the state that makes it visible.
 */
const {
  describeProviderHealth,
  getProviderHealth,
  overallProviderState,
  recordProviderFailure,
  recordProviderSuccess,
  recordProviderUnconfigured,
  resetProviderHealth,
} = require('../../../api/provider-health');

beforeEach(() => {
  resetProviderHealth();
});

describe('provider health state', () => {
  test('starts unknown for both providers', () => {
    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('unknown');
    expect(health.koios.state).toBe('unknown');
    expect(health.overall).toBe('unknown');
  });

  test('records latency and endpoint on success', () => {
    recordProviderSuccess('koios', 128.6, '/tip');
    const { koios } = getProviderHealth();
    expect(koios.state).toBe('ok');
    expect(koios.latencyMs).toBe(129);
    expect(koios.lastEndpoint).toBe('/tip');
    expect(koios.lastError).toBeNull();
    expect(koios.checkedAt).toBeGreaterThan(0);
  });

  test('keeps a short, single-line error message', () => {
    recordProviderFailure(
      'blockfrost',
      new Error(`Blockfrost API error: 500\n${'x'.repeat(400)}`),
      '/address_info'
    );
    const { blockfrost } = getProviderHealth();
    expect(blockfrost.state).toBe('failing');
    expect(blockfrost.lastError).not.toMatch(/\n/);
    expect(blockfrost.lastError.length).toBeLessThanOrEqual(200);
  });

  test('a later success clears the previous failure', () => {
    recordProviderFailure('koios', new Error('boom'), '/tip');
    recordProviderSuccess('koios', 10, '/tip');
    expect(getProviderHealth().koios.lastError).toBeNull();
  });
});

describe('overall state', () => {
  const snapshot = (blockfrost, koios) => ({
    blockfrost: { state: blockfrost },
    koios: { state: koios },
  });

  test('one provider failing while the other works is degraded', () => {
    expect(overallProviderState(snapshot('failing', 'ok'))).toBe('degraded');
    expect(overallProviderState(snapshot('ok', 'failing'))).toBe('degraded');
  });

  test('every configured provider failing is down', () => {
    expect(overallProviderState(snapshot('failing', 'failing'))).toBe('down');
  });

  test('both reachable is ok', () => {
    expect(overallProviderState(snapshot('ok', 'ok'))).toBe('ok');
  });

  // A build with no Blockfrost project id runs on Koios by design. Reporting
  // that as an outage would make a healthy wallet look broken.
  test('an unconfigured provider is not an outage', () => {
    expect(overallProviderState(snapshot('unconfigured', 'ok'))).toBe('ok');
    expect(overallProviderState(snapshot('unconfigured', 'failing'))).toBe(
      'down'
    );
    expect(overallProviderState(snapshot('unconfigured', 'unknown'))).toBe(
      'unknown'
    );
  });

  test('unconfigured survives repeated marking', () => {
    recordProviderUnconfigured('blockfrost');
    recordProviderUnconfigured('blockfrost');
    recordProviderSuccess('koios', 5, '/tip');
    const health = getProviderHealth();
    expect(health.blockfrost.state).toBe('unconfigured');
    expect(health.overall).toBe('ok');
  });
});

describe('describeProviderHealth', () => {
  test('reads as a status line for each state', () => {
    expect(describeProviderHealth({ state: 'ok', latencyMs: 87 })).toBe(
      'Connected · 87 ms'
    );
    expect(
      describeProviderHealth({ state: 'failing', lastError: 'HTTP 503' })
    ).toBe('Not responding · HTTP 503');
    expect(describeProviderHealth({ state: 'unconfigured' })).toBe(
      'Not configured'
    );
    expect(describeProviderHealth({ state: 'unknown' })).toBe(
      'Not checked yet'
    );
  });
});
