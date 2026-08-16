/**
 * Vault password helpers. Leaf module: no WASM — safe to import from setup UI.
 *
 * A Lucem spending password exists only when a software seed is stored.
 * Hardware-only setups (and the unused dummy root from
 * `initLocalWalletSecretIfAbsent`) do not require an existing password.
 */
import { HW, STORAGE } from '../../config/config';
import { getStorage } from './storage';

/**
 * @param {unknown} accountIndex
 * @returns {boolean}
 */
export const isHardwareAccountIndex = (accountIndex) =>
  accountIndex != null &&
  accountIndex != undefined &&
  accountIndex != 0 &&
  typeof accountIndex !== 'number' &&
  typeof accountIndex === 'string' &&
  (accountIndex.startsWith(HW.keystone) ||
    accountIndex.startsWith(HW.trezor) ||
    accountIndex.startsWith(HW.ledger));

/**
 * @param {Record<string, { index?: unknown, walletId?: unknown }>|null|undefined} accounts
 * @returns {boolean}
 */
export const hasSoftwareAccount = (accounts) => {
  if (!accounts || typeof accounts !== 'object') return false;
  return Object.keys(accounts).some((key) => {
    const account = accounts[key];
    const index = account && account.index != null ? account.index : key;
    return !isHardwareAccountIndex(index);
  });
};

/**
 * True when the user already chose a Lucem spending password for a software
 * seed. Hardware-only vaults do not count, even if a dummy `encryptedKey` is
 * present from an older Keystone import.
 *
 * @param {Record<string, { index?: unknown, walletId?: unknown }>|null|undefined} accounts
 * @param {unknown} encryptedKey
 * @param {Record<string, unknown>|null|undefined} encryptedKeys
 * @returns {boolean}
 */
export const vaultRequiresExistingPasswordFrom = (
  accounts,
  encryptedKey,
  encryptedKeys
) => {
  const map =
    encryptedKeys && typeof encryptedKeys === 'object' ? encryptedKeys : {};
  /** @type {string[]} */
  const softwareWalletIds = [];
  if (accounts && typeof accounts === 'object') {
    Object.keys(accounts).forEach((key) => {
      const account = accounts[key];
      if (!account) return;
      const index = account.index != null ? account.index : key;
      if (isHardwareAccountIndex(index)) return;
      softwareWalletIds.push(
        account.walletId != null ? String(account.walletId) : '0'
      );
    });
  }
  if (softwareWalletIds.length === 0) return false;
  return softwareWalletIds.some((id) => {
    if (Object.prototype.hasOwnProperty.call(map, id) && map[id]) return true;
    if (id === '0' && encryptedKey) return true;
    return false;
  });
};

/** @returns {Promise<boolean>} */
export const vaultRequiresExistingPassword = async () => {
  const [accounts, encryptedKey, encryptedKeys] = await Promise.all([
    getStorage(STORAGE.accounts),
    getStorage(STORAGE.encryptedKey),
    getStorage(STORAGE.encryptedKeys),
  ]);
  return vaultRequiresExistingPasswordFrom(
    accounts,
    encryptedKey,
    encryptedKeys
  );
};
