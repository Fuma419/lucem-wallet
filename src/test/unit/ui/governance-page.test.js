const fs = require('fs');
const path = require('path');

describe('governance page and wallet network button wiring', () => {
  test('network button CSS disables glow and hover lift', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/styles.css'),
      'utf8'
    );

    expect(css).toMatch(/\.button\.network-mainnet,\s*[\s\S]*box-shadow:\s*none\s*!important/);
    expect(css).toMatch(/\.button\.network-mainnet:hover[\s\S]*transform:\s*none\s*!important/);
    expect(css).toMatch(/\.button\.network-preview\[data-active\][\s\S]*box-shadow:\s*none\s*!important/);
  });

  test('wallet network button uses no shadow prop', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
      'utf8'
    );

    expect(walletSrc).toMatch(/className=\{`button network-\$\{settings\.network\.id\}/);
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
    expect(governanceSrc).toContain('isMidnightNetworkId');
  });
});

