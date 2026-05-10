import { NODE } from './config';
import secrets from 'secrets';
import { version } from '../../package.json';

const getEnvVar = (key, fallback = null) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || fallback;
  }
  return fallback;
};

const firstDefined = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return null;
};

const envValue = (keys, fallback = null) => {
  for (const key of keys) {
    const value = getEnvVar(key);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return fallback;
};

const networkToKoiosApiKey = {
  mainnet: envValue(['KOIOS_API_KEY_MAINNET'], secrets.PROJECT_ID_MAINNET),
  testnet: envValue(['KOIOS_API_KEY_TESTNET'], secrets.PROJECT_ID_TESTNET),
  preprod: envValue(['KOIOS_API_KEY_PREPROD'], secrets.PROJECT_ID_PREPROD),
  preview: envValue(['KOIOS_API_KEY_PREVIEW'], secrets.PROJECT_ID_PREVIEW),
};

/** Blockfrost API project id (header `project_id`). */
const networkToBlockfrostProjectId = {
  mainnet: envValue(
    ['BLOCKFROST_PROJECT_ID_MAINNET', 'BLOCKFROST_MAINNET_PROJECT_ID'],
    firstDefined(secrets.BLOCKFROST_PROJECT_ID_MAINNET, secrets.PROJECT_ID_MAINNET)
  ),
  testnet: envValue(
    ['BLOCKFROST_PROJECT_ID_TESTNET', 'BLOCKFROST_TESTNET_PROJECT_ID'],
    firstDefined(secrets.BLOCKFROST_PROJECT_ID_TESTNET, secrets.PROJECT_ID_TESTNET)
  ),
  preprod: envValue(
    ['BLOCKFROST_PROJECT_ID_PREPROD', 'BLOCKFROST_PREPROD_PROJECT_ID'],
    firstDefined(secrets.BLOCKFROST_PROJECT_ID_PREPROD, secrets.PROJECT_ID_PREPROD)
  ),
  preview: envValue(
    ['BLOCKFROST_PROJECT_ID_PREVIEW', 'BLOCKFROST_PREVIEW_PROJECT_ID'],
    firstDefined(secrets.BLOCKFROST_PROJECT_ID_PREVIEW, secrets.PROJECT_ID_PREVIEW)
  ),
};

export default {
  api: {
    ipfs: 'https://ipfs.blockfrost.dev/ipfs', // Keep this for now as it's still useful
    base: (node = NODE.mainnet) => node,
    header: { [getEnvVar('NAMI_HEADER', secrets.NAMI_HEADER) || 'dummy']: version },
    key: (network = 'mainnet') => ({
      project_id: networkToKoiosApiKey[network],
      blockfrost_project_id: networkToBlockfrostProjectId[network],
      // Koios API key from environment variable
      koios_key:
        networkToKoiosApiKey[network] !== 'your-koios-api-key-here'
          ? networkToKoiosApiKey[network]
          : null,
    }),
    price: (currency = 'usd') =>
      fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=${currency}`
      )
        .then((res) => res.json())
        .then((res) => res.cardano[currency]),
  },
};
