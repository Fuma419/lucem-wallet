/**
 * CSL 15 TransactionBody / TransactionOutput accessors.
 * Nami-era code called collateral_inputs() and output.datum(); those
 * names are gone and throw TypeError, which used to leave the CIP-30
 * sign popup spinning forever.
 */

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
