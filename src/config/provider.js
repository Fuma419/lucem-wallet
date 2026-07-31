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

// Static process.env.<NAME> references so webpack's EnvironmentPlugin can inline
// the real values into the browser bundle at build time. The dynamic lookup in
// `envValue`/`getEnvVar` (process.env[key]) is NOT inlined and resolves to
// undefined in the browser, which is why Blockfrost previously always fell back
// to the dummy Koios secrets and forced the Koios API path.
const staticBlockfrostProjectId = {
  mainnet: firstDefined(
    process.env.BLOCKFROST_PROJECT_ID_MAINNET,
    process.env.BLOCKFROST_MAINNET_PROJECT_ID
  ),
  testnet: firstDefined(
    process.env.BLOCKFROST_PROJECT_ID_TESTNET,
    process.env.BLOCKFROST_TESTNET_PROJECT_ID
  ),
  preprod: firstDefined(
    process.env.BLOCKFROST_PROJECT_ID_PREPROD,
    process.env.BLOCKFROST_PREPROD_PROJECT_ID
  ),
  preview: firstDefined(
    process.env.BLOCKFROST_PROJECT_ID_PREVIEW,
    process.env.BLOCKFROST_PREVIEW_PROJECT_ID
  ),
};

/** Blockfrost API project id (header `project_id`). */
const networkToBlockfrostProjectId = {
  mainnet: firstDefined(
    staticBlockfrostProjectId.mainnet,
    envValue(['BLOCKFROST_PROJECT_ID_MAINNET', 'BLOCKFROST_MAINNET_PROJECT_ID']),
    secrets.BLOCKFROST_PROJECT_ID_MAINNET,
    secrets.PROJECT_ID_MAINNET
  ),
  testnet: firstDefined(
    staticBlockfrostProjectId.testnet,
    envValue(['BLOCKFROST_PROJECT_ID_TESTNET', 'BLOCKFROST_TESTNET_PROJECT_ID']),
    secrets.BLOCKFROST_PROJECT_ID_TESTNET,
    secrets.PROJECT_ID_TESTNET
  ),
  preprod: firstDefined(
    staticBlockfrostProjectId.preprod,
    envValue(['BLOCKFROST_PROJECT_ID_PREPROD', 'BLOCKFROST_PREPROD_PROJECT_ID']),
    secrets.BLOCKFROST_PROJECT_ID_PREPROD,
    secrets.PROJECT_ID_PREPROD
  ),
  preview: firstDefined(
    staticBlockfrostProjectId.preview,
    envValue(['BLOCKFROST_PROJECT_ID_PREVIEW', 'BLOCKFROST_PREVIEW_PROJECT_ID']),
    secrets.BLOCKFROST_PROJECT_ID_PREVIEW,
    secrets.PROJECT_ID_PREVIEW
  ),
};

export default {
  api: {
    // Primary public IPFS gateway (path-style). Used by linkToSrc; Collectible
    // rotates through `ipfsGateways` when this one fails to load.
    ipfs: 'https://ipfs.io/ipfs',
    // Ordered fallbacks — public gateways are flaky; try the next on <img> error.
    ipfsGateways: [
      'https://ipfs.io/ipfs',
      'https://dweb.link/ipfs',
      'https://w3s.link/ipfs',
      'https://cloudflare-ipfs.com/ipfs',
      'https://gateway.pinata.cloud/ipfs',
    ],
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
