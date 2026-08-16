import {
  ERROR,
  EVENT,
  HW,
  LOCAL_STORAGE,
  MAX_TOTAL_ACCOUNTS,
  NETWORK_ID,
  NETWORKD_ID_NUMBER,
  NODE,
  SENDER,
  STORAGE,
  TAB,
  TARGET,
} from '../../config/config';
import platform from '../../platform';
import { mnemonicToEntropy } from 'bip39';
import Loader from '../loader';
import { createAvatar } from '@dicebear/avatars';
import { shapes } from '@dicebear/collection';
// Lazy-load `./wallet` at call sites — a static import used to cycle
// (wallet → index). wallet.js now imports leaf modules; keep the lazy require
// so Jest `requireActual` mocks (e.g. MAX_EXTERNAL_ADDRESS_INDEX) stay stable.
import {
  koiosRequest,
  koiosRequestEnhanced,
  assetsToValue,
  linkToSrc,
  convertMetadataPropToString,
  extractMetadataImage,
  fromAssetUnit,
  toAssetUnit,
  Data,
} from '../util';
import TransportWebBLE from '@ledgerhq/hw-transport-web-ble';
import Ada from '@cardano-foundation/ledgerjs-hw-app-cardano';
import AssetFingerprint from '@emurgo/cip14-js';
import { milkomedaNetworks } from '@dcspark/milkomeda-constants';
import { KOIOS_REQUESTS, addressTxsIndicatesHistory } from '../koios-endpoints';
import { normalizeLovelaceScalar } from '../lovelace-scalar';
import { normalizeStakePool as normalizeStakePoolData } from '../staking';
import { invalidateAll as invalidateReadCache } from '../cache';
import {
  filterPaymentAddressesForAccountsDisplay,
  getExternalIndices,
  getInternalIndices,
  getUserExternalIndices,
  isMultiAddressEnabled,
  normalizeExternalIndices,
  normalizeInternalIndices,
  MAX_EXTERNAL_ADDRESS_INDEX,
  MAX_INTERNAL_ADDRESS_INDEX,
  ADDRESS_ROLE,
} from './multi-address';
import {
  getStorage,
  setStorage,
  getCurrentAccountIndex,
  getNetwork,
} from './storage';
import {
  isHardwareAccountIndex,
  vaultRequiresExistingPasswordFrom,
} from './vault';
import {
  encryptWithPassword,
  decryptWithPassword,
  harden,
  requestAccountKey,
} from './keys';
import {
  activateDiscoveredExternalAddresses,
  discoverUsedPaymentIndices,
  getAddress,
} from './addresses';
import {
  checkCollateral,
  getBalanceExtended,
  getTransactions,
} from './chain-reads';

export {
  getStorage,
  setStorage,
  removeStorage,
  getCurrentAccountIndex,
  getNetwork,
  setNetwork,
  getCurrentAccount,
  hasStoredAccounts,
  getAccounts,
} from './storage';

export {
  isHardwareAccountIndex,
  hasSoftwareAccount,
  vaultRequiresExistingPasswordFrom,
  vaultRequiresExistingPassword,
} from './vault';

export {
  encryptWithPassword,
  decryptWithPassword,
  requestAccountKey,
  changeWalletPassword,
} from './keys';

export {
  isValidEthAddress,
  extractKeyHash,
  extractKeyOrScriptHash,
  verifySigStructure,
  verifyPayload,
  verifyTx,
  signData,
  signDataCIP30,
  signTx,
  signTxHW,
  submitTx,
} from './signing';

export {
  getAddress,
  getEnabledPaymentAddresses,
  paymentKeyHashesForSigning,
  setAccountExternalIndices,
  setAccountExternalIndicesAt,
  setAccountInternalIndicesAt,
  discoverUsedPaymentIndices,
  discoverUsedExternalIndices,
  activateDiscoveredExternalAddresses,
  enableExternalAddressIndex,
  disableExternalAddressIndex,
  getRewardAddress,
  getPubDRepKey,
  getAccountDRepId,
  getRegisteredPubStakeKeys,
  getUnregisteredPubStakeKeys,
} from './addresses';

export {
  getDelegation,
  getPoolMetadata,
  searchPools,
  getStakePools,
  resolveStakeAddressFromPaymentAddress,
  getAccountStakeAddress,
  getBalance,
  getBalanceExtended,
  getFullBalance,
  getAccountsControlledStake,
  getEnabledPaymentAddressDetails,
  getTransactions,
  getFiatPrice,
  getTxInfo,
  getBlock,
  getTxUTxOs,
  getTxMetadata,
  updateTxInfo,
  setTxDetail,
  getSpecificUtxo,
  getUtxos,
  getCollateral,
} from './chain-reads';

export {
  filterPaymentAddressesForAccountsDisplay,
  getExternalIndices,
  getInternalIndices,
  getUserExternalIndices,
  isMultiAddressEnabled,
  normalizeExternalIndices,
  normalizeInternalIndices,
  MAX_EXTERNAL_ADDRESS_INDEX,
  MAX_INTERNAL_ADDRESS_INDEX,
  ADDRESS_ROLE,
};

export const normalizeStakePool = normalizeStakePoolData;





// dApp origin allowlist lives in its own module (the trust anchor for the
// background authZ gate + content-script proxy). Re-exported here to keep the
// api/extension public surface stable.
export {
  getWhitelisted,
  isWhitelisted,
  setWhitelisted,
  removeWhitelisted,
} from './dapp-whitelist';

export const getCurrency = () => getStorage(STORAGE.currency);

export const setCurrency = (currency) =>
  setStorage({ [STORAGE.currency]: currency });

export const getSwapTrays = async () => {
  const value = await getStorage(STORAGE.swapTrays);
  return Boolean(value);
};

export const setSwapTrays = (swapTrays) =>
  setStorage({ [STORAGE.swapTrays]: Boolean(swapTrays) });

/** Neon glows default on; only an explicit `false` disables them. */
export const getGlowEffects = async () => {
  const value = await getStorage(STORAGE.glowEffects);
  return value !== false;
};

export const setGlowEffects = (glowEffects) =>
  setStorage({ [STORAGE.glowEffects]: Boolean(glowEffects) });

/** Reflect glow preference on <html data-glow> for CSS. */
export const syncGlowEffectsDom = (glowEffects) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute(
    'data-glow',
    glowEffects === false ? 'off' : 'on'
  );
};




export const setAccountName = async (name) => {
  const currentAccountIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  accounts[currentAccountIndex].name = name;
  return await setStorage({ [STORAGE.accounts]: accounts });
};

export const setAccountAvatar = async (avatar) => {
  const currentAccountIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  accounts[currentAccountIndex].avatar = avatar;
  return await setStorage({ [STORAGE.accounts]: accounts });
};

export const createPopup = (popup) => platform.navigation.createPopup(popup);

export const createTab = (tab, query = '') =>
  platform.navigation.createTab(tab, query);

export const closeCurrentTab = () => platform.navigation.closeCurrentTab();

const KEYSTONE_SIGN_PAYLOAD_TTL_MS = 2 * 60 * 60 * 1000;

function pruneKeystoneSignPayloads(prev) {
  const now = Date.now();
  const next = {};
  for (const [id, row] of Object.entries(prev || {})) {
    if (row && now - (row.created || 0) < KEYSTONE_SIGN_PAYLOAD_TTL_MS) {
      next[id] = row;
    }
  }
  return next;
}

export const pushKeystoneSignPayload = async (payload) => {
  const signId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prev = pruneKeystoneSignPayloads(
    (await getStorage(STORAGE.keystoneTxPending)) || {}
  );
  await setStorage({
    [STORAGE.keystoneTxPending]: {
      ...prev,
      [signId]: { ...payload, created: Date.now() },
    },
  });
  return signId;
};

/** Read the pending sign session. Does not delete — the QR tab can remount. */
export const takeKeystoneSignPayload = async (signId) => {
  const prev = (await getStorage(STORAGE.keystoneTxPending)) || {};
  return prev[signId] || null;
};

export const clearKeystoneSignPayload = async (signId) => {
  const prev = (await getStorage(STORAGE.keystoneTxPending)) || {};
  if (!prev[signId]) return;
  const next = { ...prev };
  delete next[signId];
  await setStorage({ [STORAGE.keystoneTxPending]: next });
};

/** Air-gapped Keystone: opens full tab with QR flow. Payload stays until submit. */
export const openKeystoneSignTxTab = async ({ txHex, keyHashes, partialSign }) => {
  const signId = await pushKeystoneSignPayload({
    txHex,
    keyHashes,
    partialSign: !!partialSign,
  });
  await createTab(
    TAB.keystoneTx,
    `?signId=${encodeURIComponent(signId)}`
  );
};

export const getCurrentWebpage = () =>
  platform.navigation.getCurrentWebpage();


export const bytesAddressToBinary = (bytes) =>
  bytes.reduce((str, byte) => str + byte.toString(2).padStart(8, '0'), '');

export const isValidAddress = async (address) => {
  await Loader.load();
  const network = await getNetwork();
  console.log('isValidAddress called with:', address);
  console.log('network.id:', network.id);
  
  try {
    // Try to parse as bech32 address first
    const addr = Loader.Cardano.Address.from_bech32(address);
    console.log('Address parsed successfully, network_id:', addr.network_id());
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 &&
        (network.id === NETWORK_ID.testnet ||
          network.id === NETWORK_ID.preview ||
          network.id === NETWORK_ID.preprod))
    ) {
      return Buffer.from(addr.to_bytes());
    }
      } catch (/** @type {any} */ e) {
      console.log('Bech32 parsing failed:', e);
      // If bech32 fails, try raw bytes
      try {
        const addr = Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'));
        console.log('Hex parsing successful, network_id:', addr.network_id());
      if (
        (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
        (addr.network_id() === 0 &&
          (network.id === NETWORK_ID.testnet ||
            network.id === NETWORK_ID.preview ||
            network.id === NETWORK_ID.preprod))
      ) {
        return Buffer.from(addr.to_bytes());
      }
          } catch (/** @type {any} */ e2) {
        console.log('Hex parsing failed:', e2);
        // Both parsing methods failed
        return false;
      }
    }
  console.log('Address validation failed - returning false');
  return false;
};


const emitAccountChange = async (addresses) => {
  if (typeof window !== 'undefined') {
    window.postMessage({
      data: addresses,
      target: TARGET,
      sender: SENDER.extension,
      event: EVENT.accountChange,
    });
  }
  platform.events.broadcastToTabs({
    data: addresses,
    target: TARGET,
    sender: SENDER.extension,
    event: EVENT.accountChange,
  });
};

export const onAccountChange = (callback) => {
  function responseHandler(e) {
    const response = e.data;
    if (
      typeof response !== 'object' ||
      response === null ||
      !response.target ||
      response.target !== TARGET ||
      !response.event ||
      response.event !== EVENT.accountChange ||
      !response.sender ||
      response.sender !== SENDER.extension
    )
      return;
    callback(response.data);
  }
  window.addEventListener('message', responseHandler);
  return {
    remove: () => {
      window.removeEventListener('message', responseHandler);
    },
  };
};

export const switchAccount = async (accountIndex) => {
  await setStorage({ [STORAGE.currentAccount]: accountIndex });
  const address = await getAddress();
  emitAccountChange([address]);
  return true;
};

/** Remove easy-peasy, asset cache, and session data so wiped state is consistent. */
const clearBrowserWalletCaches = () => {
  // Drop the in-memory read cache first so a fresh wallet can't observe the
  // previous wallet's cached balances/history.
  invalidateReadCache();
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage) {
      window.localStorage.removeItem(LOCAL_STORAGE.assets);
      Object.keys(window.localStorage).forEach((k) => {
        if (k.startsWith('[EasyPeasyStore]')) {
          window.localStorage.removeItem(k);
        }
      });
    }
  } catch (/** @type {any} */ _) {
    /* ignore quota / private mode */
  }
  try {
    if (window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch (/** @type {any} */ _) {
    /* ignore */
  }
};

/** PWA / web build uses IndexedDB `lucem-wallet`; extension may have none (harmless delete). */
/** @returns {Promise<void>} */
const clearIndexedDbWalletDb = () =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    try {
      const req = indexedDB.deleteDatabase('lucem-wallet');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch (/** @type {any} */ _) {
      resolve();
    }
  });

async function wipeAllLocalWalletData() {
  await platform.storage.clear();
  try {
    localStorage.removeItem('chakra-ui-color-mode');
  } catch (/** @type {any} */ _) {
    /* ignore */
  }
  clearBrowserWalletCaches();
  await clearIndexedDbWalletDb();
}

/**
 * Password-verified wipe (same end state as erase). Kept for API / tests; prefer
 * `eraseLocalWalletData` from settings when the user may have lost the password.
 */
export const resetStorage = async (password) => {
  await requestAccountKey(password, 0);
  await wipeAllLocalWalletData();
  return true;
};

/**
 * Clears all Lucem data on this device (extension storage or web IDB + browser caches).
 * Call only from UI that requires explicit confirmation (typed phrase + checkbox).
 */
export const eraseLocalWalletData = async () => {
  await wipeAllLocalWalletData();
  return true;
};

/**
 * Optional placeholder root so settings can store a password before any
 * software seed exists. Hardware import no longer calls this — the first
 * mnemonic create/import sets the Lucem password. Kept for tests / older data.
 * The key is generated in-browser and is not a Keystone/Ledger seed.
 */
export const initLocalWalletSecretIfAbsent = async (password) => {
  await Loader.load();
  const encryptedKey = await getStorage(STORAGE.encryptedKey);
  if (encryptedKey) return false;
  const rootKey = Loader.Cardano.Bip32PrivateKey.generate_ed25519_bip32();
  try {
    const encryptedRootKey = await encryptWithPassword(
      password,
      rootKey.as_bytes()
    );
    const [network, currency] = await Promise.all([
      getStorage(STORAGE.network),
      getStorage(STORAGE.currency),
    ]);
    const patch = { [STORAGE.encryptedKey]: encryptedRootKey };
    if (!network) {
      patch[STORAGE.network] = {
        id: NETWORK_ID.mainnet,
        node: NODE.mainnet,
      };
    }
    if (!currency) {
      patch[STORAGE.currency] = 'usd';
    }
    await setStorage(patch);
  } finally {
    rootKey.free();
  }
  return true;
};

/**
 * Find a stored account that matches a BIP32 account public key (hex).
 * Used to detect duplicate seed / HW imports before writing storage.
 */
export const findAccountByPublicKey = (accounts, publicKeyHex) => {
  if (!accounts || typeof accounts !== 'object' || !publicKeyHex) return null;
  const needle = String(publicKeyHex).toLowerCase();
  for (const account of Object.values(accounts)) {
    if (
      account &&
      typeof account.publicKey === 'string' &&
      account.publicKey.toLowerCase() === needle
    ) {
      return account;
    }
  }
  return null;
};

/**
 * Derive the CIP-1852 account-level BIP32 public key hex for a mnemonic index
 * without persisting anything. Caller must not log the mnemonic.
 */
export const deriveAccountPublicKeyFromMnemonic = async (
  seedPhrase,
  accountIndex = 0
) => {
  await Loader.load();
  /** @type {any} */
  let entropy = mnemonicToEntropy(seedPhrase);
  /** @type {any} */
  let rootKey = Loader.Cardano.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  );
  entropy = null;
  let accountKey;
  try {
    accountKey = rootKey
      .derive(harden(1852))
      .derive(harden(1815))
      .derive(harden(Number(accountIndex)));
    return accountKey.to_public().to_hex();
  } finally {
    if (accountKey) {
      try {
        accountKey.free();
      } catch (/** @type {any} */ _) {
        /* ignore */
      }
    }
    try {
      rootKey.free();
    } catch (/** @type {any} */ _) {
      /* ignore */
    }
    rootKey = null;
  }
};

/**
 * Returns the first existing account that matches any of the mnemonic's
 * CIP-1852 account public keys in `accountIndices`.
 */
export const findExistingAccountForMnemonic = async (
  seedPhrase,
  accountIndices = [0]
) => {
  const accounts = await getStorage(STORAGE.accounts);
  if (!accounts || typeof accounts !== 'object') return null;
  for (const index of accountIndices) {
    const publicKey = await deriveAccountPublicKeyFromMnemonic(
      seedPhrase,
      index
    );
    const match = findAccountByPublicKey(accounts, publicKey);
    if (match) return match;
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Sterilized backup: export / import / seed validation                       */
/* -------------------------------------------------------------------------- */

export const BACKUP_FORMAT = 'lucem-wallet-backup';
export const BACKUP_VERSION = 1;

/**
 * Storage keys included in a backup. Deliberately excludes every secret:
 * `encryptedKey` / `encryptedKeys` (password-protected seeds) and transient
 * signing state are never exported.
 */
const BACKUP_STORAGE_KEYS = [
  STORAGE.accounts,
  STORAGE.currentAccount,
  STORAGE.network,
  STORAGE.currency,
  STORAGE.swapTrays,
  STORAGE.glowEffects,
  STORAGE.colorMode,
  STORAGE.migration,
  STORAGE.whitelisted,
  STORAGE.acceptedLegalDocsVersion,
  STORAGE.userId,
];

/** Fields that must never appear on an exported account object. */
const ACCOUNT_SECRET_FIELDS = [
  'encryptedKey',
  'encryptedKeys',
  'privateKey',
  'rootKey',
  'mnemonic',
  'seedPhrase',
  'entropy',
];

const sanitizeAccountForExport = (account) => {
  if (!account || typeof account !== 'object') return account;
  const clone = { ...account };
  for (const field of ACCOUNT_SECRET_FIELDS) delete clone[field];
  return clone;
};

/**
 * Build a completely sterilized backup of the wallet: all account metadata
 * (names, avatars, BIP32 *public* keys, addresses, cached balances) and app
 * settings, but **no key material**. Nothing in the result can sign a tx.
 */
export const exportAppData = async () => {
  const store = (await getStorage()) || {};
  const data = {};
  for (const key of BACKUP_STORAGE_KEYS) {
    if (store[key] !== undefined) data[key] = store[key];
  }
  if (data[STORAGE.accounts] && typeof data[STORAGE.accounts] === 'object') {
    const sanitized = {};
    for (const [slot, account] of Object.entries(data[STORAGE.accounts])) {
      sanitized[slot] = sanitizeAccountForExport(account);
    }
    data[STORAGE.accounts] = sanitized;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
};

/**
 * Restore a sterilized backup. Writes account metadata + settings but never any
 * key material, so restored software accounts start unvalidated (cannot sign
 * until the user re-imports their seed phrase). Existing keyed accounts are
 * preserved on slot collisions.
 */
export const importAppData = async (backup) => {
  if (!backup || typeof backup !== 'object' || backup.format !== BACKUP_FORMAT) {
    throw new Error('This file is not a Lucem wallet backup.');
  }
  const data = backup.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Backup file is empty or corrupted.');
  }

  const patch = {};
  for (const key of BACKUP_STORAGE_KEYS) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  // Belt-and-suspenders: never import key material even from a tampered file.
  delete patch[STORAGE.encryptedKey];
  delete patch[STORAGE.encryptedKeys];

  // Strip any secret-shaped fields that a hand-edited file might carry.
  if (patch[STORAGE.accounts] && typeof patch[STORAGE.accounts] === 'object') {
    const sanitized = {};
    for (const [slot, account] of Object.entries(patch[STORAGE.accounts])) {
      sanitized[slot] = sanitizeAccountForExport(account);
    }
    patch[STORAGE.accounts] = sanitized;
  }

  // Merge with any accounts already present; keep existing (possibly keyed)
  // entries when slots collide.
  const existingAccounts = (await getStorage(STORAGE.accounts)) || {};
  const importedAccounts = patch[STORAGE.accounts] || {};
  const mergedAccounts = { ...importedAccounts, ...existingAccounts };
  patch[STORAGE.accounts] = mergedAccounts;

  const keys = Object.keys(mergedAccounts);
  const currentValid =
    patch[STORAGE.currentAccount] != null &&
    mergedAccounts[patch[STORAGE.currentAccount]] != null;
  if (!currentValid && keys.length > 0) {
    const first = keys[0];
    patch[STORAGE.currentAccount] =
      isHW(first) || Number.isNaN(Number(first)) ? first : /** @type {any} */ (parseInt(first, 10));
  }

  await setStorage(patch);
  invalidateReadCache();
  return { accounts: keys.length };
};

/** Wallet ids that currently have a stored (signable) seed. */
export const getSignableWalletIds = async () => {
  const legacy = await getStorage(STORAGE.encryptedKey);
  const map = (await getStorage(STORAGE.encryptedKeys)) || {};
  const ids = new Set(Object.keys(map));
  if (legacy) ids.add('0');
  return Array.from(ids);
};

/**
 * True when `account` can sign: hardware accounts always can (device-side), and
 * software accounts can once their seed's `walletId` has a stored key.
 */
export const isAccountSignable = (account, signableWalletIds) => {
  if (!account) return false;
  if (isHW(account.index)) return true;
  const walletId = account.walletId != null ? String(account.walletId) : '0';
  return (signableWalletIds || []).includes(walletId);
};

/**
 * Attach a mnemonic to a restored (sterilized) account: verify the seed derives
 * the account's stored public key, then store the encrypted root under the
 * account's `walletId`. Validates every software account sharing that seed.
 */
export const validateAccountWithSeed = async (
  accountKey,
  seedPhrase,
  password
) => {
  await Loader.load();
  const accounts = await getStorage(STORAGE.accounts);
  const account = accounts?.[accountKey];
  if (!account) throw new Error('Account not found.');
  if (isHW(account.index)) {
    throw new Error('Hardware accounts sign on the device and need no seed.');
  }
  if (!password || String(password).length < 8) {
    throw new Error('Password must be at least 8 characters long.');
  }

  const walletId = account.walletId != null ? String(account.walletId) : '0';
  const derivationIndex =
    account.derivationIndex != null
      ? parseInt(account.derivationIndex, 10)
      : parseInt(account.index, 10) || 0;

  let derivedPublicKey;
  try {
    derivedPublicKey = await deriveAccountPublicKeyFromMnemonic(
      seedPhrase,
      derivationIndex
    );
  } catch (/** @type {any} */ e) {
    throw new Error('Invalid recovery phrase.');
  }
  if (account.publicKey && derivedPublicKey !== account.publicKey) {
    throw new Error('This recovery phrase does not match the selected account.');
  }

  // Match an existing software-vault password only. A dummy Keystone
  // placeholder must not block attaching the first real seed.
  const existingLegacy = await getStorage(STORAGE.encryptedKey);
  const map = (await getStorage(STORAGE.encryptedKeys)) || {};
  if (vaultRequiresExistingPasswordFrom(accounts, existingLegacy, map)) {
    const mapKeys = Object.keys(map);
    const probe = existingLegacy || (mapKeys.length ? map[mapKeys[0]] : null);
    try {
      await decryptWithPassword(password, probe);
    } catch (/** @type {any} */ e) {
      throw new Error(
        `${ERROR.wrongPassword}: enter your existing Lucem password.`
      );
    }
  }

  /** @type {any} */
  let entropy = mnemonicToEntropy(seedPhrase);
  /** @type {any} */
  let rootKey = Loader.Cardano.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  );
  entropy = null;
  const encryptedRootKey = await encryptWithPassword(password, rootKey.as_bytes());
  rootKey.free();
  rootKey = null;

  const nextMap = { ...map };
  if (existingLegacy && !nextMap['0']) nextMap['0'] = existingLegacy;
  nextMap[walletId] = encryptedRootKey;
  await setStorage({ [STORAGE.encryptedKeys]: nextMap });
  if (walletId === '0' && !existingLegacy) {
    await setStorage({ [STORAGE.encryptedKey]: encryptedRootKey });
  }

  const validated = Object.values(accounts).filter(
    (a) =>
      a &&
      !isHW(a.index) &&
      (a.walletId != null ? String(a.walletId) : '0') === walletId
  ).length;

  return { walletId, validated };
};

/** Total accounts (native + hardware) currently stored. */
const totalAccountCount = (accounts) =>
  accounts && typeof accounts === 'object' ? Object.keys(accounts).length : 0;

/** Smallest unused non-negative integer native storage slot. */
const nextNativeSlot = (accounts) => {
  const used = new Set(
    Object.keys(getNativeAccounts(accounts)).map((k) => parseInt(k, 10))
  );
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
};

/** Next seed id for the `encryptedKeys` map (legacy seed is always "0"). */
const nextWalletId = async () => {
  const map = (await getStorage(STORAGE.encryptedKeys)) || {};
  const ids = Object.keys(map)
    .map((k) => parseInt(k, 10))
    .filter((n) => Number.isFinite(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return String(max + 1);
};

/**
 * @param {string} name
 * @param {string} password
 * @param {number|null} accountIndex - legacy: CIP-1852 derivation index used as
 *   the storage slot too. When `options.walletId` is set this is ignored in
 *   favor of `options.derivationIndex`.
 * @param {object} [options]
 * @param {string} [options.walletId] - seed id (multi-seed). Defaults to "0".
 * @param {number} [options.derivationIndex] - CIP-1852 account index in the seed.
 * @param {number|string} [options.slot] - storage slot (decoupled from derivation).
 */
export const createAccount = async (
  name,
  password,
  accountIndex = null,
  options = {}
) => {
  await Loader.load();

  const existingAccounts = await getStorage(STORAGE.accounts);
  const walletId = options.walletId != null ? String(options.walletId) : '0';
  const isLegacySeed = walletId === '0';

  // CIP-1852 account index inside the seed.
  const derivationIndex =
    options.derivationIndex != null
      ? Number(options.derivationIndex)
      : accountIndex != null
        ? Number(accountIndex)
        : existingAccounts
          ? Object.keys(getNativeAccounts(existingAccounts)).length
          : 0;

  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    derivationIndex,
    walletId
  );

  const publicKey = accountKey.to_public().to_hex(); // BIP32 Public key
  const paymentKeyPub = paymentKey.to_public();
  const stakeKeyPub = stakeKey.to_public();

  accountKey.free();
  paymentKey.free();
  stakeKey.free();
  accountKey = null;
  paymentKey = null;
  stakeKey = null;

  // Same derivation path / public key already stored → tell the user instead of
  // silently overwriting (which looks like "Import did nothing").
  const duplicateByKey = findAccountByPublicKey(existingAccounts, publicKey);
  if (duplicateByKey) {
    const label = duplicateByKey.name ? `"${duplicateByKey.name}"` : 'this account';
    throw new Error(
      `${ERROR.accountAlreadyExists} ${label} is already in your wallet.`
    );
  }
  // Storage slot: decoupled from the CIP-1852 derivation index so multiple seeds
  // (each starting at index 0) can coexist. Legacy single-seed accounts keep the
  // derivation index as their slot for backwards compatibility.
  let slot;
  if (options.slot != null) {
    slot = Number(options.slot);
  } else if (
    isLegacySeed &&
    (!existingAccounts || existingAccounts[derivationIndex] == null)
  ) {
    slot = derivationIndex;
  } else {
    slot = nextNativeSlot(existingAccounts);
  }
  const index = slot;

  if (existingAccounts && existingAccounts[slot]) {
    throw new Error(
      `${ERROR.accountAlreadyExists} Account index ${slot} is already in use.`
    );
  }

  if (totalAccountCount(existingAccounts) >= MAX_TOTAL_ACCOUNTS) {
    throw new Error(ERROR.maxAccountsReached);
  }

  const paymentKeyHash = Buffer.from(paymentKeyPub.hash().to_bytes()).toString(
    'hex'
  );

  const paymentKeyHashBech32 = paymentKeyPub.hash().to_bech32('addr_vkh');

  const stakeKeyHash = Buffer.from(stakeKeyPub.hash().to_bytes()).toString(
    'hex'
  );

  const paymentAddrMainnet = Loader.Cardano.BaseAddress.new(
    Loader.Cardano.NetworkInfo.mainnet().network_id(),
    Loader.Cardano.Credential.from_keyhash(paymentKeyPub.hash()),
    Loader.Cardano.Credential.from_keyhash(stakeKeyPub.hash())
  )
    .to_address()
    .to_bech32();

  const rewardAddrMainnet = Loader.Cardano.RewardAddress.new(
    Loader.Cardano.NetworkInfo.mainnet().network_id(),
    Loader.Cardano.Credential.from_keyhash(stakeKeyPub.hash())
  )
    .to_address()
    .to_bech32();

  const paymentAddrTestnet = Loader.Cardano.BaseAddress.new(
    Loader.Cardano.NetworkInfo.testnet_preview().network_id(),
    Loader.Cardano.Credential.from_keyhash(paymentKeyPub.hash()),
    Loader.Cardano.Credential.from_keyhash(stakeKeyPub.hash())
  )
    .to_address()
    .to_bech32();

  const rewardAddrTestnet = Loader.Cardano.RewardAddress.new(
    Loader.Cardano.NetworkInfo.testnet_preview().network_id(),
    Loader.Cardano.Credential.from_keyhash(stakeKeyPub.hash())
  )
    .to_address()
    .to_bech32();

  const networkDefault = {
    lovelace: null,
    minAda: 0,
    assets: [],
    history: { confirmed: [], details: {} },
  };

  const newAccount = {
    [index]: {
      index,
      // Seed this account is derived from + its CIP-1852 account index. `index`
      // above is only the storage slot; signing uses these two fields.
      walletId,
      derivationIndex,
      publicKey,
      paymentKeyHash,
      paymentKeyHashBech32,
      stakeKeyHash,
      name,
      // CIP-1852 external indices included in balance/UTXO/signing (0 = primary).
      externalIndices: [0],
      // CIP-1852 internal/change indices (populated by stake-key discovery).
      internalIndices: [],
      [NETWORK_ID.mainnet]: {
        ...networkDefault,
        paymentAddr: paymentAddrMainnet,
        rewardAddr: rewardAddrMainnet,
      },
      [NETWORK_ID.testnet]: {
        ...networkDefault,
        paymentAddr: paymentAddrTestnet,
        rewardAddr: rewardAddrTestnet,
      },
      [NETWORK_ID.preview]: {
        ...networkDefault,
        paymentAddr: paymentAddrTestnet,
        rewardAddr: rewardAddrTestnet,
      },
      [NETWORK_ID.preprod]: {
        ...networkDefault,
        paymentAddr: paymentAddrTestnet,
        rewardAddr: rewardAddrTestnet,
      },
      avatar: Math.random().toString(),
    },
  };

  await setStorage({
    [STORAGE.accounts]: { ...existingAccounts, ...newAccount },
  });

  // Import/create: activate every used external address under this stake key.
  try {
    await activateDiscoveredExternalAddresses(index);
  } catch (/** @type {any} */ error) {
    console.warn(
      'Post-create address discovery skipped:',
      error.message || error
    );
  }

  return index;
};

export const createHWAccounts = async (accounts) => {
  await Loader.load();
  let existingAccounts = await getStorage(STORAGE.accounts);
  if (!existingAccounts || typeof existingAccounts !== 'object') {
    existingAccounts = {};
  }

  const added = [];
  const skipped = [];

  for (const account of accounts) {
    const publicKey = Loader.Cardano.Bip32PublicKey.from_hex(
      account.publicKey
    );
    const publicKeyHex = publicKey.to_hex();
    const index = account.accountIndex;
    const name = account.name;

    const duplicateByKey = findAccountByPublicKey(existingAccounts, publicKeyHex);
    if (duplicateByKey || existingAccounts[index]) {
      skipped.push({
        index,
        name: name || (duplicateByKey && duplicateByKey.name) || String(index),
      });
      continue;
    }

    if (totalAccountCount(existingAccounts) >= MAX_TOTAL_ACCOUNTS) {
      throw new Error(ERROR.maxAccountsReached);
    }

    const paymentKeyHashRaw = publicKey.derive(0).derive(0).to_raw_key().hash();
    const stakeKeyHashRaw = publicKey.derive(2).derive(0).to_raw_key().hash();

    const paymentKeyHash = Buffer.from(paymentKeyHashRaw.to_bytes()).toString(
      'hex'
    );

    const paymentKeyHashBech32 = paymentKeyHashRaw.to_bech32('addr_vkh');

    const stakeKeyHash = Buffer.from(stakeKeyHashRaw.to_bytes()).toString(
      'hex'
    );

    const paymentAddrMainnet = Loader.Cardano.BaseAddress.new(
      Loader.Cardano.NetworkInfo.mainnet().network_id(),
      Loader.Cardano.Credential.from_keyhash(paymentKeyHashRaw),
      Loader.Cardano.Credential.from_keyhash(stakeKeyHashRaw)
    )
      .to_address()
      .to_bech32();

    const rewardAddrMainnet = Loader.Cardano.RewardAddress.new(
      Loader.Cardano.NetworkInfo.mainnet().network_id(),
      Loader.Cardano.Credential.from_keyhash(stakeKeyHashRaw)
    )
      .to_address()
      .to_bech32();

    const paymentAddrTestnet = Loader.Cardano.BaseAddress.new(
      Loader.Cardano.NetworkInfo.testnet_preview().network_id(),
      Loader.Cardano.Credential.from_keyhash(paymentKeyHashRaw),
      Loader.Cardano.Credential.from_keyhash(stakeKeyHashRaw)
    )
      .to_address()
      .to_bech32();

    const rewardAddrTestnet = Loader.Cardano.RewardAddress.new(
      Loader.Cardano.NetworkInfo.testnet_preview().network_id(),
      Loader.Cardano.Credential.from_keyhash(stakeKeyHashRaw)
    )
      .to_address()
      .to_bech32();

    const networkDefault = {
      lovelace: null,
      minAda: 0,
      assets: [],
      history: { confirmed: [], details: {} },
    };

    existingAccounts[index] = {
      index,
      publicKey: publicKeyHex,
      paymentKeyHash,
      paymentKeyHashBech32,
      stakeKeyHash,
      name,
      externalIndices: [0],
      internalIndices: [],
      [NETWORK_ID.mainnet]: {
        ...networkDefault,
        paymentAddr: paymentAddrMainnet,
        rewardAddr: rewardAddrMainnet,
      },
      [NETWORK_ID.testnet]: {
        ...networkDefault,
        paymentAddr: paymentAddrTestnet,
        rewardAddr: rewardAddrTestnet,
      },
      [NETWORK_ID.preview]: {
        ...networkDefault,
        paymentAddr: paymentAddrTestnet,
        rewardAddr: rewardAddrTestnet,
      },
      [NETWORK_ID.preprod]: {
        ...networkDefault,
        paymentAddr: paymentAddrTestnet,
        rewardAddr: rewardAddrTestnet,
      },
      // Hardware accounts wear their device's brand logo (set at import).
      avatar: hwAvatarSeed(index),
    };
    added.push({ index, name });
  }

  if (added.length === 0) {
    if (skipped.length > 0) {
      const names = skipped
        .map((s) => s.name)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      throw new Error(
        names
          ? `${ERROR.accountAlreadyExists} Already in Lucem: ${names}.`
          : ERROR.accountAlreadyExists
      );
    }
    throw new Error('No accounts selected');
  }

  // Always select the first newly imported account (not the previously active
  // one). switchAccount also emits accountChange for open shells.
  const firstNewIndex = added[0].index;
  await setStorage({ [STORAGE.accounts]: existingAccounts });

  for (const { index: hwIndex } of added) {
    try {
      await activateDiscoveredExternalAddresses(hwIndex);
    } catch (/** @type {any} */ error) {
      console.warn(
        `HW address discovery skipped (${hwIndex}):`,
        error.message || error
      );
    }
  }

  await switchAccount(firstNewIndex);
  return { added, skipped };
};

export const deleteAccount = async () => {
  const storage = await getStorage();
  const accounts = storage[STORAGE.accounts];
  const currentIndex = storage[STORAGE.currentAccount];
  if (Object.keys(accounts).length <= 1) throw new Error(ERROR.onlyOneAccount);
  delete accounts[currentIndex];
  return await setStorage({ [STORAGE.accounts]: accounts });
};

export const getNativeAccounts = (accounts) => {
  if (!accounts || typeof accounts !== 'object') return {};
  const nativeAccounts = {};
  Object.keys(accounts)
    .filter((accountIndex) => !isHW(accountIndex))
    .forEach(
      (accountIndex) => (nativeAccounts[accountIndex] = accounts[accountIndex])
    );
  return nativeAccounts;
};

export const indexToHw = (accountIndex) => {
  if (accountIndex == null || typeof accountIndex !== 'string') {
    return { device: '', id: '', account: NaN };
  }
  const parts = accountIndex.split('-');
  const device = parts[0];
  const id = parts[1];
  if (
    device === HW.keystone &&
    parts.length >= 4 &&
    parts[3].startsWith('v')
  ) {
    return {
      device,
      id,
      account: parseInt(parts[2], 10),
      keystoneDerivation: parts[3].slice(1),
    };
  }
  if (device === HW.ledger) {
    const account = parseInt(parts[parts.length - 1], 10);
    if (parts.length === 3 && /^\d{1,6}$/.test(parts[1])) {
      return { device, id: parts[1], account };
    }
    const idHex = parts.slice(1, -1).join('');
    if (
      /^[0-9a-fA-F]+$/i.test(idHex) &&
      idHex.length % 2 === 0 &&
      idHex.length > 0
    ) {
      try {
        return {
          device,
          id: Buffer.from(idHex, 'hex').toString('utf8'),
          account,
        };
      } catch (/** @type {any} */ e) {
        /* fall through */
      }
    }
    return {
      device,
      id: parts.slice(1, -1).join('-'),
      account,
    };
  }
  return {
    device,
    id,
    account: parseInt(parts[2], 10),
  };
};

/** Devices whose brand logo doubles as the account icon (see AvatarLoader). */
const HW_LOGO_DEVICES = [HW.keystone, HW.ledger, HW.trezor];

/**
 * Account-icon seed for a hardware account, chosen at import time. Hardware
 * wallets show their brand logo (Keystone / Ledger / Trezor): the stored avatar
 * is simply the device id, which `AvatarLoader` maps to the imported logo asset.
 * Anything without a known logo falls back to a random dicebear seed, matching
 * software accounts.
 */
export const hwAvatarSeed = (accountIndex) => {
  const { device } = indexToHw(accountIndex);
  return HW_LOGO_DEVICES.includes(device) ? device : Math.random().toString();
};

/** Row key for Keystone import UI / duplicate detection (`${account}-standard|ledger`). */
export const keystoneImportRowKey = (accountIndex) => {
  const h = indexToHw(accountIndex);
  if (h.device !== HW.keystone || Number.isNaN(h.account)) return null;
  return `${h.account}-${h.keystoneDerivation || 'standard'}`;
};

export const getHwAccounts = (accounts, { device, id }) => {
  if (!accounts || typeof accounts !== 'object') return {};
  const hwAccounts = {};
  Object.keys(accounts)
    .filter(
      (accountIndex) =>
        isHW(accountIndex) &&
        indexToHw(accountIndex).device == device &&
        indexToHw(accountIndex).id == id
    )
    .forEach(
      (accountIndex) => (hwAccounts[accountIndex] = accounts[accountIndex])
    );
  return hwAccounts;
};

export const isHW = (accountIndex) => isHardwareAccountIndex(accountIndex);

const isIosBrowserWithoutWebBluetooth = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
};

export const initHW = async ({ device, id, bleDevice }) => {
  if (device == HW.ledger) {
    const bluetooth =
      typeof navigator !== 'undefined' ? navigator.bluetooth : undefined;
    if (!bluetooth) {
      throw new Error(
        isIosBrowserWithoutWebBluetooth()
          ? 'Ledger Bluetooth is not supported on iPhone or iPad — iOS browsers do not expose Web Bluetooth. Use Lucem on a desktop or laptop with Chrome or Edge and a Bluetooth Ledger, or use Keystone with QR on this device.'
          : 'Web Bluetooth is not available. Use Chrome or Edge over HTTPS (or localhost), enable Bluetooth, and use a Bluetooth-capable Ledger (e.g. Nano X, Flex, Stax). Extension pages may not support Web Bluetooth — try the Lucem web app if connection fails.'
      );
    }
    let transport;
    if (bleDevice && bleDevice.gatt) {
      transport = await TransportWebBLE.open(bleDevice);
    } else if (id != null && String(id) !== '') {
      transport = await TransportWebBLE.open(String(id));
    } else {
      throw new Error('Missing Ledger Bluetooth device');
    }
    const appAda = new Ada(transport);
    await appAda.getVersion(); // check if Ledger has Cardano app opened
    return appAda;
  } else if (device == HW.trezor) {
    try {
      await TrezorConnect.init({
        manifest: {
          email: 'hodlerstaking@gmail.com',
          appUrl: 'https://www.hodlerstaking.com/',
        },
      });
    } catch (/** @type {any} */ e) {}
  } else if (device == HW.keystone) {
    throw new Error('Keystone hardware wallet uses QR-based signing, not USB initialization');
  }
};

/**
 *
 * @param {string} assetName utf8 encoded
 */
export const getAdaHandle = async (assetName) => {
  try {
    const network = await getNetwork();
    if (!network) return null;
    let handleUrl;
    switch (network.id){
      case 'mainnet':
        handleUrl = 'https://api.handle.me'
        break;
      case 'preprod':
        handleUrl = 'https://preprod.api.handle.me'
        break;
      case 'preview':
        handleUrl = 'https://preview.api.handle.me'
        break;
      default:
        return null;
    }
    const response = await fetch(`${handleUrl}/handles/${assetName}`);
    const data = response && response.ok ? await response.json() : null;
    return data && data.resolved_addresses && data.resolved_addresses.ada
      ? data.resolved_addresses.ada
      : null;
  } catch (/** @type {any} */ e) {
    return null;
  }
};

/**
 *
 * @param {string} ethAddress
 */
export const getMilkomedaData = async (ethAddress) => {
  try {
    const network = await getNetwork();
    const isAddressAllowedController = new AbortController();
    const stargateController = new AbortController();
    setTimeout(() => isAddressAllowedController.abort(), 500);
    let result;
    if (network.id === NETWORK_ID.mainnet) {
      const { isAllowed } = await fetch(
        'https://' +
          milkomedaNetworks['c1-mainnet'].backendEndpoint +
          `/v1/isAddressAllowed?address=${ethAddress}`,
        { signal: isAddressAllowedController.signal }
      ).then((res) => res.json());
      setTimeout(() => stargateController.abort(), 500);
      const { ada, ttl_expiry, assets, current_address } = await fetch(
        'https://' +
          milkomedaNetworks['c1-mainnet'].backendEndpoint +
          '/v1/stargate',
        { signal: stargateController.signal }
      ).then((res) => res.json());
      const protocolMagic = milkomedaNetworks['c1-mainnet'].protocolMagic;
      result = {
        isAllowed,
        assets: [],
        ada,
        current_address,
        protocolMagic,
        ttl: ttl_expiry,
      };
    } else {
      const { isAllowed } = await fetch(
        'https://' +
          milkomedaNetworks['c1-devnet'].backendEndpoint +
          `/v1/isAddressAllowed?address=${ethAddress}`,
          { signal: isAddressAllowedController.signal }
        ).then((res) => res.json());
      setTimeout(() => stargateController.abort(), 500);
      const { ada, ttl_expiry, assets, current_address } = await fetch(
        'https://' +
          milkomedaNetworks['c1-devnet'].backendEndpoint +
          '/v1/stargate',
        { signal: stargateController.signal }
      ).then((res) => res.json());
      const protocolMagic = milkomedaNetworks['c1-devnet'].protocolMagic;
      result = {
        isAllowed,
        assets: [],
        ada,
        current_address,
        protocolMagic,
        ttl: ttl_expiry,
      };
    }
    return result;
  } catch (/** @type {any} */ error) {
    console.error('Error fetching Milkomeda data:', error);
    throw error;
  }
};


export const createWallet = async (name, seedPhrase, password, explicitAccounts = [0]) => {
  await Loader.load();

  const accountIndices =
    Array.isArray(explicitAccounts) && explicitAccounts.length > 0
      ? explicitAccounts
      : [0];

  // Detect re-import of an already-stored seed/account *before* wiping storage.
  // Previously createWallet cleared and recreated, which looked like "Import did
  // nothing" when the end state matched the existing wallet.
  // Always include account 0 so the same seed is caught even if the user only
  // selected higher indices in Advanced options.
  const indicesToCheck = Array.from(
    new Set([0, ...accountIndices.map((i) => Number(i))])
  ).filter((i) => Number.isFinite(i) && i >= 0);
  const existingMatch = await findExistingAccountForMnemonic(
    seedPhrase,
    indicesToCheck
  );
  if (existingMatch) {
    const label = existingMatch.name
      ? `"${existingMatch.name}"`
      : 'this wallet';
    throw new Error(
      `${ERROR.walletAlreadyExists} ${label} is already in Lucem.`
    );
  }

  // A software vault can already exist. Adding a mnemonic no longer wipes it —
  // the new seed becomes an additional wallet (walletId). Hardware-only setups
  // (and a dummy `encryptedKey` from older Keystone imports) do not count as a
  // password the user can enter — the first software seed *sets* that password.
  const existingEncryptedKey = await getStorage(STORAGE.encryptedKey);
  const existingEncryptedKeys = (await getStorage(STORAGE.encryptedKeys)) || {};
  const existingAccounts = await getStorage(STORAGE.accounts);
  const vaultExists = vaultRequiresExistingPasswordFrom(
    existingAccounts,
    existingEncryptedKey,
    existingEncryptedKeys
  );

  if (
    existingAccounts &&
    totalAccountCount(existingAccounts) + accountIndices.length >
      MAX_TOTAL_ACCOUNTS
  ) {
    throw new Error(ERROR.maxAccountsReached);
  }

  let walletId = '0';
  if (vaultExists) {
    // Every software seed in a vault is protected by the same password.
    const probe =
      existingEncryptedKey ||
      existingEncryptedKeys[Object.keys(existingEncryptedKeys)[0]];
    try {
      await decryptWithPassword(password, probe);
    } catch (/** @type {any} */ e) {
      throw new Error(
        `${ERROR.wrongPassword}: enter your existing Lucem password to add another wallet.`
      );
    }
    walletId = await nextWalletId();
  }

  /** @type {any} */
  let entropy = mnemonicToEntropy(seedPhrase);
  /** @type {any} */
  let rootKey = Loader.Cardano.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  );
  entropy = null;
  seedPhrase = null;

  const encryptedRootKey = await encryptWithPassword(
    password,
    rootKey.as_bytes()
  );
  rootKey.free();
  rootKey = null;

  if (vaultExists) {
    // Materialize the multi-seed map lazily, migrating the legacy seed to "0".
    const map = { ...existingEncryptedKeys };
    if (!map['0'] && existingEncryptedKey) map['0'] = existingEncryptedKey;
    map[walletId] = encryptedRootKey;
    await setStorage({ [STORAGE.encryptedKeys]: map });
  } else {
    // First software seed: overwrite any HW-only dummy root so it cannot sit
    // as an unreachable wallet 0 or demand an unknown password later.
    await setStorage({ [STORAGE.encryptedKey]: encryptedRootKey });
    if (existingEncryptedKeys && existingEncryptedKeys['0']) {
      const nextMap = { ...existingEncryptedKeys };
      delete nextMap['0'];
      await setStorage({ [STORAGE.encryptedKeys]: nextMap });
    }
    const [network, currency] = await Promise.all([
      getStorage(STORAGE.network),
      getStorage(STORAGE.currency),
    ]);
    /** @type {Record<string, unknown>} */
    const defaults = {};
    if (!network) {
      defaults[STORAGE.network] = {
        id: NETWORK_ID.mainnet,
        node: NODE.mainnet,
      };
    }
    if (!currency) {
      defaults[STORAGE.currency] = 'usd';
    }
    if (Object.keys(defaults).length) await setStorage(defaults);
  }

  const primaryIndex = Number(explicitAccounts[0]);
  const index = await createAccount(name, password, primaryIndex, {
    walletId,
    derivationIndex: primaryIndex,
  });

  // Create additional explicitly selected accounts
  for (let i = 1; i < explicitAccounts.length; i++) {
    const derivationIndex = Number(explicitAccounts[i]);
    await createAccount(`Account ${derivationIndex}`, password, derivationIndex, {
      walletId,
      derivationIndex,
    });
  }

  // Discover additional used derivation indices via Koios POST /address_txs (legacy GET /addresses/.../txs was removed).
  const MAX_SUB_ACCOUNT_SCAN = 20;
  let searchIndex = Math.max(...explicitAccounts.map((i) => Number(i))) + 1;
  while (searchIndex <= MAX_SUB_ACCOUNT_SCAN) {
    // Respect the global cap; stop discovering rather than throwing mid-import.
    if (totalAccountCount(await getStorage(STORAGE.accounts)) >= MAX_TOTAL_ACCOUNTS) {
      break;
    }
    let { paymentKey, stakeKey } = await requestAccountKey(
      password,
      searchIndex,
      walletId
    );

    const network = await getNetwork();
    const networkId = NETWORKD_ID_NUMBER[network.name || network.id];

    const baseAddress = Loader.Cardano.BaseAddress.new(
      networkId,
      Loader.Cardano.Credential.from_keyhash(paymentKey.to_public().hash()),
      Loader.Cardano.Credential.from_keyhash(stakeKey.to_public().hash())
    );

    const fullAddress = baseAddress.to_address().to_bech32();

    paymentKey.free();
    stakeKey.free();
    paymentKey = null;
    stakeKey = null;

    try {
      const req = KOIOS_REQUESTS.getAddressTxs(fullAddress);
      const transactions = await koiosRequest(req.endpoint, undefined, req.body);
      if (addressTxsIndicatesHistory(transactions)) {
        await createAccount(`Account ${searchIndex}`, password, searchIndex, {
          walletId,
          derivationIndex: searchIndex,
        });
      } else {
        break;
      }
    } catch (/** @type {any} */ error) {
      if (error.message && error.message.includes('404')) {
        break;
      }
      console.warn('Sub-account scan stopped:', error.message);
      break;
    }

    searchIndex++;
  }

  password = null;
  // Always activate the primary new account (first explicit index), even when
  // other accounts already existed on the device before this import/create.
  await switchAccount(index);

  return index;
};

export const mnemonicToObject = (mnemonic) => {
  const mnemonicMap = {};
  mnemonic.split(' ').forEach((word, index) => (mnemonicMap[index + 1] = word));
  return mnemonicMap;
};

export const mnemonicFromObject = (mnemonicMap) => {
  return Object.keys(mnemonicMap).reduce(
    (acc, key) => (acc ? acc + ' ' + mnemonicMap[key] : acc + mnemonicMap[key]),
    ''
  );
};

// Helper function to generate a random string for the seed
const generateRandomSeed = () => Math.random().toString(36).substring(2, 15);

// Helper function to get a random color
const getRandomBackgroundColor = () => {
  const colors = ["BEBEBE", "8C8C8C", "616161"];
  return colors[Math.floor(Math.random() * colors.length)];
};

const getRandomColor = () => {
  const colors = ["C5FF0A", "B08102", "708fb4", "B80000"];
  return colors[Math.floor(Math.random() * colors.length)];
};

const getRandomRotation = () => {
  const degrees = [0,90,180,270];
  return degrees[Math.floor(Math.random() * degrees.length)];
};

const getRandomShape = () => {
  const shape = ["line", "ellipse", "ellipseFilled", "polygonFilled", "rectangleFilled","rectangle"];
  return shape[Math.floor(Math.random() * shape.length)];
};

export const avatarToImage = (avatar) => {
  // @ts-expect-error dicebear v4 createAvatar + v9 shapes style types do not overlap
  const svg = createAvatar(shapes, {
    seed: avatar,
    shape1: ["line", "ellipse", "ellipseFilled", "polygonFilled", "rectangleFilled", "rectangle"],
    shape2: ["line", "ellipse", "ellipseFilled", "polygonFilled", "rectangleFilled", "rectangle"],
    shape3: ["line", "ellipse", "ellipseFilled", "polygonFilled", "rectangleFilled", "rectangle"],
    shape1Color: ["00F5FF", "DC1BFA"],
    shape2Color: ["CEFA00", "DC1BFA"],
    shape3Color: ["CEFA00", "00F5FF"],
    backgroundColor: ["CEFA00", "00F5FF", "DC1BFA", "ffffff"],
    backgroundType: ["gradientLinear"],
  });

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  return URL.createObjectURL(blob);
};

export const getAsset = async (unit) => {
  if (!window.assets) {
    window.assets = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE.assets) || '{}'
    );
  }
  const assets = window.assets;
  const asset = assets[unit] || {};
  const time = Date.now();
  const h1 = 6000000;
  // Skip cache when a prior fetch left image empty — old empty caches from
  // broken metadata/IPFS paths would otherwise stick for ~100 minutes.
  if (
    asset &&
    asset.time &&
    time - asset.time <= h1 &&
    !asset.mint &&
    asset.image
  ) {
    return asset;
  } else {
    const { policyId, name, label } = fromAssetUnit(unit);
    const bufferName = Buffer.from(name, 'hex');
    asset.unit = unit;
    asset.policy = policyId;
    asset.fingerprint = AssetFingerprint.fromParts(
      Buffer.from(policyId, 'hex'),
      bufferName
    ).fingerprint();
    asset.name = Number.isInteger(label)
      ? `(${label}) ` + bufferName.toString()
      : bufferName.toString();

    // CIP-0067 & CIP-0068 (support 222 and 333 sub standards)

    if (label === 222) {
      const refUnit = toAssetUnit(policyId, name, 100);
      try {
        const owners = await koiosRequestEnhanced(`/assets/${refUnit}/addresses`);
        if (!owners || owners.error || !owners[0] || !owners[0].address) {
          throw new Error('No owner found.');
        }
        const [refUtxo] = await koiosRequest(
          `/addresses/${owners[0].address}/utxos/${refUnit}`
        );
        const datum =
          refUtxo?.inline_datum ||
          (await koiosRequest(`/scripts/datum/${refUtxo?.data_hash}/cbor`))
            ?.cbor;
        const metadataDatum = datum && (await Data.from(datum));

        if (metadataDatum.index !== 0) throw new Error('No correct metadata.');

        const metadata = metadataDatum && Data.toJson(metadataDatum.fields[0]);

        asset.displayName = metadata.name;
        asset.image = extractMetadataImage(metadata) || '';
        asset.decimals = 0;
      } catch (/** @type {any} */ _e) {
        asset.displayName = asset.name;
        asset.mint = true;
      }
    } else if (label === 333) {
      const refUnit = toAssetUnit(policyId, name, 100);
      try {
        const owners = await koiosRequestEnhanced(`/assets/${refUnit}/addresses`);
        if (!owners || owners.error || !owners[0] || !owners[0].address) {
          throw new Error('No owner found.');
        }
        const [refUtxo] = await koiosRequest(
          `/addresses/${owners[0].address}/utxos/${refUnit}`
        );
        const datum =
          refUtxo?.inline_datum ||
          (await koiosRequest(`/scripts/datum/${refUtxo?.data_hash}/cbor`))
            ?.cbor;
        const metadataDatum = datum && (await Data.from(datum));

        if (metadataDatum.index !== 0) throw new Error('No correct metadata.');

        const metadata = metadataDatum && Data.toJson(metadataDatum.fields[0]);

        asset.displayName = metadata.name;
        asset.image = linkToSrc(convertMetadataPropToString(metadata.logo)) || '';
        asset.decimals = metadata.decimals || 0;
      } catch (/** @type {any} */ _e) {
        asset.displayName = asset.name;
        asset.mint = true;
      }
    } else {
      let result = await koiosRequestEnhanced(`/assets/${unit}`);
      if (!result || result.error) {
        result = {};
        asset.mint = true;
      }
      // Blockfrost shape: per-asset CIP-25 in `onchain_metadata`.
      let onchainMetadata =
        result.onchain_metadata &&
        ((result.onchain_metadata.version === 2 &&
          result.onchain_metadata?.[`0x${policyId}`]?.[`0x${name}`]) ||
          result.onchain_metadata);
      // Koios shape: CIP-25 lives in the full minting-tx metadata under label
      // 721 → policy → asset name; off-chain token registry data in
      // `token_registry_metadata`. Field names differ from Blockfrost, so map
      // them here when the Blockfrost-style fields are absent.
      if (!onchainMetadata && result.minting_tx_metadata) {
        const cip25 =
          result.minting_tx_metadata['721'] || result.minting_tx_metadata[721];
        const byPolicy = cip25 && (cip25[policyId] || cip25[`0x${policyId}`]);
        if (byPolicy && typeof byPolicy === 'object') {
          const nameAscii = Buffer.from(name, 'hex').toString('utf8');
          onchainMetadata =
            byPolicy[nameAscii] ||
            byPolicy[name] ||
            byPolicy[`0x${name}`] ||
            Object.values(byPolicy)[0] ||
            null;
        }
      }
      const registry = result.metadata || result.token_registry_metadata || null;
      asset.displayName =
        (onchainMetadata && onchainMetadata.name) ||
        (registry && registry.name) ||
        asset.name;
      asset.image =
        extractMetadataImage(onchainMetadata) ||
        (registry && registry.logo && linkToSrc(registry.logo, true)) ||
        '';
      asset.decimals = (registry && registry.decimals) || 0;
      if (!asset.name) {
        if (asset.displayName) asset.name = asset.displayName[0];
        else asset.name = '-';
      }
    }
    asset.time = Date.now();
    assets[unit] = asset;
    window.assets = assets;
    localStorage.setItem(LOCAL_STORAGE.assets, JSON.stringify(assets));
    return asset;
  }
};

export const updateBalance = async (currentAccount, network, { force = false } = {}) => {
  await Loader.load();
  const assets = await getBalanceExtended({ force });
  const amount = await assetsToValue(assets);
  await checkCollateral(currentAccount, network);

  if (assets.length > 0) {
    const lovelaceRow = assets.find((am) => am.unit === 'lovelace');
    currentAccount[network.id].lovelace = normalizeLovelaceScalar(
      lovelaceRow ? lovelaceRow.quantity : null
    );
    currentAccount[network.id].assets = assets.filter(
      (am) => am.unit !== 'lovelace'
    );
    if (currentAccount[network.id].assets.length > 0) {
      try {
        const { initTx } = require('./wallet');
        const protocolParameters = await initTx();
        const checkOutput = Loader.Cardano.TransactionOutput.new(
          Loader.Cardano.Address.from_bech32(
            currentAccount[network.id].paymentAddr
          ),
          amount
        );
        const dataCost = Loader.Cardano.DataCost.new_coins_per_byte(
          Loader.Cardano.BigNum.from_str(
            protocolParameters.coinsPerUtxoWord.toString()
          )
        );
        const minAda = Loader.Cardano.min_ada_for_output(
          checkOutput,
          dataCost
        ).toString();
        currentAccount[network.id].minAda = normalizeLovelaceScalar(minAda);
      } catch (/** @type {any} */ error) {
        // Stake-wide multiasset values can fail the single-output min-ada probe
        // (or protocol-params fetch). Do not fail the whole balance refresh.
        console.warn('minAda probe failed:', error.message || error);
        currentAccount[network.id].minAda = 0;
      }
    } else {
      currentAccount[network.id].minAda = 0;
    }
  } else {
    currentAccount[network.id].lovelace = 0;
    currentAccount[network.id].assets = [];
    currentAccount[network.id].minAda = 0;
  }
  return true;
};

/**
 * Rebuild confirmed history from the provider list.
 * Keeps a short leading run of local-only hashes (optimistic prependTxHash)
 * and drops cross-network pollution (several foreign hashes shoved ahead of
 * a tx that already exists in the API response).
 *
 * @param {string[]} confirmed
 * @param {string[]} apiHashes
 * @param {{ replace?: boolean }} [opts] - when replace=true, trust API only
 * @returns {string[]}
 */
export const mergeConfirmedWithApi = (confirmed, apiHashes, opts = {}) => {
  if (!Array.isArray(apiHashes) || apiHashes.length <= 0) {
    return Array.isArray(confirmed) ? confirmed : [];
  }
  if (opts.replace) return apiHashes;

  const prev = Array.isArray(confirmed) ? confirmed : [];
  if (prev[0] === apiHashes[0]) return prev;

  const apiSet = new Set(apiHashes);
  const pending = [];
  for (const hash of prev) {
    if (apiSet.has(hash)) break;
    pending.push(hash);
  }

  // Several local-only hashes in front of a known API tx ⇒ poisoned list
  // from a network-switch race. A single pending hash is optimistic submit.
  if (pending.length > 1 && prev.includes(apiHashes[0])) {
    return apiHashes;
  }

  return [...pending, ...apiHashes];
};

const updateTransactions = async (currentAccount, network, { replace = false, force = false } = {}) => {
  const transactions = await getTransactions(1, 10, { force });
  if (transactions.length <= 0) return false;
  const apiHashes = transactions.map((tx) => tx.txHash);
  const confirmed = currentAccount[network.id].history.confirmed;
  const next = mergeConfirmedWithApi(confirmed, apiHashes, { replace });
  if (
    next.length === confirmed.length &&
    next.every((hash, i) => hash === confirmed[i])
  ) {
    return false;
  }
  currentAccount[network.id].history.confirmed = next;
  return true;
};

export const setTransactions = async (txs) => {
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  accounts[currentIndex][network.id].history.confirmed = txs;
  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

/**
 * Optimistically prepend a just-submitted tx hash so the history viewer
 * shows it immediately, before Koios indexes the block.
 */
export const prependTxHash = async (txHash) => {
  if (!txHash) return;
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  const confirmed = accounts[currentIndex][network.id].history.confirmed;
  if (!confirmed.includes(txHash)) {
    confirmed.unshift(txHash);
    await setStorage({ [STORAGE.accounts]: { ...accounts } });
  }
};

export const setCollateral = async (collateral) => {
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  accounts[currentIndex][network.id].collateral = {
    ...collateral,
    lovelace: normalizeLovelaceScalar(collateral.lovelace),
  };
  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

export const removeCollateral = async () => {
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  delete accounts[currentIndex][network.id].collateral;

  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

export const updateAccount = async (forceUpdate = false) => {
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const currentAccount = accounts[currentIndex];
  const network = await getNetwork();

  const txChanged = await updateTransactions(currentAccount, network, {
    replace: forceUpdate,
    force: forceUpdate,
  });

  // Discover used external + change addresses even when the balance refresh is
  // skipped (unchanged tip). Otherwise soft refreshes never activate change
  // addresses that already hold funds under this stake key.
  let addressesChanged = false;
  try {
    const beforeExternal = getExternalIndices(currentAccount);
    const beforeInternal = getInternalIndices(currentAccount);
    const discovered = await discoverUsedPaymentIndices(currentAccount, {
      networkKeys: [network.id],
    });
    const mergedExternal = normalizeExternalIndices([
      ...beforeExternal,
      ...discovered.externalIndices,
    ]);
    const mergedInternal = normalizeInternalIndices([
      ...beforeInternal,
      ...discovered.internalIndices,
    ]);
    const externalChanged =
      mergedExternal.length !== beforeExternal.length ||
      mergedExternal.some((n, i) => n !== beforeExternal[i]);
    const internalChanged =
      mergedInternal.length !== beforeInternal.length ||
      mergedInternal.some((n, i) => n !== beforeInternal[i]);
    if (externalChanged || internalChanged) {
      currentAccount.externalIndices = mergedExternal;
      currentAccount.internalIndices = mergedInternal;
      addressesChanged = true;
      await setStorage({
        [STORAGE.accounts]: {
          ...accounts,
        },
      });
      invalidateReadCache();
    }
  } catch (/** @type {any} */ error) {
    console.warn(
      'Address discovery failed:',
      error.message || error
    );
  }

  const isFirstLoad = currentAccount[network.id].lovelace == null;
  // Account-level forceUpdate (migrations) must both bypass the tip short-circuit
  // and force a fresh balance fetch. Using only the function parameter meant
  // soft opens after 4.0.3 could clear the flag and still skip/cache-serve the
  // old primary-address total when tip was unchanged.
  const accountForceUpdate = Boolean(currentAccount[network.id].forceUpdate);
  if (
    currentAccount[network.id].history.confirmed[0] ==
      currentAccount[network.id].lastUpdate &&
    !forceUpdate &&
    !isFirstLoad &&
    !accountForceUpdate &&
    !addressesChanged
  ) {
    // Tip unchanged and no forced balance refresh — skip the balance fetch.
    return;
  }

  if (accountForceUpdate) delete currentAccount[network.id].forceUpdate;

  const balanceSignatureBefore = balanceSignature(currentAccount[network.id]);
  await updateBalance(currentAccount, network, {
    force: forceUpdate || addressesChanged || accountForceUpdate,
  });
  const balanceChanged =
    balanceSignature(currentAccount[network.id]) !== balanceSignatureBefore;

  currentAccount[network.id].lastUpdate =
    currentAccount[network.id].history.confirmed[0];

  // Avoid rewriting the whole accounts blob when neither history nor balance
  // actually changed (e.g. a forced refresh that returned identical data).
  if (!txChanged && !balanceChanged && !isFirstLoad && !addressesChanged) {
    return;
  }

  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

/** Compact fingerprint of the balance-relevant fields for change detection. */
const balanceSignature = (networkSlice) =>
  JSON.stringify({
    lovelace: networkSlice?.lovelace ?? null,
    minAda: networkSlice?.minAda ?? null,
    assets: networkSlice?.assets ?? [],
    collateral: networkSlice?.collateral ?? null,
  });

export const updateRecentSentToAddress = async (address) => {
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  accounts[currentIndex][network.id].recentSendToAddresses = [address]; // Update in the future to add mulitple addresses
  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

export const displayUnit = (quantity, decimals = 6) => {
  const parsed = parseInt(quantity);
  if (!Number.isFinite(parsed)) return 0;
  return parsed / 10 ** decimals;
};

export const toUnit = (amount, decimals = 6) => {
  if (!amount) return '0';
  let result = parseFloat(
    amount.toString().replace(/[,\s]/g, '')
  ).toLocaleString('en-EN', { minimumFractionDigits: decimals });
  const split = result.split('.');
  const front = split[0].replace(/[,\s]/g, '');
  result =
    (front === '0' ? '' : front) + (split[1] ? split[1].slice(0, decimals) : '');
  if (!result) return '0';
  else if (result == 'NaN') return '0';
  return result;
};