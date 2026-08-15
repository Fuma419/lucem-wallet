/**
 * Stake-scoped balance helpers.
 *
 * Payment addresses under one reward/stake key share controlled funds. Lucem
 * aggregates UTxOs via `/account_utxos` so the wallet total matches chain
 * stake-controlled ADA and native assets — not just the primary address.
 *
 * The stake account for a payment address is discovered via `/address_info`
 * (`stake_address`), not hard-coded.
 */
import { bigIntLovelace } from '../lovelace-scalar';

/**
 * Extract the stake/reward address from a Koios or Blockfrost-shaped
 * `/address_info` payload (array or single row).
 *
 * @param {unknown} payload
 * @returns {string|null}
 */
export const stakeAddressFromAddressInfo = (payload) => {
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== 'object') return null;
  const stake =
    row.stake_address ||
    row.stake_addr ||
    (typeof row.stake_addr === 'object' ? row.stake_addr?.bech32 : null);
  return typeof stake === 'string' && stake.length > 0 ? stake : null;
};

/**
 * Sum Koios-shaped UTxO rows into a flat asset list (lovelace + native units).
 * Rows from `/account_utxos` with `_extended: false` often have `asset_list: null`,
 * which silently drops tokens — callers must request extended UTxOs.
 *
 * @param {Array<{ value?: string|number, asset_list?: Array<{policy_id:string,asset_name:string,quantity:string|number}>|null }>} utxos
 * @returns {{ unit: string, quantity: string }[]}
 */
export const aggregateKoiosUtxosToAssets = (utxos) => {
  const aggregatedAssets = {};
  let totalLovelace = BigInt(0);

  for (const utxo of utxos || []) {
    totalLovelace += bigIntLovelace(utxo.value);

    if (utxo.asset_list && Array.isArray(utxo.asset_list)) {
      for (const asset of utxo.asset_list) {
        const unit = `${asset.policy_id || ''}${asset.asset_name || ''}`;
        if (!unit) continue;
        if (!aggregatedAssets[unit]) {
          aggregatedAssets[unit] = BigInt(0);
        }
        aggregatedAssets[unit] += bigIntLovelace(asset.quantity);
      }
    }
  }

  return [
    { unit: 'lovelace', quantity: totalLovelace.toString() },
    ...Object.entries(aggregatedAssets).map(([unit, quantity]) => ({
      unit,
      quantity: quantity.toString(),
    })),
  ];
};

/**
 * ADA controlled by a stake key from `/account_info` (Koios or Blockfrost-shaped).
 * Koios v1 now exposes `total_balance` / `utxo`; older Blockfrost mapping uses
 * `controlled_amount`. Prefer UTxO-backed figures (exclude withdrawable rewards
 * already counted separately in the UI when present).
 */
export const stakeControlledLovelaceFromAccountInfo = (row) => {
  if (!row || typeof row !== 'object') return '0';
  const utxo = row.utxo ?? row.controlled_amount ?? row.total_balance;
  if (utxo != null && utxo !== '') {
    return bigIntLovelace(utxo).toString();
  }
  const controlled = bigIntLovelace(row.controlled_amount);
  const withdrawable = bigIntLovelace(
    row.withdrawable_amount ?? row.rewards_available
  );
  return (controlled - withdrawable).toString();
};

/**
 * Summarize Koios/Blockfrost-shaped `/address_info` into UI-friendly contents.
 * Used by the Accounts multi-address panel (per-payment-address details).
 *
 * @param {*} row
 * @returns {{ lovelace: string, utxoCount: number, nativeAssetCount: number }}
 */
export const summarizeAddressInfo = (row) => {
  if (!row || typeof row !== 'object') {
    return { lovelace: '0', utxoCount: 0, nativeAssetCount: 0 };
  }
  const utxos = Array.isArray(row.utxo_set) ? row.utxo_set : [];
  let lovelace =
    row.balance != null && row.balance !== ''
      ? bigIntLovelace(row.balance)
      : 0n;
  if (row.balance == null || row.balance === '') {
    for (const utxo of utxos) {
      lovelace += bigIntLovelace(utxo.value);
    }
  }
  const units = new Set();
  for (const utxo of utxos) {
    if (!Array.isArray(utxo.asset_list)) continue;
    for (const asset of utxo.asset_list) {
      const unit = `${asset.policy_id || ''}${asset.asset_name || ''}`;
      if (unit) units.add(unit);
    }
  }
  return {
    lovelace: lovelace.toString(),
    utxoCount: utxos.length,
    nativeAssetCount: units.size,
  };
};

/**
 * Group `/account_utxos` rows by payment address for Accounts address listing.
 * Prefer this over `/address_info` when deciding which addresses hold assets —
 * some accounts otherwise miss funded receive/change indices.
 *
 * @param {Array<{ address?: string, value?: string|number, asset_list?: Array<{policy_id?:string,asset_name?:string}>|null }>} utxos
 * @returns {Map<string, { lovelace: bigint, utxoCount: number, assetUnits: Set<string> }>}
 */
export const aggregateKoiosUtxosByAddress = (utxos) => {
  const byAddr = new Map();
  for (const utxo of utxos || []) {
    const address = utxo?.address;
    if (typeof address !== 'string' || !address) continue;
    let entry = byAddr.get(address);
    if (!entry) {
      entry = { lovelace: 0n, utxoCount: 0, assetUnits: new Set() };
      byAddr.set(address, entry);
    }
    entry.lovelace += bigIntLovelace(utxo.value);
    entry.utxoCount += 1;
    if (!Array.isArray(utxo.asset_list)) continue;
    for (const asset of utxo.asset_list) {
      const unit = `${asset.policy_id || ''}${asset.asset_name || ''}`;
      if (unit) entry.assetUnits.add(unit);
    }
  }
  return byAddr;
};

/**
 * @param {{ lovelace: bigint, utxoCount: number, assetUnits: Set<string> } | undefined} entry
 * @returns {{ lovelace: string, utxoCount: number, nativeAssetCount: number }}
 */
export const summarizeUtxosByAddressEntry = (entry) => {
  if (!entry) {
    return { lovelace: '0', utxoCount: 0, nativeAssetCount: 0 };
  }
  return {
    lovelace: entry.lovelace.toString(),
    utxoCount: entry.utxoCount,
    nativeAssetCount: entry.assetUnits.size,
  };
};
