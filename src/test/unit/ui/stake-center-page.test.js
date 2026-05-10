const fs = require('fs');
const path = require('path');

describe('stake center page wiring', () => {
  test('wallet stake action routes to the dedicated stake center', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );

    expect(walletSrc).toContain("navigate('/staking')");
    expect(walletSrc).toContain('aria-label="Open stake center"');
  });

  test('main router exposes the stake center route', () => {
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/indexMain.jsx'),
      'utf8'
    );

    expect(mainSrc).toContain("import Staking from './app/pages/staking'");
    expect(mainSrc).toContain('path="/staking"');
  });

  test('transaction builder no longer owns delegation pool search', () => {
    const builderSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/transactionBuilder.jsx'),
      'utf8'
    );

    expect(builderSrc).not.toContain('initDelegation');
    expect(builderSrc).not.toContain("import PoolSearch from './poolSearch'");
  });

  test('stake center has search, preview, and no-blank error states', () => {
    const stakingSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/staking.jsx'),
      'utf8'
    );

    expect(stakingSrc).toContain('data-testid="stake-center-page"');
    expect(stakingSrc).toContain('data-testid="stake-pool-search"');
    expect(stakingSrc).toContain('data-testid="stake-confirm-transaction"');
    expect(stakingSrc).toContain('Unable to prepare delegation transaction.');
  });
});
