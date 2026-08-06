/**
 * Regression: CSL change dead-zone when fee-align uses set_fee before change.
 *
 * Error: "Not enough ADA leftover to include a new change output.
 * And leftovers is bigger than fee upper bound"
 *
 * Why unit/integration tests missed it:
 * - build-tx tests use comfortable leftovers (send 2–3 ADA from 10 ADA) where
 *   change is well above minUTxO, so fee-align never enters the dead zone.
 * - Live integration self-sends a fixed small amount with ample change.
 * - The failure needs (1) leftover near minUTxO and (2) fee-align calling
 *   set_fee(exact) before add_change_if_needed, which treats that fee as an
 *   upper bound and refuses to burn leftover into fee.
 */
const fs = require('fs');
const path = require('path');
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  buildUnsignedSimpleTx,
  createCslTransactionBuilderConfig,
} = require('../../../api/tx/csl-unsigned-tx');

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

const DEAD_ZONE_ERROR =
  /Not enough ADA leftover to include a new change output\. And leftovers is bigger than fee upper bound/;

function makeUtxo(coin, index = 0, txHashHex = 'aa'.repeat(32)) {
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(CSL.TransactionHash.from_hex(txHashHex), index),
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
}

function makeOutputs(coins) {
  const outputs = CSL.TransactionOutputs.new();
  for (const c of coins) {
    outputs.add(
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(TEST_ADDR),
        CSL.Value.new(CSL.BigNum.from_str(String(c)))
      )
    );
  }
  return outputs;
}

function dummyKeyHashes(n = 1) {
  return Array.from({ length: n }, () =>
    CSL.PrivateKey.generate_ed25519().to_public().hash().to_hex()
  );
}

describe('change leftover / fee upper bound', () => {
  test('CSL set_fee + marginal leftover reproduces the production error', () => {
    // input 10 ADA, send 8.85 ADA → ~1.15 ADA leftover (near minUTxO).
    // Locking fee exactly at 218829 leaves leftover that cannot form change
    // and cannot be burned because it exceeds the exact fee upper bound.
    const txBuilder = CSL.TransactionBuilder.new(
      createCslTransactionBuilderConfig(CSL, PROTOCOL_PARAMS)
    );
    txBuilder.add_output(makeOutputs([8_850_000]).get(0));
    const col = CSL.TransactionUnspentOutputs.new();
    col.add(makeUtxo(10_000_000));
    txBuilder.add_inputs_from(
      col,
      CSL.CoinSelectionStrategyCIP2.LargestFirst
    );
    txBuilder.set_fee(CSL.BigNum.from_str('218829'));

    expect(() =>
      txBuilder.add_change_if_needed(CSL.Address.from_bech32(TEST_ADDR))
    ).toThrow(DEAD_ZONE_ERROR);
  });

  test('fee-align loop must use set_min_fee (not set_fee) before change', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/tx/csl-unsigned-tx.js'),
      'utf8'
    );
    const loopStart = src.indexOf(
      'for (let attempt = 0; attempt < FEE_ALIGN_MAX_ATTEMPTS'
    );
    expect(loopStart).toBeGreaterThan(-1);
    const loopBody = src.slice(
      loopStart,
      src.indexOf(
        'Could not align transaction fee with ledger minimum',
        loopStart
      )
    );
    expect(loopBody).toMatch(/set_min_fee\(/);
    expect(loopBody).not.toMatch(/\.set_fee\(/);
  });

  test('buildUnsignedSimpleTx succeeds for marginal leftover band', () => {
    // Same UTxO/output shape that dead-zones under set_fee during fee-align.
    for (const keys of [1, 2, 4, 8]) {
      for (const out of [8_800_000, 8_850_000, 8_870_000, 8_900_000]) {
        const tx = buildUnsignedSimpleTx({
          Cardano: CSL,
          protocolParameters: PROTOCOL_PARAMS,
          utxos: [makeUtxo(10_000_000)],
          outputs: makeOutputs([out]),
          changeAddressBech32: TEST_ADDR,
          requiredVkeyHashesHex: dummyKeyHashes(keys),
        });
        const body = tx.body();
        expect(BigInt(body.fee().to_str())).toBeGreaterThan(0n);

        let outputSum = 0n;
        for (let i = 0; i < body.outputs().len(); i += 1) {
          outputSum += BigInt(body.outputs().get(i).amount().coin().to_str());
        }
        expect(outputSum + BigInt(body.fee().to_str())).toBe(10_000_000n);
      }
    }
  });

  test('set_min_fee (not set_fee) recovers the CSL dead-zone amounts', () => {
    const txBuilder = CSL.TransactionBuilder.new(
      createCslTransactionBuilderConfig(CSL, PROTOCOL_PARAMS)
    );
    txBuilder.add_output(makeOutputs([8_850_000]).get(0));
    const col = CSL.TransactionUnspentOutputs.new();
    col.add(makeUtxo(10_000_000));
    txBuilder.add_inputs_from(
      col,
      CSL.CoinSelectionStrategyCIP2.LargestFirst
    );
    txBuilder.set_min_fee(CSL.BigNum.from_str('218829'));
    txBuilder.add_change_if_needed(CSL.Address.from_bech32(TEST_ADDR));
    const body = txBuilder.build();
    expect(BigInt(body.fee().to_str())).toBeGreaterThanOrEqual(218829n);
    expect(body.outputs().len()).toBeGreaterThanOrEqual(1);
  });
});
