/**
 * Payment-key hashes for CIP-30 dApp txs.
 *
 * The sign popup used to record the account's *primary* (external index 0)
 * payment hash for every owned input. Mesh/delegation coin selection often
 * spends a change-address UTxO, so the popup asked for the wrong vkey and
 * the ledger rejected the cert tx. Hash the address on the UTxO instead.
 */

const keyHashHex = (credential) => {
  if (!credential || typeof credential.kind !== 'function') return null;
  if (credential.kind() !== 0) return null;
  return Buffer.from(credential.to_keyhash().to_bytes()).toString('hex');
};

export const paymentKeyHashHexFromCslAddress = (Cardano, address) => {
  if (!Cardano || !address) return null;
  try {
    const hex = keyHashHex(
      Cardano.BaseAddress.from_address(address)?.payment_cred()
    );
    if (hex) return hex;
  } catch (/** @type {any} */ _) {
    /* not a base address */
  }
  try {
    const hex = keyHashHex(
      Cardano.EnterpriseAddress.from_address(address)?.payment_cred()
    );
    if (hex) return hex;
  } catch (/** @type {any} */ _) {
    /* not enterprise */
  }
  try {
    const hex = keyHashHex(
      Cardano.PointerAddress.from_address(address)?.payment_cred()
    );
    if (hex) return hex;
  } catch (/** @type {any} */ _) {
    /* not pointer */
  }
  return null;
};

const inputId = (input) => ({
  txHash: Buffer.from(input.transaction_id().to_bytes()).toString('hex'),
  index: parseInt(input.index().toString(), 10),
});

/**
 * Payment key hashes for tx inputs that appear in `utxos` (this account).
 * Unowned inputs are skipped — do not insert a sentinel hash that later
 * makes software signing throw ProofGeneration.
 *
 * @param {object} Cardano CSL
 * @param {object} tx CSL Transaction
 * @param {object[]} utxos CSL TransactionUnspentOutput[]
 * @returns {string[]}
 */
export const ownedInputPaymentHashes = (Cardano, tx, utxos) => {
  const hashes = [];
  const body = tx?.body?.();
  const inputs = body?.inputs?.();
  if (!inputs || typeof inputs.len !== 'function') return hashes;

  const owned = (utxos || []).map((utxo) => ({
    ...inputId(utxo.input()),
    address: utxo.output().address(),
  }));

  for (let i = 0; i < inputs.len(); i++) {
    const { txHash, index } = inputId(inputs.get(i));
    const match = owned.find((u) => u.txHash === txHash && u.index === index);
    if (!match) continue;
    const hash = paymentKeyHashHexFromCslAddress(Cardano, match.address);
    if (hash) hashes.push(hash);
  }
  return hashes;
};
