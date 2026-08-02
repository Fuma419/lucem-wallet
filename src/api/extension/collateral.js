/**
 * CIP-30 getCollateral helpers (legacy; prefer CIP-40 collateral return).
 * Pure utilities kept separate for unit testing without WASM.
 */

/** Protocol-friendly max request (~5 ADA). */
export const MAX_COLLATERAL_AMOUNT = 5_000_000n;

/** Soft cap for a single collateral UTxO without collateral return. */
export const MAX_COLLATERAL_UTXO = 50_000_000n;

/**
 * Koios address_info.utxo_set uses `tx_index`; address_utxos often uses `output_index`.
 * @param {{ output_index?: number, tx_index?: number }} utxo
 * @returns {number|undefined}
 */
export const utxoOutputIndex = (utxo) => utxo.output_index ?? utxo.tx_index;

/**
 * @param {Array<{ tx_hash: string, output_index?: number, tx_index?: number }>} utxoSet
 * @param {{ txHash: string, txId: number }|null|undefined} collateral
 * @returns {boolean}
 */
export const isReservedCollateralPresent = (utxoSet, collateral) => {
  if (!collateral || !Array.isArray(utxoSet)) return false;
  return utxoSet.some(
    (utxo) =>
      utxo.tx_hash === collateral.txHash &&
      utxoOutputIndex(utxo) === collateral.txId
  );
};

/**
 * Parse CIP-30 getCollateral amount into lovelace.
 * Accepts CBOR hex (Coin / Value), decimal string, or number.
 * Cap is MAX_COLLATERAL_AMOUNT; omitted amount defaults to the cap.
 *
 * @param {unknown} amount
 * @param {{ decodeCoin: (hex: string) => bigint }} cbor
 * @returns {bigint}
 */
export const parseCollateralAmount = (amount, cbor) => {
  if (amount == null || amount === '') {
    return MAX_COLLATERAL_AMOUNT;
  }

  let lovelace;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
      throw new Error('invalid collateral amount');
    }
    lovelace = BigInt(amount);
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (/^\d+$/.test(trimmed)) {
      lovelace = BigInt(trimmed);
    } else if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
      lovelace = cbor.decodeCoin(trimmed);
    } else {
      throw new Error('invalid collateral amount');
    }
  } else if (typeof amount === 'bigint') {
    if (amount < 0n) throw new Error('invalid collateral amount');
    lovelace = amount;
  } else {
    throw new Error('invalid collateral amount');
  }

  if (lovelace > MAX_COLLATERAL_AMOUNT) {
    throw new Error('requested amount is too big');
  }
  return lovelace;
};

/**
 * Greedy ADA-only selection covering at least `minLovelace`.
 * Prefers smaller UTxOs; skips multiasset and oversized entries.
 *
 * @param {Array<{ coin: bigint, multiassetLen: number, utxo: unknown }>} candidates
 * @param {bigint} minLovelace
 * @returns {unknown[]|null} selected raw utxo objects, or null if insufficient
 */
export const selectCollateralCandidates = (candidates, minLovelace) => {
  const eligible = candidates
    .filter(
      (c) =>
        c.multiassetLen === 0 &&
        c.coin > 0n &&
        c.coin <= MAX_COLLATERAL_UTXO
    )
    .sort((a, b) => (a.coin < b.coin ? -1 : a.coin > b.coin ? 1 : 0));

  const selected = [];
  let total = 0n;
  for (const c of eligible) {
    selected.push(c.utxo);
    total += c.coin;
    if (total >= minLovelace) return selected;
  }
  return null;
};
