/**
 * @jest-environment node
 *
 * A 10 ADA Keystone send spends a larger UTxO and pays a different recipient
 * plus change. The device lists both; Lucem must label them so they are not
 * mistaken for "the same input and output".
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const { buildUnsignedSimpleTx } = require('../../../api/tx/csl-unsigned-tx');
const {
  summarizeUnsignedPaymentTx,
} = require('../../../api/keystone-cardano');

const CHANGE_ADDR =
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

function recipientAddress() {
  const sk = CSL.PrivateKey.generate_ed25519();
  const cred = CSL.Credential.from_keyhash(sk.to_public().hash());
  const addr = CSL.EnterpriseAddress.new(0, cred).to_address().to_bech32();
  if (typeof sk.free === 'function') sk.free();
  return addr;
}

function dummyKeyHash() {
  const sk = CSL.PrivateKey.generate_ed25519();
  const hex = sk.to_public().hash().to_hex();
  if (typeof sk.free === 'function') sk.free();
  return hex;
}

describe('summarizeUnsignedPaymentTx', () => {
  test('labels a 10 ADA payment separately from change back to the spender', () => {
    const recipient = recipientAddress();
    const utxo = CSL.TransactionUnspentOutput.new(
      CSL.TransactionInput.new(CSL.TransactionHash.from_hex('aa'.repeat(32)), 0),
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(CHANGE_ADDR),
        CSL.Value.new(CSL.BigNum.from_str('20000000'))
      )
    );
    const outputs = CSL.TransactionOutputs.new();
    outputs.add(
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(recipient),
        CSL.Value.new(CSL.BigNum.from_str('10000000'))
      )
    );
    const tx = buildUnsignedSimpleTx({
      Cardano: CSL,
      protocolParameters: PROTOCOL_PARAMS,
      utxos: [utxo],
      outputs,
      changeAddressBech32: CHANGE_ADDR,
      requiredVkeyHashesHex: [dummyKeyHash()],
    });

    const summary = summarizeUnsignedPaymentTx(tx, [utxo]);
    expect(summary.inputs).toHaveLength(1);
    expect(summary.inputs[0].address).toBe(CHANGE_ADDR);
    expect(summary.inputs[0].lovelace).toBe('20000000');

    const payment = summary.outputs.filter((o) => o.kind === 'payment');
    const change = summary.outputs.filter((o) => o.kind === 'change');
    expect(payment).toHaveLength(1);
    expect(payment[0].address).toBe(recipient);
    expect(payment[0].lovelace).toBe('10000000');
    expect(change.length).toBeGreaterThanOrEqual(1);
    expect(change[0].address).toBe(CHANGE_ADDR);
    expect(payment[0].address).not.toBe(summary.inputs[0].address);
    expect(BigInt(summary.fee)).toBeGreaterThan(0n);
  });
});
