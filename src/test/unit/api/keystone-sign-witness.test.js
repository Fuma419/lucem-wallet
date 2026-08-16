/**
 * @jest-environment node
 *
 * Real-CSL checks for Keystone witness assembly helpers.
 */

import { buildUnsignedSimpleTx } from '../../../api/tx/csl-unsigned-tx';
import {
  assertKeystoneWitnessesCover,
  cardanoTxBodyHashHex,
  vkeyHashesFromWitnessSet,
} from '../../../api/keystone-cardano';

const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

const TEST_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

function makeUtxo(coin) {
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(CSL.TransactionHash.from_hex('aa'.repeat(32)), 0),
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
}

function makeOutputs(coin) {
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
  return outputs;
}

describe('Keystone witness helpers', () => {
  test('cardanoTxBodyHashHex matches FixedTransactionBody.tx_hash', () => {
    const paymentKey = CSL.PrivateKey.generate_ed25519();
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(10_000_000)],
      outputs: makeOutputs(2_000_000),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: [paymentKey.to_public().hash().to_hex()],
    });
    const fixed = CSL.FixedTransactionBody.from_bytes(tx.body().to_bytes());
    const bodyHash = cardanoTxBodyHashHex(CSL, tx);
    expect(bodyHash).toBe(
      Buffer.from(fixed.tx_hash().to_bytes()).toString('hex')
    );
    expect(bodyHash).toHaveLength(64);
    expect(bodyHash).not.toBe(
      require('crypto')
        .createHash('sha256')
        .update(Buffer.from(tx.to_bytes()))
        .digest('hex')
    );
  });

  test('assertKeystoneWitnessesCover accepts the payment vkey and rejects empty', () => {
    const paymentKey = CSL.PrivateKey.generate_ed25519();
    const paymentHash = paymentKey.to_public().hash().to_hex();
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(10_000_000)],
      outputs: makeOutputs(2_000_000),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: [paymentHash],
    });
    const empty = CSL.TransactionWitnessSet.new();
    expect(() =>
      assertKeystoneWitnessesCover(CSL, tx, empty, [paymentHash])
    ).toThrow(/empty signature/);

    const fixed = CSL.FixedTransactionBody.from_bytes(tx.body().to_bytes());
    const vkeys = CSL.Vkeywitnesses.new();
    vkeys.add(CSL.make_vkey_witness(fixed.tx_hash(), paymentKey));
    const ws = CSL.TransactionWitnessSet.new();
    ws.set_vkeys(vkeys);
    expect(vkeyHashesFromWitnessSet(CSL, ws)).toEqual([paymentHash]);
    expect(() =>
      assertKeystoneWitnessesCover(CSL, tx, ws, [paymentHash])
    ).not.toThrow();

    const other = CSL.PrivateKey.generate_ed25519();
    expect(() =>
      assertKeystoneWitnessesCover(CSL, tx, ws, [
        other.to_public().hash().to_hex(),
      ])
    ).toThrow(/different key/);
  });
});
