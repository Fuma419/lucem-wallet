import { koiosRequest } from './src/api/util.js';
import { KOIOS_REQUESTS } from './src/api/koios-endpoints.js';

// Mock getNetwork since test environment is running out of context
global.chrome = { storage: { local: { get: () => Promise.resolve({ network: { id: 'mainnet' } }) } } };

koiosRequest('/pool_info', {}, { _pool_bech32_ids: ['pool1eaeynp2hs06v4x8q65jfm2xqcd3dc80rv220gmxvwg8m5sd6e7a'] })
  .then(res => console.log('Result:', res))
  .catch(err => console.error('Error:', err));