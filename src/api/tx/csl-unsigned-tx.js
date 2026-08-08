/**
 * Central CSL transaction assembly for payment-style flows.
 * See docs/TX_ARCHITECTURE_PLAN.md.
 */

import { decodeTx, encodeTx, transformTx } from 'cardano-hw-interop-lib';
import { TX } from '../../config/config';

const FEE_ALIGN_MAX_ATTEMPTS = 5;

/**
 * @param {*} Cardano - Emurgo CSL namespace
 * @param {object} protocolParameters - snapshot from `buildProtocolParametersSnapshot`
 * @param {object} [options]
 * @param {boolean} [options.preferPureChange=true] - split change into a pure-ADA
 *   output when possible. Send-all disables this so the whole balance (ADA +
 *   every token) lands in a single consolidated output.
 */
export function createCslTransactionBuilderConfig(
  Cardano,
  protocolParameters,
  { preferPureChange = true } = {}
) {
  const p = protocolParameters;
  if (!p.linearFee?.minFeeA || !p.linearFee?.minFeeB) {
    throw new Error('Invalid protocol parameters: linearFee');
  }
  if (!p.poolDeposit || !p.keyDeposit || !p.coinsPerUtxoWord) {
    throw new Error(
      'Invalid protocol parameters: poolDeposit, keyDeposit, or coinsPerUtxoWord'
    );
  }
  if (!p.maxValSize || !p.maxTxSize) {
    throw new Error('Invalid protocol parameters: maxValSize or maxTxSize');
  }
  return Cardano.TransactionBuilderConfigBuilder.new()
    .fee_algo(
      Cardano.LinearFee.new(
        Cardano.BigNum.from_str(String(p.linearFee.minFeeA)),
        Cardano.BigNum.from_str(String(p.linearFee.minFeeB))
      )
    )
    .pool_deposit(Cardano.BigNum.from_str(String(p.poolDeposit)))
    .key_deposit(Cardano.BigNum.from_str(String(p.keyDeposit)))
    .coins_per_utxo_byte(Cardano.BigNum.from_str(String(p.coinsPerUtxoWord)))
    .max_value_size(parseInt(String(p.maxValSize), 10))
    .max_tx_size(parseInt(String(p.maxTxSize), 10))
    .prefer_pure_change(preferPureChange)
    .build();
}

/**
 * CIP-0021 canonical CBOR for hardware wallets / consistent submit encoding.
 * @param {*} Cardano
 * @param {*} tx - CSL Transaction
 */
export function toCanonicalTransactionCip21(Cardano, tx) {
  const canonicalCbor = encodeTx(transformTx(decodeTx(tx.to_bytes())));
  return Cardano.Transaction.from_bytes(canonicalCbor);
}

/**
 * @param {*} Cardano
 * @param {*} body - TransactionBody
 * @param {string[]} requiredVkeyHashesHex
 */
function dummyWitnessSetForMinFee(Cardano, body, requiredVkeyHashesHex) {
  const bodyBytes = body.to_bytes();
  const fixedBody = Cardano.FixedTransactionBody.from_bytes(bodyBytes);
  const txHash = fixedBody.tx_hash();
  if (typeof fixedBody.free === 'function') fixedBody.free();

  const vkeys = Cardano.Vkeywitnesses.new();
  const n = requiredVkeyHashesHex.length;
  for (let i = 0; i < n; i += 1) {
    const sk = Cardano.PrivateKey.generate_ed25519();
    vkeys.add(Cardano.make_vkey_witness(txHash, sk));
    if (typeof sk.free === 'function') sk.free();
  }
  const witnessSet = Cardano.TransactionWitnessSet.new();
  witnessSet.set_vkeys(vkeys);
  return witnessSet;
}

function ttlInvalidHereafterBignum(Cardano, protocolParameters) {
  const base = Math.floor(Number(protocolParameters.slot));
  if (!Number.isFinite(base) || base < 0) {
    throw new Error('Invalid chain slot in protocol parameters');
  }
  return Cardano.BigNum.from_str(String(base + TX.invalid_hereafter));
}

/**
 * Payment-style unsigned transaction: inputs from UTxO set, explicit outputs, change, TTL.
 * Aligns body fee with `Cardano.min_fee` using ephemeral dummy vkeys (no user keys required).
 *
 * @param {object} opts
 * @param {*} opts.Cardano
 * @param {object} opts.protocolParameters
 * @param {Array} opts.utxos - CSL TransactionUnspentOutput[]
 * @param {*} opts.outputs - CSL TransactionOutputs
 * @param {string} opts.changeAddressBech32
 * @param {string[]} opts.requiredVkeyHashesHex - hex key hashes that will sign (fee sizing)
 * @param {*} [opts.auxiliaryData]
 */
export function buildUnsignedSimpleTx({
  Cardano,
  protocolParameters,
  utxos,
  outputs,
  changeAddressBech32,
  requiredVkeyHashesHex,
  auxiliaryData = null,
}) {
  if (!requiredVkeyHashesHex?.length) {
    throw new Error(
      'requiredVkeyHashesHex must list key hashes that will sign (fee sizing)'
    );
  }
  if (!utxos?.length) {
    throw new Error('No UTxOs provided for transaction');
  }
  const linearFee = Cardano.LinearFee.new(
    Cardano.BigNum.from_str(String(protocolParameters.linearFee.minFeeA)),
    Cardano.BigNum.from_str(String(protocolParameters.linearFee.minFeeB))
  );
  const txConfig = createCslTransactionBuilderConfig(
    Cardano,
    protocolParameters
  );
  const changeAddress = Cardano.Address.from_bech32(changeAddressBech32);
  const invalidHereafter = ttlInvalidHereafterBignum(Cardano, protocolParameters);

  const utxoCollection = Cardano.TransactionUnspentOutputs.new();
  for (const u of utxos) {
    utxoCollection.add(u);
  }

  // Token transfers may involve multi-asset UTxOs and/or multi-asset change outputs.
  // Using a multi-asset-aware coin selection strategy avoids building transactions
  // that the ledger rejects at submission time.
  let containsMultiasset = false;
  for (let i = 0; i < outputs.len(); i += 1) {
    const multiAsset = outputs.get(i).amount().multiasset();
    if (multiAsset && multiAsset.len() > 0) {
      containsMultiasset = true;
      break;
    }
  }
  if (!containsMultiasset) {
    for (const u of utxos) {
      const multiAsset = u.output().amount().multiasset();
      if (multiAsset && multiAsset.len() > 0) {
        containsMultiasset = true;
        break;
      }
    }
  }

  // Prefer multi-asset strategies that account for change min-ADA. Plain
  // LargestFirst cannot select multi-asset UTxOs.
  const inputSelectionStrategy = containsMultiasset
    ? Cardano.CoinSelectionStrategyCIP2.RandomImproveMultiAsset
    : Cardano.CoinSelectionStrategyCIP2.LargestFirst;

  // Use set_min_fee (floor) — never set_fee (exact upper bound) — before change.
  // set_fee + leftover in (fee, minUTxO) throws:
  // "Not enough ADA leftover to include a new change output. And leftovers is bigger than fee upper bound"
  let minFeeFloor = null;

  for (let attempt = 0; attempt < FEE_ALIGN_MAX_ATTEMPTS; attempt += 1) {
    const txBuilder = Cardano.TransactionBuilder.new(txConfig);
    for (let i = 0; i < outputs.len(); i += 1) {
      txBuilder.add_output(outputs.get(i));
    }
    for (const hex of requiredVkeyHashesHex) {
      txBuilder.add_required_signer(
        Cardano.Ed25519KeyHash.from_bytes(Buffer.from(hex, 'hex'))
      );
    }
    // TTL / aux before change so size (and fee) include them.
    txBuilder.set_ttl_bignum(invalidHereafter);
    if (auxiliaryData) {
      txBuilder.set_auxiliary_data(auxiliaryData);
    }
    if (minFeeFloor != null) {
      txBuilder.set_min_fee(minFeeFloor);
    }
    // Coin selection + change in one step (CSL-recommended; considers change min-ADA).
    txBuilder.add_inputs_from_and_change(
      utxoCollection,
      inputSelectionStrategy,
      Cardano.ChangeConfig.new(changeAddress)
    );

    const txBody = txBuilder.build();

    const emptyW = Cardano.TransactionWitnessSet.new();
    const unsigned = Cardano.Transaction.new(
      txBody,
      emptyW,
      auxiliaryData || undefined
    );
    const dummyW = dummyWitnessSetForMinFee(
      Cardano,
      txBody,
      requiredVkeyHashesHex
    );
    const signedForFee = Cardano.Transaction.new(
      txBody,
      dummyW,
      auxiliaryData || undefined
    );
    signedForFee.set_is_valid(unsigned.is_valid());

    const required = Cardano.min_fee(signedForFee, linearFee);
    if (txBody.fee().compare(required) >= 0) {
      const finalTx = Cardano.Transaction.new(
        txBody,
        emptyW,
        auxiliaryData || undefined
      );
      finalTx.set_is_valid(unsigned.is_valid());
      return toCanonicalTransactionCip21(Cardano, finalTx);
    }
    minFeeFloor = required;
  }

  throw new Error(
    `Could not align transaction fee with ledger minimum after ${FEE_ALIGN_MAX_ATTEMPTS} attempts`
  );
}

/**
 * "Send all" unsigned transaction. Forces EVERY provided UTxO in as an input and
 * sweeps the whole balance — all lovelace plus every native token, minus the
 * network fee — into a single output at the recipient.
 *
 * Unlike `buildUnsignedSimpleTx`, this never runs coin selection: coin selection
 * only pulls the minimum inputs needed to cover a target output, which strands the
 * UTxOs it did not pick. A send-all must instead consume the entire UTxO set, so
 * we add each input explicitly and let one balancing pass compute the fee.
 *
 * The recipient doubles as the change address, so `add_change_if_needed` places
 * the full swept value in one output. CSL sizes the fee (including vkey witnesses
 * inferred from each input's address) and enforces min-ADA. If the wallet genuinely
 * cannot cover the fee plus the min-ADA its tokens require, CSL throws and we
 * surface a clear "not enough ADA" error — the real insufficiency case, not the
 * spurious one the old fee-reduction heuristic produced.
 *
 * @param {object} opts
 * @param {*} opts.Cardano
 * @param {object} opts.protocolParameters
 * @param {Array} opts.utxos - CSL TransactionUnspentOutput[] (all get spent)
 * @param {string} opts.recipientAddressBech32 - destination for the whole balance
 * @param {*} [opts.auxiliaryData]
 */
export function buildUnsignedSendAllTx({
  Cardano,
  protocolParameters,
  utxos,
  recipientAddressBech32,
  auxiliaryData = null,
}) {
  if (!utxos?.length) {
    throw new Error('No UTxOs provided for send all');
  }
  const txConfig = createCslTransactionBuilderConfig(
    Cardano,
    protocolParameters,
    { preferPureChange: false }
  );
  const txBuilder = Cardano.TransactionBuilder.new(txConfig);
  const recipientAddress = Cardano.Address.from_bech32(recipientAddressBech32);
  const invalidHereafter = ttlInvalidHereafterBignum(
    Cardano,
    protocolParameters
  );

  // Force every UTxO in — coin selection would pick a subset and strand funds,
  // which is the exact bug that made "send all" leave money behind.
  for (const u of utxos) {
    txBuilder.add_regular_input(
      u.output().address(),
      u.input(),
      u.output().amount()
    );
  }

  // TTL / aux before change so size (and fee) account for them.
  txBuilder.set_ttl_bignum(invalidHereafter);
  if (auxiliaryData) {
    txBuilder.set_auxiliary_data(auxiliaryData);
  }

  // One balancing pass: with the recipient as the change address and no explicit
  // outputs, the whole balance minus fee (every token included) lands in a single
  // output. CSL enforces min-ADA and throws on genuine dust.
  let added;
  try {
    added = txBuilder.add_change_if_needed(recipientAddress);
  } catch (e) {
    throw new Error(
      'Not enough ADA to cover the network fee and the minimum required for the selected assets'
    );
  }
  if (!added) {
    throw new Error(
      'Send all could not produce an output — the wallet balance is empty'
    );
  }

  const txBody = txBuilder.build();
  const emptyW = Cardano.TransactionWitnessSet.new();
  const finalTx = Cardano.Transaction.new(
    txBody,
    emptyW,
    auxiliaryData || undefined
  );
  return toCanonicalTransactionCip21(Cardano, finalTx);
}
