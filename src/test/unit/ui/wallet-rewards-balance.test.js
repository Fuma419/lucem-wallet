const fs = require('fs');
const path = require('path');

describe('wallet total ADA with rewards breakdown', () => {
  const walletSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
    'utf8'
  );

  test('main balance shows total ADA including rewards', () => {
    expect(walletSrc).toContain('data-testid="wallet-total-ada"');
    expect(walletSrc).toContain(
      '(accountAdaLovelace + rewardsAdaLovelace).toString()'
    );
    expect(walletSrc).toContain('quantity={displayTotalAda}');
  });

  test('selecting total ADA opens account + rewards breakdown', () => {
    expect(walletSrc).toContain('data-testid="wallet-ada-breakdown"');
    expect(walletSrc).toContain('data-testid="wallet-account-ada"');
    expect(walletSrc).toContain('data-testid="wallet-rewards-balance"');
    expect(walletSrc).toContain('aria-label="Show ADA balance breakdown"');
    expect(walletSrc).toMatch(/Rewards[\s\S]*rewardsAdaLovelace/);
    // Rewards are no longer a permanent subtitle under the balance
    expect(walletSrc).not.toContain('Rewards:');
  });
});
