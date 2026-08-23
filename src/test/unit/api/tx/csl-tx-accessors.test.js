const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  outputDatumHashHex,
  outputHasDatum,
  txBodyCollateral,
} = require('../../../../api/tx/csl-tx-accessors');

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

const txInput = () =>
  CSL.TransactionInput.new(
    CSL.TransactionHash.from_bytes(Buffer.from('11'.repeat(32), 'hex')),
    0
  );

const plainOutput = () =>
  CSL.TransactionOutput.new(
    testAddress(),
    CSL.Value.new(CSL.BigNum.from_str('2000000'))
  );

const bodyWithCerts = () => {
  const inputs = CSL.TransactionInputs.new();
  inputs.add(txInput());
  const outputs = CSL.TransactionOutputs.new();
  outputs.add(plainOutput());
  const body = CSL.TransactionBody.new_tx_body(
    inputs,
    outputs,
    CSL.BigNum.from_str('170000')
  );
  const certs = CSL.Certificates.new();
  certs.add(
    CSL.Certificate.new_stake_delegation(
      CSL.StakeDelegation.new(
        stakeCred(),
        CSL.Ed25519KeyHash.from_bytes(Buffer.from('22'.repeat(28), 'hex'))
      )
    )
  );
  body.set_certs(certs);
  return body;
};

describe('CSL 15 tx accessors used by the CIP-30 sign page', () => {
  test('TransactionBody has collateral(), not collateral_inputs()', () => {
    const body = bodyWithCerts();
    expect(typeof body.collateral).toBe('function');
    expect(typeof body.collateral_inputs).toBe('undefined');
    expect(() => body.collateral_inputs()).toThrow(TypeError);
  });

  test('txBodyCollateral is undefined on a Mesh-like delegation body', () => {
    expect(txBodyCollateral(bodyWithCerts())).toBeUndefined();
  });

  test('txBodyCollateral reads set collateral inputs', () => {
    const body = bodyWithCerts();
    const coll = CSL.TransactionInputs.new();
    coll.add(txInput());
    body.set_collateral(coll);
    const read = txBodyCollateral(body);
    expect(read).toBeDefined();
    expect(read.len()).toBe(1);
  });

  test('TransactionOutput has no datum() — outputHasDatum stays false', () => {
    const output = plainOutput();
    expect(typeof output.datum).toBe('undefined');
    expect(() => output.datum()).toThrow(TypeError);
    expect(outputHasDatum(output)).toBe(false);
    expect(outputDatumHashHex(output, CSL)).toBeUndefined();
  });

  test('outputHasDatum / outputDatumHashHex read a data hash', () => {
    const output = plainOutput();
    const hashBytes = Buffer.from('33'.repeat(32), 'hex');
    output.set_data_hash(CSL.DataHash.from_bytes(hashBytes));
    expect(outputHasDatum(output)).toBe(true);
    expect(outputDatumHashHex(output, CSL)).toBe(hashBytes.toString('hex'));
  });

  test('sign-page reads on a cert-only body do not throw', () => {
    const body = bodyWithCerts();
    expect(() => {
      body.fee().to_str();
      body.inputs();
      body.outputs();
      body.certs();
      body.withdrawals();
      body.mint();
      body.script_data_hash();
      body.required_signers();
      txBodyCollateral(body);
      body.collateral_return();
      const outputs = body.outputs();
      for (let i = 0; i < outputs.len(); i++) {
        const output = outputs.get(i);
        output.address().to_bech32();
        outputHasDatum(output);
        outputDatumHashHex(output, CSL);
      }
    }).not.toThrow();
  });
});
