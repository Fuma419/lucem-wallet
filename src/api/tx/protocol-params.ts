/**
 * Koios → wallet protocol snapshot (tip slot + epoch params).
 * Shared by `initTx`, `buildTx`, and tests.
 */

import {
  asLovelace,
  asSlot,
  type KoiosEpochParamsRow,
  type KoiosRequestEnhanced,
  type KoiosTipRow,
  type ProtocolParametersSnapshot,
  type Slot,
} from '../types';

/**
 * @param tipRow Koios `/tip` row or first element of array response
 */
export function parseKoiosTipSlot(tipRow: KoiosTipRow | null | undefined): Slot {
  const rawSlot = tipRow?.abs_slot ?? tipRow?.absolute_slot ?? tipRow?.slot;
  if (rawSlot == null || rawSlot === '') {
    throw new Error('Missing chain tip slot from Koios (/tip)');
  }
  const tipSlot = parseInt(String(rawSlot), 10);
  if (!Number.isFinite(tipSlot) || tipSlot < 0) {
    throw new Error('Invalid tip slot from Koios');
  }
  return asSlot(tipSlot);
}

export async function fetchKoiosTipSlot(
  koiosRequestEnhanced: KoiosRequestEnhanced
): Promise<Slot> {
  const tipRaw = await koiosRequestEnhanced('/tip');
  const tipRow =
    Array.isArray(tipRaw) && tipRaw.length > 0 ? tipRaw[0] : tipRaw;
  return parseKoiosTipSlot(tipRow as KoiosTipRow);
}

export function latestEpochParamsRow(
  payload: KoiosEpochParamsRow | KoiosEpochParamsRow[] | null | undefined
): KoiosEpochParamsRow {
  if (Array.isArray(payload) && payload.length > 0) {
    return payload[0];
  }
  return payload as KoiosEpochParamsRow;
}

export function buildProtocolParametersSnapshot(
  p: KoiosEpochParamsRow,
  tipSlot: Slot | number
): ProtocolParametersSnapshot {
  if (!p.min_fee_a || !p.min_fee_b) {
    throw new Error(
      'Missing required protocol parameters: min_fee_a or min_fee_b'
    );
  }
  if (!p.pool_deposit || !p.key_deposit || !p.coins_per_utxo_size) {
    throw new Error(
      'Missing required protocol parameters: pool_deposit, key_deposit, or coins_per_utxo_size'
    );
  }
  if (!p.max_val_size || !p.max_tx_size) {
    throw new Error(
      'Missing required protocol parameters: max_val_size or max_tx_size'
    );
  }

  return {
    linearFee: {
      minFeeA: asLovelace(p.min_fee_a),
      minFeeB: asLovelace(p.min_fee_b),
    },
    minUtxo: asLovelace('1000000'),
    poolDeposit: asLovelace(p.pool_deposit),
    keyDeposit: asLovelace(p.key_deposit),
    coinsPerUtxoWord: asLovelace(p.coins_per_utxo_size),
    maxValSize: p.max_val_size,
    priceMem: p.price_mem,
    priceStep: p.price_step,
    minFeeRefScriptCostPerByte: p.min_fee_ref_script_cost_per_byte || 0,
    maxTxSize: parseInt(String(p.max_tx_size), 10),
    slot: asSlot(typeof tipSlot === 'number' ? tipSlot : Number(tipSlot)),
    collateralPercentage: parseInt(String(p.collateral_percent), 10),
    maxCollateralInputs: parseInt(String(p.max_collateral_inputs), 10),
  };
}
