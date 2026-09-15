/**
 * Cardano submit nodes often accept a tx, then a second POST (or the Koios
 * fallback after Blockfrost) fails with ConwayMempoolFailure "All inputs are
 * spent. Transaction has probably already been included". That is a duplicate
 * submit of a tx that is already in the mempool or on-chain — not a failed vote.
 *
 * Leaf module: do not import pending-history or extension/storage (those import
 * util.js, and util.js calls this helper).
 */
import Loader from '../loader';

export const ALREADY_INCLUDED_USER_MESSAGE =
  'This transaction is already on the network, or its coins were already spent. Check history; wait for it to confirm before sending another.';

/**
 * @param {unknown} errorOrText
 * @returns {boolean}
 */
export const isAlreadyIncludedSubmitError = (errorOrText) => {
  const text = String(
    errorOrText && typeof errorOrText === 'object' && 'message' in errorOrText
      ? /** @type {{ message?: unknown }} */ (errorOrText).message
      : errorOrText || ''
  );
  return (
    /All inputs are spent/i.test(text) ||
    /already been included/i.test(text) ||
    /already included/i.test(text)
  );
};

/**
 * Body hash of a signed tx CBOR hex. Used when the node refuses a duplicate
 * submit so the wallet can still record the pending hash.
 * @param {string} txHex
 * @returns {Promise<string>}
 */
export const txHashFromCborHex = async (txHex) => {
  if (!txHex || typeof txHex !== 'string') {
    throw new Error('Missing transaction hex');
  }
  await Loader.load();
  const Cardano = Loader.Cardano;
  const tx =
    typeof Cardano.Transaction.from_hex === 'function'
      ? Cardano.Transaction.from_hex(txHex)
      : Cardano.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
  const fixed = Cardano.FixedTransactionBody.from_bytes(tx.body().to_bytes());
  const hex = Buffer.from(fixed.tx_hash().to_bytes()).toString('hex');
  if (typeof fixed.free === 'function') fixed.free();
  return hex;
};
