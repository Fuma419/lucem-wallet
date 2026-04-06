/**
 * Koios API Endpoints Library
 * Based on official Koios API documentation (koios-docs.yml)
 * This library provides the correct endpoints, HTTP methods, and request formats
 */

export const KOIOS_ENDPOINTS = {
  // ===== BLOCK ENDPOINTS =====
  BLOCKS: {
    // GET /blocks - Get summarised details about all blocks (paginated - latest first)
    LIST: {
      method: 'GET',
      endpoint: '/blocks',
      queryParams: ['select', 'epoch_no', 'epoch_slot', 'block_height', 'block_time', 'pool', 'order', 'limit', 'offset'],
      example: '/blocks?block_height=eq.123456&limit=1'
    },
    // GET /blocks?block_height=eq.{height} - Get specific block by height
    BY_HEIGHT: {
      method: 'GET',
      endpoint: '/blocks',
      queryParams: ['block_height'],
      example: '/blocks?block_height=eq.123456'
    }
  },
  
  BLOCK_INFO: {
    // POST /block_info - Get detailed information about specific blocks
    DETAILS: {
      method: 'POST',
      endpoint: '/block_info',
      body: { _block_hashes: ['hash1', 'hash2'] },
      example: { _block_hashes: ['fb9087c9f1408a7bbd7b022fd294ab565fec8dd3a8ef091567482722a1fa4e30'] }
    }
  },

  // ===== TRANSACTION ENDPOINTS =====
  TX_INFO: {
    // POST /tx_info - Get detailed information about transaction(s)
    DETAILS: {
      method: 'POST',
      endpoint: '/tx_info',
      body: { 
        _tx_hashes: ['hash1', 'hash2'],
        _inputs: false,
        _metadata: false,
        _assets: false,
        _withdrawals: false,
        _certs: false,
        _scripts: false,
        _bytecode: false,
        _governance: false
      },
      example: { _tx_hashes: ['f144a8264acf4bdfe2e1241170969c930d64ab6b0996a4a45237b623f1dd670e'] }
    }
  },

  TX_UTXOS: {
    // POST /tx_utxos - Get UTxO set (inputs/outputs) of transactions [DEPRECATED]
    DETAILS: {
      method: 'POST',
      endpoint: '/tx_utxos',
      body: { _tx_hashes: ['hash1', 'hash2'] },
      example: { _tx_hashes: ['f144a8264acf4bdfe2e1241170969c930d64ab6b0996a4a45237b623f1dd670e'] },
      deprecated: true
    }
  },

  TX_METADATA: {
    // POST /tx_metadata - Get metadata information for given transaction(s)
    DETAILS: {
      method: 'POST',
      endpoint: '/tx_metadata',
      body: { _tx_hashes: ['hash1', 'hash2'] },
      example: { _tx_hashes: ['f144a8264acf4bdfe2e1241170969c930d64ab6b0996a4a45237b623f1dd670e'] }
    }
  },

  TX_STATUS: {
    // POST /tx_status - Get status of transaction(s)
    DETAILS: {
      method: 'POST',
      endpoint: '/tx_status',
      body: { _tx_hashes: ['hash1', 'hash2'] },
      example: { _tx_hashes: ['f144a8264acf4bdfe2e1241170969c930d64ab6b0996a4a45237b623f1dd670e'] }
    }
  },

  // ===== ADDRESS ENDPOINTS =====
  ADDRESS_INFO: {
    // POST /address_info - Get address info - balance, associated stake address and UTxO set
    DETAILS: {
      method: 'POST',
      endpoint: '/address_info',
      body: { _addresses: ['addr1...', 'addr2...'] },
      example: { _addresses: ['addr1qy2jt0qpqz2z2z9zx5w4xemekkce7yderz53kjue53lpqv90lkfa9sgrfjuz6uvt4uqtrqhl2kj0a9lnr9ndzutx32gqleeckv'] }
    }
  },

  ADDRESS_UTXOS: {
    // POST /address_utxos - Get UTxO set for given addresses
    DETAILS: {
      method: 'POST',
      endpoint: '/address_utxos',
      body: { 
        _addresses: ['addr1...', 'addr2...'],
        _extended: true // Optional: include extended info
      },
      example: { _addresses: ['addr1qy2jt0qpqz2z2z9zx5w4xemekkce7yderz53kjue53lpqv90lkfa9sgrfjuz6uvt4uqtrqhl2kj0a9lnr9ndzutx32gqleeckv'] }
    }
  },

  ADDRESS_TXS: {
    // POST /address_txs - Get transaction hashes for given addresses
    DETAILS: {
      method: 'POST',
      endpoint: '/address_txs',
      body: { _addresses: ['addr1...', 'addr2...'] },
      example: { _addresses: ['addr1qy2jt0qpqz2z2z9zx5w4xemekkce7yderz53kjue53lpqv90lkfa9sgrfjuz6uvt4uqtrqhl2kj0a9lnr9ndzutx32gqleeckv'] }
    }
  },

  // ===== ACCOUNT (STAKE ADDRESS) ENDPOINTS =====
  ACCOUNT_INFO: {
    // POST /account_info - Get cached account information for given stake addresses
    DETAILS: {
      method: 'POST',
      endpoint: '/account_info',
      body: { _stake_addresses: ['stake1...', 'stake2...'] },
      example: { _stake_addresses: ['stake1u8fvlns8kzw5rl08uns7g35atul8k43unpcyd8we8juwuhcc27rzl'] }
    }
  },

  ACCOUNT_UTXOS: {
    // POST /account_utxos - UTxOs for stake addresses (accounts)
    DETAILS: {
      method: 'POST',
      endpoint: '/account_utxos',
      body: { 
        _stake_addresses: ['stake1...', 'stake2...'],
        _extended: true // Optional: include extended info
      },
      example: { _stake_addresses: ['stake1u8fvlns8kzw5rl08uns7g35atul8k43unpcyd8we8juwuhcc27rzl'] }
    }
  },

  ACCOUNT_TXS: {
    // GET /account_txs - Get transaction history for given stake addresses
    DETAILS: {
      method: 'GET',
      endpoint: '/account_txs',
      queryParams: ['_stake_address', '_after_block_height', '_limit'],
      example: '/account_txs?_stake_address=stake1u8fvlns8kzw5rl08uns7g35atul8k43unpcyd8we8juwuhcc27rzl&_after_block_height=0'
    }
  },

  ACCOUNT_REWARDS: {
    // GET /account_rewards - Get reward history for given stake addresses
    DETAILS: {
      method: 'GET',
      endpoint: '/account_rewards',
      queryParams: ['_stake_address', '_epoch_no'],
      example: '/account_rewards?_stake_address=stake1u8fvlns8kzw5rl08uns7g35atul8k43unpcyd8we8juwuhcc27rzl'
    }
  },

  // ===== ASSET ENDPOINTS =====
  ASSETS: {
    // GET /assets/{asset} - Get asset information
    DETAILS: {
      method: 'GET',
      endpoint: '/assets/{asset}',
      example: '/assets/29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e'
    }
  },

  // ===== POOL ENDPOINTS =====
  POOLS: {
    // GET /pools/{pool_id}/metadata - Get pool metadata
    METADATA: {
      method: 'GET',
      endpoint: '/pools/{pool_id}/metadata',
      example: '/pools/pool155efqn9xpcf73pphkk88cmlkdwx4ulkg606tne970qswczg3asc/metadata'
    }
  },

  // ===== NETWORK ENDPOINTS =====
  NETWORK: {
    // GET /tip - Get the tip info about the latest block seen by network
    TIP: {
      method: 'GET',
      endpoint: '/tip',
      example: '/tip'
    },
    
    // GET /genesis - Get the Genesis parameters used to create specific era on protocol
    GENESIS: {
      method: 'GET',
      endpoint: '/genesis',
      example: '/genesis'
    },
    
    // GET /totals - Get the circulating utxo, treasury, rewards, supply and reserves in lovelace for specified epoch
    TOTALS: {
      method: 'GET',
      endpoint: '/totals',
      queryParams: ['_epoch_no'],
      example: '/totals?_epoch_no=250'
    }
  },

  // ===== EPOCH ENDPOINTS =====
  EPOCHS: {
    // GET /epoch_params/latest - Get the protocol parameters for the latest epoch
    LATEST_PARAMS: {
      method: 'GET',
      endpoint: '/epoch_params/latest',
      example: '/epoch_params/latest'
    },
    
    // GET /epoch_params/{epoch_no} - Get the protocol parameters for specific epoch
    PARAMS: {
      method: 'GET',
      endpoint: '/epoch_params/{epoch_no}',
      queryParams: ['select', 'epoch_no', 'epoch_slot', 'min_fee_a', 'min_fee_b', 'max_block_size', 'max_tx_size', 'max_bh_size', 'key_deposit', 'pool_deposit', 'max_epoch', 'optimal_pool_count', 'influence', 'monetary_expand_rate', 'treasury_growth_rate', 'decentralisation', 'entropy', 'protocol_major', 'protocol_minor', 'min_utxo', 'min_pool_cost', 'nonce', 'cost_model', 'price_mem', 'price_step', 'max_tx_ex_mem', 'max_tx_ex_steps', 'max_block_ex_mem', 'max_block_ex_steps', 'max_val_size', 'collateral_percent', 'max_collateral_inputs', 'coins_per_utxo_word', 'coins_per_utxo_size'],
      example: '/epoch_params/250'
    }
  }
};

/**
 * Helper function to build Koios API requests
 */
export const buildKoiosRequest = (endpointConfig, params = {}) => {
  const { method, endpoint, body, queryParams, example } = endpointConfig;
  
  let finalEndpoint = endpoint;
  
  // Replace path parameters
  if (params.pathParams) {
    Object.entries(params.pathParams).forEach(([key, value]) => {
      finalEndpoint = finalEndpoint.replace(`{${key}}`, value);
    });
  }
  
  // Add query parameters
  if (params.queryParams && queryParams) {
    const queryString = Object.entries(params.queryParams)
      .filter(([key]) => queryParams.includes(key))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    if (queryString) {
      finalEndpoint += `?${queryString}`;
    }
  }
  
  return {
    method,
    endpoint: finalEndpoint,
    body: params.body || body,
    example
  };
};

/**
 * Common Koios API request patterns
 */
export const KOIOS_REQUESTS = {
  // Get block by height
  getBlockByHeight: (blockHeight) => buildKoiosRequest(KOIOS_ENDPOINTS.BLOCKS.BY_HEIGHT, {
    queryParams: { block_height: `eq.${blockHeight}` }
  }),
  
  // Get block by hash
  getBlockByHash: (blockHash) => buildKoiosRequest(KOIOS_ENDPOINTS.BLOCK_INFO.DETAILS, {
    body: { _block_hashes: [blockHash] }
  }),
  
  // Get transaction info
  getTxInfo: (txHash) => buildKoiosRequest(KOIOS_ENDPOINTS.TX_INFO.DETAILS, {
    body: { _tx_hashes: [txHash] }
  }),
  
  // Get transaction UTXOs
  getTxUtxos: (txHash) => buildKoiosRequest(KOIOS_ENDPOINTS.TX_UTXOS.DETAILS, {
    body: { _tx_hashes: [txHash] }
  }),
  
  // Get transaction metadata
  getTxMetadata: (txHash) => buildKoiosRequest(KOIOS_ENDPOINTS.TX_METADATA.DETAILS, {
    body: { _tx_hashes: [txHash] }
  }),

  // Get transaction confirmation status
  getTxStatus: (txHash) => buildKoiosRequest(KOIOS_ENDPOINTS.TX_STATUS.DETAILS, {
    body: { _tx_hashes: [txHash] }
  }),
  
  // Get address info
  getAddressInfo: (address) => buildKoiosRequest(KOIOS_ENDPOINTS.ADDRESS_INFO.DETAILS, {
    body: { _addresses: [address] }
  }),
  
  // Get address UTXOs
  getAddressUtxos: (address, extended = false) => buildKoiosRequest(KOIOS_ENDPOINTS.ADDRESS_UTXOS.DETAILS, {
    body: { _addresses: [address], _extended: extended }
  }),

  // Get transaction history for addresses (POST /address_txs)
  getAddressTxs: (address) => buildKoiosRequest(KOIOS_ENDPOINTS.ADDRESS_TXS.DETAILS, {
    body: { _addresses: [address] }
  }),
  
  // Get account info
  getAccountInfo: (stakeAddress) => buildKoiosRequest(KOIOS_ENDPOINTS.ACCOUNT_INFO.DETAILS, {
    body: { _stake_addresses: [stakeAddress] }
  }),
  
  // Get account transactions
  getAccountTxs: (stakeAddress, afterBlockHeight = 0) => buildKoiosRequest(KOIOS_ENDPOINTS.ACCOUNT_TXS.DETAILS, {
    queryParams: { 
      _stake_address: stakeAddress,
      _after_block_height: afterBlockHeight
    }
  }),

  getAccountRewards: (stakeAddress, epochNo) => buildKoiosRequest(KOIOS_ENDPOINTS.ACCOUNT_REWARDS.DETAILS, {
    queryParams: epochNo === undefined || epochNo === null
      ? { _stake_address: stakeAddress }
      : { _stake_address: stakeAddress, _epoch_no: epochNo }
  }),
  
  // Get account UTXOs
  getAccountUtxos: (stakeAddress, extended = false) => buildKoiosRequest(KOIOS_ENDPOINTS.ACCOUNT_UTXOS.DETAILS, {
    body: { _stake_addresses: [stakeAddress], _extended: extended }
  }),
  
  // Get pool metadata
  getPoolMetadata: (poolId) => buildKoiosRequest(KOIOS_ENDPOINTS.POOLS.METADATA, {
    pathParams: { pool_id: poolId }
  }),
  
  // Get asset info
  getAssetInfo: (asset) => buildKoiosRequest(KOIOS_ENDPOINTS.ASSETS.DETAILS, {
    pathParams: { asset }
  }),

  getEpochParamsLatest: () => buildKoiosRequest(KOIOS_ENDPOINTS.EPOCHS.LATEST_PARAMS),

  getNetworkTip: () => buildKoiosRequest(KOIOS_ENDPOINTS.NETWORK.TIP),

  getNetworkGenesis: () => buildKoiosRequest(KOIOS_ENDPOINTS.NETWORK.GENESIS),
};

/**
 * True when Koios /address_txs (or equivalent) response indicates at least one transaction.
 * Koios returns a JSON array of rows; error payloads may be objects with `.error`.
 */
export const addressTxsIndicatesHistory = (payload) => {
  if (payload == null) return false;
  if (typeof payload === 'object' && !Array.isArray(payload) && payload.error) {
    return false;
  }
  return Array.isArray(payload) && payload.length >= 1;
};

export default KOIOS_ENDPOINTS; 