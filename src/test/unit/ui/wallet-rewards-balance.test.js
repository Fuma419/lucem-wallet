const fs = require('fs');
const path = require('path');

describe('wallet rewards balance visibility', () => {
  test('main wallet page renders rewards balance from delegation state', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );

    expect(walletSrc).toContain('data-testid="wallet-rewards-balance"');
    expect(walletSrc).toContain('Rewards:');
    expect(walletSrc).toContain(
      'quantity={bigIntLovelace(state.delegation.rewards).toString()}'
    );
  });
});
