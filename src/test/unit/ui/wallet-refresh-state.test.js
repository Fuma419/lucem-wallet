const fs = require('fs');
const path = require('path');

describe('wallet refresh state retention', () => {
  test('unit: wallet source keeps cached account/delegation while data refreshes', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).not.toMatch(
      /setState\(\(s\) => \(\{[\s\S]{0,200}account:\s*null,[\s\S]{0,200}delegation:\s*null,[\s\S]{0,200}\}\)\);/
    );
  });

  test('functional: delegation actions and balance rendering are not gated by isFetching', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).toMatch(/\{state\.delegation && \(/);
    expect(walletSrc).toMatch(
      /quantity=\{\s*state\.account[\s\S]{0,260}state\.account\.lovelace !== null[\s\S]{0,260}\?\s*\(/
    );
    expect(walletSrc).not.toMatch(
      /\{isFetching &&[\s\S]{0,200}data-testid="wallet-delegation"/
    );
    expect(walletSrc).not.toMatch(
      /\{isFetching[\s\S]{0,200}quantity=\{[\s\S]{0,80}undefined/
    );
  });
});
