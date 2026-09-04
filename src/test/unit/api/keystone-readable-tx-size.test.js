/**
 * @jest-environment node
 *
 * A Keystone hash-only request carries no transaction body, so the device warns
 * that the data is not readable and its reply does not always include a witness
 * set ("Keystone did not return a witness set"). Everyday sends must therefore
 * stay on the full-transaction path: a 20-input send is ~870 bytes, which the
 * old 768-byte cutoff pushed onto blind signing.
 */

jest.mock('../../../api/loader', () => ({
  __esModule: true,
  default: {
    load: jest.fn().mockResolvedValue(undefined),
    Cardano: {},
  },
}));

const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  emptyWitnessSetMessage,
  keystoneNeedsTxHashRequest,
} = require('../../../api/keystone-cardano');
const {
  buildUnsignedSimpleTx,
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
const ADDR =
  'addr_test1qq02xt0z2e7cyd8dg05zlpclhqnpdx6eektgegdsq7nq0whmnjrwgrd2f8txn9g78zh5futgtyn4ctjekjdu9wdpkk8qcz65ed';

/** Unsigned-tx byte length for a send that must spend `count` UTxOs. */
function sendTxBytes(count) {
  const utxos = Array.from({ length: count }, (_, i) =>
    CSL.TransactionUnspentOutput.new(
      CSL.TransactionInput.new(
        CSL.TransactionHash.from_hex(
          (i + 1).toString(16).padStart(2, '0').repeat(32)
        ),
        i
      ),
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(ADDR),
        CSL.Value.new(CSL.BigNum.from_str('2000000'))
      )
    )
  );
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      CSL.Address.from_bech32(ADDR),
      CSL.Value.new(CSL.BigNum.from_str(String(count * 2000000 - 1500000)))
    )
  );
  const tx = buildUnsignedSimpleTx({
    Cardano: CSL,
    protocolParameters: PROTOCOL_PARAMS,
    utxos,
    outputs,
    changeAddressBech32: ADDR,
    requiredVkeyHashesHex: [
      CSL.PrivateKey.from_normal_bytes(new Uint8Array(32).fill(7))
        .to_public()
        .hash()
        .to_hex(),
    ],
  });
  expect(tx.body().inputs().len()).toBe(count);
  return tx.to_bytes().length;
}

describe('Keystone full-tx vs hash-only routing', () => {
  test('a 20-input send stays readable on the device', () => {
    const bytes = sendTxBytes(20);
    // Regression: this is the size band the old 768-byte cutoff blind-signed.
    expect(bytes).toBeGreaterThan(768);
    expect(keystoneNeedsTxHashRequest(bytes)).toBe(false);
  });

  test('sends across realistic UTxO counts stay readable', () => {
    for (const count of [5, 10, 20, 30]) {
      expect(keystoneNeedsTxHashRequest(sendTxBytes(count))).toBe(false);
    }
  });

  test('falls back to hash-only only at the SDK size limit', () => {
    expect(keystoneNeedsTxHashRequest(2047)).toBe(false);
    expect(keystoneNeedsTxHashRequest(2048)).toBe(true);
    expect(keystoneNeedsTxHashRequest(9000)).toBe(true);
  });
});

describe('emptyWitnessSetMessage', () => {
  test('blames tx size and suggests a remedy after hash-only signing', () => {
    const msg = emptyWitnessSetMessage({ usedTxHash: true, inputCount: 24 });
    expect(msg).toMatch(/24 inputs/);
    expect(msg).toMatch(/not readable/i);
    expect(msg).toMatch(/smaller amount|consolidate/i);
  });

  test('points at device approval when the full tx was sent', () => {
    const msg = emptyWitnessSetMessage({ usedTxHash: false, inputCount: 2 });
    expect(msg).toMatch(/Approve the transaction on the device/i);
    expect(msg).not.toMatch(/too large/i);
  });
});
