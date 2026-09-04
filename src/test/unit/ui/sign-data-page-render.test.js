/**
 * @jest-environment jsdom
 *
 * Mount the dApp "sign message" screen: shell, copy, and the paths that return
 * a result to the dApp.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';

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

const mockSignDataCIP30 = jest.fn().mockResolvedValue('signed_cip30');
const mockIsHW = jest.fn(() => false);

jest.mock('../../../api/extension', () => ({
  __esModule: true,
  getCurrentAccount: jest.fn().mockResolvedValue({
    index: 0,
    name: 'Account 0',
    avatar: 'a',
  }),
  isHW: (...args) => mockIsHW(...args),
  signData: jest.fn(),
  signDataCIP30: (...args) => mockSignDataCIP30(...args),
  avatarToImage: jest.fn(() => ''),
}));

jest.mock('../../../platform', () => ({
  __esModule: true,
  default: {
    icons: { getFaviconUrl: (origin) => `https://icons.test/?o=${origin}` },
  },
}));

// Base address bytes decode to a "payment" key label.
jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    Cardano: {
      Address: { from_bytes: () => ({}) },
      BaseAddress: { from_address: () => ({}) },
      RewardAddress: { from_address: () => null },
    },
  },
}));

const SignData = require('../../../ui/app/pages/signData').default;

const MESSAGE = 'Delegate to LUCEM pool';
const ORIGIN = 'https://magic-delegation.test';

function makeRequest() {
  return {
    origin: ORIGIN,
    data: {
      CIP30: true,
      address: '00'.repeat(29),
      payload: Buffer.from(MESSAGE, 'utf8').toString('hex'),
    },
  };
}

async function mount(overrides = {}) {
  const controller = { returnData: jest.fn().mockResolvedValue(undefined) };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChakraProvider>
        <SignData
          request={{ ...makeRequest(), ...overrides }}
          controller={controller}
        />
      </ChakraProvider>
    );
  });
  return { container, root, controller };
}

const byTestId = (container, id) =>
  container.querySelector(`[data-testid="${id}"]`);

const click = async (node) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

describe('dApp sign message screen', () => {
  let closeSpy;

  beforeEach(() => {
    mockIsHW.mockReturnValue(false);
    mockSignDataCIP30.mockClear();
    closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
  });

  afterEach(() => {
    closeSpy.mockRestore();
    document.body.innerHTML = '';
  });

  test('shows the origin, the message, and which key signs', async () => {
    const { container, root } = await mount();

    expect(byTestId(container, 'sign-data-page')).toBeTruthy();
    expect(byTestId(container, 'sign-data-page-title').textContent).toBe(
      'Sign message'
    );
    expect(byTestId(container, 'sign-data-origin').textContent).toContain(
      'magic-delegation.test'
    );
    expect(byTestId(container, 'sign-data-payload').textContent).toContain(
      MESSAGE
    );
    // Reassure the user that a signature cannot move funds.
    expect(container.textContent).toContain('payment key');
    expect(container.textContent).toContain('cannot move funds');
    await act(async () => root.unmount());
  });

  test('uses the shared approval shell rather than a bare page', async () => {
    const { container, root } = await mount();
    const page = byTestId(container, 'sign-data-page');
    expect(page.className).toContain('lucem-sign-page');
    expect(page.className).toContain('lucem-settings-shell');
    expect(byTestId(container, 'sign-data-footer')).toBeTruthy();
    expect(byTestId(container, 'sign-data-payload').className).toContain(
      'lucem-inset-surface'
    );
    await act(async () => root.unmount());
  });

  test('an empty message says so instead of rendering a blank card', async () => {
    const { container, root } = await mount({
      data: { ...makeRequest().data, payload: '' },
    });
    expect(byTestId(container, 'sign-data-payload').textContent).toContain(
      'empty message'
    );
    await act(async () => root.unmount());
  });

  test('cancel declines and closes', async () => {
    const { container, root, controller } = await mount();
    await click(byTestId(container, 'sign-data-cancel'));

    expect(controller.returnData).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: expect.any(Number) }),
    });
    expect(closeSpy).toHaveBeenCalled();
    expect(mockSignDataCIP30).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  // Regression: signData called an undefined `capture(Events…)` after signing.
  // confirmModal caught the ReferenceError and reported failure, so the dApp got
  // an error instead of the signature the user had just approved.
  test('a successful signature is returned to the dApp, not an error', async () => {
    const { container, root, controller } = await mount();

    await click(byTestId(container, 'sign-data-primary-action'));

    const input = document.querySelector('input[type="password"]');
    expect(input).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      setter.call(input, 'pa$$word');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Confirm'
    );
    expect(confirm).toBeTruthy();
    await click(confirm);

    expect(mockSignDataCIP30).toHaveBeenCalled();
    expect(controller.returnData).toHaveBeenCalledWith({
      data: 'signed_cip30',
    });
    expect(controller.returnData).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() })
    );
    await act(async () => root.unmount());
  });

  test('a hardware account is told why it cannot sign, and Sign is disabled', async () => {
    mockIsHW.mockReturnValue(true);
    const { container, root } = await mount();

    expect(byTestId(container, 'sign-data-error').textContent).toMatch(
      /Hardware wallets cannot sign data/i
    );
    expect(
      byTestId(container, 'sign-data-primary-action').hasAttribute('disabled')
    ).toBe(true);
    await act(async () => root.unmount());
  });
});
