/**
 * @jest-environment jsdom
 *
 * Mount the Settings connection status and assert it names each provider, tells
 * "not configured" apart from "not responding", and re-probes on demand.
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

const mockProbe = jest.fn();

jest.mock('../../../api/util', () => ({
  probeChainProviders: (...args) => mockProbe(...args),
}));

const {
  recordProviderFailure,
  recordProviderSuccess,
  recordProviderUnconfigured,
  resetProviderHealth,
  getProviderHealth,
} = require('../../../api/provider-health');
const ProviderStatus = require('../../../ui/app/components/providerStatus')
  .default;

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChakraProvider>
        <ProviderStatus networkId={0} />
      </ChakraProvider>
    );
  });
  return { container, root };
}

const text = (container, testId) =>
  container.querySelector(`[data-testid="${testId}"]`)?.textContent || '';

describe('Settings connection status', () => {
  beforeEach(() => {
    resetProviderHealth();
    mockProbe.mockReset();
  });

  test('probes on mount and reports both providers connected', async () => {
    mockProbe.mockImplementation(async () => {
      recordProviderSuccess('blockfrost', 91, '/tip');
      recordProviderSuccess('koios', 140, '/tip');
      return getProviderHealth();
    });

    const { container, root } = await mount();
    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(text(container, 'settings-provider-blockfrost')).toMatch(
      /Blockfrost/
    );
    expect(text(container, 'settings-provider-blockfrost-detail')).toMatch(
      /Connected · 91 ms/
    );
    expect(text(container, 'settings-provider-koios-detail')).toMatch(
      /Connected · 140 ms/
    );
    expect(text(container, 'settings-provider-summary')).toMatch(
      /Both providers reachable/
    );
    await act(async () => root.unmount());
  });

  // The silent fallback: Blockfrost down, Koios carrying the wallet.
  test('names the failing provider and says the other is covering', async () => {
    mockProbe.mockImplementation(async () => {
      recordProviderFailure(
        'blockfrost',
        new Error('Blockfrost API error: 503'),
        '/tip'
      );
      recordProviderSuccess('koios', 210, '/tip');
      return getProviderHealth();
    });

    const { container, root } = await mount();
    expect(text(container, 'settings-provider-blockfrost-detail')).toMatch(
      /Not responding.*503/
    );
    expect(text(container, 'settings-provider-summary')).toMatch(
      /One provider is down; Lucem is using the other/
    );
    await act(async () => root.unmount());
  });

  test('a build with no Blockfrost key is reported healthy, not broken', async () => {
    mockProbe.mockImplementation(async () => {
      recordProviderUnconfigured('blockfrost');
      recordProviderSuccess('koios', 100, '/tip');
      return getProviderHealth();
    });

    const { container, root } = await mount();
    expect(text(container, 'settings-provider-blockfrost-detail')).toMatch(
      /Not configured/
    );
    expect(text(container, 'settings-provider-summary')).toMatch(
      /Both providers reachable/
    );
    await act(async () => root.unmount());
  });

  test('a total outage warns that balances and sending will fail', async () => {
    mockProbe.mockImplementation(async () => {
      recordProviderFailure('blockfrost', new Error('offline'), '/tip');
      recordProviderFailure('koios', new Error('offline'), '/tip');
      return getProviderHealth();
    });

    const { container, root } = await mount();
    expect(text(container, 'settings-provider-summary')).toMatch(
      /No provider is reachable/
    );
    await act(async () => root.unmount());
  });

  test('Test connection re-probes', async () => {
    mockProbe.mockImplementation(async () => {
      recordProviderSuccess('koios', 100, '/tip');
      return getProviderHealth();
    });

    const { container, root } = await mount();
    const button = container.querySelector(
      '[data-testid="settings-provider-test"]'
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(mockProbe).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  test('survives a probe that rejects', async () => {
    mockProbe.mockRejectedValue(new Error('probe blew up'));
    const { container, root } = await mount();
    expect(text(container, 'settings-provider-summary')).toMatch(
      /not checked yet/i
    );
    await act(async () => root.unmount());
  });
});
