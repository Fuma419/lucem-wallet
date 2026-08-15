/**
 * Typed Blockfrost / Koios credential and header helpers.
 * Request adapters live in `providers/blockfrost.ts`; this module owns
 * network keys and project-id resolution so a wrong network cannot silently
 * pick a dummy key.
 */

import provider from '../config/provider';
import { asNetworkKey, type NetworkKey } from './types';

export const BLOCKFROST_BASE: Record<NetworkKey, string> = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  testnet: 'https://cardano-preprod.blockfrost.io/api/v0',
  preview: 'https://cardano-preview.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
};

const PLACEHOLDER_KEYS = new Set([
  'dummy',
  'your-koios-api-key-here',
  'your-blockfrost-project-id',
  'DUMMY_MAINNET',
  'DUMMY_TESTNET',
  'DUMMY_PREVIEW',
  'DUMMY_PREPROD',
]);

export function getEnvVar(key: string): string | null {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || null;
  }
  return null;
}

export function isUsableKey(key: unknown): key is string {
  return typeof key === 'string' && Boolean(key.trim()) && !PLACEHOLDER_KEYS.has(key.trim());
}

export function normalizeNetworkKey(network: { name?: string; id?: string } | null | undefined): NetworkKey {
  return asNetworkKey(network?.name || network?.id || 'mainnet');
}

export function resolveKoiosApiKey(networkKey: NetworkKey): string | null {
  const envKey = getEnvVar(`KOIOS_API_KEY_${networkKey.toUpperCase()}`);
  return isUsableKey(envKey) ? envKey : null;
}

export function resolveBlockfrostProjectId(networkKey: NetworkKey): string | null {
  const envCandidates = [
    `BLOCKFROST_PROJECT_ID_${networkKey.toUpperCase()}`,
    `BLOCKFROST_${networkKey.toUpperCase()}_PROJECT_ID`,
  ];
  for (const key of envCandidates) {
    const envValue = getEnvVar(key);
    if (isUsableKey(envValue)) return envValue;
  }
  const providerId = provider?.api?.key?.(networkKey)?.blockfrost_project_id;
  return isUsableKey(providerId) ? providerId : null;
}

export function koiosHeaders(
  networkKey: NetworkKey,
  headers: Record<string, string> = {},
  isCbor = false
): Record<string, string> {
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': isCbor ? 'application/cbor' : 'application/json',
    'Cache-Control': 'no-cache',
    ...headers,
  };
  const apiKey = resolveKoiosApiKey(networkKey);
  if (apiKey) {
    requestHeaders.Authorization = `Bearer ${apiKey}`;
  }
  return requestHeaders;
}

export function blockfrostHeaders(
  networkKey: NetworkKey,
  headers: Record<string, string> = {},
  isCbor = false
): Record<string, string> {
  const projectId = resolveBlockfrostProjectId(networkKey);
  if (!projectId) {
    throw new Error(`Missing Blockfrost project_id for ${networkKey}`);
  }
  return {
    project_id: projectId,
    'Content-Type': isCbor ? 'application/cbor' : 'application/json',
    ...headers,
  };
}
