/**
 * Koios/provider reads: balances, UTxOs, history, pools, collateral.
 * Depends on ./addresses and ./storage; must not import ./index or ./wallet.
 */
import {
  APIError,
  NETWORKD_ID_NUMBER,
  STORAGE,
} from '../../config/config';
import { cacheKey, getCached, invalidateAll as invalidateReadCache, setCached, withCache } from '../cache';
import { KOIOS_REQUESTS } from '../koios-endpoints';
import Loader from '../loader';
import {
  emptyDelegation,
  buildStakePoolSearchRequest,
  normalizeDelegationRow,
  normalizeStakePool,
} from '../staking';
import { assetsToValue, koiosRequest, utxoFromJson } from '../util';
import provider from '../../config/provider';
import {
  MAX_COLLATERAL_AMOUNT,
  isReservedCollateralPresent,
  parseCollateralAmount,
  selectCollateralCandidates,
} from './collateral';
import {
  activateDiscoveredExternalAddresses,
  getAddress,
  getEnabledPaymentAddresses,
  getRewardAddress,
} from './addresses';
import {
  ADDRESS_ROLE,
  derivePaymentFromAccountPublicKey,
  filterPaymentAddressesForAccountsDisplay,
  getExternalIndices,
  getInternalIndices,
  listEnabledPaymentAddresses,
  matchExternalIndicesFromAddresses,
  matchInternalIndicesFromAddresses,
  normalizeExternalIndices,
  normalizeInternalIndices,
} from './multi-address';
import {
  aggregateKoiosUtxosByAddress,
  aggregateKoiosUtxosToAssets,
  stakeAddressFromAddressInfo,
  stakeControlledLovelaceFromAccountInfo,
  summarizeAddressInfo,
  summarizeUtxosByAddressEntry,
} from './stake-balance';
import {
  getCurrentAccount,
  getCurrentAccountIndex,
  getNetwork,
  getStorage,
  setStorage,
} from './storage';
import { extraFromKoiosInfo } from '../tx/tx-kind';
import {
  HISTORY_TX_INFO_TTL_MS,
  blockSummaryFromTxInfo,
  convertKoiosTxToExpectedFormat,
  detailFromKoiosTxInfo,
  isHistoryDetailComplete,
  normalizeTxMetadata,
  utxosFromTxInfo,
} from '../tx/tx-history';


const compareValues = (value1, value2) => {
  try {
    const result = value1.checked_sub(value2);

    // If subtraction does not throw and result is not zero, value1 is greater
    if (!result.is_zero()) {
      return 1;
    }

    return 0;
  } catch (/** @type {any} */ error) {
    // If we catch an underflow error, value1 is less than value2
    return -1;
  }
}

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
  const request = buildStakePoolSearchRequest(query);
  if (request.kind === 'empty') return [];

  if (request.kind === 'poolId') {
    try {
      return [await getPoolMetadata(request.poolId)];
    } catch {
      return [];
    }
  }

  const poolList = await koiosRequest(request.endpoint);

  if (!poolList || poolList.error || !Array.isArray(poolList) || poolList.length === 0) {
    return [];
  }

  const poolIds = poolList.map((m) => m.pool_id_bech32).filter(Boolean);
  if (poolIds.length === 0) return [];
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
  } catch (/** @type {any} */ error) {
    console.warn(
      'resolveStakeAddressFromPaymentAddress failed:',
      error.message || error
    );
    return null;
  }
};

/**
 * Stake account for a wallet: prefer stored rewardAddr, otherwise
 * resolve it from the primary payment address through the chain API.
 */
export const getAccountStakeAddress = async (account) => {
  if (account?.rewardAddr) return account.rewardAddr;
  const stored = await getRewardAddress(account);
  if (stored) return stored;
  const paymentAddr = account?.paymentAddr || (await getAddress(account));
  return resolveStakeAddressFromPaymentAddress(paymentAddr);
};

export const getBalance = async (account) => {
  await Loader.load();
  const currentAccount = account || (await getCurrentAccount());
  const stakeAddress = await getAccountStakeAddress(currentAccount);
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
    const paymentAddresses = await getEnabledPaymentAddresses(currentAccount);
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
  /** @type {Record<string, { lovelace: string, status: string|null, poolId: string|null }>} */
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
    } catch (/** @type {any} */ error) {
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
    } catch (/** @type {any} */ error) {
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
    } catch (/** @type {any} */ error) {
      console.warn(
        'Accounts address_info enrich failed:',
        error?.message || error
      );
    }
  }

  /** @type {any[]} */
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
  } catch (/** @type {any} */ error) {
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

const txInfoCacheKey = (networkId, txHash) =>
  cacheKey('tx-info', networkId, txHash);

const rememberTxInfo = (networkId, row) => {
  if (row?.tx_hash) {
    setCached(txInfoCacheKey(networkId, row.tx_hash), row, HISTORY_TX_INFO_TTL_MS);
  }
  return row;
};

export const getTxInfo = async (txHash) => {
  const network = await getNetwork();
  const key = txInfoCacheKey(network?.id, txHash);
  const cached = getCached(key);
  if (cached) return cached;
  const request = KOIOS_REQUESTS.getTxInfo(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  return rememberTxInfo(network?.id, result[0]);
};

/**
 * Batch-hydrate history rows from one POST /tx_info. Used by the list so each
 * visible hash is not an independent 4-request waterfall.
 */
export const hydrateHistoryDetails = async (txHashes) => {
  const hashes = [...new Set((txHashes || []).filter(Boolean))];
  if (!hashes.length) return {};
  const network = await getNetwork();
  const map = {};
  const missing = [];
  for (const hash of hashes) {
    const cached = getCached(txInfoCacheKey(network?.id, hash));
    if (cached) {
      const detail = detailFromKoiosTxInfo(cached);
      if (detail) map[hash] = detail;
      else missing.push(hash);
    } else {
      missing.push(hash);
    }
  }
  if (!missing.length) return map;

  const request = KOIOS_REQUESTS.getTxInfos(missing);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || !Array.isArray(result)) return map;
  for (const row of result) {
    if (!row?.tx_hash) continue;
    rememberTxInfo(network?.id, row);
    const detail = detailFromKoiosTxInfo(row);
    if (detail) map[row.tx_hash] = detail;
  }
  return map;
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

export const getTxUTxOs = async (txHash) => {
  const request = KOIOS_REQUESTS.getTxUtxos(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  return utxosFromTxInfo(result[0]);
};

export const getTxMetadata = async (txHash) => {
  const request = KOIOS_REQUESTS.getTxMetadata(txHash);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  if (!result || result.error || result.length === 0) return null;
  return normalizeTxMetadata(result[0]);
};

export const updateTxInfo = async (txHash) => {
  const currentAccount = await getCurrentAccount();
  const network = await getNetwork();
  const history = currentAccount[network.id]?.history || currentAccount.history;
  const stored = history?.details?.[txHash];
  const pendingStub =
    stored && typeof stored === 'object' && stored.pending ? stored : null;
  if (isHistoryDetailComplete(stored)) return stored;

  const info = await getTxInfo(txHash);
  let detail = info ? detailFromKoiosTxInfo(info) : {};
  if (!detail) detail = {};

  if (!detail.utxos) {
    const uTxOs = await getTxUTxOs(txHash);
    if (uTxOs) detail.utxos = uTxOs;
  }
  if (!detail.metadata || !detail.metadata.length) {
    const metadata = await getTxMetadata(txHash);
    if (metadata && metadata.length) detail.metadata = metadata;
  }
  if (!detail.block && info) {
    detail.block = blockSummaryFromTxInfo(info) || (info.block_height
      ? await getBlock(info.block_height)
      : null);
  }
  if (!detail.info && info) {
    detail.info = convertKoiosTxToExpectedFormat(info);
  }

  if (isHistoryDetailComplete({ ...detail, pending: false })) {
    return {
      ...detail,
      extra: extraFromKoiosInfo(detail.info),
      pending: false,
    };
  }

  if (pendingStub || detail.info) {
    return {
      pending: true,
      submittedAt: pendingStub?.submittedAt,
      extra:
        (detail.info && extraFromKoiosInfo(detail.info)) ||
        pendingStub?.extra ||
        [],
      info: detail.info,
      utxos: detail.utxos,
      metadata: detail.metadata || [],
      block: detail.block,
    };
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
 * @param {string} [amount] - cbor value
 * @param {{ page: number, limit: number }} [paginate]
 * @param {object} [account] - CIP-30 bound account; defaults to UI selection
 * @returns
 */
export const getUtxos = async (
  amount = undefined,
  paginate = undefined,
  account = undefined
) => {
  const currentAccount = account || (await getCurrentAccount());
  const paymentAddresses = await getEnabledPaymentAddresses(currentAccount);
  const addressList = paymentAddresses.map((a) => a.paymentAddr).filter(Boolean);
  const stakeAddress = await getAccountStakeAddress(currentAccount);

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
  // Any UTxO here already sits under this account's stake key, but discovery
  // may not have enabled its receive/change index yet — keep it whenever the
  // payment key is derivable, so ADA the balance counts stays spendable.
  const enabledOwners = new Set(addressList.filter(Boolean));
  if (enabledOwners.size > 0) {
    const unknownAddrs = [
      ...new Set(
        utxos
          .map((utxo) => utxo.address)
          .filter((addr) => addr && !enabledOwners.has(addr))
      ),
    ];
    if (unknownAddrs.length > 0 && currentAccount.publicKey) {
      await Loader.load();
      const network = await getNetwork();
      const networkId = NETWORKD_ID_NUMBER[network.name || network.id];
      const extraExternal = matchExternalIndicesFromAddresses(
        Loader.Cardano,
        currentAccount.publicKey,
        networkId,
        unknownAddrs
      );
      const extraInternal = matchInternalIndicesFromAddresses(
        Loader.Cardano,
        currentAccount.publicKey,
        networkId,
        unknownAddrs
      );
      for (const index of extraExternal) {
        if (index === 0 && currentAccount.paymentAddr) {
          enabledOwners.add(currentAccount.paymentAddr);
          continue;
        }
        enabledOwners.add(
          derivePaymentFromAccountPublicKey(
            Loader.Cardano,
            currentAccount.publicKey,
            networkId,
            ADDRESS_ROLE.external,
            index
          ).paymentAddr
        );
      }
      for (const index of extraInternal) {
        enabledOwners.add(
          derivePaymentFromAccountPublicKey(
            Loader.Cardano,
            currentAccount.publicKey,
            networkId,
            ADDRESS_ROLE.internal,
            index
          ).paymentAddr
        );
      }
      const prevExt = getExternalIndices(currentAccount);
      const prevInt = getInternalIndices(currentAccount);
      const mergedExt = normalizeExternalIndices([
        ...prevExt,
        ...extraExternal,
      ]);
      const mergedInt = normalizeInternalIndices([
        ...prevInt,
        ...extraInternal,
      ]);
      const extChanged =
        mergedExt.length !== prevExt.length ||
        mergedExt.some((n, i) => n !== prevExt[i]);
      const intChanged =
        mergedInt.length !== prevInt.length ||
        mergedInt.some((n, i) => n !== prevInt[i]);
      if (extChanged || intChanged) {
        const persistIndex =
          currentAccount.index !== undefined && currentAccount.index !== null
            ? currentAccount.index
            : await getCurrentAccountIndex();
        const accounts = await getStorage(STORAGE.accounts);
        if (accounts?.[persistIndex]) {
          if (!Array.isArray(accounts[persistIndex].userExternalIndices)) {
            accounts[persistIndex].userExternalIndices = prevExt;
          }
          accounts[persistIndex].externalIndices = mergedExt;
          accounts[persistIndex].internalIndices = mergedInt;
          await setStorage({ [STORAGE.accounts]: { ...accounts } });
          invalidateReadCache();
        }
      }
    }
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
    } catch (/** @type {any} */ e) {
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
 * @returns {Promise<boolean>} true when collateral was cleared (caller should persist)
 */
export const checkCollateral = async (currentAccount, network, checkTx) => {
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
  } catch (/** @type {any} */ _) {
    // fall through — some dApps send a CBOR Value instead of a bare Coin
  }
  try {
    return BigInt(Loader.Cardano.Value.from_bytes(bytes).coin().to_str());
  } catch (/** @type {any} */ _) {
    throw new Error('could not parse collateral amount');
  }
};

/**
 * CIP-30 getCollateral (deprecated; prefer CIP-40 collateral return).
 * @param {{ amount?: string|number }|string|number|undefined} params
 * @param {object} [account] - CIP-30 bound account; defaults to UI selection
 * @returns {Promise<any[]|null>}
 */
export const getCollateral = async (params, account) => {
  await Loader.load();
  const currentIndex =
    account?.index !== undefined && account?.index !== null
      ? account.index
      : await getCurrentAccountIndex();
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
  } catch (/** @type {any} */ e) {
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

  const utxos = await getUtxos(
    undefined,
    undefined,
    account || (await getCurrentAccount())
  );
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

