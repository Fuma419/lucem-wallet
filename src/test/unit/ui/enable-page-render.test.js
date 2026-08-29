/**
 * @jest-environment jsdom
 *
 * Mount the CIP-30 connection approval screen and assert the user-visible
 * grant/refuse actions plus CIP-95 permission copy.
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

const mockSetWhitelisted = jest.fn().mockResolvedValue(true);

jest.mock('../../../api/extension', () => ({
  __esModule: true,
  setWhitelisted: (...args) => mockSetWhitelisted(...args),
  getCurrentAccount: jest.fn().mockResolvedValue({
    name: 'Account 0',
    avatar: 'a',
  }),
  avatarToImage: jest.fn(() => ''),
}));

jest.mock('../../../platform', () => ({
  __esModule: true,
  default: {
    icons: {
      getFaviconUrl: (origin) => `https://icons.test/?o=${origin}`,
    },
  },
}));

const Enable = require('../../../ui/app/pages/enable').default;

const mountEnable = async (request, controller) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChakraProvider>
        <Enable request={request} controller={controller} />
      </ChakraProvider>
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
};

describe('Enable connection approval — render', () => {
  let closeSpy;

  beforeEach(() => {
    mockSetWhitelisted.mockClear();
    closeSpy = jest.spyOn(window, 'close').mockImplementation(() => {});
  });

  afterEach(() => {
    closeSpy.mockRestore();
  });

  test('shows host, connect title, and core permissions', async () => {
    const { container, unmount } = await mountEnable(
      { origin: 'https://gov.tools' },
      { returnData: jest.fn() }
    );

    expect(container.querySelector('[data-testid="enable-page"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="enable-page-title"]').textContent).toBe(
      'Connect to this site'
    );
    expect(container.textContent).toContain('gov.tools');
    expect(container.textContent).toContain('View your balance and addresses');
    expect(container.textContent).toContain('Request approval for transactions');
    expect(container.textContent).not.toContain(
      'View governance keys (DRep and stake)'
    );
    await unmount();
  });

  test('lists CIP-95 governance permission when the dApp requested it', async () => {
    const { container, unmount } = await mountEnable(
      {
        origin: 'https://gov.tools',
        data: { extensions: [{ cip: 95 }] },
      },
      { returnData: jest.fn() }
    );

    expect(container.textContent).toContain(
      'View governance keys (DRep and stake)'
    );
    await unmount();
  });

  test('Connect whitelists the origin and returns success', async () => {
    const returnData = jest.fn().mockResolvedValue(undefined);
    const { container, unmount } = await mountEnable(
      { origin: 'https://gov.tools' },
      { returnData }
    );

    await act(async () => {
      container.querySelector('[data-testid="enable-connect"]').click();
    });

    expect(mockSetWhitelisted).toHaveBeenCalledWith('https://gov.tools');
    expect(returnData).toHaveBeenCalledWith({ data: true });
    expect(closeSpy).toHaveBeenCalled();
    await unmount();
  });

  test('Cancel refuses the connection without whitelisting', async () => {
    const returnData = jest.fn().mockResolvedValue(undefined);
    const { container, unmount } = await mountEnable(
      { origin: 'https://gov.tools' },
      { returnData }
    );

    await act(async () => {
      container.querySelector('[data-testid="enable-cancel"]').click();
    });

    expect(mockSetWhitelisted).not.toHaveBeenCalled();
    expect(returnData).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: expect.any(Number) }),
    });
    expect(closeSpy).toHaveBeenCalled();
    await unmount();
  });
});
