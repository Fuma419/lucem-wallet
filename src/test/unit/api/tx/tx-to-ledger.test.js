/**
 * Real-CSL encoding of a payment tx for Ledger. Catches the next missing
 * v15 method (datum / kind / ttl.to_str / validity_interval_start) instead
 * of only asserting source contracts.
 */
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const { HARDENED, DatumType, TxOutputFormat } = require(
  '@cardano-foundation/ledgerjs-hw-app-cardano'
);
const { txToLedger } = require('../../../../api/util');

const paymentCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from('ab'.repeat(28), 'hex'))
  );

const stakeCred = () =>
  CSL.Credential.from_keyhash(
    CSL.Ed25519KeyHash.from_bytes(Buffer.from('cd'.repeat(28), 'hex'))
  );

const testAddress = () =>
  CSL.BaseAddress.new(
    CSL.NetworkInfo.testnet_preview().network_id(),
    paymentCred(),
    stakeCred()
  ).to_address();

const paymentTx = ({ withValidityStart = false } = {}) => {
  const addr = testAddress();
  const inputs = CSL.TransactionInputs.new();
  inputs.add(
    CSL.TransactionInput.new(
      CSL.TransactionHash.from_bytes(Buffer.from('11'.repeat(32), 'hex')),
      1
    )
  );
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(
    CSL.TransactionOutput.new(
      addr,
      CSL.Value.new(CSL.BigNum.from_str('2000000'))
    )
  );
  const body = CSL.TransactionBody.new_tx_body(
    inputs,
    outputs,
    CSL.BigNum.from_str('170000')
  );
  body.set_ttl(CSL.BigNum.from_str('12345'));
  if (withValidityStart) {
    body.set_validity_start_interval(99);
  }
  return {
    tx: CSL.Transaction.new(body, CSL.TransactionWitnessSet.new()),
    addressHex: Buffer.from(addr.to_bytes()).toString('hex'),
  };
};

const ledgerKeys = {
  payment: {
    hash: 'ab'.repeat(28),
    path: [HARDENED + 1852, HARDENED + 1815, HARDENED + 0, 0, 0],
  },
  stake: {
    hash: 'cd'.repeat(28),
    path: [HARDENED + 1852, HARDENED + 1815, HARDENED + 0, 2, 0],
  },
};

describe('txToLedger (CSL v15 payment tx)', () => {
  test('encodes a simple send without calling output.datum or ttl.to_str', async () => {
    const { tx, addressHex } = paymentTx();
    const encoded = await txToLedger(tx, 0, ledgerKeys, addressHex, 0);
    expect(encoded.tx.outputs).toHaveLength(1);
    // ARRAY_LEGACY is 0 and is stripped as falsy; Ledger treats missing as legacy.
    expect(encoded.tx.outputs[0].format).toBeUndefined();
    expect(TxOutputFormat.ARRAY_LEGACY).toBe(0);
    expect(encoded.tx.outputs[0].amount).toBe('2000000');
    expect(encoded.tx.outputs[0].datum).toBeUndefined();
    expect(encoded.tx.outputs[0].datumHashHex).toBeUndefined();
    expect(encoded.tx.inputs[0].outputIndex).toBe(1);
    expect(encoded.tx.fee).toBe('170000');
    expect(encoded.tx.ttl).toBe('12345');
    expect(encoded.tx.validityIntervalStart).toBeUndefined();
  });

  test('reads validity_start_interval as a string slot', async () => {
    const { tx, addressHex } = paymentTx({ withValidityStart: true });
    const encoded = await txToLedger(tx, 0, ledgerKeys, addressHex, 0);
    expect(encoded.tx.ttl).toBe('12345');
    expect(encoded.tx.validityIntervalStart).toBe('99');
  });

  test('encodes an inline-datum output as Babbage', async () => {
    const addr = testAddress();
    const inputs = CSL.TransactionInputs.new();
    inputs.add(
      CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from('11'.repeat(32), 'hex')),
        0
      )
    );
    const output = CSL.TransactionOutput.new(
      addr,
      CSL.Value.new(CSL.BigNum.from_str('2000000'))
    );
    output.set_plutus_data(CSL.PlutusData.new_integer(CSL.BigInt.from_str('42')));
    const outputs = CSL.TransactionOutputs.new();
    outputs.add(output);
    const body = CSL.TransactionBody.new_tx_body(
      inputs,
      outputs,
      CSL.BigNum.from_str('170000')
    );
    body.set_ttl(CSL.BigNum.from_str('12345'));
    const tx = CSL.Transaction.new(body, CSL.TransactionWitnessSet.new());
    const encoded = await txToLedger(
      tx,
      0,
      ledgerKeys,
      Buffer.from(addr.to_bytes()).toString('hex'),
      0
    );
    expect(encoded.tx.outputs[0].format).toBe(TxOutputFormat.MAP_BABBAGE);
    expect(encoded.tx.outputs[0].datum).toEqual({
      type: DatumType.INLINE,
      datumHex: Buffer.from(
        CSL.PlutusData.new_integer(CSL.BigInt.from_str('42')).to_bytes()
      ).toString('hex'),
    });
  });
});
