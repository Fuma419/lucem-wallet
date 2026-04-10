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
    settings: { colorTheme: 'dark', network: { id: 'mainnet' }, currency: 'usd', adaSymbol: 'A' },
    setSettings: action(() => {})
  },
  network: { network: 'mainnet' },
  account: { account: { name: 'Test' } },
});

jest.mock('../../../api/extension', () => {
  const originalModule = jest.requireActual('../../../api/extension');
  return {
    __esModule: true,
    ...originalModule,
    getStorage: jest.fn().mockResolvedValue({}),
    setStorage: jest.fn().mockResolvedValue(true),
    getNetwork: jest.fn().mockResolvedValue({ id: 'mainnet' }),
  };
});

describe('Wallet Component', () => {
  it('renders without throwing ReferenceError for undefined components', () => {
    // This will catch react/jsx-no-undef at runtime since React.createElement
    // throws or the function call throws when an undefined variable is passed
    // as a component type.
    
    // We just want to ensure that calling the function doesn't throw a ReferenceError
    // for a missing component like DeleteAccountModal
    expect(() => {
      renderToString(
        <ChakraProvider>
          <StoreProvider store={dummyStore}>
            <BrowserRouter>
              <Wallet />
            </BrowserRouter>
          </StoreProvider>
        </ChakraProvider>
      );
    }).not.toThrow();
  });
});
