const fs = require('fs');
const path = require('path');
const CSL = require('@emurgo/cardano-serialization-lib-nodejs');
const {
  ALREADY_INCLUDED_USER_MESSAGE,
  isAlreadyIncludedSubmitError,
  txHashFromCborHex,
} = require('../../../../api/tx/submit-already-included');

const USER_KOIOS_ERROR =
  'Transaction submission failed: Koios API error: 400 — {"contents":{"contents":{"contents":{"era":"ShelleyBasedEraConway","error":["ConwayMempoolFailure \\"All inputs are spent. Transaction has probably already been included\\""],"kind":"ShelleyTxValidationError"},"tag":"TxValidationErrorInCardanoMode"},"tag":"TxCmdTxSubmitValidationError"},"tag":"TxSubmitFail"}';

const emptyTxHex = () => {
  const body = CSL.TransactionBody.new_tx_body(
    CSL.TransactionInputs.new(),
    CSL.TransactionOutputs.new(),
    CSL.BigNum.from_str('170000')
  );
  const tx = CSL.Transaction.new(body, CSL.TransactionWitnessSet.new());
  return Buffer.from(tx.to_bytes()).toString('hex');
};

describe('already-included submit recovery', () => {
  test('matches the Conway mempool error the vote submit path surfaces', () => {
    expect(isAlreadyIncludedSubmitError(USER_KOIOS_ERROR)).toBe(true);
    expect(isAlreadyIncludedSubmitError(new Error(USER_KOIOS_ERROR))).toBe(true);
    expect(isAlreadyIncludedSubmitError('Blockfrost API error: 400 already included')).toBe(
      true
    );
    expect(isAlreadyIncludedSubmitError('FeeTooSmallUTxO')).toBe(false);
    expect(isAlreadyIncludedSubmitError('ValueNotConservedUTxO')).toBe(false);
  });

  test('txHashFromCborHex matches CSL body hash', async () => {
    const hex = emptyTxHex();
    const hash = await txHashFromCborHex(hex);
    const expected = Buffer.from(
      CSL.FixedTransactionBody.from_bytes(
        CSL.Transaction.from_bytes(Buffer.from(hex, 'hex')).body().to_bytes()
      )
        .tx_hash()
        .to_bytes()
    ).toString('hex');
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('koiosSubmitTransaction recovers already-included instead of falling back blindly', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/util.js'),
      'utf8'
    );
    const start = src.indexOf('export async function koiosSubmitTransaction');
    const end = src.indexOf('export async function probeChainProviders');
    const fn = src.slice(start, end);
    expect(fn).toContain('isAlreadyIncludedSubmitError');
    expect(fn).toContain('txHashFromCborHex');
    expect(fn.indexOf('isAlreadyIncludedSubmitError')).toBeLessThan(
      fn.indexOf('Blockfrost submit failed, falling back to Koios')
    );
  });

  test('custom submitTx endpoint recovers already-included instead of InvalidRequest', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../api/extension/signing.js'),
      'utf8'
    );
    expect(src).toContain('isAlreadyIncludedSubmitError');
    expect(src).toContain('txHashFromCborHex');
  });
});

describe('ALREADY_INCLUDED_USER_MESSAGE', () => {
  test('tells the user to check history rather than retry immediately', () => {
    expect(ALREADY_INCLUDED_USER_MESSAGE).toMatch(/already on the network/i);
    expect(ALREADY_INCLUDED_USER_MESSAGE).toMatch(/history/i);
  });
});
