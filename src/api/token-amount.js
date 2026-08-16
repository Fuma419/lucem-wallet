/**
 * Token send amounts: display units ↔ on-chain base units.
 * Native tokens must not inherit ADA's 6 decimals.
 */

import { toUnit } from './extension';

export const tokenDecimals = (asset) => {
  if (!asset || asset.decimals == null || asset.decimals === '') return 0;
  const n = Number(asset.decimals);
  return Number.isFinite(n) ? n : 0;
};

/** BigInt-safe display string (avoids `1e-8` from Number). */
export const displayTokenAmount = (quantity, decimals = 0) => {
  let q = 0n;
  try {
    q = BigInt(String(quantity ?? '0'));
  } catch (/** @type {any} */ _) {
    return '0';
  }
  const dec = Number.isFinite(Number(decimals))
    ? Math.min(38, Math.max(0, Math.floor(Number(decimals))))
    : 0;
  if (dec <= 0) return q.toString();
  // Avoid `10n ** n` — Babel rewrites `**` to Math.pow, which rejects BigInt.
  const scale = BigInt(`1${'0'.repeat(dec)}`);
  const whole = q / scale;
  const frac = q % scale;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(dec, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
};

const looksLikeOneDisplayUnit = (input) =>
  /^(1|1\.0+)$/.test(String(input || '').replace(/[,\s]/g, ''));

/**
 * Convert a display-unit input to on-chain quantity, never above `available`.
 * A read-only 1-base-unit token (NFT / 1-atom) often shows as "1"; with
 * registry decimals that would become 10^decimals — treat that as 1 base unit.
 * @returns {{ quantity: string } | { error: string }}
 */
export const resolveTokenSendQuantity = (input, decimals, available) => {
  if (input == null || input === '') {
    return { error: 'Asset quantity not set' };
  }
  const dec = Number.isFinite(Number(decimals)) ? Number(decimals) : 0;
  let requested;
  try {
    requested = BigInt(toUnit(input, dec) || '0');
  } catch (/** @type {any} */ _) {
    return { error: 'Asset quantity not set' };
  }
  if (requested < 1n) {
    return { error: 'Asset quantity not set' };
  }
  let have = 0n;
  try {
    have = BigInt(String(available || '0'));
  } catch (/** @type {any} */ _) {
    have = 0n;
  }
  if (requested > have) {
    if (have === 1n && looksLikeOneDisplayUnit(input)) {
      return { quantity: '1' };
    }
    return {
      error:
        'Token amount is larger than this wallet holds. Check the amount and token decimals.',
    };
  }
  return { quantity: requested.toString() };
};

/**
 * If hex looks like CBOR definite-bytes wrapping a name (`45` + 5 bytes),
 * return the inner name hex so Send and UTxO inventory compare the same unit.
 */
export const unwrapAssetNameHex = (nameHex) => {
  if (!nameHex || nameHex.length % 2 !== 0) return nameHex || '';
  try {
    const bytes = Buffer.from(nameHex, 'hex');
    if (bytes.length === 0) return nameHex;
    const b0 = bytes[0];
    if (b0 >= 0x40 && b0 <= 0x57) {
      const len = b0 - 0x40;
      if (bytes.length === 1 + len) return bytes.slice(1).toString('hex');
    }
  } catch (/** @type {any} */ _) {
    return nameHex;
  }
  return nameHex;
};

/**
 * Resolve a picker/store asset to a spendable UTxO inventory row.
 * Matches exact unit, then same policy + unwrapped asset name.
 */
export const matchSpendableToken = (asset, spendableAssets) => {
  if (!asset?.unit || !Array.isArray(spendableAssets)) return null;
  const exact = spendableAssets.find((row) => row.unit === asset.unit);
  if (exact) return exact;
  const policy = asset.unit.slice(0, 56);
  if (policy.length !== 56) return null;
  const requestedName = unwrapAssetNameHex(asset.unit.slice(56));
  return (
    spendableAssets.find(
      (row) =>
        row.unit.slice(0, 56) === policy &&
        unwrapAssetNameHex(row.unit.slice(56)) === requestedName
    ) || null
  );
};

export const formatUtxoBalanceInsufficient = (message) => {
  const msg = message ? String(message) : '';
  if (/UTxO Balance Insufficient/i.test(msg)) {
    return 'Not enough of the selected token in spendable UTxOs. Check the token amount, or send ADA only.';
  }
  return msg;
};
