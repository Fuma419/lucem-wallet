const fs = require('fs');
const path = require('path');

describe('governance page and wallet network button wiring', () => {
  test('network button CSS matches translucent FAB tray treatment', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(css).toMatch(/\.button\.network-mainnet[\s\S]*opacity:\s*0\.85/);
    expect(css).toMatch(
      /\.button\.network-mainnet\s*\{[\s\S]*radial-gradient\([\s\S]*rgba\(206,\s*250,\s*0/
    );
    expect(css).toMatch(
      /\.button\.network-preprod\s*\{[\s\S]*radial-gradient\([\s\S]*rgba\(0,\s*245,\s*255/
    );
    expect(css).toMatch(
      /\.button\.network-preview[\s\S]*radial-gradient\([\s\S]*rgba\(220,\s*27,\s*250/
    );
    expect(css).toMatch(
      /\.button\.network-mainnet\[data-active\][\s\S]*opacity:\s*1\s*!important/
    );
  });

  test('wallet network tray buttons use per-network class names with no shadow', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );

    expect(walletSrc).toContain('networkOptions.map((networkOption)');
    expect(walletSrc).toMatch(/className=\{`button network-\$\{networkOption\.id\}/);
    expect(walletSrc).toContain('data-active=');
    expect(walletSrc).toMatch(/shadow="none"/);
  });

  test('wallet shows colored testnet banner and hides it on mainnet', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(walletSrc).toContain('testnetBanner');
    expect(walletSrc).toContain('NETWORK_ID.mainnet');
    expect(walletSrc).toContain('wallet-network-banner');
    expect(walletSrc).toMatch(/network-banner-\$\{testnetBanner\.id\}/);
    expect(css).toMatch(/\.network-banner[\s\S]*position:\s*absolute/);
    expect(css).toMatch(/\.network-banner-preprod[\s\S]*rgba\(0,\s*245,\s*255/);
    expect(css).toMatch(/\.network-banner-preview[\s\S]*rgba\(220,\s*27,\s*250/);
  });

  test('governance page uses API-backed governance loading and confirm modal signing flow', () => {
    const governanceSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/governance.jsx'),
      'utf8'
    );

    expect(governanceSrc).toContain('fetchGovernanceOverview');
    expect(governanceSrc).toContain('ConfirmModal');
    expect(governanceSrc).toContain('voteDelegationTx');
    expect(governanceSrc).toContain("source === 'blockfrost'");
    expect(governanceSrc).toContain('signAndSubmitHW');
    expect(governanceSrc).toContain('signAndSubmit(');
    expect(governanceSrc).toContain('Delegate Voting Power');
    expect(governanceSrc).toContain('Active Governance Proposals');
    expect(governanceSrc).toContain('Learn governance action types');
    expect(governanceSrc).toContain('Read full proposal text');
    expect(governanceSrc).toContain('Copy ID');
  });
});

