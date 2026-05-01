import platform from '../platform';
import { STORAGE } from '../config/config';

/**
 * User-selected appearance (not necessarily the resolved Chakra mode when `system`).
 *
 * @returns {Promise<'light' | 'dark' | 'system' | null>}
 */
export async function getStoredAppearancePreference() {
  const v = await platform.storage.get(STORAGE.colorMode);
  return v === 'light' || v === 'dark' || v === 'system' ? v : null;
}

/** @param {'light' | 'dark' | 'system'} appearance */
export function persistAppearancePreference(appearance) {
  return platform.storage.set({ [STORAGE.colorMode]: appearance });
}
