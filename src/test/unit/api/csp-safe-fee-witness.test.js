/**
 * Regression: building an unsigned tx must never call
 * PrivateKey.generate_ed25519(). In the browser WASM, ed25519 keygen pulls
 * entropy through a `new Function("return this")` shim that the extension CSP
 * (script-src 'self' 'wasm-unsafe-eval') rejects — the Send page then shows
 * "Unable to prepare transaction: Evaluating a string as JavaScript…".
 * Fee sizing uses deterministic throwaway keys instead (signing is RNG-free).
 */
const fs = require('fs');
const path = require('path');
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  buildUnsignedSimpleTx,
  buildUnsignedSendAllTx,
} = require('../../../api/tx/csl-unsigned-tx');

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

const TEST_ADDR =
  'addr_test1qq02xt0z2e7cyd8dg05zlpclhqnpdx6eektgegdsq7nq0whmnjrwgrd2f8txn9g78zh5futgtyn4ctjekjdu9wdpkk8qcz65ed';
const REWARD_ADDR =
  'stake_test1uraeephypk4yn4nfj50r3t6y7959jf6u9evmfx7zhxsmtrssx6ehu';

/**
 * CSL facade whose PrivateKey.generate_ed25519 throws the same EvalError the
 * extension CSP produces. Everything else passes through untouched.
 */
const cspEvalError = () => {
  throw new EvalError(
    "Evaluating a string as JavaScript violates the following Content Security Policy directive because 'unsafe-eval' is not an allowed source of script: script-src 'self' 'wasm-unsafe-eval'"
  );
};
const BlockedPrivateKey = new Proxy(CSL.PrivateKey, {
  get(target, prop, receiver) {
    if (prop === 'generate_ed25519' || prop === 'generate_ed25519_extended') {
      return cspEvalError;
    }
    return Reflect.get(target, prop, receiver);
  },
});
const CspBlockedCSL = new Proxy(CSL, {
  get(target, prop, receiver) {
    if (prop === 'PrivateKey') return BlockedPrivateKey;
    return Reflect.get(target, prop, receiver);
  },
});

function makeUtxo(coin, index = 0) {
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(
      CSL.TransactionHash.from_hex(
        String(index + 1).padStart(2, '0').repeat(32)
      ),
      index
    ),
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

// Real hashes, generated with the Node CSL (no CSP there) — the production
// builder must not need keygen for these.
function realKeyHashes(n) {
  return Array.from({ length: n }, () =>
    CSL.PrivateKey.generate_ed25519().to_public().hash().to_hex()
  );
}

describe('CSP-safe fee sizing (no WASM keygen during buildTx)', () => {
  test('simple send builds when generate_ed25519 throws the CSP EvalError', () => {
    const tx = buildUnsignedSimpleTx({
      Cardano: CspBlockedCSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(95_000_000)],
      outputs: makeOutputs(5_000_000),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: realKeyHashes(2),
    });
    expect(BigInt(tx.body().fee().to_str())).toBeGreaterThan(0n);
  });

  test('send with reward withdrawal builds under the CSP block (97 from 95+5)', () => {
    const tx = buildUnsignedSimpleTx({
      Cardano: CspBlockedCSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(95_000_000)],
      outputs: makeOutputs(97_000_000),
      changeAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: realKeyHashes(1),
      withdrawal: {
        rewardAddressBech32: REWARD_ADDR,
        amountLovelace: '5000000',
      },
    });
    const withdrawals = tx.body().withdrawals();
    expect(withdrawals && withdrawals.len()).toBe(1);
  });

  test('send-all builds under the CSP block', () => {
    const tx = buildUnsignedSendAllTx({
      Cardano: CspBlockedCSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [makeUtxo(10_000_000)],
      recipientAddressBech32: TEST_ADDR,
      requiredVkeyHashesHex: realKeyHashes(2),
    });
    expect(BigInt(tx.body().fee().to_str())).toBeGreaterThan(0n);
  });

  test('deterministic dummy witnesses stay distinct: fee grows with signer count', () => {
    const feeFor = (hashCount) =>
      BigInt(
        buildUnsignedSimpleTx({
          Cardano: CspBlockedCSL,
          protocolParameters: PROTOCOL_PARAMS,
          utxos: [makeUtxo(95_000_000)],
          outputs: makeOutputs(5_000_000),
          changeAddressBech32: TEST_ADDR,
          requiredVkeyHashesHex: realKeyHashes(hashCount),
        })
          .body()
          .fee()
          .to_str()
      );
    // If identical dummy witnesses were deduplicated, fee(8) would collapse
    // to fee(1) and the ledger would reject with FeeTooSmallUTxO.
    expect(feeFor(8)).toBeGreaterThan(feeFor(1));
  });

  test('source guard: csl-unsigned-tx.ts never calls generate_ed25519', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/tx/csl-unsigned-tx.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/generate_ed25519\s*\(/);
  });
});
