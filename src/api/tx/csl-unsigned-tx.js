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
 */
export function createCslTransactionBuilderConfig(Cardano, protocolParameters) {
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
    .prefer_pure_change(true)
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

  let explicitFee = null;

  for (let attempt = 0; attempt < FEE_ALIGN_MAX_ATTEMPTS; attempt += 1) {
    const txBuilder = Cardano.TransactionBuilder.new(txConfig);
    txBuilder.add_inputs_from(
      utxoCollection,
      Cardano.CoinSelectionStrategyCIP2.LargestFirst
    );
    for (let i = 0; i < outputs.len(); i += 1) {
      txBuilder.add_output(outputs.get(i));
    }
    for (const hex of requiredVkeyHashesHex) {
      txBuilder.add_required_signer(
        Cardano.Ed25519KeyHash.from_bytes(Buffer.from(hex, 'hex'))
      );
    }
    if (explicitFee != null) {
      txBuilder.set_fee(explicitFee);
    }
    txBuilder.add_change_if_needed(changeAddress);
    txBuilder.set_ttl_bignum(invalidHereafter);
    if (auxiliaryData) {
      txBuilder.set_auxiliary_data(auxiliaryData);
    }

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
    explicitFee = required;
  }

  throw new Error(
    `Could not align transaction fee with ledger minimum after ${FEE_ALIGN_MAX_ATTEMPTS} attempts`
  );
}
