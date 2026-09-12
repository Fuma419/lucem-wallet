/**
 * CSL 15 TransactionBody / TransactionOutput accessors.
 * Nami-era code called collateral_inputs() and output.datum(); those
 * names are gone and throw TypeError, which used to leave the CIP-30
 * sign popup spinning forever.
 */

/**
 * TransactionInput.index() is a plain number in CSL v15. Older bindings
 * returned a BigNum with to_str(). Calling to_str() on a number throws
 * `G1.index(...).to_str is not a function` and aborted Ledger signing.
 * @param {{ index?: () => unknown } | null | undefined} input
 * @returns {number}
 */
export const transactionInputIndex = (input) => {
  const idx = input && typeof input.index === 'function' ? input.index() : input;
  if (typeof idx === 'number' && Number.isFinite(idx)) return idx;
  if (
    idx &&
    typeof idx === 'object' &&
    typeof /** @type {{ to_str?: () => string }} */ (idx).to_str === 'function'
  ) {
    return parseInt(
      /** @type {{ to_str: () => string }} */ (idx).to_str(),
      10
    );
  }
  const parsed = parseInt(String(idx), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Slot / quantity fields that used to be BigNum (to_str) are a plain number
 * in CSL v15. Calling to_str() on a number throws
 * `Oe.ttl(...).to_str is not a function` the same way index() did.
 * @param {unknown} value
 * @returns {string | null}
 */
export const optionalUintToStr = (value) => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' && value !== '') return value;
  if (
    typeof value === 'object' &&
    typeof /** @type {{ to_str?: () => string }} */ (value).to_str ===
      'function'
  ) {
    return /** @type {{ to_str: () => string }} */ (value).to_str();
  }
  return null;
};

/** @param {any} txBody */
export const txBodyTtl = (txBody) => {
  if (!txBody) return null;
  if (typeof txBody.ttl === 'function') {
    const asStr = optionalUintToStr(txBody.ttl());
    if (asStr != null) return asStr;
  }
  if (typeof txBody.ttl_bignum === 'function') {
    return optionalUintToStr(txBody.ttl_bignum());
  }
  return null;
};

/** @param {any} txBody */
export const txBodyValidityStart = (txBody) => {
  if (!txBody) return null;
  if (typeof txBody.validity_start_interval === 'function') {
    const asStr = optionalUintToStr(txBody.validity_start_interval());
    if (asStr != null) return asStr;
  }
  if (typeof txBody.validity_start_interval_bignum === 'function') {
    const asStr = optionalUintToStr(txBody.validity_start_interval_bignum());
    if (asStr != null) return asStr;
  }
  // Nami-era name
  if (typeof txBody.validity_interval_start === 'function') {
    return optionalUintToStr(txBody.validity_interval_start());
  }
  return null;
};

/**
 * CSL v15 dropped output.datum() and output.kind(). Datum hash is
 * data_hash(); inline datum is plutus_data() when has_plutus_data().
 * Babbage (map) outputs are required for inline datum or a script ref.
 * @param {any} output
 * @returns {{
 *   datum: { type: 'hash', datumHashHex: string } | { type: 'inline', datumHex: string } | null,
 *   isBabbage: boolean,
 *   referenceScriptHex: string | null,
 * }}
 */
export const ledgerOutputDatum = (output) => {
  const empty = { datum: null, isBabbage: false, referenceScriptHex: null };
  if (!output) return empty;
  try {
    let referenceScriptHex = null;
    if (
      typeof output.has_script_ref === 'function'
        ? output.has_script_ref()
        : typeof output.script_ref === 'function'
    ) {
      const ref = output.script_ref();
      if (ref) {
        referenceScriptHex = Buffer.from(ref.to_bytes()).toString('hex');
      }
    }

    /** @type {{ type: 'hash', datumHashHex: string } | { type: 'inline', datumHex: string } | null} */
    let datum = null;
    if (
      typeof output.has_plutus_data === 'function' &&
      output.has_plutus_data() &&
      typeof output.plutus_data === 'function'
    ) {
      const data = output.plutus_data();
      if (data) {
        datum = {
          type: 'inline',
          datumHex: Buffer.from(data.to_bytes()).toString('hex'),
        };
      }
    } else if (
      typeof output.has_data_hash === 'function' &&
      output.has_data_hash() &&
      typeof output.data_hash === 'function'
    ) {
      const hash = output.data_hash();
      if (hash) {
        datum = {
          type: 'hash',
          datumHashHex: Buffer.from(hash.to_bytes()).toString('hex'),
        };
      }
    } else if (typeof output.datum === 'function') {
      const old = output.datum();
      if (old) {
        if (old.kind() === 0) {
          datum = {
            type: 'hash',
            datumHashHex: Buffer.from(old.as_hash().to_bytes()).toString('hex'),
          };
        } else {
          datum = {
            type: 'inline',
            datumHex: Buffer.from(old.as_datum().to_bytes()).toString('hex'),
          };
        }
      }
    }

    let isBabbage =
      Boolean(datum && datum.type === 'inline') || Boolean(referenceScriptHex);
    if (!isBabbage && typeof output.kind === 'function') {
      isBabbage = Boolean(output.kind());
    }
    return { datum, isBabbage, referenceScriptHex };
  } catch (/** @type {any} */ _) {
    return empty;
  }
};

export const txBodyCollateral = (txBody) => {
  if (!txBody) return undefined;
  if (typeof txBody.collateral === 'function') {
    return txBody.collateral();
  }
  if (typeof txBody.collateral_inputs === 'function') {
    return txBody.collateral_inputs();
  }
  return undefined;
};

export const outputHasDatum = (output) => {
  if (!output) return false;
  try {
    if (typeof output.has_data_hash === 'function' && output.has_data_hash()) {
      return true;
    }
    if (
      typeof output.has_plutus_data === 'function' &&
      output.has_plutus_data()
    ) {
      return true;
    }
    if (typeof output.data_hash === 'function' && output.data_hash()) {
      return true;
    }
    if (typeof output.plutus_data === 'function' && output.plutus_data()) {
      return true;
    }
    if (typeof output.datum === 'function' && output.datum()) {
      return true;
    }
  } catch (/** @type {any} */ _) {
    return false;
  }
  return false;
};

export const outputDatumHashHex = (output, Cardano) => {
  if (!output) return undefined;
  try {
    if (typeof output.data_hash === 'function') {
      const hash = output.data_hash();
      if (hash) return Buffer.from(hash.to_bytes()).toString('hex');
    }
    if (typeof output.plutus_data === 'function') {
      const data = output.plutus_data();
      if (data && Cardano && typeof Cardano.hash_plutus_data === 'function') {
        return Buffer.from(
          Cardano.hash_plutus_data(data).to_bytes()
        ).toString('hex');
      }
    }
    if (typeof output.datum === 'function') {
      const datum = output.datum();
      if (!datum) return undefined;
      if (datum.kind() === 0) {
        return Buffer.from(datum.as_hash().to_bytes()).toString('hex');
      }
      if (Cardano && typeof Cardano.hash_plutus_data === 'function') {
        return Buffer.from(
          Cardano.hash_plutus_data(datum.as_datum()).to_bytes()
        ).toString('hex');
      }
    }
  } catch (/** @type {any} */ _) {
    return undefined;
  }
  return undefined;
};
