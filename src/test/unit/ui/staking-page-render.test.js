/**
 * @jest-environment jsdom
 *
 * Behavioral render tests for the Staking (stake center) page. These mount the
 * real component, run its effects with mocked data services, and assert
 * user-visible behavior: the page leaves its initial spinner, lists pools,
 * builds a delegation preview on pool select, and gates the reward-withdrawal
 * action. The pre-existing stake-center-page.test.js only greps source
 * strings, so behavioral regressions slipped through.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';

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

jest.mock('../../../api/extension', () => ({
  __esModule: true,
  displayUnit: (quantity, decimals = 6) => Number(quantity) / 10 ** decimals,
  createTab: jest.fn(),
  getCurrentAccount: jest.fn(),
  getDelegation: jest.fn(),
  getPoolMetadata: jest.fn(),
  getStakePools: jest.fn(),
  getUtxos: jest.fn().mockResolvedValue([]),
  openKeystoneSignTxTab: jest.fn(),
  paymentKeyHashesForSigning: jest.fn().mockResolvedValue([]),
  searchPools: jest.fn(),
}));

jest.mock('../../../api/extension/wallet', () => ({
  __esModule: true,
  delegationTx: jest.fn(),
  initTx: jest.fn(),
  signAndSubmit: jest.fn(),
  signAndSubmitHW: jest.fn(),
  undelegateTx: jest.fn(),
  withdrawalTx: jest.fn(),
}));

import Staking from '../../../ui/app/pages/staking';
import {
  getCurrentAccount,
  getDelegation,
  getPoolMetadata,
  getStakePools,
  searchPools,
} from '../../../api/extension';
import { delegationTx, initTx } from '../../../api/extension/wallet';

const POOL = {
  id: 'pool1hodlr',
  poolId: 'pool1hodlr',
  poolIdHex: 'ee'.repeat(28),
  ticker: 'HODLR',
  name: 'HODLR Pool',
  description: 'A bright stake pool',
  homepage: 'https://example.com',
  margin: 0.02,
  fixedCost: '340000000',
  pledge: '1000000000',
  activeStake: '5000000000',
  liveSaturation: 0.42,
  blocks: '12',
  status: 'registered',
};

function txStub(fee) {
  return {
    body: () => ({ fee: () => ({ toString: () => String(fee) }) }),
    to_bytes: () => new Uint8Array([1, 2, 3]),
  };
}

async function renderStaking() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ChakraProvider>
        <BrowserRouter>
          <Staking />
        </BrowserRouter>
      </ChakraProvider>
    );
  });
  // Flush initial state load (account + delegation + protocol params).
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  // The pool search runs behind a 300ms debounce.
  await act(async () => {
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

function buttonByText(container, text) {
  return [...container.querySelectorAll('button')].find((b) =>
    b.textContent.trim().includes(text)
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  getCurrentAccount.mockResolvedValue({
    index: 0,
    paymentAddr: 'addr_test1xyz',
    stakeKeyHash: 'aa'.repeat(28),
    paymentKeyHash: 'ab'.repeat(28),
  });
  getStakePools.mockResolvedValue([POOL]);
  searchPools.mockResolvedValue([POOL]);
  getPoolMetadata.mockResolvedValue(POOL);
  initTx.mockResolvedValue({ keyDeposit: '2000000', linearFee: {} });
  delegationTx.mockResolvedValue(txStub(180000));
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('Staking page — behavioral render', () => {
  test('leaves the loading spinner and renders the stake center once data resolves', async () => {
    getDelegation.mockResolvedValue({ registered: false, active: false, rewards: '0' });
    const { container } = await renderStaking();
    expect(container.querySelector('[data-testid="stake-center-page"]')).toBeTruthy();
    expect(container.textContent).toContain('Stake Center');
  });

  test('lists stake pools returned by the search service', async () => {
    getDelegation.mockResolvedValue({ registered: false, active: false, rewards: '0' });
    const { container } = await renderStaking();
    expect(container.textContent).toContain('HODLR');
  });

  test('selecting a pool from search builds a delegation preview ready to sign', async () => {
    getDelegation.mockResolvedValue({ registered: false, active: false, rewards: '0' });
    const { container } = await renderStaking();

    // The featured pool auto-selects and collapses search; reopen it, then pick
    // the pool from the results list (the working delegation entry point).
    const changePool = buttonByText(container, 'Change Pool');
    expect(changePool).toBeTruthy();
    await act(async () => {
      changePool.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const poolButton = buttonByText(container, 'HODLR Pool');
    expect(poolButton).toBeTruthy();
    await act(async () => {
      poolButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(delegationTx).toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="stake-confirm-transaction"]')
    ).toBeTruthy();
  });

  // KNOWN BUG (tracked): after the page auto-features a pool (default query
  // "HODLR"), the selected PoolCard is wired to a no-op `onSelect={() => {}}` and
  // there is no delegate CTA. So a user who clicks the highlighted featured pool
  // gets no delegation preview — `delegationTx` is never called. The only way to
  // delegate is the non-obvious "Change Pool" → search → reselect path.
  //
  // Marked `test.failing` so CI stays green while the regression is tracked.
  // Remove `.failing` once clicking the featured pool starts a delegation.
  test.failing(
    'clicking the auto-featured pool should start a delegation preview',
    async () => {
      getDelegation.mockResolvedValue({
        registered: false,
        active: false,
        rewards: '0',
      });
      const { container } = await renderStaking();

      const featured = buttonByText(container, 'HODLR Pool');
      expect(featured).toBeTruthy();
      await act(async () => {
        featured.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(delegationTx).toHaveBeenCalled();
    }
  );

  test('reward withdrawal is disabled below the 2 ADA minimum', async () => {
    getDelegation.mockResolvedValue({
      registered: true,
      active: true,
      rewards: '1500000',
    });
    const { container } = await renderStaking();
    const withdrawBtn = buttonByText(container, 'Start');
    // The first "Start" button belongs to the Withdraw Rewards action card.
    expect(withdrawBtn).toBeTruthy();
    expect(withdrawBtn.disabled).toBe(true);
  });

  test('reward withdrawal is enabled at or above the 2 ADA minimum', async () => {
    getDelegation.mockResolvedValue({
      registered: true,
      active: true,
      rewards: '2500000',
    });
    const { container } = await renderStaking();
    const withdrawBtn = buttonByText(container, 'Start');
    expect(withdrawBtn).toBeTruthy();
    expect(withdrawBtn.disabled).toBe(false);
  });
});
