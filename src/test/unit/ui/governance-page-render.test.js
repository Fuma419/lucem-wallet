/**
 * @jest-environment jsdom
 *
 * Behavioral render tests for the Voting (governance) page. These mount the
 * real component, run its effects with mocked data services, and assert
 * user-visible behavior (proposal list, DRep gating, vote actions). The
 * pre-existing governance-page.test.js only greps the source string, so
 * behavioral regressions slipped through — these close that gap.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { createStore, StoreProvider, action } from 'easy-peasy';
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

const DREP_KEY_HASH = 'cc'.repeat(28);
const PROPOSAL_TX_HASH = 'dd'.repeat(32);

jest.mock('../../../api/extension', () => ({
  __esModule: true,
  displayUnit: (quantity, decimals = 6) => Number(quantity) / 10 ** decimals,
  createTab: jest.fn(),
  getAccountDRepId: jest.fn(),
  getCurrentAccount: jest.fn(),
  getDelegation: jest.fn(),
  isHW: jest.fn(() => false),
  openKeystoneSignTxTab: jest.fn(),
  paymentKeyHashesForSigning: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../api/extension/wallet', () => ({
  __esModule: true,
  initTx: jest.fn(),
  signAndSubmit: jest.fn(),
  signAndSubmitHW: jest.fn(),
  voteDelegationTx: jest.fn(),
  voteTx: jest.fn(),
}));

const govTxStub = (fee) => ({
  body: () => ({ fee: () => ({ toString: () => String(fee) }) }),
  to_bytes: () => new Uint8Array([1, 2, 3]),
});

jest.mock('../../../api/governance', () => {
  const actual = jest.requireActual('../../../api/governance');
  return {
    __esModule: true,
    ...actual,
    fetchDRepRegistration: jest.fn(),
    fetchDRepVotes: jest.fn(),
    fetchGovernanceOverview: jest.fn(),
    ensureDrepRegisteredForDelegation: jest.fn(),
  };
});

import Governance from '../../../ui/app/pages/governance';
import {
  getAccountDRepId,
  getCurrentAccount,
  getDelegation,
  isHW,
} from '../../../api/extension';
import { initTx, voteDelegationTx, voteTx } from '../../../api/extension/wallet';
import {
  DREP_NOT_REGISTERED,
  ensureDrepRegisteredForDelegation,
  fetchDRepRegistration,
  fetchDRepVotes,
  fetchGovernanceOverview,
} from '../../../api/governance';
import Loader from '../../../api/loader';

const votableProposal = {
  id: `${PROPOSAL_TX_HASH}#0`,
  type: 'info_action',
  status: 'active',
  title: 'Increase Treasury Cap',
  summary: 'A short proposal summary.',
  rationale: '',
  motivation: '',
  references: [],
  authors: [],
  url: '',
  anchorHash: '',
  submittedEpoch: 500,
  expiresAfterEpoch: 520,
  txHash: PROPOSAL_TX_HASH,
  certIndex: 0,
  govActionId: '',
};

function makeStore() {
  return createStore({
    settings: {
      settings: { network: { id: 'preprod' }, adaSymbol: 't₳' },
      setSettings: action(() => {}),
    },
  });
}

async function renderGovernance() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ChakraProvider>
        <StoreProvider store={makeStore()}>
          <BrowserRouter>
            <Governance />
          </BrowserRouter>
        </StoreProvider>
      </ChakraProvider>
    );
  });
  // Flush the chained data effects (overview + DRep registration + votes).
  await act(async () => {
    await Promise.resolve();
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
  getCurrentAccount.mockResolvedValue({
    index: 0,
    paymentKeyHash: 'ab'.repeat(28),
    stakeKeyHash: 'aa'.repeat(28),
    paymentAddr: 'addr_test1xyz',
  });
  getDelegation.mockResolvedValue({ registered: true, active: true });
  getAccountDRepId.mockResolvedValue({
    drepKeyHashHex: DREP_KEY_HASH,
    drepIdCip129: 'drep1cip129example',
    drepIdLegacy: 'drep1legacyexample',
  });
  fetchDRepRegistration.mockResolvedValue({
    registered: true,
    drepId: 'drep1cip129example',
  });
  ensureDrepRegisteredForDelegation.mockResolvedValue(undefined);
  fetchDRepVotes.mockResolvedValue({ votes: [], source: 'blockfrost' });
  fetchGovernanceOverview.mockResolvedValue({
    source: 'blockfrost',
    fallbackReason: '',
    proposals: [votableProposal],
    dreps: [],
  });
  initTx.mockResolvedValue({ keyDeposit: '2000000', linearFee: {} });
  voteDelegationTx.mockResolvedValue(govTxStub(180000));
  voteTx.mockResolvedValue(govTxStub(175000));
});

describe('Voting page — behavioral render', () => {
  test('renders governance proposals returned by the data service', async () => {
    const { container } = await renderGovernance();
    expect(container.textContent).toContain('Increase Treasury Cap');
    expect(container.textContent).toContain('Delegate Voting Power');
  });

  test('shows the DRep badge when this wallet is a registered DRep', async () => {
    const { container } = await renderGovernance();
    expect(container.textContent).toContain("You're a DRep");
  });

  test('exposes Yes/No/Abstain vote actions for a votable proposal when registered', async () => {
    const { container } = await renderGovernance();

    // Accordion: expand the proposal to reveal the vote controls.
    const header = buttonByText(container, 'Increase Treasury Cap');
    expect(header).toBeTruthy();
    await act(async () => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(buttonByText(container, 'Yes')).toBeTruthy();
    expect(buttonByText(container, 'No')).toBeTruthy();
    expect(buttonByText(container, 'Abstain')).toBeTruthy();
  });

  test('casting a Yes vote builds a governance vote transaction', async () => {
    const { container } = await renderGovernance();

    const header = buttonByText(container, 'Increase Treasury Cap');
    await act(async () => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const yesBtn = buttonByText(container, 'Yes');
    await act(async () => {
      yesBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(voteTx).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        proposalTxHash: PROPOSAL_TX_HASH,
        proposalIndex: 0,
        voteKind: 'yes',
      })
    );
  });

  test('hardware wallets can still prepare a DRep vote', async () => {
    isHW.mockReturnValue(true);
    getCurrentAccount.mockResolvedValue({
      index: 'ledger-usb-0',
      paymentKeyHash: 'ab'.repeat(28),
      stakeKeyHash: 'aa'.repeat(28),
      paymentAddr: 'addr_test1xyz',
    });
    const { container } = await renderGovernance();
    const header = buttonByText(container, 'Increase Treasury Cap');
    await act(async () => {
      header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const yesBtn = buttonByText(container, 'Yes');
    await act(async () => {
      yesBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(voteTx).toHaveBeenCalled();
  });

  test('Delegate to Always Abstain builds a vote-delegation transaction', async () => {
    const { container } = await renderGovernance();
    const delegateBtn = buttonByText(container, 'Delegate to Always Abstain');
    expect(delegateBtn).toBeTruthy();
    await act(async () => {
      delegateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(voteDelegationTx).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      'always_abstain',
      ''
    );
  });

  test('pasting a gov.tools drep1… ID builds a key-hash vote-delegation tx', async () => {
    const targetKeyHash = '11'.repeat(28);
    const drep1 = Loader.Cardano.DRep.new_key_hash(
      Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(targetKeyHash, 'hex'))
    ).to_bech32(true);
    expect(drep1.startsWith('drep1')).toBe(true);

    const { container } = await renderGovernance();
    const pasteIdx = container.textContent.indexOf('Delegate to a specific DRep');
    const abstainIdx = container.textContent.indexOf('Always Abstain');
    expect(pasteIdx).toBeGreaterThan(-1);
    expect(pasteIdx).toBeLessThan(abstainIdx);

    const input = container.querySelector('[data-testid="governance-drep-id-input"]');
    expect(input).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(input, drep1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const delegateBtn = container.querySelector(
      '[data-testid="governance-custom-drep-delegate"]'
    );
    expect(delegateBtn).toBeTruthy();
    expect(delegateBtn.disabled).toBe(false);
    await act(async () => {
      delegateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(voteDelegationTx).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      'key_hash',
      targetKeyHash
    );
  });

  test('refuses to build a vote-delegation tx for an unregistered DRep', async () => {
    ensureDrepRegisteredForDelegation.mockRejectedValue(
      new Error(DREP_NOT_REGISTERED)
    );
    const targetKeyHash = '11'.repeat(28);
    const drep1 = Loader.Cardano.DRep.new_key_hash(
      Loader.Cardano.Ed25519KeyHash.from_bytes(Buffer.from(targetKeyHash, 'hex'))
    ).to_bech32(true);

    const { container } = await renderGovernance();
    const input = container.querySelector('[data-testid="governance-drep-id-input"]');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(input, drep1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const delegateBtn = container.querySelector(
      '[data-testid="governance-custom-drep-delegate"]'
    );
    await act(async () => {
      delegateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(voteDelegationTx).not.toHaveBeenCalled();
    expect(ensureDrepRegisteredForDelegation).toHaveBeenCalled();
  });
});
