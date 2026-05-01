import platform from '../platform';
import { STORAGE } from '../config/config';

/**
 * Persist wallet UI appearance without importing `api/extension` (keeps MV3/create-wallet CSP lean).
 *
 * @returns {Promise<'light' | 'dark' | null>}
 */
export async function getStoredUiColorMode() {
  const v = await platform.storage.get(STORAGE.colorMode);
  return v === 'light' || v === 'dark' ? v : null;
}

/** @param {'light' | 'dark'} mode */
export function persistUiColorMode(mode) {
  return platform.storage.set({ [STORAGE.colorMode]: mode });
}
