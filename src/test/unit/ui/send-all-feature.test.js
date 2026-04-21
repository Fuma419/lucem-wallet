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

  test('send all tx builder adjusts output coin by computed fee', () => {
    expect(sendSrc).toContain(
      "const totalLovelace = BigInt(txInfo.balance.lovelace || '0');"
    );
    expect(sendSrc).toContain('const nextCandidate = totalLovelace - feeLovelace;');
  });
});
