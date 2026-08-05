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

  test('pull-to-refresh always clears isFetching (try/finally)', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    // Regression: getData used to setIsFetching(true) then return/throw without
    // clearing it, so pull-to-refresh spun forever after updateAccount errors.
    expect(walletSrc).toMatch(/setIsFetching\(true\)/);
    expect(walletSrc).toMatch(
      /finally\s*\{[\s\S]{0,200}setIsFetching\(false\)/
    );
    // Early unmount returns must not skip the finally block.
    expect(walletSrc).toMatch(
      /const getData = async[\s\S]{0,400}try\s*\{/
    );
    expect(walletSrc).toMatch(/withTimeout\([\s\S]{0,80}updateAccount/);
    expect(walletSrc).toMatch(/assets \?\? \[\]/);
  });

  test('updateBalance must not fail the refresh when minAda probe throws', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../api/extension/index.js'),
      'utf8'
    );
    expect(src).toMatch(/minAda probe failed/);
    expect(src).toMatch(
      /assets\.length > 0\)\s*\{[\s\S]{0,120}try\s*\{[\s\S]{0,200}initTx/
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
    // Vote / Delegate must not disappear when delegation is still loading or
    // a refresh fails (previously gated on `delegation &&`).
    expect(traysSrc).not.toMatch(
      /\{delegation\s*&&[\s\S]{0,120}data-testid="wallet-delegation"/
    );
    expect(traysSrc).not.toMatch(/display:\s*'contents'/);
    expect(traysSrc).toContain('delegation?.active');
    expect(walletSrc).not.toMatch(
      /\{isFetching[\s\S]{0,200}quantity=\{[\s\S]{0,80}undefined/
    );
    // Only the balance-adjacent refresh control should spin on refresh.
    expect(walletSrc).toMatch(/isLoading=\{isFetching\}/);
    expect(walletSrc).not.toMatch(/isRefreshing=\{isFetching\}/);
    expect(walletSrc).not.toMatch(/<Skeleton[\s\S]{0,200}displayTotalAda/);
    const ptrSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/pullToRefresh.jsx'),
      'utf8'
    );
    // Pull-to-refresh must not add a second top-center yellow spinner.
    expect(ptrSrc).not.toMatch(/Spinner/);
    expect(ptrSrc).not.toContain('pull-to-refresh-indicator');
  });
});
