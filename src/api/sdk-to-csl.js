import Loader from './loader';

/**
 * Boundary for Cardano SDK (or any non-CSL builder): unsigned tx must become an Emurgo CSL
 * `Transaction` before software signing, Ledger/Trezor encoding, or Keystone UR flows.
 *
 * @param {Uint8Array | Buffer} txBytes — canonical unsigned transaction CBOR
 * @returns {Promise<import('@emurgo/cardano-serialization-lib-browser').Transaction>}
 */
export async function cslTransactionFromTxBytes(txBytes) {
  await Loader.load();
  const u8 =
    txBytes instanceof Uint8Array ? txBytes : new Uint8Array(txBytes);
  return Loader.Cardano.Transaction.from_bytes(u8);
}

/**
 * @param {string} txHex — hex-encoded tx CBOR (optional 0x prefix stripped)
 * @returns {Promise<import('@emurgo/cardano-serialization-lib-browser').Transaction>}
 */
export async function cslTransactionFromTxHex(txHex) {
  const hex =
    typeof txHex === 'string' ? txHex.trim().replace(/^0x/i, '') : '';
  return cslTransactionFromTxBytes(Buffer.from(hex, 'hex'));
}
