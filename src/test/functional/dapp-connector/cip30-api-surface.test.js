/**
 * @jest-environment jsdom
 *
 * CIP-30 (+ CIP-95) API surface compliance for the injected connector.
 *
 * Exercises the real `src/pages/Content/injected.js` provider that a dApp sees
 * on `window.cardano.lucem`. The transport layer (`src/api/webpage`) is mocked
 * so the test asserts the injected contract — provider metadata, the full
 * CIP-30 method set returned from `enable()`, correct argument delegation, and
 * opt-in CIP-95 governance methods — without needing the extension runtime.
 */

const mockWebpage = {
  enable: jest.fn(),
  isEnabled: jest.fn(),
  getBalance: jest.fn(),
  signData: jest.fn(),
  signDataCIP30: jest.fn(),
  signTx: jest.fn(),
  submitTx: jest.fn(),
  getUtxos: jest.fn(),
  getCollateral: jest.fn(),
  getAddress: jest.fn(),
  getRewardAddress: jest.fn(),
  getNetworkId: jest.fn(),
  getPubDRepKey: jest.fn(),
  getRegisteredPubStakeKeys: jest.fn(),
  getUnregisteredPubStakeKeys: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
};

jest.mock('../../../api/webpage', () => mockWebpage);

const CIP30_API_METHODS = [
  'getNetworkId',
  'getUtxos',
  'getCollateral',
  'getBalance',
  'getUsedAddresses',
  'getUnusedAddresses',
  'getChangeAddress',
  'getRewardAddresses',
  'signTx',
  'signData',
  'submitTx',
  'getExtensions',
  'on',
  'off',
];

const CIP95_API_METHODS = [
  'getPubDRepKey',
  'getRegisteredPubStakeKeys',
  'getUnregisteredPubStakeKeys',
  'signData',
];

describe('dApp connector — CIP-30 injected API surface', () => {
  beforeAll(() => {
    // Loading the injected script installs window.cardano / window.cardano.lucem.
    require('../../../pages/Content/injected.js');
  });

  beforeEach(() => {
    Object.values(mockWebpage).forEach((fn) => fn.mockReset());
    mockWebpage.enable.mockResolvedValue(true);
    mockWebpage.isEnabled.mockResolvedValue(false);
    mockWebpage.getBalance.mockResolvedValue('00');
    mockWebpage.getUtxos.mockResolvedValue([]);
    mockWebpage.getCollateral.mockResolvedValue([]);
    mockWebpage.getAddress.mockResolvedValue('addr_used_hex');
    mockWebpage.getRewardAddress.mockResolvedValue('addr_reward_hex');
    mockWebpage.getNetworkId.mockResolvedValue(1);
    mockWebpage.signTx.mockResolvedValue('signed_witness_hex');
    mockWebpage.signDataCIP30.mockResolvedValue({ signature: 'sig', key: 'k' });
    mockWebpage.submitTx.mockResolvedValue('tx_hash');
    mockWebpage.getPubDRepKey.mockResolvedValue('drep_key_hex');
    mockWebpage.getRegisteredPubStakeKeys.mockResolvedValue(['reg_key']);
    mockWebpage.getUnregisteredPubStakeKeys.mockResolvedValue(['unreg_key']);
  });

  test('exposes the CIP-30 provider under window.cardano.lucem with metadata', () => {
    expect(window.cardano).toBeDefined();
    const provider = window.cardano.lucem;
    expect(provider).toBeDefined();
    expect(provider.name).toBe('Lucem');
    expect(provider.apiVersion).toBe('0.1.0');
    expect(typeof provider.enable).toBe('function');
    expect(typeof provider.isEnabled).toBe('function');
    expect(typeof provider.icon).toBe('string');
    expect(provider.icon.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('advertises CIP-95 as a supported extension', () => {
    expect(window.cardano.lucem.supportedExtensions).toEqual([{ cip: 95 }]);
  });

  test('keeps the deprecated top-level window.cardano namespace for back-compat', () => {
    const deprecated = window.cardano;
    [
      'enable',
      'isEnabled',
      'getBalance',
      'signData',
      'signTx',
      'submitTx',
      'getUtxos',
      'getCollateral',
      'getUsedAddresses',
      'getUnusedAddresses',
      'getChangeAddress',
      'getRewardAddress',
      'getNetworkId',
      'onAccountChange',
      'onNetworkChange',
      'off',
    ].forEach((method) => {
      expect(typeof deprecated[method]).toBe('function');
    });
  });

  test('isEnabled() delegates to the transport layer', async () => {
    mockWebpage.isEnabled.mockResolvedValue(true);
    await expect(window.cardano.lucem.isEnabled()).resolves.toBe(true);
    expect(mockWebpage.isEnabled).toHaveBeenCalledTimes(1);
  });

  test('enable() returns undefined when the connection is not granted', async () => {
    mockWebpage.enable.mockResolvedValue(false);
    const api = await window.cardano.lucem.enable();
    expect(api).toBeUndefined();
  });

  test('enable() returns the full CIP-30 API when granted', async () => {
    const api = await window.cardano.lucem.enable();
    expect(api).toBeDefined();
    CIP30_API_METHODS.forEach((method) => {
      expect(typeof api[method]).toBe('function');
    });
  });

  test('does not attach CIP-95 methods unless the extension is requested', async () => {
    const api = await window.cardano.lucem.enable();
    expect(api.cip95).toBeUndefined();
  });

  test('getExtensions() returns no extensions when none were requested', async () => {
    const api = await window.cardano.lucem.enable();
    await expect(api.getExtensions()).resolves.toEqual([]);
  });

  test('attaches CIP-95 governance methods when {cip:95} is requested', async () => {
    const api = await window.cardano.lucem.enable({ extensions: [{ cip: 95 }] });
    expect(api.cip95).toBeDefined();
    CIP95_API_METHODS.forEach((method) => {
      expect(typeof api.cip95[method]).toBe('function');
    });
  });

  test('getExtensions() reports CIP-95 after it is requested (gov.tools handshake)', async () => {
    const api = await window.cardano.lucem.enable({ extensions: [{ cip: 95 }] });
    await expect(api.getExtensions()).resolves.toEqual([{ cip: 95 }]);
  });

  describe('granted API delegates to the transport with CIP-30 semantics', () => {
    let api;
    beforeEach(async () => {
      api = await window.cardano.lucem.enable();
    });

    test('getNetworkId → getNetworkId', async () => {
      await expect(api.getNetworkId()).resolves.toBe(1);
      expect(mockWebpage.getNetworkId).toHaveBeenCalledTimes(1);
    });

    test('getUtxos forwards amount and paginate', async () => {
      const paginate = { page: 1, limit: 5 };
      await api.getUtxos('1000000', paginate);
      expect(mockWebpage.getUtxos).toHaveBeenCalledWith('1000000', paginate);
    });

    test('getBalance → getBalance', async () => {
      await expect(api.getBalance()).resolves.toBe('00');
      expect(mockWebpage.getBalance).toHaveBeenCalledTimes(1);
    });

    test('getUsedAddresses wraps the change address in an array', async () => {
      await expect(api.getUsedAddresses()).resolves.toEqual(['addr_used_hex']);
      expect(mockWebpage.getAddress).toHaveBeenCalledTimes(1);
    });

    test('getUnusedAddresses returns an empty array (CIP-30 allows this)', async () => {
      await expect(api.getUnusedAddresses()).resolves.toEqual([]);
    });

    test('getChangeAddress → getAddress', async () => {
      await expect(api.getChangeAddress()).resolves.toBe('addr_used_hex');
      expect(mockWebpage.getAddress).toHaveBeenCalledTimes(1);
    });

    test('getRewardAddresses wraps the reward address in an array', async () => {
      await expect(api.getRewardAddresses()).resolves.toEqual(['addr_reward_hex']);
      expect(mockWebpage.getRewardAddress).toHaveBeenCalledTimes(1);
    });

    test('signTx forwards the tx and partial-sign flag', async () => {
      await expect(api.signTx('tx_hex', true)).resolves.toBe('signed_witness_hex');
      expect(mockWebpage.signTx).toHaveBeenCalledWith('tx_hex', true);
    });

    test('signData delegates to the CIP-30 signData implementation', async () => {
      await api.signData('addr_hex', 'payload_hex');
      expect(mockWebpage.signDataCIP30).toHaveBeenCalledWith('addr_hex', 'payload_hex');
      expect(mockWebpage.signData).not.toHaveBeenCalled();
    });

    test('submitTx forwards the signed tx', async () => {
      await expect(api.submitTx('signed_tx_hex')).resolves.toBe('tx_hash');
      expect(mockWebpage.submitTx).toHaveBeenCalledWith('signed_tx_hex');
    });

    test('getCollateral → getCollateral', async () => {
      await api.getCollateral();
      expect(mockWebpage.getCollateral).toHaveBeenCalledTimes(1);
    });

    test('getCollateral forwards amount params', async () => {
      const params = { amount: '1a000f4240' };
      await api.getCollateral(params);
      expect(mockWebpage.getCollateral).toHaveBeenCalledWith(params);
    });

    test('on / off register and deregister events', () => {
      const cb = jest.fn();
      api.on('accountChange', cb);
      api.off('accountChange', cb);
      expect(mockWebpage.on).toHaveBeenCalledWith('accountChange', cb);
      expect(mockWebpage.off).toHaveBeenCalledWith('accountChange', cb);
    });
  });

  test('CIP-95 methods delegate to their governance transports', async () => {
    const api = await window.cardano.lucem.enable({ extensions: [{ cip: 95 }] });
    await expect(api.cip95.getPubDRepKey()).resolves.toBe('drep_key_hex');
    await expect(api.cip95.getRegisteredPubStakeKeys()).resolves.toEqual(['reg_key']);
    await expect(api.cip95.getUnregisteredPubStakeKeys()).resolves.toEqual([
      'unreg_key',
    ]);
    api.cip95.signData('addr_hex', 'payload_hex');
    expect(mockWebpage.signDataCIP30).toHaveBeenCalledWith('addr_hex', 'payload_hex');
  });
});
