import {
  KOIOS_ENDPOINTS,
  buildKoiosRequest,
  KOIOS_REQUESTS,
  addressTxsIndicatesHistory,
} from '../../../api/koios-endpoints';

describe('Koios Endpoints Library', () => {
  describe('KOIOS_ENDPOINTS structure', () => {
    test('should have all required endpoint categories', () => {
      expect(KOIOS_ENDPOINTS).toHaveProperty('BLOCKS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('BLOCK_INFO');
      expect(KOIOS_ENDPOINTS).toHaveProperty('TX_INFO');
      expect(KOIOS_ENDPOINTS).toHaveProperty('TX_UTXOS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('TX_METADATA');
      expect(KOIOS_ENDPOINTS).toHaveProperty('TX_STATUS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ADDRESS_INFO');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ADDRESS_UTXOS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ADDRESS_TXS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ACCOUNT_INFO');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ACCOUNT_UTXOS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ACCOUNT_TXS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ACCOUNT_REWARDS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('ASSETS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('POOLS');
      expect(KOIOS_ENDPOINTS).toHaveProperty('NETWORK');
      expect(KOIOS_ENDPOINTS).toHaveProperty('EPOCHS');
    });

    test('each endpoint should have required properties', () => {
      const validateEndpoint = (endpoint, name) => {
        expect(endpoint).toHaveProperty('method', expect.any(String));
        expect(endpoint).toHaveProperty('endpoint', expect.any(String));
        expect(['GET', 'POST'].includes(endpoint.method)).toBe(true);
        expect(endpoint.endpoint).toMatch(/^\//);
        
        if (endpoint.method === 'POST') {
          expect(endpoint).toHaveProperty('body');
        }
        
        if (endpoint.queryParams) {
          expect(endpoint.queryParams).toBeInstanceOf(Array);
        }
        
        if (endpoint.example) {
          expect(endpoint.example).toBeDefined();
        }
      };

      // Test all endpoints recursively
      const testAllEndpoints = (obj, path = '') => {
        Object.entries(obj).forEach(([key, value]) => {
          if (value && typeof value === 'object' && value.method) {
            validateEndpoint(value, `${path}.${key}`);
          } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            testAllEndpoints(value, `${path}.${key}`);
          }
        });
      };

      testAllEndpoints(KOIOS_ENDPOINTS);
    });
  });

  describe('BLOCKS endpoints', () => {
    test('BLOCKS.LIST should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.BLOCKS.LIST;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/blocks');
      expect(endpoint.queryParams).toContain('block_height');
      expect(endpoint.queryParams).toContain('limit');
      expect(endpoint.queryParams).toContain('offset');
    });

    test('BLOCKS.BY_HEIGHT should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.BLOCKS.BY_HEIGHT;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/blocks');
      expect(endpoint.queryParams).toContain('block_height');
    });

    test('BLOCK_INFO.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.BLOCK_INFO.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/block_info');
      expect(endpoint.body).toHaveProperty('_block_hashes');
      expect(Array.isArray(endpoint.body._block_hashes)).toBe(true);
    });
  });

  describe('TRANSACTION endpoints', () => {
    test('TX_INFO.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.TX_INFO.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/tx_info');
      expect(endpoint.body).toHaveProperty('_tx_hashes');
      expect(endpoint.body).toHaveProperty('_inputs');
      expect(endpoint.body).toHaveProperty('_metadata');
      expect(endpoint.body).toHaveProperty('_assets');
    });

    test('TX_UTXOS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.TX_UTXOS.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/tx_utxos');
      expect(endpoint.body).toHaveProperty('_tx_hashes');
      expect(endpoint.deprecated).toBe(true);
    });

    test('TX_METADATA.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.TX_METADATA.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/tx_metadata');
      expect(endpoint.body).toHaveProperty('_tx_hashes');
    });

    test('TX_STATUS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.TX_STATUS.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/tx_status');
      expect(endpoint.body).toHaveProperty('_tx_hashes');
    });
  });

  describe('ADDRESS endpoints', () => {
    test('ADDRESS_INFO.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ADDRESS_INFO.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/address_info');
      expect(endpoint.body).toHaveProperty('_addresses');
      expect(Array.isArray(endpoint.body._addresses)).toBe(true);
    });

    test('ADDRESS_UTXOS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ADDRESS_UTXOS.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/address_utxos');
      expect(endpoint.body).toHaveProperty('_addresses');
      expect(endpoint.body).toHaveProperty('_extended');
    });

    test('ADDRESS_TXS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ADDRESS_TXS.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/address_txs');
      expect(endpoint.body).toHaveProperty('_addresses');
    });
  });

  describe('ACCOUNT endpoints', () => {
    test('ACCOUNT_INFO.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ACCOUNT_INFO.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/account_info');
      expect(endpoint.body).toHaveProperty('_stake_addresses');
      expect(Array.isArray(endpoint.body._stake_addresses)).toBe(true);
    });

    test('ACCOUNT_UTXOS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ACCOUNT_UTXOS.DETAILS;
      expect(endpoint.method).toBe('POST');
      expect(endpoint.endpoint).toBe('/account_utxos');
      expect(endpoint.body).toHaveProperty('_stake_addresses');
      expect(endpoint.body).toHaveProperty('_extended');
    });

    test('ACCOUNT_TXS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ACCOUNT_TXS.DETAILS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/account_txs');
      expect(endpoint.queryParams).toContain('_stake_address');
      expect(endpoint.queryParams).toContain('_after_block_height');
    });

    test('ACCOUNT_REWARDS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ACCOUNT_REWARDS.DETAILS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/account_rewards');
      expect(endpoint.queryParams).toContain('_stake_address');
      expect(endpoint.queryParams).toContain('_epoch_no');
    });
  });

  describe('ASSET and POOL endpoints', () => {
    test('ASSETS.DETAILS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.ASSETS.DETAILS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/assets/{asset}');
    });

    test('POOLS.METADATA should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.POOLS.METADATA;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/pools/{pool_id}/metadata');
    });
  });

  describe('NETWORK and EPOCH endpoints', () => {
    test('NETWORK.TIP should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.NETWORK.TIP;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/tip');
    });

    test('NETWORK.GENESIS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.NETWORK.GENESIS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/genesis');
    });

    test('NETWORK.TOTALS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.NETWORK.TOTALS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/totals');
      expect(endpoint.queryParams).toContain('_epoch_no');
    });

    test('EPOCHS.LATEST_PARAMS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.EPOCHS.LATEST_PARAMS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/epoch_params/latest');
    });

    test('EPOCHS.PARAMS should be configured correctly', () => {
      const endpoint = KOIOS_ENDPOINTS.EPOCHS.PARAMS;
      expect(endpoint.method).toBe('GET');
      expect(endpoint.endpoint).toBe('/epoch_params/{epoch_no}');
    });
  });
});

describe('buildKoiosRequest function', () => {
  test('should build GET request without parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.NETWORK.TIP);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/tip');
    expect(request.body).toBeUndefined();
  });

  test('should build GET request with query parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.BLOCKS.BY_HEIGHT, {
      queryParams: { block_height: 'eq.123456' }
    });
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/blocks?block_height=eq.123456');
  });

  test('should build POST request with body', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.TX_INFO.DETAILS, {
      body: { _tx_hashes: ['test-hash'] }
    });
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_info');
    expect(request.body).toEqual({ _tx_hashes: ['test-hash'] });
  });

  test('should replace path parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.ASSETS.DETAILS, {
      pathParams: { asset: 'test-asset' }
    });
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/assets/test-asset');
  });

  test('should combine path parameters and query parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.EPOCHS.PARAMS, {
      pathParams: { epoch_no: '250' },
      queryParams: { select: 'epoch_no,epoch_slot' }
    });
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/epoch_params/250?select=epoch_no,epoch_slot');
  });

  test('should filter query parameters based on allowed params', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.BLOCKS.LIST, {
      queryParams: { 
        block_height: 'eq.123456',
        limit: '10',
        invalid_param: 'should_be_ignored'
      }
    });
    expect(request.endpoint).toBe('/blocks?block_height=eq.123456&limit=10');
  });
});

describe('KOIOS_REQUESTS helper functions', () => {
  test('getBlockByHeight should build correct request', () => {
    const request = KOIOS_REQUESTS.getBlockByHeight(123456);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/blocks?block_height=eq.123456');
  });

  test('getBlockByHash should build correct request', () => {
    const request = KOIOS_REQUESTS.getBlockByHash('test-hash');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/block_info');
    expect(request.body).toEqual({ _block_hashes: ['test-hash'] });
  });

  test('getTxInfo should build correct request', () => {
    const request = KOIOS_REQUESTS.getTxInfo('test-tx-hash');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_info');
    expect(request.body).toEqual({ _tx_hashes: ['test-tx-hash'] });
  });

  test('getTxInfos should preserve default flags and set multiple hashes', () => {
    const request = KOIOS_REQUESTS.getTxInfos(['h1', 'h2']);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_info');
    expect(request.body._tx_hashes).toEqual(['h1', 'h2']);
    expect(request.body._inputs).toBe(false);
  });

  test('getTxUtxos should build correct request', () => {
    const request = KOIOS_REQUESTS.getTxUtxos('test-tx-hash');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_utxos');
    expect(request.body).toEqual({ _tx_hashes: ['test-tx-hash'] });
  });

  test('getTxUtxosMany should build correct request for multiple hashes', () => {
    const request = KOIOS_REQUESTS.getTxUtxosMany(['t1', 't2']);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_utxos');
    expect(request.body._tx_hashes).toEqual(['t1', 't2']);
  });

  test('getTxMetadata should build correct request', () => {
    const request = KOIOS_REQUESTS.getTxMetadata('test-tx-hash');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_metadata');
    expect(request.body).toEqual({ _tx_hashes: ['test-tx-hash'] });
  });

  test('getTxMetadatas should build correct request for multiple hashes', () => {
    const request = KOIOS_REQUESTS.getTxMetadatas(['a', 'b']);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_metadata');
    expect(request.body._tx_hashes).toEqual(['a', 'b']);
  });

  test('getTxStatus should build correct request', () => {
    const request = KOIOS_REQUESTS.getTxStatus('test-tx-hash');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_status');
    expect(request.body).toEqual({ _tx_hashes: ['test-tx-hash'] });
  });

  test('getTxStatuses should build correct request for multiple hashes', () => {
    const request = KOIOS_REQUESTS.getTxStatuses(['x', 'y']);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_status');
    expect(request.body._tx_hashes).toEqual(['x', 'y']);
  });

  test('getAddressInfo should build correct request', () => {
    const request = KOIOS_REQUESTS.getAddressInfo('test-address');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_info');
    expect(request.body).toEqual({ _addresses: ['test-address'] });
  });

  test('getAddressesInfo should build correct request for multiple addresses', () => {
    const addrs = ['addr1', 'addr2'];
    const request = KOIOS_REQUESTS.getAddressesInfo(addrs);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_info');
    expect(request.body).toEqual({ _addresses: ['addr1', 'addr2'] });
    expect(addrs).toEqual(['addr1', 'addr2']);
  });

  test('getAddressUtxos should build correct request with extended flag', () => {
    const request = KOIOS_REQUESTS.getAddressUtxos('test-address', true);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_utxos');
    expect(request.body).toEqual({ _addresses: ['test-address'], _extended: true });
  });

  test('getAddressesUtxos should build correct request for multiple addresses', () => {
    const request = KOIOS_REQUESTS.getAddressesUtxos(['a1', 'a2'], false);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_utxos');
    expect(request.body).toEqual({ _addresses: ['a1', 'a2'], _extended: false });
  });

  test('getAddressTxs should build correct request', () => {
    const request = KOIOS_REQUESTS.getAddressTxs('test-address');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_txs');
    expect(request.body).toEqual({ _addresses: ['test-address'] });
  });

  test('getAddressesTxs should build correct request for multiple addresses', () => {
    const request = KOIOS_REQUESTS.getAddressesTxs(['addr1', 'addr2']);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_txs');
    expect(request.body).toEqual({ _addresses: ['addr1', 'addr2'] });
  });

  test('getAccountInfo should build correct request', () => {
    const request = KOIOS_REQUESTS.getAccountInfo('test-stake-address');
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/account_info');
    expect(request.body).toEqual({ _stake_addresses: ['test-stake-address'] });
  });

  test('getAccountsInfo should build correct request for multiple stake addresses', () => {
    const request = KOIOS_REQUESTS.getAccountsInfo(['stake1', 'stake2']);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/account_info');
    expect(request.body).toEqual({ _stake_addresses: ['stake1', 'stake2'] });
  });

  test('getAccountTxs should build correct request', () => {
    const request = KOIOS_REQUESTS.getAccountTxs('test-stake-address', 1000);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/account_txs?_stake_address=test-stake-address&_after_block_height=1000');
  });

  test('getAccountRewards should build correct request without epoch', () => {
    const request = KOIOS_REQUESTS.getAccountRewards('test-stake-address');
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/account_rewards?_stake_address=test-stake-address');
  });

  test('getAccountRewards should build correct request with epoch', () => {
    const request = KOIOS_REQUESTS.getAccountRewards('test-stake-address', 420);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/account_rewards?_stake_address=test-stake-address&_epoch_no=420');
  });

  test('getAccountUtxos should build correct request', () => {
    const request = KOIOS_REQUESTS.getAccountUtxos('test-stake-address', false);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/account_utxos');
    expect(request.body).toEqual({ _stake_addresses: ['test-stake-address'], _extended: false });
  });

  test('getAccountsUtxos should build correct request for multiple stake addresses', () => {
    const request = KOIOS_REQUESTS.getAccountsUtxos(['s1', 's2'], true);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/account_utxos');
    expect(request.body).toEqual({ _stake_addresses: ['s1', 's2'], _extended: true });
  });

  test('getPoolMetadata should build correct request', () => {
    const request = KOIOS_REQUESTS.getPoolMetadata('test-pool-id');
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/pools/test-pool-id/metadata');
  });

  test('getAssetInfo should build correct request', () => {
    const request = KOIOS_REQUESTS.getAssetInfo('test-asset');
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/assets/test-asset');
  });

  test('getEpochParamsLatest should build correct request', () => {
    const request = KOIOS_REQUESTS.getEpochParamsLatest();
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/epoch_params/latest');
  });

  test('getEpochParams should build correct request', () => {
    const request = KOIOS_REQUESTS.getEpochParams(250);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/epoch_params/250');
  });

  test('getNetworkTip should build correct request', () => {
    const request = KOIOS_REQUESTS.getNetworkTip();
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/tip');
  });

  test('getNetworkGenesis should build correct request', () => {
    const request = KOIOS_REQUESTS.getNetworkGenesis();
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/genesis');
  });

  test('getNetworkTotals should build correct request', () => {
    const request = KOIOS_REQUESTS.getNetworkTotals(300);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/totals?_epoch_no=300');
  });
});

describe('addressTxsIndicatesHistory', () => {
  test('false for null, undefined, empty array', () => {
    expect(addressTxsIndicatesHistory(null)).toBe(false);
    expect(addressTxsIndicatesHistory(undefined)).toBe(false);
    expect(addressTxsIndicatesHistory([])).toBe(false);
  });

  test('false for error-shaped object', () => {
    expect(addressTxsIndicatesHistory({ error: 'bad request' })).toBe(false);
  });

  test('true when at least one row', () => {
    expect(addressTxsIndicatesHistory([{ tx_hash: 'abc' }])).toBe(true);
  });
});

describe('Edge cases and error handling', () => {
  test('should handle empty query parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.BLOCKS.LIST, {
      queryParams: {}
    });
    expect(request.endpoint).toBe('/blocks');
  });

  test('should handle undefined parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.NETWORK.TIP);
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/tip');
  });

  test('should preserve original body when no override provided', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.TX_INFO.DETAILS);
    expect(request.body).toEqual(KOIOS_ENDPOINTS.TX_INFO.DETAILS.body);
  });

  test('should handle multiple path parameters', () => {
    const request = buildKoiosRequest(KOIOS_ENDPOINTS.ASSETS.DETAILS, {
      pathParams: { asset: 'asset1' }
    });
    expect(request.endpoint).toBe('/assets/asset1');
  });
});

describe('Integration tests', () => {
  test('should build realistic transaction info request', () => {
    const txHash = 'f144a8264acf4bdfe2e1241170969c930d64ab6b0996a4a45237b623f1dd670e';
    const request = KOIOS_REQUESTS.getTxInfo(txHash);
    
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/tx_info');
    expect(request.body).toEqual({ _tx_hashes: [txHash] });
  });

  test('should build realistic address info request', () => {
    const address = 'addr1qy2jt0qpqz2z2z9zx5w4xemekkce7yderz53kjue53lpqv90lkfa9sgrfjuz6uvt4uqtrqhl2kj0a9lnr9ndzutx32gqleeckv';
    const request = KOIOS_REQUESTS.getAddressInfo(address);
    
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_info');
    expect(request.body).toEqual({ _addresses: [address] });
  });

  test('should build realistic address_txs request', () => {
    const address = 'addr1qy2jt0qpqz2z2z9zx5w4xemekkce7yderz53kjue53lpqv90lkfa9sgrfjuz6uvt4uqtrqhl2kj0a9lnr9ndzutx32gqleeckv';
    const request = KOIOS_REQUESTS.getAddressTxs(address);
    expect(request.method).toBe('POST');
    expect(request.endpoint).toBe('/address_txs');
    expect(request.body).toEqual({ _addresses: [address] });
  });

  test('should build realistic account transactions request', () => {
    const stakeAddress = 'stake1u8fvlns8kzw5rl08uns7g35atul8k43unpcyd8we8juwuhcc27rzl';
    const request = KOIOS_REQUESTS.getAccountTxs(stakeAddress, 0);
    
    expect(request.method).toBe('GET');
    expect(request.endpoint).toBe('/account_txs?_stake_address=stake1u8fvlns8kzw5rl08uns7g35atul8k43unpcyd8we8juwuhcc27rzl&_after_block_height=0');
  });
}); 