/**
 * Real-CSL tests for the signing pipeline.
 * Exercises buildVkeyWitnessSet + assembleSignedTransaction + value conservation.
 */
import { buildVkeyWitnessSet } from '../../../api/tx/sign-witness-set';
import {
  buildUnsignedSimpleTx,
  toCanonicalTransactionCip21,
} from '../../../api/tx/csl-unsigned-tx';

const CSL = require('@emurgo/cardano-serialization-lib-nodejs');

const TEST_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';

function makeUtxo(coin, index = 0) {
  const txHash = CSL.TransactionHash.from_hex('aa'.repeat(32));
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(txHash, index),
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
}

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

function buildTestTx(inputCoins = 10_000_000, outputCoins = 3_000_000) {
  const utxos = [makeUtxo(inputCoins)];
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(outputCoins)))
    )
  );
  const paymentKey = CSL.PrivateKey.generate_ed25519();
  const paymentKeyHash = paymentKey.to_public().hash().to_hex();
  const stakeKey = CSL.PrivateKey.generate_ed25519();
  const stakeKeyHash = stakeKey.to_public().hash().to_hex();

  const tx = buildUnsignedSimpleTx({
    Cardano: CSL,
    protocolParameters: PROTOCOL_PARAMS,
    utxos,
    outputs,
    changeAddressBech32: TEST_ADDR,
    requiredVkeyHashesHex: [paymentKeyHash, stakeKeyHash],
  });

  return { tx, paymentKey, paymentKeyHash, stakeKey, stakeKeyHash };
}

describe('buildVkeyWitnessSet', () => {
  test('produces Vkeywitnesses with correct count', () => {
    const { tx, paymentKey, paymentKeyHash, stakeKey, stakeKeyHash } =
      buildTestTx();
    const txHex = Buffer.from(tx.to_bytes()).toString('hex');

    const keyMap = new Map([
      [paymentKeyHash, paymentKey],
      [stakeKeyHash, stakeKey],
    ]);

    const witnessSet = buildVkeyWitnessSet(
      CSL,
      txHex,
      keyMap,
      [paymentKeyHash, stakeKeyHash]
    );

    const vkeys = witnessSet.vkeys();
    expect(vkeys).toBeDefined();
    expect(vkeys.len()).toBe(2);
  });

  test('partialSign skips missing keys without throwing', () => {
    const { tx, paymentKey, paymentKeyHash } = buildTestTx();
    const txHex = Buffer.from(tx.to_bytes()).toString('hex');

    const keyMap = new Map([[paymentKeyHash, paymentKey]]);
    const witnessSet = buildVkeyWitnessSet(
      CSL,
      txHex,
      keyMap,
      [paymentKeyHash, 'cc'.repeat(28)],
      true
    );

    expect(witnessSet.vkeys().len()).toBe(1);
  });

  test('throws when key missing and partialSign is false', () => {
    const { tx, paymentKey, paymentKeyHash } = buildTestTx();
    const txHex = Buffer.from(tx.to_bytes()).toString('hex');

    const keyMap = new Map([[paymentKeyHash, paymentKey]]);
    expect(() =>
      buildVkeyWitnessSet(
        CSL,
        txHex,
        keyMap,
        [paymentKeyHash, 'cc'.repeat(28)],
        false
      )
    ).toThrow();
  });
});

describe('signed transaction value conservation', () => {
  test('assembled signed tx conserves value (inputs == outputs + fee)', () => {
    const inputCoins = 10_000_000n;
    const { tx, paymentKey, paymentKeyHash, stakeKey, stakeKeyHash } =
      buildTestTx(Number(inputCoins));
    const txHex = Buffer.from(tx.to_bytes()).toString('hex');

    const keyMap = new Map([
      [paymentKeyHash, paymentKey],
      [stakeKeyHash, stakeKey],
    ]);
    const witnessSet = buildVkeyWitnessSet(
      CSL,
      txHex,
      keyMap,
      [paymentKeyHash, stakeKeyHash]
    );

    const signed = CSL.Transaction.new(
      tx.body(),
      witnessSet,
      tx.auxiliary_data()
    );

    const body = signed.body();
    let outputSum = 0n;
    for (let i = 0; i < body.outputs().len(); i++) {
      outputSum += BigInt(body.outputs().get(i).amount().coin().to_str());
    }
    const fee = BigInt(body.fee().to_str());
    expect(outputSum + fee).toBe(inputCoins);
  });
});

describe('CIP-21 canonical encoding', () => {
  test('body hash is preserved through CIP-21 transform', () => {
    const { tx } = buildTestTx();

    const originalBody = tx.body();
    const originalHash = Buffer.from(
      CSL.FixedTransactionBody.from_bytes(originalBody.to_bytes())
        .tx_hash()
        .to_bytes()
    ).toString('hex');

    const canonical = toCanonicalTransactionCip21(CSL, tx);
    const canonicalBody = canonical.body();
    const canonicalHash = Buffer.from(
      CSL.FixedTransactionBody.from_bytes(canonicalBody.to_bytes())
        .tx_hash()
        .to_bytes()
    ).toString('hex');

    expect(canonicalHash).toBe(originalHash);
  });
});
