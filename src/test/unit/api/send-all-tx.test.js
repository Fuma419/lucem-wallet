/**
 * Behavioral coverage for the "Send all" money-movement logic on the Send page.
 *
 * The existing send tests (send-all-feature.test.js, send-page-redesign.test.js)
 * only grep send.jsx for strings — they never build a send-all transaction. These
 * exercise the REAL send-all builder (`buildUnsignedSendAllTx`), which the Send
 * page now calls via `sendAllTx`, against realistic wallet shapes and assert the
 * properties a correct "send all" must hold:
 *   1. it does not spuriously error for a normally funded wallet,
 *   2. it consumes every UTxO (nothing stranded),
 *   3. it moves every token, and
 *   4. output + fee == total balance (no value left behind),
 * while still rejecting a genuinely un-sweepable dust wallet with a clear error.
 *
 * These replace the earlier `test.failing` placeholders that documented the old
 * fee-reduction heuristic's bugs (stranded UTxOs, spurious "Not enough ADA").
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  buildUnsignedSendAllTx,
  summarizeSendAllTx,
} = require('../../../api/tx/csl-unsigned-tx');
const { assetsToValue } = require('../../../api/util');

// Wallet UTxOs live at this address; send-all sweeps everything to RECIPIENT.
const WALLET_ADDR =
  'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwq2ytjqp';
const RECIPIENT_ADDR = WALLET_ADDR;

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

// Distinct 28-byte (56-hex) policy ids for building token UTxOs.
const policy = (n) => n.toString(16).padStart(2, '0').repeat(28);

async function makeUtxo({ coin, assets = [], index = 0, txHash = 'aa'.repeat(32) }) {
  const amount = [{ unit: 'lovelace', quantity: String(coin) }, ...assets];
  const value = await assetsToValue(amount);
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(CSL.TransactionHash.from_hex(txHash), index),
    CSL.TransactionOutput.new(CSL.Address.from_bech32(WALLET_ADDR), value)
  );
}

/**
 * Drives the real builder exactly as the Send page's send-all path does now
 * (send.jsx prepareTx → sendAllTx → buildUnsignedSendAllTx). Returns `{ error }`
 * on genuine insufficiency, `{ tx }` otherwise.
 */
function simulateSendAll(utxos) {
  try {
    const tx = buildUnsignedSendAllTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos,
      recipientAddressBech32: RECIPIENT_ADDR,
    });
    return { tx };
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

function inputCount(tx) {
  return tx.body().inputs().len();
}

function outputLovelaceSum(tx) {
  let sum = 0n;
  const outs = tx.body().outputs();
  for (let i = 0; i < outs.len(); i += 1) {
    sum += BigInt(outs.get(i).amount().coin().to_str());
  }
  return sum;
}

function outputTokenCount(tx) {
  let count = 0;
  const outs = tx.body().outputs();
  for (let i = 0; i < outs.len(); i += 1) {
    const ma = outs.get(i).amount().multiasset();
    if (!ma) continue;
    const policies = ma.keys();
    for (let p = 0; p < policies.len(); p += 1) {
      count += ma.get(policies.get(p)).len();
    }
  }
  return count;
}

describe('Send all — single ADA-only UTxO', () => {
  test('spends the whole balance minus fee', async () => {
    const utxos = [await makeUtxo({ coin: 10_000_000 })];
    const result = await simulateSendAll(utxos);

    expect(result.error).toBeUndefined();
    expect(result.tx).toBeTruthy();
    const fee = BigInt(result.tx.body().fee().to_str());
    expect(outputLovelaceSum(result.tx) + fee).toBe(10_000_000n);
    expect(inputCount(result.tx)).toBe(1);
  });
});

describe('Send all — multiple ADA-only UTxOs', () => {
  // Regression: the old heuristic routed through coin selection, which pulled the
  // minimum inputs to cover the target and stranded the rest. The dedicated
  // builder forces every UTxO in, so the whole wallet drains.
  test('spends every UTxO so the whole wallet is emptied', async () => {
    const utxos = [
      await makeUtxo({ coin: 4_000_000, index: 0, txHash: 'a1'.repeat(32) }),
      await makeUtxo({ coin: 3_000_000, index: 1, txHash: 'a2'.repeat(32) }),
      await makeUtxo({ coin: 2_000_000, index: 2, txHash: 'a3'.repeat(32) }),
    ];
    const result = await simulateSendAll(utxos);

    expect(result.error).toBeUndefined();
    expect(inputCount(result.tx)).toBe(3);
    const fee = BigInt(result.tx.body().fee().to_str());
    expect(outputLovelaceSum(result.tx) + fee).toBe(9_000_000n);
  });
});

describe('Send all — ADA plus native tokens', () => {
  // Regression: a plainly-spendable wallet (5 ADA + one token) used to fail with
  // "Not enough ADA to move all selected assets" because the fee-reduction loop
  // produced sub-minUTxO intermediate change outputs. The builder now sweeps it
  // in a single output.
  test('moves the token and drains the ADA', async () => {
    const tokenUnit = policy(0xab) + Buffer.from('LUCEM').toString('hex');
    const utxos = [
      await makeUtxo({
        coin: 5_000_000,
        assets: [{ unit: tokenUnit, quantity: '1000' }],
      }),
    ];
    const result = await simulateSendAll(utxos);

    expect(result.error).toBeUndefined();
    expect(outputTokenCount(result.tx)).toBe(1);
    expect(inputCount(result.tx)).toBe(1);
    const fee = BigInt(result.tx.body().fee().to_str());
    expect(outputLovelaceSum(result.tx) + fee).toBe(5_000_000n);
  });
});

describe('Send all — token-rich, ADA-light wallet', () => {
  // Regression: with tokens spread over several UTxOs the fixed 10-attempt /
  // 0.5-ADA-step heuristic never converged and the whole sweep failed. The
  // builder adds all inputs and settles in one pass.
  test('sweeps every token UTxO for a normally funded wallet', async () => {
    const utxos = [];
    for (let i = 0; i < 6; i += 1) {
      utxos.push(
        await makeUtxo({
          coin: 1_300_000,
          index: i,
          txHash: (0xb0 + i).toString(16).padStart(2, '0').repeat(32),
          assets: [
            {
              unit: policy(0xc0 + i) + Buffer.from(`TKN${i}`).toString('hex'),
              quantity: '1',
            },
          ],
        })
      );
    }
    const result = await simulateSendAll(utxos);

    expect(result.error).toBeUndefined();
    expect(inputCount(result.tx)).toBe(6);
    expect(outputTokenCount(result.tx)).toBe(6);
  });
});

describe('Send all — fee/amount summary is read from the built tx', () => {
  // Regression for "Unable to prepare transaction: Failed to parse String to
  // BigInt" on send-all: the Send page used to compute the swept amount as
  // `BigInt(txInfo.balance.lovelace) - fee`. When `balance.lovelace` was a
  // non-canonical string (a rehydrated/persisted value, e.g. scientific
  // notation or a stray decimal), that native `BigInt()` throws — and on
  // JavaScriptCore (iOS/Safari WebView) the message is exactly the one users
  // reported. `summarizeSendAllTx` derives fee + swept amount straight from the
  // CSL transaction, so it never touches balance state.
  test('sums output coins for the amount and never touches balance state', async () => {
    const utxos = [
      await makeUtxo({ coin: 4_000_000, index: 0, txHash: 'd1'.repeat(32) }),
      await makeUtxo({ coin: 3_000_000, index: 1, txHash: 'd2'.repeat(32) }),
    ];
    const tx = buildUnsignedSendAllTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos,
      recipientAddressBech32: RECIPIENT_ADDR,
    });

    const { fee, sent } = summarizeSendAllTx(CSL, tx);

    // fee matches the tx body; sent == output coins == total balance − fee.
    expect(fee).toBe(tx.body().fee().to_str());
    expect(BigInt(sent)).toBe(outputLovelaceSum(tx));
    expect(BigInt(sent) + BigInt(fee)).toBe(7_000_000n);
    // Both values are canonical base-10 integer strings safe for BigInt().
    expect(sent).toMatch(/^\d+$/);
    expect(fee).toMatch(/^\d+$/);
  });

  test('summary holds for a token-bearing sweep', async () => {
    const tokenUnit = policy(0xab) + Buffer.from('LUCEM').toString('hex');
    const utxos = [
      await makeUtxo({
        coin: 5_000_000,
        assets: [{ unit: tokenUnit, quantity: '1000' }],
      }),
    ];
    const tx = buildUnsignedSendAllTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos,
      recipientAddressBech32: RECIPIENT_ADDR,
    });

    const { fee, sent } = summarizeSendAllTx(CSL, tx);
    expect(BigInt(sent) + BigInt(fee)).toBe(5_000_000n);
    expect(BigInt(sent)).toBe(outputLovelaceSum(tx));
  });
});

describe('Send all — fee covers every signing vkey', () => {
  // Regression: send-all used CSL's one-pass fee (one inferred witness) while
  // signTx attaches a vkey for every enabled payment hash. The ledger then
  // rejects with FeeTooSmallUTxO.
  test('body fee meets min_fee when eight extra payment keys will sign', async () => {
    const extraHashes = [];
    for (let i = 0; i < 8; i += 1) {
      const sk = CSL.PrivateKey.generate_ed25519();
      extraHashes.push(sk.to_public().hash().to_hex());
      if (typeof sk.free === 'function') sk.free();
    }
    const tx = buildUnsignedSendAllTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [await makeUtxo({ coin: 10_000_000 })],
      recipientAddressBech32: RECIPIENT_ADDR,
      requiredVkeyHashesHex: extraHashes,
    });
    const linearFee = CSL.LinearFee.new(
      CSL.BigNum.from_str(PROTOCOL_PARAMS.linearFee.minFeeA),
      CSL.BigNum.from_str(PROTOCOL_PARAMS.linearFee.minFeeB)
    );
    const body = tx.body();
    const fixed = CSL.FixedTransactionBody.from_bytes(body.to_bytes());
    const txHash = fixed.tx_hash();
    const vkeys = CSL.Vkeywitnesses.new();
    for (let i = 0; i < extraHashes.length; i += 1) {
      const sk = CSL.PrivateKey.generate_ed25519();
      vkeys.add(CSL.make_vkey_witness(txHash, sk));
    }
    const witnesses = CSL.TransactionWitnessSet.new();
    witnesses.set_vkeys(vkeys);
    const signed = CSL.Transaction.new(body, witnesses);
    const minFee = CSL.min_fee(signed, linearFee);
    expect(body.fee().compare(minFee)).toBeGreaterThanOrEqual(0);
    expect(outputLovelaceSum(tx) + BigInt(body.fee().to_str())).toBe(
      10_000_000n
    );
  });
});

describe('Send all — unclaimed rewards', () => {
  const stakeHash = 'aa'.repeat(28);
  const rewardAddr = CSL.RewardAddress.new(
    CSL.NetworkInfo.testnet_preprod().network_id(),
    CSL.Credential.from_keyhash(
      CSL.Ed25519KeyHash.from_bytes(Buffer.from(stakeHash, 'hex'))
    )
  )
    .to_address()
    .to_bech32();

  test('sweeps UTxO ADA plus a full reward withdrawal', async () => {
    const utxos = [await makeUtxo({ coin: 95_000_000 })];
    const tx = buildUnsignedSendAllTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos,
      recipientAddressBech32: RECIPIENT_ADDR,
      withdrawal: {
        rewardAddressBech32: rewardAddr,
        amountLovelace: '5000000',
      },
    });
    expect(tx.body().withdrawals().len()).toBe(1);
    expect(outputLovelaceSum(tx) + BigInt(tx.body().fee().to_str())).toBe(
      100_000_000n
    );
  });
});

describe('Send all — genuine dust (un-sweepable)', () => {
  // A wallet holding a token but too little ADA to satisfy the token bundle's
  // min-ADA plus fee genuinely cannot be swept. The builder must surface a clear
  // "not enough ADA" error rather than silently strand or crash.
  test('rejects a token bundle with insufficient ADA', async () => {
    const tokenUnit = policy(0xab) + Buffer.from('LUCEM').toString('hex');
    const utxos = [
      await makeUtxo({
        coin: 900_000,
        assets: [{ unit: tokenUnit, quantity: '1000' }],
      }),
    ];
    const result = await simulateSendAll(utxos);

    expect(result.tx).toBeUndefined();
    expect(result.error).toMatch(/not enough ADA/i);
  });
});
