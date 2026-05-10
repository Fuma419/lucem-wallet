/**
 * Pure CSL signing helper — no storage, no key derivation.
 * Testable independently of the extension environment.
 */

/**
 * Build a TransactionWitnessSet with vkey witnesses for the given signing keys.
 *
 * @param {object} Cardano - CSL namespace
 * @param {string} txHex - transaction CBOR as hex
 * @param {Map<string, PrivateKey>} keyHashToSigningKey - map of key-hash hex → CSL PrivateKey
 * @param {string[]} requestedKeyHashes - which key hashes to sign with
 * @param {boolean} [partialSign=false] - if false, throws when a requested hash has no key
 * @returns {TransactionWitnessSet}
 */
export function buildVkeyWitnessSet(
  Cardano,
  txHex,
  keyHashToSigningKey,
  requestedKeyHashes,
  partialSign = false
) {
  const rawTx = Cardano.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
  const fixedBody = Cardano.FixedTransactionBody.from_bytes(
    rawTx.body().to_bytes()
  );
  const txHash = fixedBody.tx_hash();
  if (typeof fixedBody.free === 'function') fixedBody.free();

  const vkeys = Cardano.Vkeywitnesses.new();
  for (const keyHash of requestedKeyHashes) {
    const signingKey = keyHashToSigningKey.get(keyHash);
    if (!signingKey) {
      if (!partialSign) {
        throw new Error(`No signing key for hash ${keyHash}`);
      }
      continue;
    }
    vkeys.add(Cardano.make_vkey_witness(txHash, signingKey));
  }

  const witnessSet = Cardano.TransactionWitnessSet.new();
  witnessSet.set_vkeys(vkeys);
  return witnessSet;
}
