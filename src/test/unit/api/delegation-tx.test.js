/**
 * Real-CSL tests for delegation transaction building.
 * Verifies registration cert logic uses `registered` (not `active`),
 * cert inclusion, and value conservation.
 */
import {
  createStakeRegistrationCertificate,
  createStakeDelegationCertificate,
} from '../../../api/tx/staking-certificates';
import {
  createCslTransactionBuilderConfig,
  toCanonicalTransactionCip21,
} from '../../../api/tx/csl-unsigned-tx';

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

const STAKE_KEY_HASH = 'aa'.repeat(28);
const POOL_KEY_HASH = 'bb'.repeat(28);

function makeUtxo(coin, index = 0) {
  return CSL.TransactionUnspentOutput.new(
    CSL.TransactionInput.new(CSL.TransactionHash.from_hex('cc'.repeat(32)), index),
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(TEST_ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(coin)))
    )
  );
}

/**
 * Mirrors the delegation cert logic from wallet.js delegationTx,
 * but without the storage/network dependencies.
 */
function buildDelegationTxBody(delegation) {
  const txConfig = createCslTransactionBuilderConfig(CSL, PROTOCOL_PARAMS);
  const txBuilder = CSL.TransactionBuilder.new(txConfig);

  const certsBuilder = CSL.CertificatesBuilder.new();
  if (!delegation.registered) {
    certsBuilder.add(createStakeRegistrationCertificate(CSL, STAKE_KEY_HASH));
  }
  certsBuilder.add(
    createStakeDelegationCertificate(CSL, STAKE_KEY_HASH, POOL_KEY_HASH)
  );
  txBuilder.set_certs_builder(certsBuilder);
  txBuilder.set_ttl_bignum(CSL.BigNum.from_str('99999999'));

  const utxoCollection = CSL.TransactionUnspentOutputs.new();
  utxoCollection.add(makeUtxo(50_000_000));
  txBuilder.add_inputs_from(
    utxoCollection,
    CSL.CoinSelectionStrategyCIP2.LargestFirst
  );
  txBuilder.add_change_if_needed(CSL.Address.from_bech32(TEST_ADDR));

  const body = txBuilder.build();
  const ws = CSL.TransactionWitnessSet.new();
  return CSL.Transaction.new(body, ws);
}

describe('delegation cert inclusion based on registration status', () => {
  test('registered=true → no registration cert, only delegation cert', () => {
    const tx = buildDelegationTxBody({ registered: true, active: true });
    const certs = tx.body().certs();
    expect(certs).toBeDefined();
    expect(certs.len()).toBe(1);
  });

  test('registered=false → registration cert + delegation cert', () => {
    const tx = buildDelegationTxBody({ registered: false, active: false });
    const certs = tx.body().certs();
    expect(certs).toBeDefined();
    expect(certs.len()).toBe(2);
  });

  test('BUG GUARD: active=false but registered=true → must NOT include registration cert', () => {
    const tx = buildDelegationTxBody({ registered: true, active: false });
    const certs = tx.body().certs();
    expect(certs.len()).toBe(1);
  });
});

describe('delegation tx value conservation', () => {
  test('tx with registration cert conserves value (includes key deposit)', () => {
    const inputCoins = 50_000_000n;
    const keyDeposit = BigInt(PROTOCOL_PARAMS.keyDeposit);

    const tx = buildDelegationTxBody({ registered: false, active: false });
    const body = tx.body();

    let outputSum = 0n;
    for (let i = 0; i < body.outputs().len(); i++) {
      outputSum += BigInt(body.outputs().get(i).amount().coin().to_str());
    }
    const fee = BigInt(body.fee().to_str());
    expect(outputSum + fee + keyDeposit).toBe(inputCoins);
  });

  test('tx without registration cert conserves value (no deposit)', () => {
    const inputCoins = 50_000_000n;

    const tx = buildDelegationTxBody({ registered: true, active: true });
    const body = tx.body();

    let outputSum = 0n;
    for (let i = 0; i < body.outputs().len(); i++) {
      outputSum += BigInt(body.outputs().get(i).amount().coin().to_str());
    }
    const fee = BigInt(body.fee().to_str());
    expect(outputSum + fee).toBe(inputCoins);
  });
});

describe('delegation tx CIP-21 encoding', () => {
  test('canonical encoding preserves body hash', () => {
    const tx = buildDelegationTxBody({ registered: false, active: false });
    const origHash = Buffer.from(
      CSL.FixedTransactionBody.from_bytes(tx.body().to_bytes())
        .tx_hash()
        .to_bytes()
    ).toString('hex');

    const canonical = toCanonicalTransactionCip21(CSL, tx);
    const canonHash = Buffer.from(
      CSL.FixedTransactionBody.from_bytes(canonical.body().to_bytes())
        .tx_hash()
        .to_bytes()
    ).toString('hex');

    expect(canonHash).toBe(origHash);
  });
});
