/**
 * Regression: pure-ADA sends must not burn spendable balance into the fee.
 *
 * Production bug (on-chain preprod tx 3606d4a6…): sending 5 ADA produced a
 * 5-ADA output with a **1-ADA fee and no change**. CSL's
 * `add_inputs_from_and_change` + LargestFirst stops as soon as the selected
 * inputs nominally cover output+fee; when the leftover lands in the change
 * "dead-zone" (0 < leftover < min-ADA for a change output) it folds that leftover
 * into the FEE — even when the wallet holds more UTxOs that would let a proper
 * change output form. Real wallets hit this constantly and overpaid ~1 ADA.
 *
 * The fix (`selectAdaInputsForViableChange`) selects inputs largest-first, pulling
 * enough that the change output clears min-ADA whenever the wallet can afford it.
 * A leftover is only burned when it is genuinely un-splittable (the wallet's whole
 * spendable balance sits in the dead-zone — e.g. a single 6-ADA UTxO).
 *
 * These are behavioral assertions on the real builder, not string greps.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const { buildUnsignedSimpleTx } = require('../../../api/tx/csl-unsigned-tx');

const PROTOCOL_PARAMS = {
  linearFee: { minFeeA: '44', minFeeB: '155381' },
  poolDeposit: '500000000',
  keyDeposit: '2000000',
  coinsPerUtxoWord: '4310',
  maxValSize: 5000,
  maxTxSize: 16384,
  slot: 50000000,
};

// A "normal" simple-tx fee is ~170k–190k lovelace. The pre-fix bug produced
// exactly 1_000_000 (leftover burned). Anything approaching 0.4 ADA is a burn.
const MAX_NORMAL_FEE = 400_000n;

function testnetAddr() {
  const pay = CSL.PrivateKey.generate_ed25519().to_public().hash();
  const stake = CSL.PrivateKey.generate_ed25519().to_public().hash();
  return CSL.BaseAddress.new(
    CSL.NetworkInfo.testnet_preprod().network_id(),
    CSL.Credential.from_keyhash(pay),
    CSL.Credential.from_keyhash(stake)
  )
    .to_address()
    .to_bech32();
}

const CHANGE_ADDR = testnetAddr();
const RECIPIENT_ADDR = testnetAddr();
const SIGNING_KEYS = [
  CSL.PrivateKey.generate_ed25519().to_public().hash().to_hex(),
];

function utxosFrom(coins) {
  return coins.map((coin, i) =>
    CSL.TransactionUnspentOutput.new(
      CSL.TransactionInput.new(
        CSL.TransactionHash.from_hex(String(i + 1).padStart(2, '0').repeat(32)),
        i
      ),
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(CHANGE_ADDR),
        CSL.Value.new(CSL.BigNum.from_str(String(coin)))
      )
    )
  );
}

function sendOutputs(coin) {
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(RECIPIENT_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
  return outputs;
}

function build(coins, send) {
  const tx = buildUnsignedSimpleTx({
    Cardano: CSL,
    protocolParameters: PROTOCOL_PARAMS,
    utxos: utxosFrom(coins),
    outputs: sendOutputs(send),
    changeAddressBech32: CHANGE_ADDR,
    requiredVkeyHashesHex: SIGNING_KEYS,
  });
  const body = tx.body();
  const fee = BigInt(body.fee().to_str());
  const inputsUsed = body.inputs().len();
  let recipientCoin = 0n;
  let changeCoin = 0n;
  let outputSum = 0n;
  for (let i = 0; i < body.outputs().len(); i += 1) {
    const out = body.outputs().get(i);
    const coin = BigInt(out.amount().coin().to_str());
    outputSum += coin;
    if (out.address().to_bech32() === RECIPIENT_ADDR) recipientCoin += coin;
    else changeCoin += coin;
  }
  return { fee, inputsUsed, recipientCoin, changeCoin, outputSum };
}

describe('pure-ADA send does not burn spendable balance into the fee', () => {
  // The exact production shape (5-ADA send) plus other dead-zone distributions
  // where the LARGEST UTxO alone overshoots into the dead-zone but the wallet
  // holds more it can pull in.
  const DEAD_ZONE_WITH_SPARE = [
    { coins: [6_000_000, 5_000_000], send: 5_000_000 },
    { coins: [6_000_000, 3_000_000], send: 5_000_000 },
    { coins: [6_000_000, 4_000_000, 4_000_000, 4_000_000], send: 5_000_000 },
    { coins: [3_000_000, 3_000_000, 3_000_000], send: 5_000_000 },
  ];

  test.each(DEAD_ZONE_WITH_SPARE)(
    'in=$coins send=$send → normal fee + real change (not a 1-ADA burn)',
    ({ coins, send }) => {
      const r = build(coins, send);
      // Recipient always gets EXACTLY what was requested — never 0, never less.
      expect(r.recipientCoin).toBe(BigInt(send));
      // The bug burned the leftover into the fee; the fix pulls another input.
      expect(r.fee).toBeLessThanOrEqual(MAX_NORMAL_FEE);
      // A genuine change output is returned to the wallet.
      expect(r.changeCoin).toBeGreaterThan(0n);
      expect(r.inputsUsed).toBeGreaterThanOrEqual(2);
      // Conservation: nothing vanishes.
      const usedIn = r.outputSum + r.fee;
      expect(usedIn).toBeLessThanOrEqual(
        coins.reduce((a, b) => a + BigInt(b), 0n)
      );
    }
  );

  test('ample-balance sends still take one input and a small fee', () => {
    const r = build([100_000_000, 6_000_000], 5_000_000);
    expect(r.recipientCoin).toBe(5_000_000n);
    expect(r.fee).toBeLessThanOrEqual(MAX_NORMAL_FEE);
    expect(r.changeCoin).toBeGreaterThan(90_000_000n);
    expect(r.inputsUsed).toBe(1);
  });

  test('single UTxO with a valid change band keeps a normal fee', () => {
    // 6.2 ADA → 5 ADA send leaves ~1.02 ADA change, just above min-ADA.
    const r = build([6_200_000], 5_000_000);
    expect(r.recipientCoin).toBe(5_000_000n);
    expect(r.fee).toBeLessThanOrEqual(MAX_NORMAL_FEE);
    expect(r.changeCoin).toBeGreaterThan(0n);
  });

  test('single tight UTxO still delivers the exact amount (dead-zone unavoidable)', () => {
    // A lone 6-ADA UTxO cannot form a ~0.83 ADA change output, so Cardano forces
    // the leftover into the fee. The one guarantee we keep: the recipient gets
    // EXACTLY the requested amount (never a 0-ADA send) and the tx is valid.
    const r = build([6_000_000], 5_000_000);
    expect(r.recipientCoin).toBe(5_000_000n);
    expect(r.recipientCoin + r.changeCoin + r.fee).toBe(6_000_000n);
  });
});
