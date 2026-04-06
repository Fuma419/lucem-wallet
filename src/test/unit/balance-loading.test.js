/**
 * Tests for balance loading fixes:
 * 1. koiosRequest must not retry infinitely on HTTP 500
 * 2. Zero-balance wallets must display "0" not "..."
 */

// --- Test 1: koiosRequest retry limit ---

describe('koiosRequest retry behavior', () => {
  let koiosRequest;
  let mockGetNetwork;

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockGetNetwork = jest.fn().mockResolvedValue({ id: 'mainnet', name: 'mainnet' });

    jest.doMock('../../api/extension', () => ({
      getNetwork: mockGetNetwork,
    }));
    jest.doMock('../../config/provider', () => ({}));
    jest.doMock('../../api/loader', () => ({}));
    jest.doMock('../../config/config', () => ({ NETWORK_ID: {} }));
    jest.doMock('@emurgo/cip14-js', () => ({}));
    jest.doMock('@cardano-foundation/ledgerjs-hw-app-cardano', () => ({
      AddressType: {}, CertificateType: {}, DatumType: {}, HARDENED: 0,
      PoolKeyType: {}, PoolOwnerType: {}, PoolRewardAccountType: {},
      RelayType: {}, CredentialParamsType: {}, TransactionSigningMode: {},
      TxAuxiliaryDataType: {}, TxOutputDestinationType: {},
      TxOutputFormat: {}, TxRequiredSignerType: {},
    }));
    jest.doMock('crc', () => ({ crc8: jest.fn() }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('should throw after max retries when API returns status_code 500 in body', async () => {
    const { koiosRequest: kr } = require('../../api/util');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status_code: 500 }),
    });

    await expect(kr('/test-endpoint', {})).rejects.toThrow(
      'max retries exceeded'
    );

    // Should have been called limited times (MAX_RETRIES + 1 initial)
    expect(global.fetch.mock.calls.length).toBeLessThanOrEqual(6);
  });

  test('should return immediately on successful response', async () => {
    const { koiosRequest: kr } = require('../../api/util');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ tx_hash: 'abc123' }]),
    });

    const result = await kr('/test-endpoint', {});
    expect(result).toEqual([{ tx_hash: 'abc123' }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('should throw on non-500 HTTP errors', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { koiosRequest: kr } = require('../../api/util');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: () => Promise.resolve('rate limited'),
      });

      await expect(kr('/test-endpoint', {})).rejects.toThrow('Koios API error');
    } finally {
      errSpy.mockRestore();
    }
  });
});

// --- Test 2: Zero-balance quantity expression ---

describe('balance display quantity logic', () => {
  const { bigIntLovelace } = require('../../api/lovelace-scalar');

  /** Mirrors wallet.jsx UnitDisplay quantity after bigIntLovelace hardening. */
  function computeDisplayQuantity(account) {
    if (!account) return undefined;
    if (account.lovelace !== null && account.lovelace !== undefined) {
      return (
        bigIntLovelace(account.lovelace) -
        bigIntLovelace(account.minAda) -
        bigIntLovelace(account.collateral?.lovelace)
      ).toString();
    }
    return undefined;
  }

  test('should return "0" for a newly created wallet with zero balance (number)', () => {
    const account = { lovelace: 0, minAda: 0, collateral: null };
    expect(computeDisplayQuantity(account)).toBe('0');
  });

  test('should return "0" for a newly created wallet with zero balance (string)', () => {
    const account = { lovelace: '0', minAda: 0, collateral: null };
    expect(computeDisplayQuantity(account)).toBe('0');
  });

  test('should return undefined when account is null', () => {
    expect(computeDisplayQuantity(null)).toBeUndefined();
  });

  test('should return undefined when lovelace is null (not yet loaded)', () => {
    const account = { lovelace: null, minAda: 0, collateral: null };
    expect(computeDisplayQuantity(account)).toBeUndefined();
  });

  test('should compute correct balance for funded wallet', () => {
    const account = {
      lovelace: '5000000',
      minAda: '1000000',
      collateral: null,
    };
    expect(computeDisplayQuantity(account)).toBe('4000000');
  });

  test('should accept bigint lovelace and minAda from normalized scalars', () => {
    const account = {
      lovelace: 9000000n,
      minAda: 1000000n,
      collateral: null,
    };
    expect(computeDisplayQuantity(account)).toBe('8000000');
  });

  test('should subtract collateral from balance', () => {
    const account = {
      lovelace: '10000000',
      minAda: '2000000',
      collateral: { lovelace: '5000000' },
    };
    expect(computeDisplayQuantity(account)).toBe('3000000');
  });

  test('should not throw when lovelace is a stray object (truthy pre-fix bug)', () => {
    const account = {
      lovelace: { not: 'valid' },
      minAda: 0,
      collateral: null,
    };
    expect(computeDisplayQuantity(account)).toBe('0');
  });
});

// --- Test 3: Verify the BROKEN (pre-fix) expression would fail ---

describe('old balance expression regression check', () => {
  /**
   * The OLD expression was:
   *   state.account && state.account.lovelace && BigInt(...)
   *
   * This fails for lovelace === 0 because 0 is falsy.
   */
  function oldComputeDisplayQuantity(account) {
    return (
      account &&
      account.lovelace &&
      (
        BigInt(account.lovelace) -
        BigInt(account.minAda) -
        BigInt(account.collateral ? account.collateral.lovelace : 0)
      ).toString()
    );
  }

  test('old expression returns 0 (falsy) for zero-balance wallet, confirming the bug', () => {
    const account = { lovelace: 0, minAda: 0, collateral: null };
    const result = oldComputeDisplayQuantity(account);
    // The old code returns 0 (the number, which is falsy), NOT "0" the string
    // UnitDisplay treats this as missing → shows "..."
    expect(result).toBeFalsy();
  });
});
