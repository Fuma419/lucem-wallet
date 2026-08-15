/**
 * Koios/provider reads: balances, UTxOs, history, pools, collateral.
 * Depends on ./addresses and ./storage; must not import ./index or ./wallet.
 */
import {
  APIError,
  NETWORKD_ID_NUMBER,
  STORAGE,
} from '../../config/config';
import { cacheKey, invalidateAll as invalidateReadCache, withCache } from '../cache';
import { KOIOS_REQUESTS } from '../koios-endpoints';
import Loader from '../loader';
import {
  emptyDelegation,
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
  } catch (/** @type {any} */ error) {
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
 * @param {string} [amount] - cbor value
 * @param {{ page: number, limit: number }} [paginate]
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
 * @returns {Promise<any[]|null>}
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

