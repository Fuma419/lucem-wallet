/**
 * Turn a Koios /tx_info row into the history detail the wallet UI already
 * stores: `{ info, utxos, block, metadata }`.
 *
 * One flagged /tx_info call has inputs, certs, votes, assets, and metadata —
 * so list rows do not need /tx_utxos + /tx_metadata + /block_info.
 */
import {
  extraFromKoiosInfo,
  koiosKindCounts,
  listMetadataItems,
} from './tx-kind';

const TX_INFO_TTL_MS = 5 * 60_000;

export const HISTORY_TX_INFO_TTL_MS = TX_INFO_TTL_MS;

const normalizeAddress = (utxo) =>
  utxo?.payment_addr?.bech32 ||
  utxo?.address ||
  utxo?.payment_addr ||
  utxo?.stake_address ||
  utxo?.stake_addr?.bech32 ||
  utxo?.stake_addr ||
  null;

const mapUtxo = (utxo) => ({
  address: normalizeAddress(utxo),
  stake_address: utxo?.stake_addr || utxo?.stake_address,
  tx_hash: utxo?.tx_hash,
  tx_index: utxo?.tx_index,
  value: utxo?.value,
  asset_list: utxo?.asset_list || [],
  datum_hash: utxo?.datum_hash,
  inline_datum: utxo?.inline_datum,
  reference_script: utxo?.reference_script,
  collateral: utxo?.collateral,
});

export const normalizeTxMetadata = (raw) => listMetadataItems(raw);

export const utxosFromTxInfo = (koiosTx) => {
  if (!koiosTx) return null;
  const inputs = koiosTx.inputs || [];
  const outputs = koiosTx.outputs || [];
  if (!inputs.length && !outputs.length) return null;
  return {
    inputs: inputs.map(mapUtxo),
    outputs: outputs.map(mapUtxo),
  };
};

export const blockSummaryFromTxInfo = (info = {}) => {
  if (
    !info ||
    (info.block_height == null &&
      info.tx_timestamp == null &&
      !info.block_hash)
  ) {
    return null;
  }
  return {
    block_height: info.block_height,
    hash: info.block_hash,
    block_hash: info.block_hash,
    epoch_no: info.epoch_no,
    epoch_slot: info.epoch_slot,
    abs_slot: info.absolute_slot,
    absolute_slot: info.absolute_slot,
    block_time: info.tx_timestamp,
    time: info.tx_timestamp,
  };
};

const fallbackCount = (computed, provided) => {
  if (computed) return computed;
  const n = parseInt(provided, 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Normalize a provider tx_info row into the `detail.info` shape the UI reads.
 */
export const convertKoiosTxToExpectedFormat = (koiosTx) => {
  if (!koiosTx) return null;

  const counts = koiosKindCounts(koiosTx);

  return {
    tx_hash: koiosTx.tx_hash,
    block_height: koiosTx.block_height,
    block_hash: koiosTx.block_hash,
    epoch_no: koiosTx.epoch_no,
    epoch_slot: koiosTx.epoch_slot,
    absolute_slot: koiosTx.absolute_slot,
    tx_timestamp: koiosTx.tx_timestamp,
    tx_block_index: koiosTx.tx_block_index,
    tx_size: koiosTx.tx_size,

    total_output: koiosTx.total_output,
    fee: koiosTx.fee,
    treasury_donation: koiosTx.treasury_donation,
    deposit: koiosTx.deposit,

    invalid_before: koiosTx.invalid_before,
    invalid_after: koiosTx.invalid_after,

    inputs: koiosTx.inputs || [],
    outputs: koiosTx.outputs || [],

    collateral_inputs: koiosTx.collateral_inputs,
    collateral_output: koiosTx.collateral_output,
    reference_inputs: koiosTx.reference_inputs,
    withdrawals: koiosTx.withdrawals,
    assets_minted: koiosTx.assets_minted,
    certificates: koiosTx.certificates,
    native_scripts: koiosTx.native_scripts,
    plutus_contracts: koiosTx.plutus_contracts,
    voting_procedures: koiosTx.voting_procedures || [],
    proposal_procedures: koiosTx.proposal_procedures || [],
    metadata: koiosTx.metadata,

    fees: koiosTx.fee,
    valid_contract:
      koiosTx.valid_contract == null ? true : Boolean(koiosTx.valid_contract),

    redeemer_count: fallbackCount(counts.redeemerCount, koiosTx.redeemer_count),
    withdrawal_count: fallbackCount(
      counts.withdrawalCount,
      koiosTx.withdrawal_count
    ),
    delegation_count: fallbackCount(
      counts.delegationCount,
      koiosTx.delegation_count
    ),
    drep_delegation_count: fallbackCount(
      counts.drepDelegationCount,
      koiosTx.drep_delegation_count
    ),
    drep_registration_count: fallbackCount(
      counts.drepRegistrationCount,
      koiosTx.drep_registration_count
    ),
    drep_deregistration_count: fallbackCount(
      counts.drepDeregistrationCount,
      koiosTx.drep_deregistration_count
    ),
    drep_update_count: fallbackCount(
      counts.drepUpdateCount,
      koiosTx.drep_update_count
    ),
    vote_count: fallbackCount(counts.voteCount, koiosTx.vote_count),
    proposal_count: fallbackCount(counts.proposalCount, koiosTx.proposal_count),
    proposal_cert_count: counts.proposalCertCount,
    committee_hot_count: fallbackCount(
      counts.committeeHotCount,
      koiosTx.committee_hot_count
    ),
    committee_cold_count: fallbackCount(
      counts.committeeColdCount,
      koiosTx.committee_cold_count
    ),
    mir_count: fallbackCount(counts.mirCount, koiosTx.mir_cert_count),
    asset_mint_count: counts.assetMintCount,
    asset_burn_count: counts.assetBurnCount,
    asset_mint_or_burn_count: fallbackCount(
      counts.assetMintOrBurnCount,
      koiosTx.asset_mint_or_burn_count
    ),
    stake_reg_count: counts.stakeRegCount,
    stake_unreg_count: fallbackCount(
      counts.stakeUnregCount,
      koiosTx.stake_deregistration_count
    ),
    stake_cert_count: fallbackCount(
      counts.stakeCertCount,
      koiosTx.stake_cert_count
    ),
    pool_retire_count: fallbackCount(
      counts.poolRetireCount,
      koiosTx.pool_retire_count
    ),
    pool_update_count: fallbackCount(
      counts.poolUpdateCount,
      koiosTx.pool_update_count
    ),
  };
};

export const detailFromKoiosTxInfo = (koiosTx) => {
  const info = convertKoiosTxToExpectedFormat(koiosTx);
  if (!info) return null;
  const extras = extraFromKoiosInfo(info);
  return {
    info,
    utxos: utxosFromTxInfo(koiosTx),
    block: blockSummaryFromTxInfo(koiosTx),
    metadata: normalizeTxMetadata(koiosTx.metadata),
    extra: extras,
    pending: false,
  };
};

export const isHistoryDetailComplete = (detail) =>
  Boolean(
    detail &&
      !detail.pending &&
      detail.info &&
      detail.utxos &&
      detail.block
  );
