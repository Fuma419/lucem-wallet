import {
  APIError,
  DataSignError,
  ERROR,
  EVENT,
  HW,
  LOCAL_STORAGE,
  MAX_TOTAL_ACCOUNTS,
  NETWORK_ID, NETWORKD_ID_NUMBER,
  NODE,
  SENDER,
  STORAGE,
  TAB,
  TARGET,
  TxSignError,
} from '../../config/config';
import { POPUP_WINDOW } from '../../config/config';
import platform from '../../platform';
import { mnemonicToEntropy } from 'bip39';
import cryptoRandomString from 'crypto-random-string';
import Loader from '../loader';
import { createAvatar } from '@dicebear/avatars';
import { shapes } from '@dicebear/collection';
// Lazy-load `./wallet` at call sites — a static import cycles (wallet → index)
// and breaks Jest `requireActual` mocks (e.g. MAX_EXTERNAL_ADDRESS_INDEX).
import {
  koiosRequest,
  koiosRequestEnhanced,
  koiosSubmitTransaction,
  networkNameToId,
  utxoFromJson,
  assetsToValue,
  txToLedger,
  txToTrezor,
  linkToSrc,
  convertMetadataPropToString,
  extractMetadataImage,
  fromAssetUnit,
  toAssetUnit,
  Data,
} from '../util';
import TransportWebBLE from '@ledgerhq/hw-transport-web-ble';
import Ada, { HARDENED } from '@cardano-foundation/ledgerjs-hw-app-cardano';
import AssetFingerprint from '@emurgo/cip14-js';
import { isAddress } from 'web3-validator';
import { milkomedaNetworks } from '@dcspark/milkomeda-constants';
import { Cardano, Serialization } from '@cardano-sdk/core';
import provider from '../../config/provider';
import { KOIOS_REQUESTS, addressTxsIndicatesHistory } from '../koios-endpoints';
import { bigIntLovelace, normalizeLovelaceScalar } from '../lovelace-scalar';
import { buildVkeyWitnessSet } from '../tx/sign-witness-set';
import {
  MAX_COLLATERAL_AMOUNT,
  isReservedCollateralPresent,
  parseCollateralAmount,
  selectCollateralCandidates,
} from './collateral';
import {
  aggregateKoiosUtxosByAddress,
  aggregateKoiosUtxosToAssets,
  stakeAddressFromAddressInfo,
  stakeControlledLovelaceFromAccountInfo,
  summarizeAddressInfo,
  summarizeUtxosByAddressEntry,
} from './stake-balance';
import {
  emptyDelegation,
  normalizeDelegationRow,
  normalizeStakePool as normalizeStakePoolData,
} from '../staking';
import {
  cacheKey,
  invalidateAll as invalidateReadCache,
  withCache,
} from '../cache';
import {
  filterPaymentAddressesForAccountsDisplay,
  getExternalIndices,
  getInternalIndices,
  getUserExternalIndices,
  isMultiAddressEnabled,
  listEnabledPaymentAddresses,
  normalizeExternalIndices,
  normalizeInternalIndices,
  deriveExternalPaymentFromAccountPublicKey,
  derivePaymentFromAccountPublicKey,
  matchExternalIndicesFromAddresses,
  matchInternalIndicesFromAddresses,
  flattenAccountAddressesPayload,
  MAX_EXTERNAL_ADDRESS_INDEX,
  MAX_INTERNAL_ADDRESS_INDEX,
  ADDRESS_ROLE,
} from './multi-address';

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

const hasTaggedSets = (cbor) => {
  const tx = Serialization.Transaction.fromCbor(cbor);
  return tx.body().hasTaggedSets();
}

const compareValues = (value1, value2) => {
  try {
    const result = value1.checked_sub(value2);

    // If subtraction does not throw and result is not zero, value1 is greater
    if (!result.is_zero()) {
      return 1;
    }

    return 0;
  } catch (error) {
    // If we catch an underflow error, value1 is less than value2
    return -1;
  }
}

export const getStorage = (key) => platform.storage.get(key);
export const setStorage = (item) => platform.storage.set(item);
export const removeStorage = (item) => platform.storage.remove(item);

export const encryptWithPassword = async (password, rootKeyBytes) => {
  await Loader.load();
  const rootKeyHex = rootKeyBytes instanceof Uint8Array
    ? Buffer.from(rootKeyBytes).toString('hex')
    : Buffer.from(rootKeyBytes, 'hex').toString('hex');
  const passwordHex = Buffer.from(password).toString('hex');
  const salt = cryptoRandomString({ length: 2 * 32 });
  const nonce = cryptoRandomString({ length: 2 * 12 });
  return Loader.Cardano.encrypt_with_password(
    passwordHex,
    salt,
    nonce,
    rootKeyHex
  );
};

export const decryptWithPassword = async (password, encryptedKeyHex) => {
  await Loader.load();
  const passwordHex = Buffer.from(password).toString('hex');
  let decryptedHex;
  try {
    decryptedHex = Loader.Cardano.decrypt_with_password(
      passwordHex,
      encryptedKeyHex
    );
  } catch (err) {
    throw new Error(ERROR.wrongPassword);
  }
  return decryptedHex;
};

export const getWhitelisted = async () => {
  const result = await getStorage(STORAGE.whitelisted);
  return result ? result : [];
};

export const isWhitelisted = async (_origin) => {
  const whitelisted = await getWhitelisted();
  let access = false;
  if (whitelisted.includes(_origin)) access = true;
  return access;
};

export const setWhitelisted = async (origin) => {
  let whitelisted = await getWhitelisted();
  whitelisted ? whitelisted.push(origin) : (whitelisted = [origin]);
  return await setStorage({ [STORAGE.whitelisted]: whitelisted });
};

export const removeWhitelisted = async (origin) => {
  const whitelisted = await getWhitelisted();
  const index = whitelisted.indexOf(origin);
  whitelisted.splice(index, 1);
  return await setStorage({ [STORAGE.whitelisted]: whitelisted });
};

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

export const getDelegation = async ({ force = false } = {}) => {
  const network = await getNetwork();
  const stakeAddress = await getRewardAddress();
  return withCache(
    cacheKey('delegation', network?.id, stakeAddress),
    () => fetchDelegation(stakeAddress),
    { force }
  );
};

const fetchDelegation = async (stakeAddress) => {
  const request = KOIOS_REQUESTS.getAccountInfo(stakeAddress);
  const stake = await koiosRequest(request.endpoint, {}, request.body);

  if (!stake || stake.error || !Array.isArray(stake) || !stake[0]) {
    return emptyDelegation(stakeAddress);
  }

  const stakeRow = stake[0];
  const delegation = normalizeDelegationRow(stakeRow, stakeAddress);

  if (!stakeRow.pool_id) {
    return delegation;
  }

  const poolRequest = KOIOS_REQUESTS.getPoolInfo([stakeRow.pool_id]);
  const poolResponse = await koiosRequest(
    poolRequest.endpoint,
    {},
    poolRequest.body
  );

  if (
    !poolResponse ||
    poolResponse.error ||
    !Array.isArray(poolResponse) ||
    poolResponse.length === 0
  ) {
    return delegation;
  }

  const pool = normalizeStakePool(poolResponse[0], stakeRow.pool_id);
  return {
    ...delegation,
    poolId: pool.poolId,
    poolIdHex: pool.poolIdHex,
    ticker: pool.ticker,
    description: pool.description,
    name: pool.name,
    homepage: pool.homepage,
    margin: pool.margin,
    fixedCost: pool.fixedCost,
    pledge: pool.pledge,
    activeStake: pool.activeStake,
    liveSaturation: pool.liveSaturation,
    blocks: pool.blocks,
    status: pool.status,
  };
};

export const getPoolMetadata = async (poolId) => {
  if (!poolId) {
    throw new Error('poolId argument not provided');
  }

  const request = KOIOS_REQUESTS.getPoolInfo([poolId]);
  const response = await koiosRequest(request.endpoint, {}, request.body);

  if (!response || response.error || !Array.isArray(response) || response.length === 0) {
    throw new Error(response?.message || 'Stake pool not found');
  }

  const poolData = response[0];
  const pool = normalizeStakePool(poolData, poolId);

  return {
    ...pool,
    id: pool.poolId,
    hex: pool.poolIdHex,
  };
};

export const searchPools = async (query) => {
  if (!query) return [];
  const searchLower = encodeURIComponent(query.trim().toLowerCase());

  // Use Koios PostgREST filtering for server-side search
  const listEndpoint = `/pool_list?pool_status=eq.registered&or=(ticker.ilike.*${searchLower}*,pool_id_bech32.ilike.*${searchLower}*)&limit=20`;
  const poolList = await koiosRequest(listEndpoint);

  if (!poolList || poolList.error || !Array.isArray(poolList) || poolList.length === 0) {
    return [];
  }

  // Get detailed info for the matches
  const poolIds = poolList.map(m => m.pool_id_bech32);
  const infoRequest = KOIOS_REQUESTS.getPoolInfo(poolIds);
  const detailedPools = await koiosRequest(infoRequest.endpoint, {}, infoRequest.body);

  if (!detailedPools || detailedPools.error || !Array.isArray(detailedPools)) {
    return [];
  }

  return detailedPools.map((pool) => normalizeStakePool(pool));
};

export const getStakePools = async (limit = 25) => {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const poolList = await koiosRequest(
    `/pool_list?pool_status=eq.registered&limit=${cappedLimit}`
  );

  if (!poolList || poolList.error || !Array.isArray(poolList) || poolList.length === 0) {
    return [];
  }

  const poolIds = poolList.map((pool) => pool.pool_id_bech32).filter(Boolean);
  if (poolIds.length === 0) return [];

  const infoRequest = KOIOS_REQUESTS.getPoolInfo(poolIds);
  const detailedPools = await koiosRequest(infoRequest.endpoint, {}, infoRequest.body);
  if (!detailedPools || detailedPools.error || !Array.isArray(detailedPools)) {
    return [];
  }

  return detailedPools.map((pool) => normalizeStakePool(pool));
};

/**
 * Look up the stake/reward address for a payment address via `/address_info`.
 * Used when the wallet has a payment address but no stored rewardAddr yet.
 */
export const resolveStakeAddressFromPaymentAddress = async (paymentAddr) => {
  if (!paymentAddr) return null;
  try {
    const request = KOIOS_REQUESTS.getAddressInfo(paymentAddr);
    const result = await koiosRequest(request.endpoint, {}, request.body);
    if (result?.error) return null;
    return stakeAddressFromAddressInfo(result);
  } catch (error) {
    console.warn(
      'resolveStakeAddressFromPaymentAddress failed:',
      error.message || error
    );
    return null;
  }
};

/**
 * Stake account for the current wallet: prefer stored rewardAddr, otherwise
 * resolve it from the primary payment address through the chain API.
 */
export const getAccountStakeAddress = async () => {
  const stored = await getRewardAddress();
  if (stored) return stored;
  const paymentAddr = await getAddress();
  return resolveStakeAddressFromPaymentAddress(paymentAddr);
};

export const getBalance = async () => {
  await Loader.load();
  const stakeAddress = await getAccountStakeAddress();
  let utxos = [];
  if (stakeAddress) {
    // `_extended: true` is required on Koios — otherwise asset_list is null and
    // native tokens under the stake key are omitted from the CIP-30 Value.
    const request = KOIOS_REQUESTS.getAccountUtxos(stakeAddress, true);
    const result = await koiosRequest(request.endpoint, {}, request.body);
    if (result?.error) {
      if (result.status_code === 400) throw APIError.InvalidRequest;
      else if (result.status_code === 500) throw APIError.InternalError;
    } else if (Array.isArray(result)) {
      utxos = result;
    }
  }
  // Fallback: enabled payment addresses only (legacy / no stake addr).
  if (utxos.length === 0 && !stakeAddress) {
    const paymentAddresses = await getEnabledPaymentAddresses();
    const addressList = paymentAddresses.map((a) => a.paymentAddr).filter(Boolean);
    if (addressList.length === 0) {
      return Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0'));
    }
    const request = KOIOS_REQUESTS.getAddressesUtxos(addressList, true);
    const result = await koiosRequest(request.endpoint, {}, request.body);
    if (result?.error) {
      if (result.status_code === 400) throw APIError.InvalidRequest;
      else if (result.status_code === 500) throw APIError.InternalError;
      else return Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0'));
    }
    utxos = Array.isArray(result) ? result : [];
  }

  if (utxos.length === 0) {
    return Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0'));
  }

  const assets = aggregateKoiosUtxosToAssets(utxos);
  return await assetsToValue(assets);
};

export const getBalanceExtended = async ({ force = false } = {}) => {
  const network = await getNetwork();
  const stakeAddress = await getAccountStakeAddress();
  if (!stakeAddress) {
    const addresses = await getEnabledPaymentAddresses();
    const addressList = addresses.map((a) => a.paymentAddr).filter(Boolean);
    if (addressList.length === 0) return [];
    return withCache(
      cacheKey(
        'balance-extended',
        network?.id,
        addressList.join(','),
        addresses.map((a) => `${a.role ?? 0}:${a.index}`).join('-')
      ),
      () => fetchBalanceExtended(addressList),
      { force }
    );
  }
  // Stake-controlled UTxOs include every payment address under the account
  // (external + change), so the wallet total matches chain controlled_amount.
  return withCache(
    cacheKey('balance-extended-stake', network?.id, stakeAddress),
    () => fetchBalanceFromStake(stakeAddress),
    { force }
  );
};

const fetchBalanceExtended = async (addresses) => {
  const list = Array.isArray(addresses) ? addresses : [addresses];
  const request = KOIOS_REQUESTS.getAddressesUtxos(list, true);
  const result = await koiosRequest(request.endpoint, {}, request.body);

  if (result.error) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return [];
  }

  if (!result || result.length === 0) {
    return [];
  }

  return aggregateKoiosUtxosToAssets(result);
};

const fetchBalanceFromStake = async (stakeAddress) => {
  const request = KOIOS_REQUESTS.getAccountUtxos(stakeAddress, true);
  const result = await koiosRequest(request.endpoint, {}, request.body);

  if (result?.error) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return [];
  }

  if (!result || result.length === 0) {
    return [];
  }

  return aggregateKoiosUtxosToAssets(result);
};

export const getFullBalance = async () => {
  const stakeAddress = await getAccountStakeAddress();
  if (!stakeAddress) return '0';

  const request = KOIOS_REQUESTS.getAccountInfo(stakeAddress);
  const result = await koiosRequest(request.endpoint, {}, request.body);

  if (result?.error || !result?.[0]) return '0';
  return stakeControlledLovelaceFromAccountInfo(result[0]);
};

/**
 * Stake-controlled ADA for every stored account (batch `/account_info`).
 * Used by the Accounts list so rows show controlled stake — not primary
 * payment-address contents.
 *
 * @returns {Promise<Record<string, { lovelace: string, status: string|null, poolId: string|null }>>}
 */
export const getAccountsControlledStake = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  if (!accounts || typeof accounts !== 'object' || !network?.id) {
    return {};
  }

  const accountKeysByStake = new Map();
  for (const key of Object.keys(accounts)) {
    const rewardAddr = accounts[key]?.[network.id]?.rewardAddr;
    if (!rewardAddr) continue;
    const list = accountKeysByStake.get(rewardAddr) || [];
    list.push(key);
    accountKeysByStake.set(rewardAddr, list);
  }

  const stakeAddresses = Array.from(accountKeysByStake.keys());
  if (stakeAddresses.length === 0) return {};

  const request = KOIOS_REQUESTS.getAccountsInfo(stakeAddresses);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  const out = {};

  if (Array.isArray(result)) {
    for (const row of result) {
      const stake = row?.stake_address;
      if (!stake) continue;
      const keys = accountKeysByStake.get(stake) || [];
      const lovelace = stakeControlledLovelaceFromAccountInfo(row);
      const status =
        row.status ||
        (row.registered === true
          ? 'registered'
          : row.registered === false
            ? 'unregistered'
            : null);
      const poolId = row.delegated_pool || row.pool_id || null;
      for (const key of keys) {
        out[key] = { lovelace, status, poolId };
      }
    }
  }

  for (const keys of accountKeysByStake.values()) {
    for (const key of keys) {
      if (out[key] == null) {
        out[key] = { lovelace: '0', status: null, poolId: null };
      }
    }
  }

  return out;
};

/**
 * Enabled payment/change addresses for the current account, enriched with
 * per-address contents (ADA, UTxO count, native asset count).
 *
 * @param {{ accountsDisplay?: boolean }} [options] - When `accountsDisplay`,
 *   refresh discovery, prefer stake `/account_utxos` for funded addresses
 *   (so every address holding assets is listed even if prior discovery or
 *   `/address_info` missed it), then filter to assets + user-activated.
 */
export const getEnabledPaymentAddressDetails = async (options = {}) => {
  const accountsDisplay = Boolean(options?.accountsDisplay);
  await Loader.load();
  const network = await getNetwork();
  const networkId = NETWORKD_ID_NUMBER[network.name || network.id];

  if (accountsDisplay) {
    try {
      const currentIndex = await getCurrentAccountIndex();
      await activateDiscoveredExternalAddresses(currentIndex, {
        networkKeys: [network.id],
      });
    } catch (error) {
      console.warn(
        'Accounts address discovery failed:',
        error?.message || error
      );
    }
  }

  let currentAccount = await getCurrentAccount();
  let rows = listEnabledPaymentAddresses(
    Loader.Cardano,
    currentAccount,
    networkId
  );

  /** @type {Map<string, { lovelace: bigint, utxoCount: number, assetUnits: Set<string> }>} */
  let fundedByAddr = new Map();
  if (accountsDisplay && currentAccount.rewardAddr) {
    try {
      const utxoReq = KOIOS_REQUESTS.getAccountUtxos(
        currentAccount.rewardAddr,
        true
      );
      const utxos = await koiosRequest(utxoReq.endpoint, {}, utxoReq.body);
      if (Array.isArray(utxos)) {
        fundedByAddr = aggregateKoiosUtxosByAddress(utxos);
      }
    } catch (error) {
      console.warn(
        'Accounts funded-address scan failed:',
        error?.message || error
      );
    }
  }

  // Activate any CIP-1852 indices that currently hold UTxOs but were not yet
  // in externalIndices/internalIndices (common for accounts never soft-refreshed).
  if (accountsDisplay && currentAccount.publicKey && fundedByAddr.size > 0) {
    const fundedAddrs = Array.from(fundedByAddr.keys());
    const extFromFunded = matchExternalIndicesFromAddresses(
      Loader.Cardano,
      currentAccount.publicKey,
      networkId,
      fundedAddrs
    );
    const intFromFunded = matchInternalIndicesFromAddresses(
      Loader.Cardano,
      currentAccount.publicKey,
      networkId,
      fundedAddrs
    );
    const prevExt = getExternalIndices(currentAccount);
    const prevInt = getInternalIndices(currentAccount);
    const mergedExt = normalizeExternalIndices([...prevExt, ...extFromFunded]);
    const mergedInt = normalizeInternalIndices([...prevInt, ...intFromFunded]);
    const extChanged =
      mergedExt.length !== prevExt.length ||
      mergedExt.some((n, i) => n !== prevExt[i]);
    const intChanged =
      mergedInt.length !== prevInt.length ||
      mergedInt.some((n, i) => n !== prevInt[i]);
    if (extChanged || intChanged) {
      const currentIndex = await getCurrentAccountIndex();
      const accounts = await getStorage(STORAGE.accounts);
      if (accounts?.[currentIndex]) {
        if (!Array.isArray(accounts[currentIndex].userExternalIndices)) {
          accounts[currentIndex].userExternalIndices = prevExt;
        }
        accounts[currentIndex].externalIndices = mergedExt;
        accounts[currentIndex].internalIndices = mergedInt;
        await setStorage({ [STORAGE.accounts]: { ...accounts } });
        invalidateReadCache();
        currentAccount = await getCurrentAccount();
        rows = listEnabledPaymentAddresses(
          Loader.Cardano,
          currentAccount,
          networkId
        );
      }
    }
  }

  if (rows.length === 0) return [];

  // Prefer stake-UTxO totals for funded addresses; `/address_info` only for the rest
  // (user-activated empties). Avoids false "empty" rows that the display filter drops.
  const needInfo = rows
    .map((r) => r.paymentAddr)
    .filter((addr) => addr && !fundedByAddr.has(addr));
  const byAddrInfo = new Map();
  if (needInfo.length > 0) {
    try {
      const infoReq = KOIOS_REQUESTS.getAddressesInfo(needInfo);
      const infoRows = await koiosRequest(infoReq.endpoint, {}, infoReq.body);
      if (Array.isArray(infoRows)) {
        for (const row of infoRows) {
          if (row?.address) byAddrInfo.set(row.address, row);
        }
      }
    } catch (error) {
      console.warn(
        'Accounts address_info enrich failed:',
        error?.message || error
      );
    }
  }

  const details = rows.map((row) => {
    const funded = fundedByAddr.get(row.paymentAddr);
    if (funded) {
      const summary = summarizeUtxosByAddressEntry(funded);
      return {
        ...row,
        lovelace: summary.lovelace,
        utxoCount: summary.utxoCount,
        nativeAssetCount: summary.nativeAssetCount,
      };
    }
    const summary = summarizeAddressInfo(byAddrInfo.get(row.paymentAddr));
    return {
      ...row,
      lovelace: summary.lovelace,
      utxoCount: summary.utxoCount,
      nativeAssetCount: summary.nativeAssetCount,
    };
  });

  // Stake UTxOs on addresses we could not map to a known index (e.g. missing
  // account publicKey, or index beyond the scan cap) still belong in the list.
  if (accountsDisplay && fundedByAddr.size > 0) {
    const listed = new Set(details.map((row) => row.paymentAddr));
    for (const [addr, funded] of fundedByAddr) {
      if (listed.has(addr)) continue;
      const summary = summarizeUtxosByAddressEntry(funded);
      details.push({
        role: ADDRESS_ROLE.external,
        index: null,
        paymentAddr: addr,
        paymentKeyHash: null,
        lovelace: summary.lovelace,
        utxoCount: summary.utxoCount,
        nativeAssetCount: summary.nativeAssetCount,
      });
    }
  }

  if (!accountsDisplay) return details;
  return filterPaymentAddressesForAccountsDisplay(details, currentAccount);
};

export const getTransactions = async (paginate = 1, count = 10, { force = false } = {}) => {
  const network = await getNetwork();
  const stakeAddress = await getRewardAddress();
  // The bounded fetch returns the same leading 100 txs regardless of the UI's
  // local paging cursor, so a single per-account/network cache entry is safe.
  return withCache(
    cacheKey('account-txs', network?.id, stakeAddress),
    () => fetchTransactions(stakeAddress),
    { force }
  );
};

const fetchTransactions = async (stakeAddress) => {
  const request = KOIOS_REQUESTS.getAccountTxs(stakeAddress, 0);
  // Bound the Koios direct-path response (mainnet accounts can have thousands of
  // txs; an unbounded fetch is slow/huge and makes the history "load forever").
  // `order`/`limit` are PostgREST reserved params Koios honours; the Blockfrost
  // adapter ignores them and self-caps at 100.
  const boundedEndpoint = `${request.endpoint}&order=block_height.desc&limit=100`;

  // Never let a hung/slow provider stall the history spinner indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let result;
  try {
    result = await koiosRequest(
      boundedEndpoint,
      {},
      request.body,
      controller.signal
    );
  } catch (error) {
    console.warn('getTransactions failed:', error?.message || error);
    return [];
  } finally {
    clearTimeout(timeout);
  }

  if (!result || result.error) return [];
  
  let processedTransactions = result.map(tx => ({
    txHash: tx.tx_hash,
    blockHeight: tx.block_height,
    epochNo: tx.epoch_no,
    epochSlot: tx.epoch_slot,
    absoluteSlot: tx.absolute_slot,
    txTimestamp: tx.tx_timestamp,
    txBlockIndex: tx.tx_block_index,
    txSize: tx.tx_size,
    totalOutput: tx.total_output,
    fee: tx.fee,
    deposit: tx.deposit,
    invalidBefore: tx.invalid_before,
    invalidAfter: tx.invalid_after,
    collateralInputs: tx.collateral_inputs,
    collateralOutput: tx.collateral_output,
    referenceInputs: tx.reference_inputs,
    inputs: tx.inputs || [],
    outputs: tx.outputs || [],
    withdrawals: tx.withdrawals || [],
    assetsMinted: tx.assets_minted || [],
    metadata: tx.metadata,
    certificates: tx.certificates || [],
    nativeScripts: tx.native_scripts || [],
    plutusContracts: tx.plutus_contracts || [],
    votingProcedures: tx.voting_procedures || [],
    proposalProcedures: tx.proposal_procedures || []
  }));
  
  return processedTransactions;
};

/**
 * Cached fiat price lookup. Previously each wallet mount refetched the rate
 * (it lived only in a component ref), so returning to the wallet always
 * re-hit the provider. Cached per-currency with the shared TTL.
 */
export const getFiatPrice = async (currency, { force = false } = {}) =>
  withCache(
    cacheKey('fiat-price', currency),
    () => provider.api.price(currency),
    { force }
  );

export const getTxInfo = async (txHash) => {
  const request = KOIOS_REQUESTS.getTxInfo(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  return result[0];
};

export const getBlock = async (blockHashOrNumb) => {
  let request;
  let result;
  
  // Check if it's a block height (number) or block hash (string)
  if (typeof blockHashOrNumb === 'number' || !isNaN(blockHashOrNumb)) {
    request = KOIOS_REQUESTS.getBlockByHeight(blockHashOrNumb);
    result = await koiosRequest(request.endpoint, {}, request.body);
  } else {
    request = KOIOS_REQUESTS.getBlockByHash(blockHashOrNumb);
    result = await koiosRequest(request.endpoint, {}, request.body);
  }
  
  if (!result || result.error || result.length === 0) return null;
  return result[0];
};

// Helper function to convert Koios UTXO format to expected format
const convertKoiosUtxosToExpectedFormat = (koiosUtxos) => {
  if (!koiosUtxos) return null;
  const normalizeAddress = (utxo) =>
    utxo.payment_addr?.bech32 ||
    utxo.address ||
    utxo.payment_addr ||
    utxo.stake_address ||
    utxo.stake_addr?.bech32 ||
    utxo.stake_addr ||
    null;
  
  return {
    inputs: (koiosUtxos.inputs || []).map(input => ({
      address: normalizeAddress(input),
      stake_address: input.stake_addr || input.stake_address || input.stake_addr?.bech32,
      tx_hash: input.tx_hash,
      tx_index: input.tx_index,
      value: input.value,
      asset_list: input.asset_list || [],
      datum_hash: input.datum_hash,
      inline_datum: input.inline_datum,
      reference_script: input.reference_script
    })),
    outputs: (koiosUtxos.outputs || []).map(output => ({
      address: normalizeAddress(output),
      stake_address: output.stake_addr || output.stake_address || output.stake_addr?.bech32,
      tx_hash: output.tx_hash,
      tx_index: output.tx_index,
      value: output.value,
      asset_list: output.asset_list || [],
      datum_hash: output.datum_hash,
      inline_datum: output.inline_datum,
      reference_script: output.reference_script
    }))
  };
};

export const getTxUTxOs = async (txHash) => {
  const request = KOIOS_REQUESTS.getTxUtxos(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  
  // Convert Koios format to expected format
  const converted = convertKoiosUtxosToExpectedFormat(result[0]);
  return converted;
};

export const getTxMetadata = async (txHash) => {
  const request = KOIOS_REQUESTS.getTxMetadata(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  return result[0];
};

// Helper function to convert Koios transaction format to expected format
const convertKoiosTxToExpectedFormat = (koiosTx) => {
  if (!koiosTx) return null;
  
  // Calculate transaction type indicators from certificates and other data
  const certificates = koiosTx.certificates || [];
  const withdrawals = koiosTx.withdrawals || [];
  const assetsMinted = koiosTx.assets_minted || [];
  const plutusContracts = koiosTx.plutus_contracts || [];
  
  // Count different types of certificates
  const delegationCount = certificates.filter(cert => 
    cert.cert_type === 'delegation' || cert.cert_type === 'deleg_reg'
  ).length;
  
  const stakeCertCount = certificates.filter(cert => 
    cert.cert_type === 'stake_registration' || cert.cert_type === 'stake_deregistration'
  ).length;
  
  const poolRetireCount = certificates.filter(cert => 
    cert.cert_type === 'pool_retirement'
  ).length;
  
  const poolUpdateCount = certificates.filter(cert => 
    cert.cert_type === 'pool_registration' || cert.cert_type === 'pool_update'
  ).length;
  
  // Count other transaction types
  const withdrawalCount = withdrawals.length;
  const assetMintOrBurnCount = assetsMinted.length;
  const redeemerCount = plutusContracts.reduce((count, contract) => 
    count + (contract.redeemers ? contract.redeemers.length : 0), 0
  );
  
  return {
    // Basic transaction info
    tx_hash: koiosTx.tx_hash,
    block_height: koiosTx.block_height,
    block_hash: koiosTx.block_hash,
    epoch_no: koiosTx.epoch_no,
    epoch_slot: koiosTx.epoch_slot,
    absolute_slot: koiosTx.absolute_slot,
    tx_timestamp: koiosTx.tx_timestamp,
    tx_block_index: koiosTx.tx_block_index,
    tx_size: koiosTx.tx_size,
    
    // Financial info
    total_output: koiosTx.total_output,
    fee: koiosTx.fee,
    treasury_donation: koiosTx.treasury_donation,
    deposit: koiosTx.deposit,
    
    // Validity
    invalid_before: koiosTx.invalid_before,
    invalid_after: koiosTx.invalid_after,
    
    // UTXOs
    inputs: koiosTx.inputs || [],
    outputs: koiosTx.outputs || [],
    
    // Additional data
    collateral_inputs: koiosTx.collateral_inputs,
    collateral_output: koiosTx.collateral_output,
    reference_inputs: koiosTx.reference_inputs,
    withdrawals: koiosTx.withdrawals,
    assets_minted: koiosTx.assets_minted,
    certificates: koiosTx.certificates,
    native_scripts: koiosTx.native_scripts,
    plutus_contracts: koiosTx.plutus_contracts,
    
    // Legacy field names for compatibility
    fees: koiosTx.fee,
    valid_contract: true, // Default to true for now
    
    // Transaction type detection fields
    redeemer_count: redeemerCount,
    withdrawal_count: withdrawalCount,
    delegation_count: delegationCount,
    asset_mint_or_burn_count: assetMintOrBurnCount,
    stake_cert_count: stakeCertCount,
    pool_retire_count: poolRetireCount,
    pool_update_count: poolUpdateCount
  };
};

export const updateTxInfo = async (txHash) => {
  const currentAccount = await getCurrentAccount();
  const network = await getNetwork();

  let detail = await currentAccount[network.id].history.details[txHash];

  if (typeof detail !== 'object' || !detail.info || !detail.block || !detail.utxos || !detail.metadata) {
    detail = {};
    
    // Get transaction info
    const info = await getTxInfo(txHash);
    
    if (info) {
      // Convert Koios format to expected format
      detail.info = convertKoiosTxToExpectedFormat(info);
      
      // Get block info if we have block height
      if (info.block_height) {
        detail.block = await getBlock(info.block_height);
      }
    }
    
    // Get transaction UTXOs
    const uTxOs = await getTxUTxOs(txHash);
    
    if (uTxOs) {
      detail.utxos = uTxOs;
    }
    
    // Get transaction metadata
    const metadata = await getTxMetadata(txHash);
    if (metadata) {
      detail.metadata = metadata;
    }
  }

  return detail;
};

export const setTxDetail = async (txObject) => {
  const currentIndex = await getCurrentAccountIndex();
  const network = await getNetwork();
  const accounts = await getStorage(STORAGE.accounts);
  for (const txHash of Object.keys(txObject)) {
    const txDetail = txObject[txHash];
    accounts[currentIndex][network.id].history.details[txHash] = txDetail;
    await setStorage({
      [STORAGE.accounts]: {
        ...accounts,
      },
    });
    delete txObject[txHash];
  }
  return true;
};

export const getSpecificUtxo = async (txHash, txId) => {
  const request = KOIOS_REQUESTS.getTxUtxos(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  return result[0].outputs[txId];
};

/**
 *
 * @param {string} amount - cbor value
 * @param {Object} paginate
 * @param {number} paginate.page
 * @param {number} paginate.limit
 * @returns
 */
export const getUtxos = async (amount = undefined, paginate = undefined) => {
  const currentAccount = await getCurrentAccount();
  const paymentAddresses = await getEnabledPaymentAddresses();
  const addressList = paymentAddresses.map((a) => a.paymentAddr).filter(Boolean);
  const stakeAddress = await getAccountStakeAddress();

  let result;
  if (stakeAddress) {
    // Extended UTxOs include asset_list (Koios drops tokens when false).
    const request = KOIOS_REQUESTS.getAccountUtxos(stakeAddress, true);
    result = await koiosRequest(request.endpoint, {}, request.body);
  } else {
    if (addressList.length === 0) return [];
    const request = KOIOS_REQUESTS.getAddressesUtxos(addressList, true);
    result = await koiosRequest(request.endpoint, {}, request.body);
  }

  if (result?.error) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return [];
  }

  let utxos = Array.isArray(result) ? result : [];

  if (currentAccount.collateral) {
    utxos = utxos.filter(
      (utxo) =>
        !(
          utxo.tx_hash === currentAccount.collateral.txHash &&
          (utxo.output_index ?? utxo.tx_index) === currentAccount.collateral.txId
        )
    );
  }

  const fallbackOwner = addressList[0] || currentAccount.paymentAddr;

  // Spend only from addresses we can witness (enabled external + change).
  // Balance aggregation still uses the full stake set via getBalance.
  const enabledOwners = new Set(addressList.filter(Boolean));
  if (enabledOwners.size > 0) {
    utxos = utxos.filter((utxo) =>
      enabledOwners.has(utxo.address || fallbackOwner)
    );
  }

  let convertedUtxos = await Promise.all(
    utxos.map(async (utxo) => {
      const owner = utxo.address || fallbackOwner;
      const formattedUtxo = {
        tx_hash: utxo.tx_hash,
        output_index: utxo.output_index ?? utxo.tx_index,
        amount: [
          { unit: 'lovelace', quantity: utxo.value || '0' },
          ...(utxo.asset_list || []).map((asset) => ({
            unit: asset.policy_id + asset.asset_name,
            quantity: asset.quantity || '0',
          })),
        ],
      };

      return await utxoFromJson(formattedUtxo, owner);
    })
  );

  // filter utxos
  if (amount) {
    await Loader.load();
    let filterValue;
    try {
      filterValue = Loader.Cardano.Value.from_bytes(Buffer.from(amount, 'hex'));
    } catch (e) {
      throw APIError.InvalidRequest;
    }

    convertedUtxos = convertedUtxos.filter(
      (unspent) =>
        !compareValues(unspent.output().amount(), filterValue) ||
        compareValues(unspent.output().amount(), filterValue) !== -1
    );
  }

  if ((amount || paginate) && convertedUtxos.length <= 0) {
    return null;
  }
  return convertedUtxos;
};

/**
 * Clear stale reserved collateral when the UTxO is no longer on-chain.
 * Mutates `currentAccount[network.id].collateral` in place.
 * @returns {boolean} true when collateral was cleared (caller should persist)
 */
const checkCollateral = async (currentAccount, network, checkTx) => {
  const reserved = currentAccount[network.id].collateral;
  if (!reserved) return false;

  if (checkTx) {
    const transactions = await getTransactions();
    if (
      transactions.length <= 0 ||
      currentAccount[network.id].history.confirmed.includes(
        transactions[0].txHash
      )
    ) {
      return false;
    }
  }

  const address = await getAddress();
  const request = KOIOS_REQUESTS.getAddressInfo(address);
  const result = await koiosRequest(request.endpoint, {}, request.body);

  if (result.error || !result[0]) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return false;
  }

  const utxos = result[0].utxo_set || [];
  if (!isReservedCollateralPresent(utxos, reserved)) {
    delete currentAccount[network.id].collateral;
    return true;
  }
  return false;
};

const decodeCollateralCoinCbor = (hex) => {
  const bytes = Buffer.from(hex, 'hex');
  try {
    return BigInt(Loader.Cardano.BigNum.from_bytes(bytes).to_str());
  } catch (_) {
    // fall through — some dApps send a CBOR Value instead of a bare Coin
  }
  try {
    return BigInt(Loader.Cardano.Value.from_bytes(bytes).coin().to_str());
  } catch (_) {
    throw new Error('could not parse collateral amount');
  }
};

/**
 * CIP-30 getCollateral (deprecated; prefer CIP-40 collateral return).
 * @param {{ amount?: string|number }|string|number|undefined} params
 * @returns {Promise<import('@emurgo/cardano-serialization-lib-browser').TransactionUnspentOutput[]|null>}
 */
export const getCollateral = async (params) => {
  await Loader.load();
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const currentAccount = accounts[currentIndex];
  const network = await getNetwork();
  if (await checkCollateral(currentAccount, network, true)) {
    await setStorage({ [STORAGE.accounts]: accounts });
  }

  const amountRaw =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params.amount
      : params;

  let minLovelace;
  try {
    minLovelace = parseCollateralAmount(amountRaw, {
      decodeCoin: decodeCollateralCoinCbor,
    });
  } catch (e) {
    throw {
      ...APIError.InvalidRequest,
      info: e?.message || APIError.InvalidRequest.info,
    };
  }

  const collateral = currentAccount[network.id].collateral;
  if (collateral) {
    const reservedCoin = BigInt(collateral.lovelace.toString());
    if (reservedCoin >= minLovelace) {
      return [
        Loader.Cardano.TransactionUnspentOutput.new(
          Loader.Cardano.TransactionInput.new(
            Loader.Cardano.TransactionHash.from_bytes(
              Buffer.from(collateral.txHash, 'hex')
            ),
            parseInt(collateral.txId, 10)
          ),
          Loader.Cardano.TransactionOutput.new(
            Loader.Cardano.Address.from_bech32(
              currentAccount[network.id].paymentAddr
            ),
            Loader.Cardano.Value.new(
              Loader.Cardano.BigNum.from_str(collateral.lovelace.toString())
            )
          )
        ),
      ];
    }
  }

  const utxos = await getUtxos();
  if (!utxos || utxos.length <= 0) return null;

  const candidates = utxos.map((utxo) => {
    const amt = utxo.output().amount();
    const ma = amt.multiasset();
    return {
      coin: BigInt(amt.coin().to_str()),
      multiassetLen: ma ? ma.len() : 0,
      utxo,
    };
  });

  const selected = selectCollateralCandidates(candidates, minLovelace);
  if (!selected) {
    if (minLovelace === MAX_COLLATERAL_AMOUNT && amountRaw == null) {
      // Back-compat: no amount requested and nothing suitable → empty list
      // (legacy Nami behavior) rather than null.
      return [];
    }
    return null;
  }
  return selected;
};

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
 * @param {object} account
 * @param {{ networkKeys?: string[] }} [options]
 * @returns {{ externalIndices: number[], internalIndices: number[] }}
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
    } catch (error) {
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
      } catch (error) {
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
 * @returns {{ externalIndices: number[], internalIndices: number[] }}
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
  } catch (error) {
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
  } catch (e) {
    drepIdCip129 = '';
  }
  try {
    drepIdLegacy = drep.to_bech32(false);
  } catch (e) {
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

export const getCurrentAccountIndex = () => getStorage(STORAGE.currentAccount);

export const getNetwork = () => getStorage(STORAGE.network);

export const setNetwork = async (network) => {
  const currentNetwork = await getNetwork();
  let id;
  let node;
  if (network.id === NETWORK_ID.mainnet) {
    id = NETWORK_ID.mainnet;
    node = NODE.mainnet;
  } else if (network.id === NETWORK_ID.testnet) {
    id = NETWORK_ID.testnet;
    node = NODE.testnet;
  } else if (network.id === NETWORK_ID.preview) {
    id = NETWORK_ID.preview;
    node = NODE.preview;
  } else {
    id = NETWORK_ID.preprod;
    node = NODE.preprod;
  }
  if (network.node) node = network.node;
  if (currentNetwork && currentNetwork.id !== id)
    emitNetworkChange(networkNameToId(id));
  await setStorage({
    [STORAGE.network]: {
      id,
      node,
      mainnetSubmit: network.mainnetSubmit,
      testnetSubmit: network.testnetSubmit,
    },
  });
  return true;
};

const accountToNetworkSpecific = (account, network) => {
  const assets = account[network.id].assets;
  const lovelace = account[network.id].lovelace;
  const history = account[network.id].history;
  const minAda = account[network.id].minAda;
  const collateral = account[network.id].collateral;
  const recentSendToAddresses = account[network.id].recentSendToAddresses;
  const paymentAddr = account[network.id].paymentAddr;
  const rewardAddr = account[network.id].rewardAddr;

  return {
    ...account,
    paymentAddr,
    rewardAddr,
    assets,
    lovelace,
    minAda,
    collateral,
    history,
    recentSendToAddresses,
  };
};

/** Returns account with network specific settings (e.g. address, reward address, etc.) */
export const getCurrentAccount = async () => {
  const currentAccountIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const network = await getNetwork();
  return accountToNetworkSpecific(accounts[currentAccountIndex], network);
};

/** True when encrypted storage has at least one account (wallet bootstrap / routing). */
export const hasStoredAccounts = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  return (
    accounts != null &&
    typeof accounts === 'object' &&
    Object.keys(accounts).length > 0
  );
};

/** Returns accounts with network specific settings (e.g. address, reward address, etc.) */
export const getAccounts = async () => {
  const accounts = await getStorage(STORAGE.accounts);
  if (!accounts || typeof accounts !== 'object') {
    return {};
  }
  const network = await getNetwork();
  for (const index in accounts) {
    accounts[index] = await accountToNetworkSpecific(accounts[index], network);
  }
  return accounts;
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

export const pushKeystoneSignPayload = async (payload) => {
  const signId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prev = (await getStorage(STORAGE.keystoneTxPending)) || {};
  await setStorage({
    [STORAGE.keystoneTxPending]: {
      ...prev,
      [signId]: { ...payload, created: Date.now() },
    },
  });
  return signId;
};

export const takeKeystoneSignPayload = async (signId) => {
  const prev = (await getStorage(STORAGE.keystoneTxPending)) || {};
  const data = prev[signId];
  if (!data) return null;
  const next = { ...prev };
  delete next[signId];
  await setStorage({ [STORAGE.keystoneTxPending]: next });
  return data;
};

/** Air-gapped Keystone: opens full tab with QR flow; payload is removed when consumed. */
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

const harden = (num) => {
  return 0x80000000 + num;
};

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
      } catch (e) {
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
          } catch (e2) {
        console.log('Hex parsing failed:', e2);
        // Both parsing methods failed
        return false;
      }
    }
  console.log('Address validation failed - returning false');
  return false;
};

const isValidAddressBytes = async (address) => {
  await Loader.load();
  const network = await getNetwork();
  try {
    const addr = Loader.Cardano.Address.from_bytes(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 &&
        (network.id === NETWORK_ID.testnet ||
          network.id === NETWORK_ID.preview ||
          network.id === NETWORK_ID.preprod))
    )
      return true;
    return false;
  } catch (e) {}
  try {
    const addr = Loader.Cardano.ByronAddress.from_bytes(address);
    if (
      (addr.network_id() === 1 && network.id === NETWORK_ID.mainnet) ||
      (addr.network_id() === 0 &&
        (network.id === NETWORK_ID.testnet ||
          network.id === NETWORK_ID.preview ||
          network.id === NETWORK_ID.preprod))
    )
      return true;
    return false;
  } catch (e) {}
  return false;
};

export const isValidEthAddress = function (address) {
  return isAddress(address);
};

const DREP_ID_HEX_RE = /^[0-9a-f]{56}$/i;

export const extractKeyHash = async (address) => {
  await Loader.load();
  if (DREP_ID_HEX_RE.test(address)) {
    return `drep_vkh${address.toLowerCase()}`;
  }
  if (!(await isValidAddressBytes(Buffer.from(address, 'hex'))))
    throw DataSignError.InvalidFormat;
  try {
    const addr = Loader.Cardano.BaseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('addr_vkh');
  } catch (e) {}
  try {
    const addr = Loader.Cardano.EnterpriseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('addr_vkh');
  } catch (e) {}
  try {
    const addr = Loader.Cardano.PointerAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('addr_vkh');
  } catch (e) {}
  try {
    const addr = Loader.Cardano.RewardAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    return addr.payment_cred().to_keyhash().to_bech32('stake_vkh');
  } catch (e) {}
  throw DataSignError.AddressNotPK;
};

const deriveAccountDRepPrivateKey = (accountKey) => accountKey.derive(3).derive(0).to_raw_key();

const deriveAccountStakePublicKeyHex = (accountPublicKeyHex) => {
  const stakeKey = Loader.Cardano.Bip32PublicKey.from_hex(accountPublicKeyHex)
    .derive(2)
    .derive(0)
    .to_raw_key();
  return Buffer.from(stakeKey.as_bytes()).toString('hex');
};

const deriveAccountDRepPublicKeyHex = (accountPublicKeyHex) => {
  const drepKey = Loader.Cardano.Bip32PublicKey.from_hex(accountPublicKeyHex)
    .derive(3)
    .derive(0)
    .to_raw_key();
  return Buffer.from(drepKey.as_bytes()).toString('hex');
};

export const extractKeyOrScriptHash = async (address) => {
  console.log('extractKeyOrScriptHash', address);
  await Loader.load();
  if (!(await isValidAddressBytes(Buffer.from(address, 'hex'))))
    throw DataSignError.InvalidFormat;
  try {
    const addr = Loader.Cardano.BaseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );

    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('addr_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (e) {}
  try {
    const addr = Loader.Cardano.EnterpriseAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('addr_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (e) {}
  try {
    const addr = Loader.Cardano.PointerAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('addr_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (e) {}
  try {
    const addr = Loader.Cardano.RewardAddress.from_address(
      Loader.Cardano.Address.from_bytes(Buffer.from(address, 'hex'))
    );
    const credential = addr.payment_cred();
    if (credential.kind() === 0)
      return credential.to_keyhash().to_bech32('stake_vkh');
    if (credential.kind() === 1)
      return credential.to_scripthash().to_bech32('script');
  } catch (e) {}
  throw new Error('No address type matched.');
};

export const verifySigStructure = async (sigStructure) => {
  await Loader.load();
  try {
    Loader.Message.SigStructure.from_bytes(Buffer.from(sigStructure, 'hex'));
  } catch (e) {
    throw DataSignError.InvalidFormat;
  }
};

export const verifyPayload = (payload) => {
  if (Buffer.from(payload, 'hex').length <= 0)
    throw DataSignError.InvalidFormat;
};

export const verifyTx = async (tx) => {
  await Loader.load();
  const network = await getNetwork();
  try {
    const parseTx = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
    let networkId = parseTx.body().network_id()
      ? parseTx.body().network_id().network()
      : null;
    if (!networkId && networkId != 0) {
      networkId = parseTx.body().outputs().get(0).address().network_id();
    }
    if (networkId != networkNameToId(network.id)) throw Error('Wrong network');
  } catch (e) {
    throw APIError.InvalidRequest;
  }
};

/**
 * @param {string} address - cbor
 * @param {string} payload - hex encoded utf8 string
 * @param {string} password
 * @param {number} accountIndex
 * @returns
 */

//deprecated soon
export const signData = async (address, payload, password, accountIndex) => {
  await Loader.load();
  const keyHash = await extractKeyHash(address);
  const prefix = keyHash.startsWith('addr_vkh')
    ? 'addr_vkh'
    : keyHash.startsWith('drep_vkh')
      ? 'drep_vkh'
      : 'stake_vkh';
  const sdAccounts = await getStorage(STORAGE.accounts);
  const sdAccount = sdAccounts?.[accountIndex];
  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    sdAccount?.derivationIndex ?? accountIndex,
    sdAccount?.walletId ?? null
  );
  let drepKey = deriveAccountDRepPrivateKey(accountKey);
  const signingKey =
    prefix === 'addr_vkh' ? paymentKey : prefix === 'drep_vkh' ? drepKey : stakeKey;

  const publicKey = signingKey.to_public();
  if (keyHash !== publicKey.hash().to_bech32(prefix))
    throw DataSignError.ProofGeneration;

  const protectedHeaders = Loader.Message.HeaderMap.new();
  protectedHeaders.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  protectedHeaders.set_key_id(publicKey.as_bytes());
  protectedHeaders.set_header(
    Loader.Message.Label.new_text('address'),
    Loader.Message.CBORValue.new_bytes(Buffer.from(address, 'hex'))
  );
  const protectedSerialized =
    Loader.Message.ProtectedHeaderMap.new(protectedHeaders);
  const unprotectedHeaders = Loader.Message.HeaderMap.new();
  const headers = Loader.Message.Headers.new(
    protectedSerialized,
    unprotectedHeaders
  );
  const builder = Loader.Message.COSESign1Builder.new(
    headers,
    Buffer.from(payload, 'hex'),
    false
  );
  const toSign = builder.make_data_to_sign().to_bytes();

  const signedSigStruc = signingKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

  accountKey.free();
  accountKey = null;
  drepKey.free();
  drepKey = null;
  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  return Buffer.from(coseSign1.to_bytes(), 'hex').toString('hex');
};

export const signDataCIP30 = async (
  address,
  payload,
  password,
  accountIndex
) => {
  await Loader.load();
  const keyHash = await extractKeyHash(address);
  const prefix = keyHash.startsWith('addr_vkh')
    ? 'addr_vkh'
    : keyHash.startsWith('drep_vkh')
      ? 'drep_vkh'
      : 'stake_vkh';
  const cip30Accounts = await getStorage(STORAGE.accounts);
  const cip30Account = cip30Accounts?.[accountIndex];
  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    cip30Account?.derivationIndex ?? accountIndex,
    cip30Account?.walletId ?? null
  );
  let drepKey = deriveAccountDRepPrivateKey(accountKey);
  const signingKey =
    prefix === 'addr_vkh' ? paymentKey : prefix === 'drep_vkh' ? drepKey : stakeKey;

  const publicKey = signingKey.to_public();
  if (keyHash !== publicKey.hash().to_bech32(prefix))
    throw DataSignError.ProofGeneration;
  const protectedHeaders = Loader.Message.HeaderMap.new();
  protectedHeaders.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  // protectedHeaders.set_key_id(publicKey.to_raw_bytes()); // Removed to adhere to CIP-30
  protectedHeaders.set_header(
    Loader.Message.Label.new_text('address'),
    Loader.Message.CBORValue.new_bytes(
      Buffer.from(
        prefix === 'drep_vkh' ? publicKey.hash().to_hex() : address,
        'hex'
      )
    )
  );
  const protectedSerialized =
    Loader.Message.ProtectedHeaderMap.new(protectedHeaders);
  const unprotectedHeaders = Loader.Message.HeaderMap.new();
  const headers = Loader.Message.Headers.new(
    protectedSerialized,
    unprotectedHeaders
  );
  const builder = Loader.Message.COSESign1Builder.new(
    headers,
    Buffer.from(payload, 'hex'),
    false
  );
  const toSign = builder.make_data_to_sign().to_bytes();

  const signedSigStruc = signingKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

  accountKey.free();
  accountKey = null;
  drepKey.free();
  drepKey = null;
  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  const key = Loader.Message.COSEKey.new(
    Loader.Message.Label.from_key_type(Loader.Message.KeyType.OKP)
  );
  key.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  key.set_header(
    Loader.Message.Label.new_int(
      Loader.Message.Int.new_negative(Loader.Message.BigNum.from_str('1'))
    ),
    Loader.Message.CBORValue.new_int(
      Loader.Message.Int.new_i32(6) //Loader.Message.CurveType.Ed25519
    )
  ); // crv (-1) set to Ed25519 (6)
  key.set_header(
    Loader.Message.Label.new_int(
      Loader.Message.Int.new_negative(Loader.Message.BigNum.from_str('2'))
    ),
    Loader.Message.CBORValue.new_bytes(publicKey.as_bytes())
  ); // x (-2) set to public key

  return {
    signature: Buffer.from(coseSign1.to_bytes()).toString('hex'),
    key: Buffer.from(key.to_bytes()).toString('hex'),
  };
};

/**
 *
 * @param {string} tx - cbor hex string
 * @param {Array<string>} keyHashes
 * @param {string} password
 * @returns {Promise<string>} witness set as hex string
 */
export const signTx = async (
  tx,
  keyHashes,
  password,
  accountIndex,
  partialSign = false
) => {
  await Loader.load();
  // `accountIndex` is the storage slot. Resolve the seed + CIP-1852 index it maps
  // to so multi-seed accounts sign with the correct root key (legacy accounts
  // fall back to slot == derivation index, walletId "0").
  const accounts = await getStorage(STORAGE.accounts);
  const account = accounts?.[accountIndex];
  const derivationIndex = account?.derivationIndex ?? accountIndex;
  const walletId = account?.walletId ?? null;
  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    derivationIndex,
    walletId
  );
  let drepKey = deriveAccountDRepPrivateKey(accountKey);
  const paymentKeyHash = paymentKey.to_public().hash().to_hex();
  const stakeKeyHash = stakeKey.to_public().hash().to_hex();
  const drepKeyHash = drepKey.to_public().hash().to_hex();

  const keyMap = new Map([
    [paymentKeyHash, paymentKey],
    [stakeKeyHash, stakeKey],
    [drepKeyHash, drepKey],
  ]);

  // Advanced multi-address: include payment keys for every enabled external and
  // internal (change) index so inputs on those addresses can be witnessed.
  const extraPaymentKeys = [];
  for (const addressIndex of getExternalIndices(account).filter((i) => i !== 0)) {
    const extraKey = accountKey.derive(0).derive(addressIndex).to_raw_key();
    extraPaymentKeys.push(extraKey);
    keyMap.set(extraKey.to_public().hash().to_hex(), extraKey);
  }
  for (const addressIndex of getInternalIndices(account)) {
    const extraKey = accountKey.derive(1).derive(addressIndex).to_raw_key();
    extraPaymentKeys.push(extraKey);
    keyMap.set(extraKey.to_public().hash().to_hex(), extraKey);
  }

  let txWitnessSet;
  try {
    txWitnessSet = buildVkeyWitnessSet(
      Loader.Cardano,
      tx,
      keyMap,
      keyHashes,
      partialSign
    );
  } catch {
    throw TxSignError.ProofGeneration;
  } finally {
    accountKey.free();
    drepKey.free();
    stakeKey.free();
    paymentKey.free();
    extraPaymentKeys.forEach((k) => {
      try {
        k.free();
      } catch (_) {
        /* ignore */
      }
    });
  }

  return txWitnessSet;
};

export const signTxHW = async (
  tx,
  keyHashes,
  account,
  hw,
  partialSign = false
) => {
  await Loader.load();
  const rawTx = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));
  const address = Loader.Cardano.Address.from_bech32(account.paymentAddr);
  const network = address.network_id();
  const keys = {
    payment: { hash: null, path: null },
    stake: { hash: null, path: null },
  };
  if (hw.device === HW.ledger) {
    const appAda = hw.appAda;
    const networkId = network;
    const paymentIndexByHash = {};
    if (account?.publicKey) {
      for (const row of listEnabledPaymentAddresses(
        Loader.Cardano,
        account,
        networkId
      )) {
        paymentIndexByHash[row.paymentKeyHash] = {
          index: row.index,
          role: row.role ?? ADDRESS_ROLE.external,
        };
      }
    } else {
      paymentIndexByHash[account.paymentKeyHash] = {
        index: 0,
        role: ADDRESS_ROLE.external,
      };
    }
    keyHashes.forEach((keyHash) => {
      if (paymentIndexByHash[keyHash] != null) {
        const { index: addrIdx, role } = paymentIndexByHash[keyHash];
        keys.payment = {
          hash: keyHash,
          path: [
            HARDENED + 1852,
            HARDENED + 1815,
            HARDENED + hw.account,
            role,
            addrIdx,
          ],
        };
      } else if (keyHash === account.stakeKeyHash)
        keys.stake = {
          hash: keyHash,
          path: [HARDENED + 1852, HARDENED + 1815, HARDENED + hw.account, 2, 0],
        };
      else if (!partialSign) throw TxSignError.ProofGeneration;
      else return;
    });
    const ledgerTx = await txToLedger(
      rawTx,
      network,
      keys,
      Buffer.from(address.to_bytes()).toString('hex'),
      hw.account
    );
    const result = await appAda.signTransaction({
      ...ledgerTx,
      options: {
        tagCborSets: hasTaggedSets(tx)
      }
    });
    // getting public keys
    const witnessSet = Loader.Cardano.TransactionWitnessSet.new();
    const vkeys = Loader.Cardano.Vkeywitnesses.new();
    result.witnesses.forEach((witness) => {
      const role = witness.path[3];
      if (role === 0 || role === 1) {
        const addrIdx = witness.path[4] != null ? witness.path[4] : 0;
        const vkey = Loader.Cardano.Bip32PublicKey.from_hex(
          account.publicKey
        )
          .derive(role)
          .derive(addrIdx)
          .to_raw_key();
        const signature = Loader.Cardano.Ed25519Signature.from_hex(
          witness.witnessSignatureHex
        );
        vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
      } else if (
        role == 2 // stake key
      ) {
        const vkey = Loader.Cardano.Bip32PublicKey.from_hex(
          account.publicKey
        )
          .derive(2)
          .derive(0)
          .to_raw_key();
        const signature = Loader.Cardano.Ed25519Signature.from_hex(
          witness.witnessSignatureHex
        );
        vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
      }
    });
    witnessSet.set_vkeys(vkeys);
    return witnessSet;
  }
  if (hw.device === HW.keystone) {
    throw new Error('Keystone signing runs in the Keystone signing tab.');
  }
  if (hw.device === HW.trezor) {
    const paymentIndexByHash = {};
    if (account?.publicKey) {
      for (const row of listEnabledPaymentAddresses(
        Loader.Cardano,
        account,
        network
      )) {
        paymentIndexByHash[row.paymentKeyHash] = {
          index: row.index,
          role: row.role ?? ADDRESS_ROLE.external,
        };
      }
    } else {
      paymentIndexByHash[account.paymentKeyHash] = {
        index: 0,
        role: ADDRESS_ROLE.external,
      };
    }
    keyHashes.forEach((keyHash) => {
      if (paymentIndexByHash[keyHash] != null) {
        const { index: addrIdx, role } = paymentIndexByHash[keyHash];
        keys.payment = {
          hash: keyHash,
          path: `m/1852'/1815'/${hw.account}'/${role}/${addrIdx}`,
        };
      } else if (keyHash === account.stakeKeyHash)
        keys.stake = {
          hash: keyHash,
          path: `m/1852'/1815'/${hw.account}'/2/0`,
        };
      else if (!partialSign) throw TxSignError.ProofGeneration;
      else return;
    });
    const trezorTx = await txToTrezor(
      rawTx,
      network,
      keys,
      Buffer.from(address.to_bytes()).toString('hex'),
      hw.account
    );
    const result = await TrezorConnect.cardanoSignTransaction({
      ...trezorTx,
      tagCborSets: hasTaggedSets(tx),
    });
    if (!result.success) throw new Error('Trezor could not sign tx');
    const witnessSet = Loader.Cardano.TransactionWitnessSet.new();
    const vkeys = Loader.Cardano.Vkeywitnesses.new();
    result.payload.witnesses.forEach((witness) => {
      const vkey = Loader.Cardano.PublicKey.from_bytes(
        Buffer.from(witness.pubKey, 'hex')
      );
      const signature = Loader.Cardano.Ed25519Signature.from_hex(
        witness.signature
      );
      vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
    });
    witnessSet.set_vkeys(vkeys);
    return witnessSet;
  }
  throw new Error('Unsupported hardware wallet device');
};

/**
 *
 * @param {string} tx - cbor hex string
 * @returns
 */

export const submitTx = async (tx) => {
  const network = await getNetwork();
  
  // Convert CBOR to hex if needed
  const txHex = typeof tx === 'string' ? tx : Buffer.from(tx).toString('hex');
  
  if (network[network.id + 'Submit']) {
    const result = await fetch(network[network.id + 'Submit'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/cbor' },
      body: Buffer.from(txHex, 'hex'),
    });
    if (result.ok) {
      // Balance/UTxO/history caches are now stale — drop them so the next read
      // reflects the just-submitted transaction.
      invalidateReadCache();
      return await result.json();
    }
    throw APIError.InvalidRequest;
  }
  
  try {
    const result = await koiosSubmitTransaction(txHex);
    invalidateReadCache();
    return result;
  } catch (error) {
    console.error('Koios transaction submission error:', error);
    throw new Error(`Transaction submission failed: ${error.message}`);
  }
};

const emitNetworkChange = async (networkId) => {
  platform.events.broadcastToTabs({
    data: networkId,
    target: TARGET,
    sender: SENDER.extension,
    event: EVENT.networkChange,
  });
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

/**
 * Resolve the encrypted root key for a given seed.
 *
 * `walletId` is a stable per-seed id. Legacy single-seed installs (and the very
 * first seed) live in `STORAGE.encryptedKey` and answer to walletId "0"; every
 * other seed lives in the `STORAGE.encryptedKeys` map written when a second seed
 * is added.
 */
const resolveEncryptedRootKey = async (walletId) => {
  const id = walletId == null || walletId === '' ? '0' : String(walletId);
  const map = await getStorage(STORAGE.encryptedKeys);
  if (map && typeof map === 'object' && map[id]) return map[id];
  if (id === '0') {
    const legacy = await getStorage(STORAGE.encryptedKey);
    if (legacy) return legacy;
  }
  throw new Error(`No stored key for wallet ${id}`);
};

export const requestAccountKey = async (password, accountIndex, walletId = null) => {
  await Loader.load();
  const encryptedRootKey = await resolveEncryptedRootKey(walletId);
  let accountKey;
  let decryptedHex;
  try {
    decryptedHex = await decryptWithPassword(password, encryptedRootKey);
  } catch (e) {
    throw ERROR.wrongPassword;
  }
  try {
    accountKey = Loader.Cardano.Bip32PrivateKey.from_bytes(
      Buffer.from(decryptedHex, 'hex')
    )
      .derive(harden(1852)) // purpose
      .derive(harden(1815)) // coin type
      .derive(harden(parseInt(accountIndex)));
  } catch (e) {
    console.error('Key derivation failed after successful decryption:', e);
    throw ERROR.wrongPassword;
  }

  return {
    accountKey,
    paymentKey: accountKey.derive(0).derive(0).to_raw_key(),
    stakeKey: accountKey.derive(2).derive(0).to_raw_key(),
  };
};

/**
 * Re-encrypt every seed in the vault (legacy `encryptedKey` + all `encryptedKeys`)
 * under a new password. Throws `ERROR.wrongPassword` if `currentPassword` is wrong.
 */
export const changeWalletPassword = async (currentPassword, newPassword) => {
  await Loader.load();

  const reencrypt = async (encryptedHex) => {
    let decryptedHex;
    try {
      decryptedHex = await decryptWithPassword(currentPassword, encryptedHex);
    } catch (e) {
      throw ERROR.wrongPassword;
    }
    let rootKey = Loader.Cardano.Bip32PrivateKey.from_bytes(
      Buffer.from(decryptedHex, 'hex')
    );
    const out = await encryptWithPassword(newPassword, rootKey.as_bytes());
    rootKey.free();
    rootKey = null;
    return out;
  };

  const legacy = await getStorage(STORAGE.encryptedKey);
  const map = await getStorage(STORAGE.encryptedKeys);

  const patch = {};
  if (legacy) patch[STORAGE.encryptedKey] = await reencrypt(legacy);
  if (map && typeof map === 'object' && Object.keys(map).length > 0) {
    const nextMap = {};
    for (const id of Object.keys(map)) {
      nextMap[id] = await reencrypt(map[id]);
    }
    patch[STORAGE.encryptedKeys] = nextMap;
  }
  await setStorage(patch);
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
  } catch (_) {
    /* ignore quota / private mode */
  }
  try {
    if (window.sessionStorage) {
      window.sessionStorage.clear();
    }
  } catch (_) {
    /* ignore */
  }
};

/** PWA / web build uses IndexedDB `lucem-wallet`; extension may have none (harmless delete). */
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
    } catch (_) {
      resolve();
    }
  });

async function wipeAllLocalWalletData() {
  await platform.storage.clear();
  try {
    localStorage.removeItem('chakra-ui-color-mode');
  } catch (_) {
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
 * First-time hardware / air-gapped setup: store an encrypted local root key so the
 * wallet has a spending password for reset, change password, and optional new
 * software accounts. The key is generated in-browser and is not the Keystone/Ledger seed.
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
  let entropy = mnemonicToEntropy(seedPhrase);
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
      .derive(harden(parseInt(accountIndex, 10)));
    return accountKey.to_public().to_hex();
  } finally {
    if (accountKey) {
      try {
        accountKey.free();
      } catch (_) {
        /* ignore */
      }
    }
    try {
      rootKey.free();
    } catch (_) {
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
      isHW(first) || isNaN(first) ? first : parseInt(first, 10);
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
  } catch (e) {
    throw new Error('Invalid recovery phrase.');
  }
  if (account.publicKey && derivedPublicKey !== account.publicKey) {
    throw new Error('This recovery phrase does not match the selected account.');
  }

  // If the vault is already unlocked with other seeds, the password must match.
  const existingLegacy = await getStorage(STORAGE.encryptedKey);
  const map = (await getStorage(STORAGE.encryptedKeys)) || {};
  const mapKeys = Object.keys(map);
  const probe = existingLegacy || (mapKeys.length ? map[mapKeys[0]] : null);
  if (probe) {
    try {
      await decryptWithPassword(password, probe);
    } catch (e) {
      throw new Error(
        `${ERROR.wrongPassword}: enter your existing Lucem password.`
      );
    }
  }

  let entropy = mnemonicToEntropy(seedPhrase);
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
      ? parseInt(options.derivationIndex, 10)
      : accountIndex !== null && accountIndex !== undefined && accountIndex !== ''
        ? parseInt(accountIndex, 10)
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
    slot = parseInt(options.slot, 10);
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
  } catch (error) {
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
      avatar: Math.random().toString(),
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
    } catch (error) {
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
      } catch (e) {
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

export const isHW = (accountIndex) =>
  accountIndex != null &&
  accountIndex != undefined &&
  accountIndex != 0 &&
  typeof accountIndex !== 'number' &&
  typeof accountIndex === 'string' &&
  (accountIndex.startsWith(HW.keystone) ||
    accountIndex.startsWith(HW.trezor) ||
    accountIndex.startsWith(HW.ledger));

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
    } catch (e) {}
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
  } catch (e) {
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
  } catch (error) {
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
    new Set([0, ...accountIndices.map((i) => parseInt(i, 10))])
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

  // A vault can already exist. Adding a mnemonic no longer wipes it — the new
  // seed becomes an additional wallet (walletId) whose accounts live alongside
  // the existing ones. Only the very first seed uses the legacy `encryptedKey`.
  const existingEncryptedKey = await getStorage(STORAGE.encryptedKey);
  const existingAccounts = await getStorage(STORAGE.accounts);
  const vaultExists = Boolean(existingEncryptedKey);

  let walletId = '0';
  if (vaultExists) {
    // Every seed in a vault is protected by the same password. Require the
    // existing one instead of silently creating a second, unreachable password.
    try {
      await decryptWithPassword(password, existingEncryptedKey);
    } catch (e) {
      throw new Error(
        `${ERROR.wrongPassword}: enter your existing Lucem password to add another wallet.`
      );
    }
    if (
      totalAccountCount(existingAccounts) + accountIndices.length >
      MAX_TOTAL_ACCOUNTS
    ) {
      throw new Error(ERROR.maxAccountsReached);
    }
    walletId = await nextWalletId();
  }

  let entropy = mnemonicToEntropy(seedPhrase);
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
    const map = (await getStorage(STORAGE.encryptedKeys)) || {};
    if (!map['0'] && existingEncryptedKey) map['0'] = existingEncryptedKey;
    map[walletId] = encryptedRootKey;
    await setStorage({ [STORAGE.encryptedKeys]: map });
  } else {
    await setStorage({ [STORAGE.encryptedKey]: encryptedRootKey });
    await setStorage({
      [STORAGE.network]: { id: NETWORK_ID.mainnet, node: NODE.mainnet },
    });
    await setStorage({
      [STORAGE.currency]: 'usd',
    });
  }

  const primaryIndex = parseInt(explicitAccounts[0], 10);
  const index = await createAccount(name, password, primaryIndex, {
    walletId,
    derivationIndex: primaryIndex,
  });

  // Create additional explicitly selected accounts
  for (let i = 1; i < explicitAccounts.length; i++) {
    const derivationIndex = parseInt(explicitAccounts[i], 10);
    await createAccount(`Account ${derivationIndex}`, password, derivationIndex, {
      walletId,
      derivationIndex,
    });
  }

  // Discover additional used derivation indices via Koios POST /address_txs (legacy GET /addresses/.../txs was removed).
  const MAX_SUB_ACCOUNT_SCAN = 20;
  let searchIndex = Math.max(...explicitAccounts.map((i) => parseInt(i, 10))) + 1;
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
    } catch (error) {
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
      } catch (_e) {
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
      } catch (_e) {
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
      } catch (error) {
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
  } catch (error) {
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
    (front == 0 ? '' : front) + (split[1] ? split[1].slice(0, decimals) : '');
  if (!result) return '0';
  else if (result == 'NaN') return '0';
  return result;
};