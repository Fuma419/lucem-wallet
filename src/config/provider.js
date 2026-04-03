import { NODE } from './config';
import secrets from 'secrets';
import { version } from '../../package.json';

// Get environment variables for Koios API keys
const getEnvVar = (key, fallback = null) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
};

const networkToProjectId = {
  mainnet: getEnvVar('KOIOS_API_KEY_MAINNET', secrets.PROJECT_ID_MAINNET),
  testnet: getEnvVar('KOIOS_API_KEY_TESTNET', secrets.PROJECT_ID_TESTNET),
  preprod: getEnvVar('KOIOS_API_KEY_PREPROD', secrets.PROJECT_ID_PREPROD),
  preview: getEnvVar('KOIOS_API_KEY_PREVIEW', secrets.PROJECT_ID_PREVIEW),
};

export default {
  api: {
    ipfs: 'https://ipfs.blockfrost.dev/ipfs', // Keep this for now as it's still useful
    base: (node = NODE.mainnet) => node,
    header: { [getEnvVar('NAMI_HEADER', secrets.NAMI_HEADER) || 'dummy']: version },
    key: (network = 'mainnet') => ({
      project_id: networkToProjectId[network],
      // Koios API key from environment variable
      koios_key: networkToProjectId[network] !== 'your-koios-api-key-here' ? networkToProjectId[network] : null,
    }),
    price: (currency = 'usd') =>
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=${currency}`
      )
        .then((res) => res.json())
        .then((res) => res.cardano[currency]),
  },
};
