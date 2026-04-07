/**
 * Koios → wallet protocol snapshot (tip slot + epoch params).
 * Shared by `initTx`, `buildTx`, and tests.
 */

/**
 * @param {object} tipRow Koios `/tip` row or first element of array response
 * @returns {number} absolute slot
 */
export function parseKoiosTipSlot(tipRow) {
  const rawSlot =
    tipRow?.abs_slot ?? tipRow?.absolute_slot ?? tipRow?.slot;
  if (rawSlot == null || rawSlot === '') {
    throw new Error('Missing chain tip slot from Koios (/tip)');
  }
  const tipSlot = parseInt(String(rawSlot), 10);
  if (!Number.isFinite(tipSlot) || tipSlot < 0) {
    throw new Error('Invalid tip slot from Koios');
  }
  return tipSlot;
}

/** @param {(path: string) => Promise<any>} koiosRequestEnhanced */
export async function fetchKoiosTipSlot(koiosRequestEnhanced) {
  const tipRaw = await koiosRequestEnhanced('/tip');
  const tipRow =
    Array.isArray(tipRaw) && tipRaw.length > 0 ? tipRaw[0] : tipRaw;
  return parseKoiosTipSlot(tipRow);
}

/**
 * @param {object|Array} payload Koios `/epoch_params` response
 * @returns {object} latest epoch params row
 */
export function latestEpochParamsRow(payload) {
  if (Array.isArray(payload) && payload.length > 0) {
    return payload[0];
  }
  return payload;
}

/**
 * @param {object} p single epoch params row from Koios
 * @param {number} tipSlot from `fetchKoiosTipSlot` / `parseKoiosTipSlot`
 * @returns {object} same shape as legacy `initTx` return value
 */
export function buildProtocolParametersSnapshot(p, tipSlot) {
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
      minFeeA: p.min_fee_a.toString(),
      minFeeB: p.min_fee_b.toString(),
    },
    minUtxo: '1000000',
    poolDeposit: p.pool_deposit.toString(),
    keyDeposit: p.key_deposit.toString(),
    coinsPerUtxoWord: p.coins_per_utxo_size.toString(),
    maxValSize: p.max_val_size,
    priceMem: p.price_mem,
    priceStep: p.price_step,
    minFeeRefScriptCostPerByte: p.min_fee_ref_script_cost_per_byte || 0,
    maxTxSize: parseInt(p.max_tx_size, 10),
    slot: tipSlot,
    collateralPercentage: parseInt(p.collateral_percent, 10),
    maxCollateralInputs: parseInt(p.max_collateral_inputs, 10),
  };
}
