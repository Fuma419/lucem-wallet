const fs = require('fs');
const path = require('path');

describe('governance page and wallet network button wiring', () => {
  test('network button CSS applies active indicator and requested colors', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(css).toMatch(/\.button\.network-mainnet\s*\{[\s\S]*rgba\(0,\s*122,\s*255/);
    expect(css).toMatch(/\.button\.network-preview\s*\{[\s\S]*rgba\(26,\s*214,\s*95/);
    expect(css).toMatch(/\.button\.network-mainnet\[data-active\][\s\S]*box-shadow:/);
    expect(css).toMatch(/\.button\.network-preview\[data-active\][\s\S]*box-shadow:/);
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

