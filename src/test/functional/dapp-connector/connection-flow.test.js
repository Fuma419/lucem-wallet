/**
 * @jest-environment jsdom
 *
 * Functional tests for the dApp connection message flow.
 *
 * Drives the real connector transport a dApp uses — `src/api/webpage` →
 * content proxy (`Messaging.createProxyController`) → background router
 * (`src/pages/Background`) — over a simulated chrome.runtime channel. Only the
 * wallet core (`src/api/extension`) and the approval popup relay are mocked, so
 * the tests cover connection lifecycle, whitelist gating, read methods, and the
 * sign/submit request paths without a live chain or browser.
 */

import {
  installBackgroundBridge,
  installWindowMessageShim,
  clearBridge,
} from './harness';

jest.mock('../../../api/extension', () => ({
  isWhitelisted: jest.fn(),
  createPopup: jest.fn(),
  getAddress: jest.fn(),
  getBalance: jest.fn(),
  getCollateral: jest.fn(),
  getNetwork: jest.fn(),
  getRewardAddress: jest.fn(),
  getRegisteredPubStakeKeys: jest.fn(),
  getUnregisteredPubStakeKeys: jest.fn(),
  getPubDRepKey: jest.fn(),
  getUtxos: jest.fn(),
  submitTx: jest.fn(),
  verifyPayload: jest.fn(),
  verifyTx: jest.fn(),
  extractKeyHash: jest.fn(),
}));

const { Messaging } = require('../../../api/messaging');
const { APIError, POPUP } = require('../../../config/config');

const bytes = (hex) => ({ to_bytes: () => Buffer.from(hex, 'hex') });

let dapp;
let extension;

beforeAll(() => {
  installWindowMessageShim();
  installBackgroundBridge();
  extension = require('../../../api/extension');
  dapp = require('../../../api/webpage');
  // Registers the background onMessage router.
  require('../../../pages/Background/index.js');
  // Registers the content-script proxy (window + runtime listeners).
  Messaging.createProxyController();
  jest.spyOn(Messaging, 'sendToPopupInternal');
});

beforeEach(() => {
  clearBridge();
  extension.isWhitelisted.mockReset().mockResolvedValue(false);
  extension.createPopup.mockReset().mockResolvedValue({ id: 42 });
  extension.getAddress.mockReset().mockResolvedValue('addr_change_hex');
  extension.getBalance.mockReset().mockResolvedValue(bytes('a1'));
  extension.getCollateral.mockReset().mockResolvedValue([bytes('c0'), bytes('c1')]);
  extension.getNetwork.mockReset().mockResolvedValue({ id: 'mainnet' });
  extension.getRewardAddress.mockReset().mockResolvedValue('addr_reward_hex');
  extension.getRegisteredPubStakeKeys.mockReset().mockResolvedValue(['reg']);
  extension.getUnregisteredPubStakeKeys.mockReset().mockResolvedValue(['unreg']);
  extension.getPubDRepKey.mockReset().mockResolvedValue('drep_key_hex');
  extension.getUtxos.mockReset().mockResolvedValue([bytes('de'), bytes('ad')]);
  extension.submitTx.mockReset().mockResolvedValue('tx_hash_hex');
  extension.verifyPayload.mockReset().mockReturnValue(true);
  extension.verifyTx.mockReset().mockResolvedValue(undefined);
  extension.extractKeyHash.mockReset().mockResolvedValue('key_hash');
  Messaging.sendToPopupInternal.mockReset().mockResolvedValue({ data: true });
});

describe('dApp connector — connection lifecycle', () => {
  test('enable() resolves without a popup when the origin is already whitelisted', async () => {
    extension.isWhitelisted.mockResolvedValue(true);

    await expect(dapp.enable()).resolves.toBe(true);
    expect(extension.createPopup).not.toHaveBeenCalled();
    expect(Messaging.sendToPopupInternal).not.toHaveBeenCalled();
  });

  test('enable() opens the approval popup when the origin is not whitelisted', async () => {
    extension.isWhitelisted.mockResolvedValue(false);
    Messaging.sendToPopupInternal.mockResolvedValue({ data: true });

    await expect(dapp.enable()).resolves.toBe(true);
    expect(extension.createPopup).toHaveBeenCalledWith(POPUP.internal);
    expect(Messaging.sendToPopupInternal).toHaveBeenCalledTimes(1);
  });

  test('enable() rejects when the user refuses the approval popup', async () => {
    extension.isWhitelisted.mockResolvedValue(false);
    Messaging.sendToPopupInternal.mockResolvedValue({ error: APIError.Refused });

    await expect(dapp.enable()).rejects.toEqual(APIError.Refused);
  });

  test('isEnabled() reflects the whitelist state', async () => {
    extension.isWhitelisted.mockResolvedValue(true);
    await expect(dapp.isEnabled()).resolves.toBe(true);

    extension.isWhitelisted.mockResolvedValue(false);
    await expect(dapp.isEnabled()).resolves.toBe(false);
  });
});

describe('dApp connector — whitelist gating of privileged methods', () => {
  test('a non-whitelisted origin cannot reach wallet read methods', async () => {
    extension.isWhitelisted.mockResolvedValue(false);

    await expect(dapp.getBalance()).rejects.toEqual(APIError.Refused);
    expect(extension.getBalance).not.toHaveBeenCalled();
  });

  test('a non-whitelisted origin cannot submit transactions', async () => {
    extension.isWhitelisted.mockResolvedValue(false);

    await expect(dapp.submitTx('signed_tx_hex')).rejects.toEqual(APIError.Refused);
    expect(extension.submitTx).not.toHaveBeenCalled();
  });
});

describe('dApp connector — read methods (whitelisted session)', () => {
  beforeEach(() => {
    extension.isWhitelisted.mockResolvedValue(true);
  });

  test('getNetworkId maps the wallet network to a CIP-30 id', async () => {
    extension.getNetwork.mockResolvedValue({ id: 'mainnet' });
    await expect(dapp.getNetworkId()).resolves.toBe(1);

    extension.getNetwork.mockResolvedValue({ id: 'preprod' });
    await expect(dapp.getNetworkId()).resolves.toBe(0);
  });

  test('getBalance returns hex-encoded CBOR from the wallet', async () => {
    await expect(dapp.getBalance()).resolves.toBe('a1');
    expect(extension.getBalance).toHaveBeenCalledTimes(1);
  });

  test('getUtxos returns hex-encoded UTxOs and forwards pagination', async () => {
    await expect(dapp.getUtxos('1000000', { page: 0, limit: 2 })).resolves.toEqual([
      'de',
      'ad',
    ]);
    expect(extension.getUtxos).toHaveBeenCalledWith('1000000', { page: 0, limit: 2 });
  });

  test('getCollateral returns hex-encoded collateral UTxOs', async () => {
    await expect(dapp.getCollateral()).resolves.toEqual(['c0', 'c1']);
  });

  test('getRewardAddress is proxied from the wallet', async () => {
    await expect(dapp.getRewardAddress()).resolves.toBe('addr_reward_hex');
  });

  test('CIP-95 getPubDRepKey is proxied from the wallet', async () => {
    await expect(dapp.getPubDRepKey()).resolves.toBe('drep_key_hex');
  });

  test('a wallet-side failure is surfaced as a rejected API call', async () => {
    extension.getBalance.mockRejectedValue(new Error('koios down'));
    await expect(dapp.getBalance()).rejects.toThrow('koios down');
  });
});

describe('dApp connector — signing and submission (whitelisted session)', () => {
  beforeEach(() => {
    extension.isWhitelisted.mockResolvedValue(true);
  });

  test('signTx verifies the tx, prompts for approval, and returns the witness', async () => {
    Messaging.sendToPopupInternal.mockResolvedValue({ data: 'signed_witness_hex' });

    await expect(dapp.signTx('tx_hex', true)).resolves.toBe('signed_witness_hex');
    expect(extension.verifyTx).toHaveBeenCalledWith('tx_hex');
    expect(extension.createPopup).toHaveBeenCalledWith(POPUP.internal);
  });

  test('signTx rejects when the user declines in the approval popup', async () => {
    Messaging.sendToPopupInternal.mockResolvedValue({ error: APIError.Refused });
    await expect(dapp.signTx('tx_hex', false)).rejects.toEqual(APIError.Refused);
  });

  test('signTx rejects an invalid transaction before prompting', async () => {
    extension.verifyTx.mockRejectedValue(new Error('invalid tx'));

    await expect(dapp.signTx('bad_tx', false)).rejects.toThrow('invalid tx');
    expect(Messaging.sendToPopupInternal).not.toHaveBeenCalled();
  });

  test('signData validates the payload, prompts, and returns the signature', async () => {
    const signature = { signature: 'sig_hex', key: 'key_hex' };
    Messaging.sendToPopupInternal.mockResolvedValue({ data: signature });

    await expect(dapp.signDataCIP30('addr_hex', 'payload_hex')).resolves.toEqual(
      signature
    );
    expect(extension.verifyPayload).toHaveBeenCalledWith('payload_hex');
    expect(extension.extractKeyHash).toHaveBeenCalledWith('addr_hex');
  });

  test('submitTx forwards the signed tx and returns the tx hash', async () => {
    await expect(dapp.submitTx('signed_tx_hex')).resolves.toBe('tx_hash_hex');
    expect(extension.submitTx).toHaveBeenCalledWith('signed_tx_hex');
  });
});
