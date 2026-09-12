const {
  LEDGER_APP_NOT_OPEN_MESSAGE,
  LEDGER_BLE_NOT_LEDGER_MESSAGE,
  LEDGER_CHOOSER_CANCELLED_MESSAGE,
  LEDGER_SW,
  LEDGER_WITNESS_ASSEMBLE_MESSAGE,
  formatLedgerError,
  isLedgerAppNotSelectedError,
  ledgerAppTooOldMessage,
  ledgerStatusCode,
} = require('../../../../api/extension/ledger-error');

describe('ledgerStatusCode', () => {
  test('reads statusCode and numeric code', () => {
    expect(ledgerStatusCode({ statusCode: 0x6e01 })).toBe(0x6e01);
    expect(ledgerStatusCode({ code: 0x6e00 })).toBe(0x6e00);
  });

  test('parses hex from DeviceStatusError copy', () => {
    expect(
      ledgerStatusCode({
        message:
          'General error 0x6e01. Please consult https://github.com/cardano-foundation/ledger-app-cardano/blob/master/src/errors.h',
      })
    ).toBe(0x6e01);
  });

  test('ignores small Ada error codes that are not APDU status words', () => {
    expect(ledgerStatusCode({ code: 1, message: 'nope' })).toBe(null);
  });
});

describe('isLedgerAppNotSelectedError', () => {
  test('treats 0x6e01 / 0x6e00 as the Cardano app not being in the foreground', () => {
    expect(isLedgerAppNotSelectedError({ statusCode: 0x6e01 })).toBe(true);
    expect(isLedgerAppNotSelectedError({ statusCode: LEDGER_SW.CLA_NOT_SUPPORTED })).toBe(
      true
    );
  });

  test('matches v8 host copy', () => {
    expect(
      isLedgerAppNotSelectedError({ message: 'App not selected on device.' })
    ).toBe(true);
  });
});

describe('formatLedgerError', () => {
  test('replaces the 0x6e01 errors.h dump with actionable copy', () => {
    expect(
      formatLedgerError({
        message:
          'General error 0x6e01. Please consult https://github.com/cardano-foundation/ledger-app-cardano/blob/master/src/errors.h',
        statusCode: 0x6e01,
      })
    ).toBe(LEDGER_APP_NOT_OPEN_MESSAGE);
  });

  test('maps locked-device status words', () => {
    expect(formatLedgerError({ statusCode: 0x5515 })).toMatch(/locked/i);
    expect(formatLedgerError({ statusCode: 0x6e11 })).toMatch(/locked/i);
  });

  test('leaves picker / transport messages intact', () => {
    expect(formatLedgerError({ message: 'No device selected.' })).toBe(
      'No device selected.'
    );
  });

  test('is idempotent for copy it already produced', () => {
    expect(formatLedgerError({ message: LEDGER_APP_NOT_OPEN_MESSAGE })).toBe(
      LEDGER_APP_NOT_OPEN_MESSAGE
    );
  });

  test('uses fallback when the error is empty', () => {
    expect(formatLedgerError(null, 'USB failed.')).toBe('USB failed.');
  });

  test('ledgerAppTooOldMessage names the recommended version', () => {
    expect(ledgerAppTooOldMessage('8.0.1')).toMatch(/8\.0\.1/);
    expect(formatLedgerError(new Error(ledgerAppTooOldMessage('8.0.1')))).toMatch(
      /too old/
    );
  });

  test('maps a cancelled requestDevice chooser to send retry copy', () => {
    expect(
      formatLedgerError({
        name: 'NotFoundError',
        message: 'User cancelled the requestDevice() chooser.',
      })
    ).toBe(LEDGER_CHOOSER_CANCELLED_MESSAGE);
  });

  test('keeps the not-a-Ledger Bluetooth copy', () => {
    expect(formatLedgerError({ message: LEDGER_BLE_NOT_LEDGER_MESSAGE })).toBe(
      LEDGER_BLE_NOT_LEDGER_MESSAGE
    );
  });

  test('maps a minified CSL instanceof error after Ledger signed', () => {
    expect(formatLedgerError({ message: 'expected instance of Ri' })).toBe(
      LEDGER_WITNESS_ASSEMBLE_MESSAGE
    );
    expect(
      formatLedgerError({
        message: 'Could not wrap the Ledger payment key as a Vkey: expected instance of Ri',
      })
    ).toMatch(/Could not wrap the Ledger payment key as a Vkey: a Cardano type mismatch/);
  });
});
