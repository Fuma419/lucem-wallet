/**
 * @jest-environment jsdom
 *
 * Behavioral render tests for the account-selector tray (formerly the network
 * tray). These mount the real WalletTrays component and assert user-visible
 * behavior rather than grepping source:
 *
 *   - one avatar FAB per stored account, so the tray is dynamic,
 *   - the active account is marked (aria-current),
 *   - tapping a different account calls the switch handler with its index,
 *   - tapping the active account is a no-op,
 *   - the tray no longer offers network switching (that moved to Settings).
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
if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// AvatarLoader (rendered inside each FAB) pulls avatarToImage from the extension
// module; stub it so we do not load the heavy real module in jsdom.
jest.mock('../../../api/extension', () => ({
  __esModule: true,
  avatarToImage: jest.fn(() => 'blob:avatar'),
}));

import WalletTrays from '../../../ui/app/components/walletTrays';

const ACCOUNTS = {
  0: { index: 0, name: 'Main', avatar: 'seed-main' },
  1: { index: 1, name: 'Savings', avatar: 'seed-savings' },
};

async function renderTrays(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ChakraProvider>
        <BrowserRouter>
          <WalletTrays
            accounts={ACCOUNTS}
            currentAccountIndex={0}
            onAccountSelect={props.onAccountSelect || jest.fn()}
            {...props}
          />
        </BrowserRouter>
      </ChakraProvider>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { container, root };
}

function click(el) {
  return act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

describe('account-selector tray — behavioral render', () => {
  test('renders the toggle plus one avatar FAB per account', async () => {
    const { container } = await renderTrays();
    expect(
      container.querySelector('[data-testid="account-tray-toggle"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="wallet-account-tray"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="account-tray-option-0"]')
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="account-tray-option-1"]')
    ).toBeTruthy();
  });

  test('is dynamic — a third account produces a third option', async () => {
    const { container } = await renderTrays({
      accounts: {
        ...ACCOUNTS,
        2: { index: 2, name: 'Cold', avatar: 'seed-cold' },
      },
    });
    expect(
      container.querySelector('[data-testid="account-tray-option-2"]')
    ).toBeTruthy();
    expect(
      container.querySelectorAll('[data-testid^="account-tray-option-"]').length
    ).toBe(3);
  });

  test('marks the active account and labels switch targets', async () => {
    const { container } = await renderTrays();
    const active = container.querySelector('[data-testid="account-tray-option-0"]');
    const other = container.querySelector('[data-testid="account-tray-option-1"]');
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(active.getAttribute('data-active')).toBe('true');
    expect(active.getAttribute('aria-label')).toContain('Main, selected');
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(other.getAttribute('aria-label')).toContain('Switch to Savings');
  });

  test('tapping another account switches to its index; tapping the active one is a no-op', async () => {
    const onAccountSelect = jest.fn();
    const { container } = await renderTrays({ onAccountSelect });

    await click(container.querySelector('[data-testid="account-tray-option-1"]'));
    expect(onAccountSelect).toHaveBeenCalledTimes(1);
    expect(onAccountSelect).toHaveBeenCalledWith(1);

    await click(container.querySelector('[data-testid="account-tray-option-0"]'));
    expect(onAccountSelect).toHaveBeenCalledTimes(1);
  });

  test('the tray no longer switches networks', async () => {
    const { container } = await renderTrays();
    const html = container.innerHTML;
    expect(html).not.toContain('Switch to Mainnet');
    expect(html).not.toContain('Switch to Preprod');
    expect(html).not.toContain('Toggle network menu');
    expect(
      container.querySelector('[data-testid="wallet-network-tray"]')
    ).toBeNull();
  });

  test('the toggle is a static account icon, not the active account avatar', async () => {
    const { container } = await renderTrays();
    const toggle = container.querySelector('[data-testid="account-tray-toggle"]');
    // The toggle renders an SVG glyph (react-icons) and never an avatar <img>,
    // so it stays fixed while the account options below still show avatars.
    expect(toggle.querySelector('svg')).toBeTruthy();
    expect(toggle.querySelector('img')).toBeNull();
    // Account options do carry avatar images, proving the two are distinct.
    const option = container.querySelector('[data-testid="account-tray-option-0"]');
    expect(option.querySelector('img')).toBeTruthy();
  });

  test('the toggle icon is static even when accounts are empty', async () => {
    const { container } = await renderTrays({
      accounts: {},
      currentAccountIndex: null,
    });
    const toggle = container.querySelector('[data-testid="account-tray-toggle"]');
    expect(toggle).toBeTruthy();
    expect(toggle.querySelector('svg')).toBeTruthy();
    // No account options while empty, but the static toggle icon still renders.
    expect(
      container.querySelectorAll('[data-testid^="account-tray-option-"]').length
    ).toBe(0);
  });
});
