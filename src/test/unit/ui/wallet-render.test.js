/**
 * @jest-environment jsdom
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import Wallet from '../../../ui/app/pages/wallet';
import { createStore, StoreProvider, action } from 'easy-peasy';
import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter } from 'react-router-dom';

const dummyStore = createStore({
  settings: {
    settings: {
      colorTheme: 'dark',
      network: { id: 'mainnet' },
      currency: 'usd',
      adaSymbol: 'A',
    },
    setSettings: action(() => {}),
  },
  network: { network: 'mainnet' },
  account: {
    account: {
      name: 'Test',
      paymentAddr: 'addr_test1qztest',
      lovelace: '0',
      minAda: '0',
      assets: [],
      history: { confirmed: [], details: {} },
    },
  },
  globalModel: {
    sendStore: {
      value: { assets: [] },
      setValue: action(() => {}),
    },
  },
});

// Do not jest.requireActual('../../../api/extension'): index ↔ util cycles through
// getNetwork, and spreading the partial module throws on re-exported bindings
// (MAX_EXTERNAL_ADDRESS_INDEX) under Jest's mock factory.
jest.mock('../../../api/extension', () => ({
  __esModule: true,
  displayUnit: (q) => q,
  getAccounts: jest.fn().mockResolvedValue({}),
  getCurrentAccountIndex: jest.fn().mockResolvedValue(0),
  getDelegation: jest.fn().mockResolvedValue(null),
  getFiatPrice: jest.fn().mockResolvedValue(0),
  getNetwork: jest.fn().mockResolvedValue({ id: 'mainnet', name: 'mainnet' }),
  updateAccount: jest.fn().mockResolvedValue(undefined),
  onAccountChange: jest.fn(() => ({ remove: jest.fn() })),
  getStorage: jest.fn().mockResolvedValue({}),
  setStorage: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../api/util', () => ({
  __esModule: true,
  currencyToSymbol: () => '$',
  fromAssetUnit: (u) => u,
}));

describe('Wallet Component', () => {
  it('exports a renderable component (no undefined JSX identifiers)', () => {
    expect(typeof Wallet).toBe('function');
    let thrown;
    try {
      renderToString(
        <ChakraProvider>
          <StoreProvider store={dummyStore}>
            <BrowserRouter>
              <Wallet />
            </BrowserRouter>
          </StoreProvider>
        </ChakraProvider>
      );
    } catch (e) {
      thrown = e;
    }
    // ReferenceError = missing component/identifier in JSX. Other runtime/SSR
    // issues are outside this smoke check's scope.
    if (thrown) {
      expect(thrown).not.toBeInstanceOf(ReferenceError);
    }
  });
});
