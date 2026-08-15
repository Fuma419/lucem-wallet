/**
 * @jest-environment jsdom
 *
 * Behavioral render tests for the laptop / desktop sidebar.
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter } from 'react-router-dom';

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
  avatarToImage: jest.fn(() => 'blob:avatar'),
}));

import DesktopNav from '../../../ui/app/components/desktopNav';

const ACCOUNTS = {
  0: { index: 0, name: 'Main', avatar: 'seed-main' },
  1: { index: 1, name: 'Savings', avatar: 'seed-savings' },
};

async function renderNav(props = {}, route = '/wallet') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ChakraProvider>
        <MemoryRouter initialEntries={[route]}>
          <DesktopNav
            accounts={ACCOUNTS}
            currentAccountIndex={0}
            onAccountSelect={props.onAccountSelect || jest.fn()}
            delegation={props.delegation || null}
            {...props}
          />
        </MemoryRouter>
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

describe('desktop sidebar nav', () => {
  test('renders primary destinations and the account list', async () => {
    const { container } = await renderNav();
    expect(container.querySelector('[data-testid="lucem-desktop-nav"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-wallet"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-send"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-stake"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-vote"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-accounts"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-settings"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-account-0"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="desktop-nav-account-1"]')).toBeTruthy();
  });

  test('marks the current route and selected account', async () => {
    const { container } = await renderNav({}, '/send');
    expect(
      container
        .querySelector('[data-testid="desktop-nav-send"]')
        .getAttribute('aria-current')
    ).toBe('page');
    expect(
      container
        .querySelector('[data-testid="desktop-nav-account-0"]')
        .getAttribute('aria-current')
    ).toBe('true');
  });

  test('switching account calls onAccountSelect with that index', async () => {
    const onAccountSelect = jest.fn();
    const { container } = await renderNav({ onAccountSelect });
    await click(container.querySelector('[data-testid="desktop-nav-account-1"]'));
    expect(onAccountSelect).toHaveBeenCalledWith(1);
  });

  test('labels stake as Delegate when the account is not delegated', async () => {
    const { container } = await renderNav({ delegation: { active: false } });
    expect(
      container.querySelector('[data-testid="desktop-nav-stake"]').textContent
    ).toMatch(/Delegate/);
  });
});
