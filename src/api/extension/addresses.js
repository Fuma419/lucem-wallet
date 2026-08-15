/**
 * Payment/reward/DRep address derivation, discovery, and CIP-30 key hashes.
 * Depends on ./keys and ./storage; must not import ./chain-reads.
 */
import {
  APIError,
  NETWORK_ID,
  NETWORKD_ID_NUMBER,
  STORAGE,
} from '../../config/config';
import { invalidateAll as invalidateReadCache } from '../cache';
import { addressTxsIndicatesHistory, KOIOS_REQUESTS } from '../koios-endpoints';
import Loader from '../loader';
import { koiosRequest } from '../util';
import {
  deriveAccountDRepPublicKeyHex,
  deriveAccountStakePublicKeyHex,
} from './keys';
import {
  ADDRESS_ROLE,
  derivePaymentFromAccountPublicKey,
  flattenAccountAddressesPayload,
  getExternalIndices,
  getInternalIndices,
  getUserExternalIndices,
  listEnabledPaymentAddresses,
  matchExternalIndicesFromAddresses,
  matchInternalIndicesFromAddresses,
  MAX_EXTERNAL_ADDRESS_INDEX,
  MAX_INTERNAL_ADDRESS_INDEX,
  normalizeExternalIndices,
  normalizeInternalIndices,
} from './multi-address';
import {
  getCurrentAccount,
  getCurrentAccountIndex,
  getNetwork,
  getStorage,
  setStorage,
} from './storage';


export const getAddress = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  // Primary receive address remains external index 0 (CIP-30 / QR default).
  return currentAccount.paymentAddr;
};

/**
 * Enabled CIP-1852 external payment addresses for the current account
 * (index 0 plus any Advanced multi-address indices).
 */
export const getEnabledPaymentAddresses = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  const network = await getNetwork();
  const networkId = NETWORKD_ID_NUMBER[network.name || network.id];
  return listEnabledPaymentAddresses(
    Loader.Cardano,
    currentAccount,
    networkId
  );
};

/**
 * Payment key hashes for every enabled external + internal address on an
 * account. Used so fee sizing and witnesses cover change/multi-address UTxOs.
 *
 * @param {object} [accountOverride] - network-specific or storage account
 * @returns {Promise<string[]>}
 */
export const paymentKeyHashesForSigning = async (accountOverride) => {
  await Loader.load();
  const account = accountOverride || (await getCurrentAccount());
  const network = await getNetwork();
  const networkId = NETWORKD_ID_NUMBER[network.name || network.id];
  const rows = listEnabledPaymentAddresses(
    Loader.Cardano,
    account,
    networkId
  );
  const hashes = [];
  const seen = new Set();
  const push = (h) => {
    if (!h || seen.has(h)) return;
    seen.add(h);
    hashes.push(h);
  };
  push(account.paymentKeyHash);
  for (const row of rows) push(row.paymentKeyHash);
  return hashes;
};

/**
 * Persist which external address indices are active for the current account.
 * Index 0 is always kept. Triggers balance cache invalidation.
 */
export const setAccountExternalIndices = async (indices) => {
  const currentIndex = await getCurrentAccountIndex();
  return setAccountExternalIndicesAt(currentIndex, indices);
};

/**
 * Persist external indices for a specific account storage slot.
 */
export const setAccountExternalIndicesAt = async (accountIndex, indices) => {
  const accounts = await getStorage(STORAGE.accounts);
  if (!accounts?.[accountIndex]) {
    throw new Error('Account not found');
  }
  const next = normalizeExternalIndices(indices);
  accounts[accountIndex].externalIndices = next;
  await setStorage({ [STORAGE.accounts]: { ...accounts } });
  invalidateReadCache();
  return next;
};

/**
 * Persist internal (change) indices for a specific account storage slot.
 */
export const setAccountInternalIndicesAt = async (accountIndex, indices) => {
  const accounts = await getStorage(STORAGE.accounts);
  if (!accounts?.[accountIndex]) {
    throw new Error('Account not found');
  }
  const next = normalizeInternalIndices(indices);
  accounts[accountIndex].internalIndices = next;
  await setStorage({ [STORAGE.accounts]: { ...accounts } });
  invalidateReadCache();
  return next;
};

/**
 * Networks to scan for used payment addresses under a stake key.
 * Preview/preprod share address bech32 format but are separate chains.
 */
const EXTERNAL_ADDRESS_SCAN_NETWORKS = [
  NETWORK_ID.mainnet,
  NETWORK_ID.preview,
  NETWORK_ID.preprod,
];

/** Consecutive empty payment indices before stopping address_txs fallback. */
const EXTERNAL_ADDRESS_SCAN_GAP = 5;

/**
 * Query Koios/Blockfrost for payment addresses on a stake key, then match
 * them to CIP-1852 external (role=0) and internal/change (role=1) indices.
 *
 * @param {*} account
 * @param {{ networkKeys?: string[] }} [options]
 * @returns {Promise<{ externalIndices: number[], internalIndices: number[] }>}
 */
export const discoverUsedPaymentIndices = async (account, options = {}) => {
  await Loader.load();
  const empty = {
    externalIndices: getExternalIndices(account),
    internalIndices: getInternalIndices(account),
  };
  if (!account?.publicKey) {
    return {
      externalIndices: [0],
      internalIndices: [],
    };
  }

  // Unit tests create wallets without a live chain; skip network discovery
  // unless explicitly opted in (avoids slow/flaky CI).
  if (
    typeof process !== 'undefined' &&
    process.env.JEST_WORKER_ID != null &&
    process.env.LUCEM_DISCOVER_ADDRESSES !== '1'
  ) {
    return empty;
  }

  const networkKeys =
    Array.isArray(options.networkKeys) && options.networkKeys.length > 0
      ? options.networkKeys
      : EXTERNAL_ADDRESS_SCAN_NETWORKS;

  const externalFound = new Set([0]);
  const internalFound = new Set();

  for (const networkKey of networkKeys) {
    const rewardAddr = account[networkKey]?.rewardAddr;
    if (!rewardAddr) continue;
    const networkIdNumber = NETWORKD_ID_NUMBER[networkKey];

    try {
      const req = KOIOS_REQUESTS.getAccountAddresses(rewardAddr, true);
      const payload = await koiosRequest(
        req.endpoint,
        undefined,
        req.body,
        undefined,
        networkKey
      );
      const addresses = flattenAccountAddressesPayload(payload);
      for (const i of matchExternalIndicesFromAddresses(
        Loader.Cardano,
        account.publicKey,
        networkIdNumber,
        addresses
      )) {
        externalFound.add(i);
      }
      for (const i of matchInternalIndicesFromAddresses(
        Loader.Cardano,
        account.publicKey,
        networkIdNumber,
        addresses
      )) {
        internalFound.add(i);
      }
      continue;
    } catch (/** @type {any} */ error) {
      console.warn(
        `account_addresses scan failed (${networkKey}):`,
        error.message || error
      );
    }

    // Fallback when /account_addresses is unavailable: gap-limited /address_txs
    // on both external and internal chains.
    for (const role of [ADDRESS_ROLE.external, ADDRESS_ROLE.internal]) {
      try {
        let gap = 0;
        const start = role === ADDRESS_ROLE.external ? 1 : 0;
        const max =
          role === ADDRESS_ROLE.external
            ? MAX_EXTERNAL_ADDRESS_INDEX
            : MAX_INTERNAL_ADDRESS_INDEX;
        for (let i = start; i <= max; i++) {
          const { paymentAddr } = derivePaymentFromAccountPublicKey(
            Loader.Cardano,
            account.publicKey,
            networkIdNumber,
            role,
            i
          );
          const req = KOIOS_REQUESTS.getAddressTxs(paymentAddr);
          const txs = await koiosRequest(
            req.endpoint,
            undefined,
            req.body,
            undefined,
            networkKey
          );
          if (addressTxsIndicatesHistory(txs)) {
            if (role === ADDRESS_ROLE.external) externalFound.add(i);
            else internalFound.add(i);
            gap = 0;
          } else {
            gap += 1;
            if (gap >= EXTERNAL_ADDRESS_SCAN_GAP) break;
          }
        }
      } catch (/** @type {any} */ error) {
        console.warn(
          `address_txs role=${role} scan failed (${networkKey}):`,
          error.message || error
        );
      }
    }
  }

  return {
    externalIndices: normalizeExternalIndices([...externalFound]),
    internalIndices: normalizeInternalIndices([...internalFound]),
  };
};

/** @deprecated Prefer discoverUsedPaymentIndices (includes change addresses). */
export const discoverUsedExternalIndices = async (account, options = {}) => {
  const { externalIndices } = await discoverUsedPaymentIndices(account, options);
  return externalIndices;
};

/**
 * After import/create/refresh: discover used external + internal addresses
 * and activate them (merged with any already enabled indices).
 *
 * @param {string|number} accountIndex
 * @param {{ networkKeys?: string[] }} [options]
 * @returns {Promise<{ externalIndices: number[], internalIndices: number[] }>}
 */
export const activateDiscoveredExternalAddresses = async (
  accountIndex,
  options = {}
) => {
  const accounts = await getStorage(STORAGE.accounts);
  const account = accounts?.[accountIndex];
  if (!account) {
    return { externalIndices: [0], internalIndices: [] };
  }

  try {
    // Snapshot user-activated externals before discovery expands the enabled
    // set, so empty discovered addresses stay off the Accounts address list.
    if (!Array.isArray(accounts[accountIndex].userExternalIndices)) {
      accounts[accountIndex].userExternalIndices = getExternalIndices(account);
    }
    const discovered = await discoverUsedPaymentIndices(account, options);
    const mergedExternal = normalizeExternalIndices([
      ...getExternalIndices(account),
      ...discovered.externalIndices,
    ]);
    const mergedInternal = normalizeInternalIndices([
      ...getInternalIndices(account),
      ...discovered.internalIndices,
    ]);
    const prevExternal = getExternalIndices(account);
    const prevInternal = getInternalIndices(account);
    const externalSame =
      mergedExternal.length === prevExternal.length &&
      mergedExternal.every((n, i) => n === prevExternal[i]);
    const internalSame =
      mergedInternal.length === prevInternal.length &&
      mergedInternal.every((n, i) => n === prevInternal[i]);
    if (externalSame && internalSame) {
      await setStorage({ [STORAGE.accounts]: { ...accounts } });
      return {
        externalIndices: mergedExternal,
        internalIndices: mergedInternal,
      };
    }
    accounts[accountIndex].externalIndices = mergedExternal;
    accounts[accountIndex].internalIndices = mergedInternal;
    await setStorage({ [STORAGE.accounts]: { ...accounts } });
    invalidateReadCache();
    return {
      externalIndices: mergedExternal,
      internalIndices: mergedInternal,
    };
  } catch (/** @type {any} */ error) {
    console.warn(
      'External address activation failed:',
      error.message || error
    );
    return {
      externalIndices: getExternalIndices(account),
      internalIndices: getInternalIndices(account),
    };
  }
};

/**
 * Enable a single external index (0..MAX) on the current account.
 * Marks the index as user-activated for the Accounts address list.
 */
export const enableExternalAddressIndex = async (addressIndex) => {
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const account = accounts?.[currentIndex];
  if (!account) throw new Error('Account not found');
  const i = parseInt(addressIndex, 10);
  if (!Number.isFinite(i) || i < 0 || i > MAX_EXTERNAL_ADDRESS_INDEX) {
    throw new Error(
      `Address index must be between 0 and ${MAX_EXTERNAL_ADDRESS_INDEX}`
    );
  }
  const nextExternal = normalizeExternalIndices([
    ...getExternalIndices(account),
    i,
  ]);
  const nextUser = normalizeExternalIndices([
    ...getUserExternalIndices(account),
    i,
  ]);
  accounts[currentIndex].externalIndices = nextExternal;
  accounts[currentIndex].userExternalIndices = nextUser;
  await setStorage({ [STORAGE.accounts]: { ...accounts } });
  invalidateReadCache();
  return nextExternal;
};

/**
 * Disable an external index on the current account (index 0 cannot be disabled).
 * Also clears the user-activated flag for that index.
 */
export const disableExternalAddressIndex = async (addressIndex) => {
  const i = parseInt(addressIndex, 10);
  if (i === 0) {
    throw new Error('The primary address (index 0) cannot be disabled');
  }
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const account = accounts?.[currentIndex];
  if (!account) throw new Error('Account not found');
  const nextExternal = normalizeExternalIndices(
    getExternalIndices(account).filter((n) => n !== i)
  );
  const nextUser = normalizeExternalIndices(
    getUserExternalIndices(account).filter((n) => n !== i)
  );
  accounts[currentIndex].externalIndices = nextExternal;
  accounts[currentIndex].userExternalIndices = nextUser;
  await setStorage({ [STORAGE.accounts]: { ...accounts } });
  invalidateReadCache();
  return nextExternal;
};

export const getRewardAddress = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  // Return the full Bech32 stake address instead of converting to key hash
  return currentAccount.rewardAddr;
};

export const getPubDRepKey = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  if (!currentAccount?.publicKey) {
    throw APIError.InternalError;
  }
  return deriveAccountDRepPublicKeyHex(currentAccount.publicKey);
};

/**
 * Derive this account's DRep identity (CIP-105 role-3 key).
 * Returns the raw key-hash hex (used as the voting credential / required signer)
 * plus the CIP-129 and legacy CIP-105 bech32 ids used to query registration.
 */
export const getAccountDRepId = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  if (!currentAccount?.publicKey) {
    throw APIError.InternalError;
  }
  const drepRawKey = Loader.Cardano.Bip32PublicKey.from_hex(currentAccount.publicKey)
    .derive(3)
    .derive(0)
    .to_raw_key();
  const drepKeyHash = drepRawKey.hash();
  const drepKeyHashHex = Buffer.from(drepKeyHash.to_bytes()).toString('hex');
  const drep = Loader.Cardano.DRep.new_key_hash(drepKeyHash);
  let drepIdCip129 = '';
  let drepIdLegacy = '';
  try {
    drepIdCip129 = drep.to_bech32(true);
  } catch (/** @type {any} */ e) {
    drepIdCip129 = '';
  }
  try {
    drepIdLegacy = drep.to_bech32(false);
  } catch (/** @type {any} */ e) {
    drepIdLegacy = '';
  }
  return { drepKeyHashHex, drepIdCip129, drepIdLegacy };
};

export const getRegisteredPubStakeKeys = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  if (!currentAccount?.publicKey || !currentAccount?.rewardAddr) {
    throw APIError.InternalError;
  }

  const stakePubKeyHex = deriveAccountStakePublicKeyHex(currentAccount.publicKey);
  const request = KOIOS_REQUESTS.getAccountInfo(currentAccount.rewardAddr);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  const row = Array.isArray(result) && result.length > 0 ? result[0] : null;
  const status = String(row?.status || '').toLowerCase();
  const isRegistered =
    row != null &&
    (row.registered === true ||
      (!status.includes('unreg') &&
        !status.includes('not registered') &&
        !status.includes('deregistered')));

  return isRegistered ? [stakePubKeyHex] : [];
};

export const getUnregisteredPubStakeKeys = async () => {
  const registeredKeys = await getRegisteredPubStakeKeys();
  if (registeredKeys.length > 0) {
    return [];
  }
  const currentAccount = await getCurrentAccount();
  if (!currentAccount?.publicKey) {
    throw APIError.InternalError;
  }
  return [deriveAccountStakePublicKeyHex(currentAccount.publicKey)];
};

