const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const fs = require('fs');
const path = require('path');
const {
  ledgerOutputDatum,
  optionalUintToStr,
  outputDatumHashHex,
  outputHasDatum,
  transactionInputIndex,
  txBodyCollateral,
  txBodyTtl,
  txBodyValidityStart,
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

describe('transactionInputIndex (CSL v15)', () => {
  test('reads a plain number — to_str is not a function', () => {
    const input = txInput();
    expect(typeof input.index()).toBe('number');
    expect(input.index().to_str).toBeUndefined();
    expect(transactionInputIndex(input)).toBe(0);
    expect(() => input.index().to_str()).toThrow(TypeError);
  });

  test('still accepts a BigNum-shaped index from older bindings', () => {
    expect(transactionInputIndex({ index: () => ({ to_str: () => '7' }) })).toBe(
      7
    );
  });

  test('Ledger encoding uses the accessor, not to_str on the index', () => {
    const utilSrc = fs.readFileSync(
      path.join(__dirname, '../../../../api/util.js'),
      'utf8'
    );
    expect(utilSrc).toMatch(/transactionInputIndex\(input\)/);
    expect(utilSrc).not.toMatch(/input\.index\(\)\.to_str\(\)/);
  });
});

describe('CSL v15 slot + output fields used by Ledger encoding', () => {
  test('ttl() is a number — to_str is not a function', () => {
    const body = bodyWithCerts();
    body.set_ttl(CSL.BigNum.from_str('12345'));
    expect(typeof body.ttl()).toBe('number');
    expect(body.ttl().to_str).toBeUndefined();
    expect(() => body.ttl().to_str()).toThrow(TypeError);
    expect(txBodyTtl(body)).toBe('12345');
    expect(optionalUintToStr(body.ttl())).toBe('12345');
  });

  test('validity_interval_start is gone; validity_start_interval is a number', () => {
    const body = bodyWithCerts();
    expect(typeof body.validity_interval_start).toBe('undefined');
    expect(() => body.validity_interval_start()).toThrow(TypeError);
    expect(txBodyValidityStart(body)).toBeNull();
    body.set_validity_start_interval(99);
    expect(typeof body.validity_start_interval()).toBe('number');
    expect(txBodyValidityStart(body)).toBe('99');
  });

  test('plain output has no datum() or kind() — Ledger extras stay empty', () => {
    const output = plainOutput();
    expect(typeof output.datum).toBe('undefined');
    expect(typeof output.kind).toBe('undefined');
    expect(() => output.datum()).toThrow(TypeError);
    expect(() => output.kind()).toThrow(TypeError);
    expect(ledgerOutputDatum(output)).toEqual({
      datum: null,
      isBabbage: false,
      referenceScriptHex: null,
    });
  });

  test('ledgerOutputDatum reads a data hash without treating it as Babbage', () => {
    const output = plainOutput();
    const hashBytes = Buffer.from('33'.repeat(32), 'hex');
    output.set_data_hash(CSL.DataHash.from_bytes(hashBytes));
    expect(ledgerOutputDatum(output)).toEqual({
      datum: { type: 'hash', datumHashHex: hashBytes.toString('hex') },
      isBabbage: false,
      referenceScriptHex: null,
    });
  });

  test('ledgerOutputDatum reads inline plutus data as Babbage', () => {
    const output = plainOutput();
    output.set_plutus_data(CSL.PlutusData.new_integer(CSL.BigInt.from_str('42')));
    const extras = ledgerOutputDatum(output);
    expect(extras.isBabbage).toBe(true);
    expect(extras.datum).toEqual({
      type: 'inline',
      datumHex: Buffer.from(
        CSL.PlutusData.new_integer(CSL.BigInt.from_str('42')).to_bytes()
      ).toString('hex'),
    });
  });

  test('Ledger encoding does not call the removed output/body methods', () => {
    const utilSrc = fs.readFileSync(
      path.join(__dirname, '../../../../api/util.js'),
      'utf8'
    );
    expect(utilSrc).toMatch(/ledgerOutputDatum\(output\)/);
    expect(utilSrc).toMatch(/txBodyTtl\(/);
    expect(utilSrc).toMatch(/txBodyValidityStart\(/);
    expect(utilSrc).not.toMatch(/output\.datum\(\)/);
    expect(utilSrc).not.toMatch(/output\.kind\(\)/);
    expect(utilSrc).not.toMatch(/validity_interval_start/);
    expect(utilSrc).not.toMatch(/ttl\(\)\.to_str\(\)/);
    expect(utilSrc).not.toMatch(/TransactionOutputList/);
  });
});
