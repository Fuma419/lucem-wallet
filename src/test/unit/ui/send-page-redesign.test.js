/**
 * @jest-environment jsdom
 *
 * Behavioral render tests for the redesigned Send page. Previously this suite
 * only grepped `send.jsx` for testid/label strings, so it could not catch a
 * page that failed to mount, got stuck on the spinner, or stopped surfacing
 * preparation errors. These mount the real component against the real
 * `sendStore` model with mocked data services and assert user-visible behavior:
 *
 *   - the redesigned shell + functional selectors actually render,
 *   - the page leaves its loading state and shows the stable primary action,
 *   - the primary action is disabled until there is a signable tx,
 *   - a failed init surfaces a dedicated error alert instead of hanging.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';
import { StoreProvider, createStore, action } from 'easy-peasy';

global.IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}
if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: { load: jest.fn().mockResolvedValue(undefined), Cardano: {} },
}));

jest.mock('../../../api/extension', () => ({
  __esModule: true,
  displayUnit: (quantity, decimals = 6) => Number(quantity) / 10 ** decimals,
  toUnit: (amount, decimals = 6) =>
    Math.floor(Number(amount) * 10 ** decimals).toString(),
  createTab: jest.fn(),
  openKeystoneSignTxTab: jest.fn(),
  getAccounts: jest.fn().mockResolvedValue({
    0: {
      index: 0,
      name: 'Account 0',
      paymentAddr: 'addr_test1xyz',
      avatar: 'a',
    },
    1: {
      index: 1,
      name: 'Savings',
      paymentAddr: 'addr_test1abc',
      avatar: 'b',
    },
  }),
  getAdaHandle: jest.fn().mockResolvedValue(null),
  getAsset: jest.fn().mockResolvedValue(null),
  getCurrentAccount: jest.fn(),
  getNetwork: jest.fn().mockResolvedValue({ id: 'preprod' }),
  getSignableWalletIds: jest.fn().mockResolvedValue(['0']),
  getUtxos: jest.fn().mockResolvedValue([]),
  indexToHw: jest.fn(),
  isAccountSignable: jest.fn((account, ids) => {
    const walletId = account?.walletId != null ? String(account.walletId) : '0';
    return (ids || []).includes(walletId);
  }),
  isHW: jest.fn().mockReturnValue(false),
  validateAccountWithSeed: jest.fn(),
  isValidAddress: jest.fn().mockResolvedValue(false),
  paymentKeyHashesForSigning: jest.fn().mockResolvedValue([]),
  prependTxHash: jest.fn(),
  updateRecentSentToAddress: jest.fn(),
}));

jest.mock('../../../api/extension/wallet', () => ({
  __esModule: true,
  buildTx: jest.fn(),
  initTx: jest.fn(),
  sendAllTx: jest.fn(),
  signAndSubmit: jest.fn(),
  signAndSubmitHW: jest.fn(),
}));

import Send, { sendStore } from '../../../ui/app/pages/send';
import { getCurrentAccount, getSignableWalletIds } from '../../../api/extension';
import Loader from '../../../api/loader';

// Seeded protocol parameters + mocked getUtxos/Loader let Send finish init
// without live Koios / real CSL, so the page reaches its loaded state.
const seededTxInfo = () => ({
  protocolParameters: {
    coinsPerUtxoWord: '4310',
    minUtxo: '1000000',
    linearFee: { minFeeA: '44', minFeeB: '155381' },
    keyDeposit: '2000000',
  },
  utxos: [],
  balance: { lovelace: '0', assets: [] },
});

function makeStore() {
  return createStore({
    globalModel: {
      sendStore: { ...sendStore, txInfo: seededTxInfo() },
    },
    settings: {
      settings: {
        network: { id: 'preprod' },
        adaSymbol: 't₳',
        currency: 'usd',
      },
      setSettings: action(() => {}),
    },
  });
}

async function renderSend() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <StoreProvider store={makeStore()}>
        <ChakraProvider>
          <BrowserRouter>
            <Send />
          </BrowserRouter>
        </ChakraProvider>
      </StoreProvider>
    );
  });
  // Flush init(): Loader.load + getCurrentAccount + getNetwork +
  // getSignableWalletIds all resolve.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

function primaryAction(container) {
  return container.querySelector('[data-testid="send-primary-action"]');
}

beforeEach(() => {
  jest.clearAllMocks();
  Loader.load.mockResolvedValue(undefined);
  getCurrentAccount.mockResolvedValue({
    index: 0,
    paymentAddr: 'addr_test1xyz',
    paymentKeyHash: 'ab'.repeat(28),
    stakeKeyHash: 'aa'.repeat(28),
  });
});

describe('Send page — behavioral render', () => {
  test('mounts the redesigned shell and functional selectors', async () => {
    const { container } = await renderSend();
    expect(container.querySelector('[data-testid="send-page"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="send-page-title"]')?.textContent).toBe(
      'Send'
    );
    expect(
      container.querySelector('[data-testid="send-network-badge"]')?.textContent
    ).toMatch(/Preprod/i);
    expect(
      container.querySelector('[data-testid="send-recipient-input"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="send-recipient-accounts"]')
    ).toBeTruthy();
    const otherAccount = container.querySelector(
      '[data-testid="send-recipient-account-1"]'
    );
    expect(otherAccount).toBeTruthy();
    expect(otherAccount.textContent).toMatch(/Savings/);
    expect(otherAccount.textContent).toMatch(/addr_test1abc/);
    expect(
      container.querySelector('[data-testid="send-ada-amount"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="send-available-balance"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="send-percent-max"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="send-note-input"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="send-tokens-empty"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="send-blocked-reason"]')
    ).toBeTruthy();
  });

  test('picking a listed account fills the recipient field', async () => {
    const { container } = await renderSend();
    const otherAccount = container.querySelector(
      '[data-testid="send-recipient-account-1"]'
    );
    expect(otherAccount).toBeTruthy();
    await act(async () => {
      otherAccount.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const input = container.querySelector('[data-testid="send-recipient-input"]');
    expect(input.value).toBe('Savings');
    expect(
      container.querySelector('[data-testid="send-recipient-account-name"]')
        ?.textContent
    ).toMatch(/Sending to Savings/);
  });

  test('leaves the loading state and shows the stable primary action label', async () => {
    const { container } = await renderSend();
    const button = primaryAction(container);
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Review transaction');
  });

  test('primary action is disabled until a transaction is prepared', async () => {
    const { container } = await renderSend();
    const button = primaryAction(container);
    // No recipient + no built tx yet → the review action must be blocked.
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  test('does not render a preparation error on a healthy mount', async () => {
    const { container } = await renderSend();
    expect(
      container.querySelector('[data-testid="send-error-alert"]')
    ).toBeNull();
  });

  test('a sterilized (needs-seed) account shows the import prompt and blocks Review', async () => {
    getSignableWalletIds.mockResolvedValueOnce([]);
    const { container } = await renderSend();

    const banner = container.querySelector('[data-testid="send-needs-seed-alert"]');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/Re-enter your recovery phrase/i);
    expect(
      container.querySelector('[data-testid="send-validate-seed-button"]')
    ).toBeTruthy();

    const button = primaryAction(container);
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  test('a signable account does not show the needs-seed banner', async () => {
    const { container } = await renderSend();
    expect(
      container.querySelector('[data-testid="send-needs-seed-alert"]')
    ).toBeNull();
  });

  test('a failed init surfaces a dedicated error alert instead of hanging', async () => {
    // Fail at the first init await so there is a single, deterministically
    // caught rejection (init().catch → error alert + setIsLoading(false)).
    Loader.load.mockRejectedValueOnce(new Error('koios unreachable'));
    const { container } = await renderSend();

    const alert = container.querySelector('[data-testid="send-error-alert"]');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Unable to prepare transaction');
    // The form still renders (it did not get stuck on the spinner).
    expect(primaryAction(container)).toBeTruthy();
  });
});
