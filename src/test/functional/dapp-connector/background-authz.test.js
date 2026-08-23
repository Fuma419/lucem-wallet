/**
 * @jest-environment jsdom
 *
 * Functional tests for the background's own authorization layer (defense in
 * depth). These deliver messages STRAIGHT to the background router
 * (`src/pages/Background`), bypassing the content-script proxy, to prove the
 * background independently:
 *   1. refuses every privileged method for a non-whitelisted origin,
 *   2. allows them for a whitelisted origin,
 *   3. drops any message whose trusted Chrome `sender` is not this extension,
 *   4. still runs the un-gated pre-auth methods (`enable`, `isEnabled`,
 *      `isWhitelisted`).
 *
 * Previously the whitelist gate lived only in the proxy, so a single upstream
 * bug could have leaked wallet data or opened a signing popup for an
 * unauthorized origin. This suite guards that boundary.
 */

import { sendDirectToBackground } from './harness';

jest.mock('../../../api/extension', () => ({
  isWhitelisted: jest.fn(),
  createPopup: jest.fn(),
  getAddress: jest.fn(),
  getCip30Address: jest.fn(),
  getBalance: jest.fn(),
  getCollateral: jest.fn(),
  getNetwork: jest.fn(),
  getRewardAddress: jest.fn(),
  getCip30RewardAddress: jest.fn(),
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
const { APIError, METHOD, SENDER, TARGET } = require('../../../config/config');

const bytes = (hex) => ({ to_bytes: () => Buffer.from(hex, 'hex') });

let extension;

beforeAll(() => {
  extension = require('../../../api/extension');
  // Registers the background onMessage router (app.listen()).
  require('../../../pages/Background/index.js');
  jest.spyOn(Messaging, 'sendToPopupInternal');
});

let nextId = 0;
const msg = (method, extra = {}) => ({
  id: `req-${(nextId += 1)}`,
  method,
  sender: SENDER.webpage,
  target: TARGET,
  origin: 'https://dapp.example',
  ...extra,
});

// Every privileged method the background must gate, with a valid payload shape.
const PRIVILEGED = [
  ['getBalance', {}, () => extension.getBalance],
  ['getAddress', {}, () => extension.getCip30Address],
  ['getRewardAddress', {}, () => extension.getCip30RewardAddress],
  ['getRegisteredPubStakeKeys', {}, () => extension.getRegisteredPubStakeKeys],
  [
    'getUnregisteredPubStakeKeys',
    {},
    () => extension.getUnregisteredPubStakeKeys,
  ],
  ['getPubDRepKey', {}, () => extension.getPubDRepKey],
  ['getUtxos', { data: { amount: '1000000', paginate: undefined } }, () => extension.getUtxos],
  ['getCollateral', { data: { amount: '5000000' } }, () => extension.getCollateral],
  ['submitTx', { data: 'signed_tx_hex' }, () => extension.submitTx],
  ['getNetworkId', {}, null],
  ['signTx', { data: { tx: 'tx_hex', partialSign: false } }, null],
  ['signData', { data: { address: 'addr_hex', payload: 'payload_hex' } }, null],
];

beforeEach(() => {
  extension.isWhitelisted.mockReset().mockResolvedValue(false);
  extension.createPopup.mockReset().mockResolvedValue({ id: 42 });
  extension.getAddress.mockReset().mockResolvedValue('addr_change_hex');
  extension.getCip30Address.mockReset().mockResolvedValue('addr_change_hex');
  extension.getBalance.mockReset().mockResolvedValue(bytes('a1'));
  extension.getCollateral.mockReset().mockResolvedValue([bytes('c0')]);
  extension.getNetwork.mockReset().mockResolvedValue({ id: 'mainnet' });
  extension.getRewardAddress.mockReset().mockResolvedValue('addr_reward_hex');
  extension.getCip30RewardAddress.mockReset().mockResolvedValue('addr_reward_hex');
  extension.getRegisteredPubStakeKeys.mockReset().mockResolvedValue(['reg']);
  extension.getUnregisteredPubStakeKeys.mockReset().mockResolvedValue(['unreg']);
  extension.getPubDRepKey.mockReset().mockResolvedValue('drep_key_hex');
  extension.getUtxos.mockReset().mockResolvedValue([bytes('de')]);
  extension.submitTx.mockReset().mockResolvedValue('tx_hash_hex');
  extension.verifyPayload.mockReset().mockReturnValue(true);
  extension.verifyTx.mockReset().mockResolvedValue(undefined);
  extension.extractKeyHash.mockReset().mockResolvedValue('key_hash');
  Messaging.sendToPopupInternal.mockReset().mockResolvedValue({ data: 'approved' });
});

describe('background authZ — non-whitelisted origin is refused', () => {
  test.each(PRIVILEGED)(
    '%s is refused and never touches the wallet',
    async (method, extra, getFn) => {
      extension.isWhitelisted.mockResolvedValue(false);

      const response = await sendDirectToBackground(msg(method, extra));

      expect(response).toBeDefined();
      expect(response.error).toEqual(APIError.Refused);
      if (getFn) expect(getFn()).not.toHaveBeenCalled();
      // Signing methods must not even open the approval popup.
      if (method === 'signTx' || method === 'signData') {
        expect(extension.createPopup).not.toHaveBeenCalled();
        expect(Messaging.sendToPopupInternal).not.toHaveBeenCalled();
      }
    }
  );
});

describe('background authZ — whitelisted origin is allowed', () => {
  beforeEach(() => extension.isWhitelisted.mockResolvedValue(true));

  test('getBalance returns wallet data once authorized', async () => {
    const response = await sendDirectToBackground(msg('getBalance'));
    expect(response.error).toBeUndefined();
    expect(response.data).toBe('a1');
    expect(extension.getBalance).toHaveBeenCalledTimes(1);
  });

  test('getNetworkId maps the network for an authorized origin', async () => {
    const response = await sendDirectToBackground(msg('getNetworkId'));
    expect(response.data).toBe(1);
  });

  test('signTx reaches the approval popup only when authorized', async () => {
    const response = await sendDirectToBackground(
      msg('signTx', { data: { tx: 'tx_hex', partialSign: false } })
    );
    expect(extension.verifyTx).toHaveBeenCalledWith('tx_hex');
    expect(extension.createPopup).toHaveBeenCalled();
    expect(response.data).toBe('approved');
  });
});

describe('background authZ — trusted-sender validation', () => {
  test('drops a message whose sender is not this extension', async () => {
    extension.isWhitelisted.mockResolvedValue(true); // would succeed if not dropped

    const response = await sendDirectToBackground(msg('getBalance'), {
      id: 'some-other-extension-id',
    });

    expect(response).toBeUndefined();
    expect(extension.getBalance).not.toHaveBeenCalled();
    expect(extension.isWhitelisted).not.toHaveBeenCalled();
  });

  test('accepts a message from this extension', async () => {
    extension.isWhitelisted.mockResolvedValue(true);

    const response = await sendDirectToBackground(msg('getBalance'), {
      id: chrome.runtime.id,
    });

    expect(response.data).toBe('a1');
  });
});

describe('background authZ — pre-auth methods stay un-gated', () => {
  test('enable opens the approval popup for a non-whitelisted origin (not auto-refused)', async () => {
    extension.isWhitelisted.mockResolvedValue(false);
    Messaging.sendToPopupInternal.mockResolvedValue({ data: true });

    const response = await sendDirectToBackground(msg('enable'));

    expect(extension.createPopup).toHaveBeenCalled();
    expect(response.data).toBe(true);
    expect(response.error).toBeUndefined();
  });

  test('isEnabled reports the whitelist state without gating', async () => {
    extension.isWhitelisted.mockResolvedValue(false);
    const response = await sendDirectToBackground(msg('isEnabled'));
    expect(response.data).toBe(false);
    expect(response.error).toBeUndefined();
  });

  test('isWhitelisted resolves for a whitelisted origin', async () => {
    extension.isWhitelisted.mockResolvedValue(true);
    const response = await sendDirectToBackground(msg('isWhitelisted'));
    expect(response.data).toBe(true);
  });
});

describe('background authZ — whitelist lookup failure is internal error', () => {
  test('a thrown isWhitelisted surfaces InternalError, not data', async () => {
    extension.isWhitelisted.mockRejectedValue(new Error('storage down'));

    const response = await sendDirectToBackground(msg('getBalance'));

    expect(response.error).toEqual(APIError.InternalError);
    expect(extension.getBalance).not.toHaveBeenCalled();
  });
});
