/**
 * Pure CSL signing helper — no storage, no key derivation.
 * Testable independently of the extension environment.
 */

import type { Csl, HexString } from '../types';

/**
 * Build a TransactionWitnessSet with vkey witnesses for the given signing keys.
 */
export function buildVkeyWitnessSet(
  Cardano: Csl,
  txHex: string,
  keyHashToSigningKey: Map<string, unknown>,
  requestedKeyHashes: string[],
  partialSign = false
) {
  const rawTx = Cardano.Transaction.from_bytes(Buffer.from(txHex as HexString, 'hex'));
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
