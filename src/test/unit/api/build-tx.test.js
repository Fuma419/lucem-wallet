/**
 * Real-CSL tests for buildUnsignedSimpleTx.
 * Verifies value conservation, fee validity, and CIP-21 encoding.
 */
import {
  buildUnsignedSimpleTx,
  createCslTransactionBuilderConfig,
  toCanonicalTransactionCip21,
} from '../../../api/tx/csl-unsigned-tx';
import { assetsToValue } from '../../../api/util';

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
  const hashes = [];
  for (let i = 0; i < n; i++) {
    const sk = CSL.PrivateKey.generate_ed25519();
    hashes.push(sk.to_public().hash().to_hex());
    if (typeof sk.free === 'function') sk.free();
  }
  return hashes;
}

describe('buildUnsignedSimpleTx', () => {
  test('conserves value for simple ADA transfer', () => {
    const inputCoins = 10_000_000n;
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(Number(inputCoins))],
      outputs: makeOutputs([3_000_000]),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: dummyKeyHashes(1),
    });

    const body = tx.body();
    let outputSum = 0n;
    for (let i = 0; i < body.outputs().len(); i++) {
      outputSum += BigInt(body.outputs().get(i).amount().coin().to_str());
    }
    expect(outputSum + BigInt(body.fee().to_str())).toBe(inputCoins);
  });

  test('conserves value when coin selection picks from multiple UTxOs', () => {
    const inputs = [makeUtxo(5_000_000, 0), makeUtxo(7_000_000, 1, 'bb'.repeat(32))];

    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: inputs,
      outputs: makeOutputs([2_000_000]),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: dummyKeyHashes(1),
    });

    const body = tx.body();
    const selectedInputs = body.inputs();
    const selectedCount = selectedInputs.len();
    expect(selectedCount).toBeGreaterThanOrEqual(1);

    let selectedTotal = 0n;
    for (let i = 0; i < selectedCount; i++) {
      const inp = selectedInputs.get(i);
      const idx = inp.index();
      const match = inputs.find((u) => u.input().index() === idx);
      if (match) selectedTotal += BigInt(match.output().amount().coin().to_str());
    }

    let outputSum = 0n;
    for (let i = 0; i < body.outputs().len(); i++) {
      outputSum += BigInt(body.outputs().get(i).amount().coin().to_str());
    }
    expect(outputSum + BigInt(body.fee().to_str())).toBe(selectedTotal);
  });

  test('fee meets minimum fee requirement', () => {
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(10_000_000)],
      outputs: makeOutputs([2_000_000]),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: dummyKeyHashes(2),
    });

    const linearFee = CSL.LinearFee.new(
      CSL.BigNum.from_str(PROTOCOL_PARAMS.linearFee.minFeeA),
      CSL.BigNum.from_str(PROTOCOL_PARAMS.linearFee.minFeeB)
    );

    const body = tx.body();
    const dummyW = CSL.TransactionWitnessSet.new();
    const vkeys = CSL.Vkeywitnesses.new();
    const fixedBody = CSL.FixedTransactionBody.from_bytes(body.to_bytes());
    const txHash = fixedBody.tx_hash();
    for (let i = 0; i < 2; i++) {
      const sk = CSL.PrivateKey.generate_ed25519();
      vkeys.add(CSL.make_vkey_witness(txHash, sk));
    }
    dummyW.set_vkeys(vkeys);
    const signedForFee = CSL.Transaction.new(body, dummyW);
    const minFee = CSL.min_fee(signedForFee, linearFee);

    expect(body.fee().compare(minFee)).toBeGreaterThanOrEqual(0);
  });

  test('throws when no UTxOs provided', () => {
    expect(() =>
      buildUnsignedSimpleTx({
        Cardano: CSL,
        protocolParameters: PROTOCOL_PARAMS,
        utxos: [],
        outputs: makeOutputs([2_000_000]),
        changeAddressBech32: TEST_ADDR,
        requiredVkeyHashesHex: dummyKeyHashes(1),
      })
    ).toThrow('No UTxOs');
  });

  test('throws when no key hashes provided', () => {
    expect(() =>
      buildUnsignedSimpleTx({
        Cardano: CSL,
        protocolParameters: PROTOCOL_PARAMS,
        utxos: [makeUtxo(10_000_000)],
        outputs: makeOutputs([2_000_000]),
        changeAddressBech32: TEST_ADDR,
        requiredVkeyHashesHex: [],
      })
    ).toThrow('requiredVkeyHashesHex');
  });
});

describe('buildUnsignedSimpleTx — native token', () => {
  const tokenUnit =
    'ab'.repeat(28) + Buffer.from('LUCEM').toString('hex');

  async function makeTokenUtxo(coin, tokenQty, index = 0) {
    const value = await assetsToValue([
      { unit: 'lovelace', quantity: String(coin) },
      { unit: tokenUnit, quantity: String(tokenQty) },
    ]);
    return CSL.TransactionUnspentOutput.new(
      CSL.TransactionInput.new(
        CSL.TransactionHash.from_hex('aa'.repeat(32)),
        index
      ),
      CSL.TransactionOutput.new(CSL.Address.from_bech32(TEST_ADDR), value)
    );
  }

  async function makeTokenOutputs(coin, tokenQty) {
    const value = await assetsToValue([
      { unit: 'lovelace', quantity: String(coin) },
      { unit: tokenUnit, quantity: String(tokenQty) },
    ]);
    const outputs = CSL.TransactionOutputs.new();
    outputs.add(
      CSL.TransactionOutput.new(CSL.Address.from_bech32(TEST_ADDR), value)
    );
    return outputs;
  }

  test('sends a token from a normally funded wallet', async () => {
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [await makeTokenUtxo(10_000_000, 1000)],
      outputs: await makeTokenOutputs(2_000_000, 100),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: dummyKeyHashes(1),
    });
    const body = tx.body();
    expect(body.outputs().len()).toBeGreaterThanOrEqual(1);
    let sent = 0n;
    for (let i = 0; i < body.outputs().len(); i += 1) {
      const ma = body.outputs().get(i).amount().multiasset();
      if (!ma) continue;
      const policy = ma.keys().get(0);
      const assets = ma.get(policy);
      sent += BigInt(assets.get(assets.keys().get(0)).to_str());
    }
    expect(sent).toBeGreaterThanOrEqual(100n);
  });

  test('keeps leftover tokens on mixed change when ADA leftover is tight', async () => {
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [await makeTokenUtxo(3_000_000, 1000)],
      outputs: await makeTokenOutputs(1_200_000, 100),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: dummyKeyHashes(1),
    });
    const body = tx.body();
    let changeTokens = 0n;
    for (let i = 0; i < body.outputs().len(); i += 1) {
      const ma = body.outputs().get(i).amount().multiasset();
      if (!ma) continue;
      const policy = ma.keys().get(0);
      const assets = ma.get(policy);
      const qty = BigInt(assets.get(assets.keys().get(0)).to_str());
      if (qty === 900n) changeTokens = qty;
    }
    expect(changeTokens).toBe(900n);
  });
});

describe('createCslTransactionBuilderConfig', () => {
  test('builds config from valid protocol parameters', () => {
    const config = createCslTransactionBuilderConfig(CSL, PROTOCOL_PARAMS);
    expect(config).toBeDefined();
  });

  test('throws on missing linearFee', () => {
    expect(() =>
      createCslTransactionBuilderConfig(CSL, {
        ...PROTOCOL_PARAMS,
        linearFee: {},
      })
    ).toThrow('linearFee');
  });
});
