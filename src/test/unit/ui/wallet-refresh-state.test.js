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
    const traysSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/walletTrays.jsx'),
      'utf8'
    );
    // Total ADA (account + rewards) renders from cached state, not isFetching.
    expect(walletSrc).toMatch(/quantity=\{displayTotalAda\}/);
    expect(walletSrc).toMatch(
      /state\.delegation[\s\S]{0,80}bigIntLovelace\(state\.delegation\.rewards\)/
    );
    expect(walletSrc).toMatch(
      /accountAdaLovelace !== null[\s\S]{0,80}\?[\s\S]{0,80}accountAdaLovelace \+ rewardsAdaLovelace/
    );
    expect(traysSrc).not.toMatch(
      /\{isFetching &&[\s\S]{0,200}data-testid="wallet-delegation"/
    );
    expect(walletSrc).not.toMatch(
      /\{isFetching[\s\S]{0,200}quantity=\{[\s\S]{0,80}undefined/
    );
    // Only the balance-adjacent refresh control should spin on refresh.
    expect(walletSrc).toMatch(/isLoading=\{isFetching\}/);
    expect(walletSrc).not.toMatch(/isRefreshing=\{isFetching\}/);
    expect(walletSrc).not.toMatch(/<Skeleton[\s\S]{0,200}displayTotalAda/);
  });
});
