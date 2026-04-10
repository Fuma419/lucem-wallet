import {
  APIError,
  DataSignError,
  ERROR,
  EVENT,
  HW,
  LOCAL_STORAGE,
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
import { initTx } from './wallet';
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

export const getDelegation = async () => {
  const currentAccount = await getCurrentAccount();
  const stakeAddress = await getRewardAddress(); // Get the stake address
  
  const request = KOIOS_REQUESTS.getAccountInfo(stakeAddress);
  const stake = await koiosRequest(request.endpoint, {}, request.body);
  
  if (!stake || stake.error || !stake[0] || !stake[0].pool_id) return {};
  
  const poolRequest = KOIOS_REQUESTS.getPoolMetadata(stake[0].pool_id);
  const delegation = await koiosRequest(poolRequest.endpoint);
  
  if (!delegation || delegation.error) return {};
  return {
    active: stake[0].active,
    rewards: stake[0].withdrawable_amount,
    homepage: delegation.homepage,
    poolId: stake[0].pool_id,
    ticker: delegation.ticker,
    description: delegation.description,
    name: delegation.name,
  };
};

export const getPoolMetadata = async (poolId) => {
  if (!poolId) {
    throw new Error('poolId argument not provided');
  }

  const request = KOIOS_REQUESTS.getPoolMetadata(poolId);
  const delegation = await koiosRequest(request.endpoint);

  if (delegation.error) {
    throw new Error(delegation.message);
  }

  return {
    ticker: delegation.ticker,
    name: delegation.name,
    id: poolId,
    hex: delegation.hex,
  };
};

export const searchPools = async (query) => {
  if (!query) return [];
  const searchLower = query.toLowerCase();
  
  // First, fetch the full list of pools to find matching tickers/IDs
  const listRequest = KOIOS_REQUESTS.getPoolList();
  const poolList = await koiosRequest(listRequest.endpoint);
  
  if (!poolList || poolList.error || !Array.isArray(poolList)) {
    return [];
  }
  
  // Find up to 20 matches based on ticker or pool ID
  const matches = poolList.filter(pool => {
    if (pool.pool_id_bech32 && pool.pool_id_bech32.toLowerCase().includes(searchLower)) return true;
    if (pool.ticker && pool.ticker.toLowerCase().includes(searchLower)) return true;
    return false;
  }).slice(0, 20);
  
  if (matches.length === 0) return [];
  
  // Get detailed info for the matches
  const poolIds = matches.map(m => m.pool_id_bech32);
  const infoRequest = KOIOS_REQUESTS.getPoolInfo(poolIds);
  const detailedPools = await koiosRequest(infoRequest.endpoint, {}, infoRequest.body);
  
  if (!detailedPools || detailedPools.error || !Array.isArray(detailedPools)) {
    return [];
  }
  
  return detailedPools.map(pool => ({
    id: pool.pool_id_bech32,
    hex: pool.pool_id_hex,
    ticker: pool.meta_json?.ticker || pool.ticker || 'Unknown',
    name: pool.meta_json?.name || pool.ticker || 'Unknown Pool',
    description: pool.meta_json?.description || '',
    homepage: pool.meta_json?.homepage || '',
    margin: pool.margin,
    pledge: pool.pledge,
    activeStake: pool.active_stake,
    liveSaturation: pool.live_saturation,
  }));
};

export const getBalance = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  const address = await getAddress(); // Get the full address
  
  // Use address_utxos to get detailed UTXO information
  const request = KOIOS_REQUESTS.getAddressUtxos(address, false);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  
  if (result.error) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0'));
  }
  
  // If no UTXOs, return zero balance
  if (!result || result.length === 0) {
    return Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0'));
  }
  
  // Aggregate all UTXOs to get total balance
  const aggregatedAssets = {};
  let totalLovelace = BigInt(0);

  for (const utxo of result) {
    totalLovelace += bigIntLovelace(utxo.value);

    if (utxo.asset_list && Array.isArray(utxo.asset_list)) {
      for (const asset of utxo.asset_list) {
        const unit = asset.policy_id + asset.asset_name;
        if (!aggregatedAssets[unit]) {
          aggregatedAssets[unit] = BigInt(0);
        }
        aggregatedAssets[unit] += bigIntLovelace(asset.quantity);
      }
    }
  }

  const assets = [
    { unit: 'lovelace', quantity: totalLovelace.toString() },
    ...Object.entries(aggregatedAssets).map(([unit, quantity]) => ({
      unit,
      quantity: quantity.toString()
    }))
  ];

  const value = await assetsToValue(assets);
  return value;
};

export const getBalanceExtended = async () => {
  const currentAccount = await getCurrentAccount();
  const address = await getAddress(); // Get the full address
  
  const request = KOIOS_REQUESTS.getAddressUtxos(address, true);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  
  if (result.error) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return [];
  }
  
  // If no UTXOs, return empty array
  if (!result || result.length === 0) {
    return [];
  }
  
  // Aggregate all UTXOs to get total balance
  const aggregatedAssets = {};
  let totalLovelace = BigInt(0);
  
  for (const utxo of result) {
    totalLovelace += bigIntLovelace(utxo.value);

    if (utxo.asset_list && Array.isArray(utxo.asset_list)) {
      for (const asset of utxo.asset_list) {
        const unit = asset.policy_id + asset.asset_name;
        if (!aggregatedAssets[unit]) {
          aggregatedAssets[unit] = BigInt(0);
        }
        aggregatedAssets[unit] += bigIntLovelace(asset.quantity);
      }
    }
  }

  const assets = [
    { unit: 'lovelace', quantity: totalLovelace.toString() },
    ...Object.entries(aggregatedAssets).map(([unit, quantity]) => ({
      unit,
      quantity: quantity.toString()
    }))
  ];

  return assets;
};

export const getFullBalance = async () => {
  const currentAccount = await getCurrentAccount();
  const stakeAddress = await getRewardAddress(); // Get the stake address
  
  const request = KOIOS_REQUESTS.getAccountInfo(stakeAddress);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  
  if (result.error || !result[0]) return '0';
  return (
    BigInt(result[0].controlled_amount || 0) - BigInt(result[0].withdrawable_amount || 0)
  ).toString();
};

export const getTransactions = async (paginate = 1, count = 10) => {
  const currentAccount = await getCurrentAccount();
  const stakeAddress = await getRewardAddress();
  
  const request = KOIOS_REQUESTS.getAccountTxs(stakeAddress, 0);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  
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
  
  return {
    inputs: (koiosUtxos.inputs || []).map(input => ({
      address: input.payment_addr?.bech32 || input.address || input.payment_addr,
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
      address: output.payment_addr?.bech32 || output.address || output.payment_addr,
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
  const address = await getAddress(); // Get the full address
  
  const request = KOIOS_REQUESTS.getAddressInfo(address);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  
  if (result.error || !result[0]) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return [];
  }
  
  let utxos = result[0].utxo_set || [];

  // exclude collateral input from overall utxo set
  if (currentAccount.collateral) {
    utxos = utxos.filter(
      (utxo) =>
        !(
          utxo.tx_hash === currentAccount.collateral.txHash &&
          utxo.output_index === currentAccount.collateral.txId
        )
    );
  }

  // Convert Koios UTXO format to expected format
  let convertedUtxos = await Promise.all(
    utxos.map(async (utxo) => {
      // Ensure the UTXO has the required fields
      const formattedUtxo = {
        tx_hash: utxo.tx_hash,
        output_index: utxo.output_index,
        amount: [
          { unit: 'lovelace', quantity: utxo.value || '0' },
          ...(utxo.asset_list || []).map(asset => ({
            unit: asset.policy_id + asset.asset_name,
            quantity: asset.quantity || '0'
          }))
        ]
      };
      
      return await utxoFromJson(formattedUtxo, address);
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

const checkCollateral = async (currentAccount, network, checkTx) => {
  if (checkTx) {
    const transactions = await getTransactions();
    if (
      transactions.length <= 0 ||
      currentAccount[network.id].history.confirmed.includes(
        transactions[0].txHash
      )
    )
      return;
  }
  const address = await getAddress(); // Get the full address
  
  const request = KOIOS_REQUESTS.getAddressInfo(address);
  const result = await koiosRequest(request.endpoint, {}, request.body);
  
  if (result.error || !result[0]) {
    if (result.status_code === 400) throw APIError.InvalidRequest;
    else if (result.status_code === 500) throw APIError.InternalError;
    else return [];
  }
  
  let utxos = result[0].utxo_set || [];

  // exclude collateral input from overall utxo set
  if (currentAccount[network.id].collateral) {
    const initialSize = utxos.length;
    utxos = utxos.filter(
      (utxo) =>
        !(
          utxo.tx_hash === currentAccount[network.id].collateral.txHash &&
          utxo.output_index === currentAccount[network.id].collateral.txId
        )
    );
    if (utxos.length === initialSize) {
      delete currentAccount[network.id].collateral;
    }
  }
};

export const getCollateral = async () => {
  await Loader.load();
  const currentIndex = await getCurrentAccountIndex();
  const accounts = await getStorage(STORAGE.accounts);
  const currentAccount = accounts[currentIndex];
  const network = await getNetwork();
  if (await checkCollateral(currentAccount, network, true)) {
    await setStorage({ [STORAGE.accounts]: accounts });
  }
  const collateral = currentAccount[network.id].collateral;
  if (collateral) {
    const collateralUtxo = Loader.Cardano.TransactionUnspentOutput.new(
      Loader.Cardano.TransactionInput.new(
        Loader.Cardano.TransactionHash.from_bytes(
          Buffer.from(collateral.txHash, 'hex')
        ),
        Loader.Cardano.BigNum.from_str(collateral.txId.toString())
      ),
      Loader.Cardano.TransactionOutput.new(
        Loader.Cardano.Address.from_bech32(
          currentAccount[network.id].paymentAddr
        ),
        Loader.Cardano.Value.new(
          Loader.Cardano.BigNum.from_str(collateral.lovelace.toString())
        )
      )
    );
    return [collateralUtxo];
  }
  const utxos = await getUtxos();
  return utxos.filter((utxo) => {
    const amt = utxo.output().amount();
    const coinOk =
      BigInt(amt.coin().to_str()) <= BigInt('50000000');
    const ma = amt.multiasset();
    return coinOk && (!ma || ma.len() === 0);
  });
};

export const getAddress = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  // Return the full Bech32 address instead of converting to key hash
  return currentAccount.paymentAddr;
};

export const getRewardAddress = async () => {
  await Loader.load();
  const currentAccount = await getCurrentAccount();
  // Return the full Bech32 stake address instead of converting to key hash
  return currentAccount.rewardAddr;
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

export const extractKeyHash = async (address) => {
  await Loader.load();
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
  const prefix = keyHash.startsWith('addr_vkh') ? 'addr_vkh' : 'stake_vkh';
  let { paymentKey, stakeKey } = await requestAccountKey(
    password,
    accountIndex
  );
  const accountKey = prefix === 'addr_vkh' ? paymentKey : stakeKey;

  const publicKey = accountKey.to_public();
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

  const signedSigStruc = accountKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

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
  const prefix = keyHash.startsWith('addr_vkh') ? 'addr_vkh' : 'stake_vkh';
  let { paymentKey, stakeKey } = await requestAccountKey(
    password,
    accountIndex
  );
  const accountKey = prefix === 'addr_vkh' ? paymentKey : stakeKey;

  const publicKey = accountKey.to_public();
  if (keyHash !== publicKey.hash().to_bech32(prefix))
    throw DataSignError.ProofGeneration;
  const protectedHeaders = Loader.Message.HeaderMap.new();
  protectedHeaders.set_algorithm_id(
    Loader.Message.Label.from_algorithm_id(Loader.Message.AlgorithmId.EdDSA)
  );
  // protectedHeaders.set_key_id(publicKey.to_raw_bytes()); // Removed to adhere to CIP-30
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

  const signedSigStruc = accountKey.sign(toSign).to_bytes();
  const coseSign1 = builder.build(signedSigStruc);

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
  let { paymentKey, stakeKey } = await requestAccountKey(
    password,
    accountIndex
  );
  const paymentKeyHash = paymentKey.to_public().hash().to_hex();
  const stakeKeyHash = stakeKey.to_public().hash().to_hex();

  const rawTx = Loader.Cardano.Transaction.from_bytes(Buffer.from(tx, 'hex'));

  const txWitnessSet = Loader.Cardano.TransactionWitnessSet.new();
  const vkeyWitnesses = Loader.Cardano.VkeywitnessList.new();
  const txHash = Loader.Cardano.hash_transaction(rawTx.body());
  keyHashes.forEach((keyHash) => {
    let signingKey;
    if (keyHash === paymentKeyHash) signingKey = paymentKey;
    else if (keyHash === stakeKeyHash) signingKey = stakeKey;
    else if (!partialSign) throw TxSignError.ProofGeneration;
    else return;
    const vkey = Loader.Cardano.make_vkey_witness(txHash, signingKey);
    vkeyWitnesses.add(vkey);
  });

  stakeKey.free();
  stakeKey = null;
  paymentKey.free();
  paymentKey = null;

  txWitnessSet.set_vkeywitnesses(vkeyWitnesses);
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
    keyHashes.forEach((keyHash) => {
      if (keyHash === account.paymentKeyHash)
        keys.payment = {
          hash: keyHash,
          path: [HARDENED + 1852, HARDENED + 1815, HARDENED + hw.account, 0, 0],
        };
      else if (keyHash === account.stakeKeyHash)
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
    const vkeys = Loader.Cardano.VkeywitnessList.new();
    result.witnesses.forEach((witness) => {
      if (
        witness.path[3] == 0 // payment key
      ) {
        const vkey = Loader.Cardano.Bip32PublicKey.from_hex(
          account.publicKey
        )
          .derive(0)
          .derive(0)
          .to_raw_key();
        const signature = Loader.Cardano.Ed25519Signature.from_hex(
          witness.witnessSignatureHex
        );
        vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
      } else if (
        witness.path[3] == 2 // stake key
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
    witnessSet.set_vkeywitnesses(vkeys);
    return witnessSet;
  }
  if (hw.device === HW.keystone) {
    throw new Error('Keystone signing runs in the Keystone signing tab.');
  }
  if (hw.device === HW.trezor) {
    keyHashes.forEach((keyHash) => {
      if (keyHash === account.paymentKeyHash)
        keys.payment = {
          hash: keyHash,
          path: `m/1852'/1815'/${hw.account}'/0/0`,
        };
      else if (keyHash === account.stakeKeyHash)
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
    const vkeys = Loader.Cardano.VkeywitnessList.new();
    result.payload.witnesses.forEach((witness) => {
      const vkey = Loader.Cardano.PublicKey.from_bytes(
        Buffer.from(witness.pubKey, 'hex')
      );
      const signature = Loader.Cardano.Ed25519Signature.from_hex(
        witness.signature
      );
      vkeys.add(Loader.Cardano.Vkeywitness.new(vkey, signature));
    });
    witnessSet.set_vkeywitnesses(vkeys);
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
      return await result.json();
    }
    throw APIError.InvalidRequest;
  }
  
  try {
    return await koiosSubmitTransaction(txHex);
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

export const requestAccountKey = async (password, accountIndex) => {
  await Loader.load();
  const encryptedRootKey = await getStorage(STORAGE.encryptedKey);
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

/** Remove easy-peasy, asset cache, and session data so wiped state is consistent. */
const clearBrowserWalletCaches = () => {
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

export const createAccount = async (name, password, accountIndex = null) => {
  await Loader.load();

  const existingAccounts = await getStorage(STORAGE.accounts);

  const index = accountIndex
    ? accountIndex
    : existingAccounts
      ? Object.keys(getNativeAccounts(existingAccounts)).length
      : 0;

  let { accountKey, paymentKey, stakeKey } = await requestAccountKey(
    password,
    index
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
      publicKey,
      paymentKeyHash,
      paymentKeyHashBech32,
      stakeKeyHash,
      name,
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
  return index;
};

export const createHWAccounts = async (accounts) => {
  await Loader.load();
  let existingAccounts = await getStorage(STORAGE.accounts);
  if (!existingAccounts || typeof existingAccounts !== 'object') {
    existingAccounts = {};
  }
  accounts.forEach((account) => {
    const publicKey = Loader.Cardano.Bip32PublicKey.from_hex(
      account.publicKey
    );

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

    const index = account.accountIndex;
    const name = account.name;

    const networkDefault = {
      lovelace: null,
      minAda: 0,
      assets: [],
      history: { confirmed: [], details: {} },
    };

    existingAccounts[index] = {
      index,
      publicKey: publicKey.to_hex(),
      paymentKeyHash,
      paymentKeyHashBech32,
      stakeKeyHash,
      name,
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
  });
  const setPayload = { [STORAGE.accounts]: existingAccounts };
  if (accounts.length > 0) {
    const firstNewIndex = accounts[0].accountIndex;
    const currentIndex = await getStorage(STORAGE.currentAccount);
    const needsCurrent =
      currentIndex === undefined ||
      currentIndex === null ||
      existingAccounts[currentIndex] === undefined;
    if (needsCurrent) {
      setPayload[STORAGE.currentAccount] = firstNewIndex;
    }
  }
  await setStorage(setPayload);
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

export const initHW = async ({ device, id, bleDevice }) => {
  if (device == HW.ledger) {
    const bluetooth =
      typeof navigator !== 'undefined' ? navigator.bluetooth : undefined;
    if (!bluetooth) {
      throw new Error(
        'Web Bluetooth is not available. Use Chrome or Edge over HTTPS (or localhost), enable Bluetooth, and use a Bluetooth-capable Ledger (e.g. Nano X, Flex, Stax). Extension pages may not support Web Bluetooth — try the Lucem web app if connection fails.'
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

  // Check and clear any leftover state from a previous failed attempt
  const checkStore = await getStorage(STORAGE.encryptedKey);
  if (checkStore) {
    await platform.storage.clear();
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

  await setStorage({ [STORAGE.encryptedKey]: encryptedRootKey });
  await setStorage({
    [STORAGE.network]: { id: NETWORK_ID.mainnet, node: NODE.mainnet },
  });

  await setStorage({
    [STORAGE.currency]: 'usd',
  });

  const index = await createAccount(name, password, explicitAccounts[0]);

  // Create additional explicitly selected accounts
  for (let i = 1; i < explicitAccounts.length; i++) {
    await createAccount(`Account ${explicitAccounts[i]}`, password, explicitAccounts[i]);
  }

  // Discover additional used derivation indices via Koios POST /address_txs (legacy GET /addresses/.../txs was removed).
  const MAX_SUB_ACCOUNT_SCAN = 20;
  let searchIndex = Math.max(...explicitAccounts) + 1;
  while (searchIndex <= MAX_SUB_ACCOUNT_SCAN) {
    let { paymentKey, stakeKey } = await requestAccountKey(password, searchIndex);

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
        await createAccount(`Account ${searchIndex}`, password, searchIndex);
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
  await switchAccount(index);

  return true;
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
  if (asset && asset.time && time - asset.time <= h1 && !asset.mint) {
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
        asset.image = metadata.image ? linkToSrc(convertMetadataPropToString(metadata.image)) : '';
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
      const onchainMetadata =
        result.onchain_metadata &&
        ((result.onchain_metadata.version === 2 &&
          result.onchain_metadata?.[`0x${policyId}`]?.[`0x${name}`]) ||
          result.onchain_metadata);
      asset.displayName =
        (onchainMetadata && onchainMetadata.name) ||
        (result.metadata && result.metadata.name) ||
        asset.name;
      asset.image =
        (onchainMetadata &&
          onchainMetadata.image &&
          linkToSrc(convertMetadataPropToString(onchainMetadata.image))) ||
        (result.metadata &&
          result.metadata.logo &&
          linkToSrc(result.metadata.logo, true)) ||
        '';
      asset.decimals = (result.metadata && result.metadata.decimals) || 0;
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

export const updateBalance = async (currentAccount, network) => {
  await Loader.load();
  const assets = await getBalanceExtended();
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
      const protocolParameters = await initTx();
      const checkOutput = Loader.Cardano.TransactionOutput.new(
        Loader.Cardano.Address.from_bech32(
          currentAccount[network.id].paymentAddr
        ),
        amount
      );
      const dataCost = Loader.Cardano.DataCost.new_coins_per_byte(
        Loader.Cardano.BigNum.from_str(protocolParameters.coinsPerUtxoWord.toString())
      );
      const minAda = Loader.Cardano.min_ada_for_output(
        checkOutput,
        dataCost
      ).toString();
      currentAccount[network.id].minAda = normalizeLovelaceScalar(minAda);
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

const updateTransactions = async (currentAccount, network) => {
  const transactions = await getTransactions();
  if (
    transactions.length <= 0 ||
    currentAccount[network.id].history.confirmed.includes(
      transactions[0].txHash
    )
  )
    return false;
  let txHashes = transactions.map((tx) => tx.txHash);
  txHashes = txHashes.concat(currentAccount[network.id].history.confirmed);
  const txSet = new Set(txHashes);
  currentAccount[network.id].history.confirmed = Array.from(txSet);
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

  await updateTransactions(currentAccount, network);

  const isFirstLoad = currentAccount[network.id].lovelace == null;
  if (
    currentAccount[network.id].history.confirmed[0] ==
      currentAccount[network.id].lastUpdate &&
    !forceUpdate &&
    !isFirstLoad &&
    !currentAccount[network.id].forceUpdate
  ) {
    return;
  }

  // forcing acccount update for in case of breaking changes in an Nami update
  if (currentAccount[network.id].forceUpdate)
    delete currentAccount[network.id].forceUpdate;

  await updateBalance(currentAccount, network);

  currentAccount[network.id].lastUpdate =
    currentAccount[network.id].history.confirmed[0];

  return await setStorage({
    [STORAGE.accounts]: {
      ...accounts,
    },
  });
};

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
  return parseInt(quantity) / 10 ** decimals;
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