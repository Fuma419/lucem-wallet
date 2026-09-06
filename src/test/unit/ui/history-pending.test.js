const fs = require('fs');
const path = require('path');

describe('history viewer pending + categories', () => {
  const historySrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/historyViewer.jsx'),
    'utf8'
  );
  const txSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/transaction.jsx'),
    'utf8'
  );
  const signingSrc = fs.readFileSync(
    path.join(__dirname, '../../../api/extension/signing.js'),
    'utf8'
  );

  test('reloads the list when a new confirmed head (pending hash) arrives', () => {
    expect(historySrc).toContain('history?.confirmed?.[0]');
    expect(historySrc).toContain('headHash');
  });

  test('pending rows have a dedicated history test id', () => {
    expect(txSrc).toContain('data-testid="history-pending-tx"');
    expect(txSrc).toContain('Waiting for confirmation');
  });

  test('history labels distinguish stake, vote, DRep, internal, and external', () => {
    const kindSrc = fs.readFileSync(
      path.join(__dirname, '../../../api/tx/tx-kind.js'),
      'utf8'
    );
    expect(kindSrc).toContain("delegation: 'Stake delegation'");
    expect(kindSrc).toContain("drepDelegation: 'DRep delegation'");
    expect(kindSrc).toContain("vote: 'Vote'");
    expect(txSrc).toContain("internalOut: 'Internal send'");
    expect(txSrc).toContain("externalOut: 'Send'");
    expect(txSrc).toContain("internalIn: 'Internal receive'");
  });

  test('every submit path records pending history', () => {
    expect(signingSrc).toContain('recordSubmittedTx');
    expect(signingSrc).toContain('rememberSubmitted');
  });
});
