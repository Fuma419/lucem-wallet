const fs = require('fs');
const path = require('path');

describe('send all safety flow', () => {
  const sendSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/send.jsx'),
    'utf8'
  );

  test('exposes send all toggle and warning copy', () => {
    expect(sendSrc).toContain('data-testid="send-all-toggle"');
    expect(sendSrc).toContain('Send all attempts to transfer every spendable ADA and token');
    expect(sendSrc).toContain('I understand this is a high-risk action');
  });

  test('requires explicit risk acknowledgement before sending', () => {
    expect(sendSrc).toContain('(value.sendAll && !sendAllRiskAccepted)');
  });

  test('disables manual amount and asset selection while send all is enabled', () => {
    expect(sendSrc).toContain('isDisabled={isLoading || value.sendAll}');
    expect(sendSrc).toContain('isDisabled={isSendAll || !assets || assets.length < 1}');
  });

  test('send all delegates to the dedicated all-inputs builder', () => {
    // Send-all no longer guesses the output with a fee-reduction loop; it calls
    // the dedicated `sendAllTx` builder, which forces every UTxO in and lets one
    // fee/change pass settle the remainder (no stranded funds).
    expect(sendSrc).toContain('const finalTx = await sendAllTx(');
  });

  test('send all reads fee/amount from the built tx, not balance state', () => {
    // Regression guard for "Failed to parse String to BigInt" on send-all: the
    // swept amount must come from `summarizeSendAll(finalTx)` (canonical CSL
    // integer strings), never re-derived from `txInfo.balance.lovelace`, whose
    // rehydrated values can be non-canonical and throw on stricter engines
    // (JavaScriptCore / iOS WebView). The old code did
    // `BigInt(txInfo.balance.lovelace) - feeLovelace`; that intermediate is gone.
    expect(sendSrc).toContain('const { fee, sent } = summarizeSendAll(finalTx);');
    expect(sendSrc).not.toContain('feeLovelace');
  });
});
