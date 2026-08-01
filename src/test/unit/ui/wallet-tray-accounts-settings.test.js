const fs = require('fs');
const path = require('path');

describe('wallet tray accounts vs settings FABs', () => {
  const traysSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/walletTrays.jsx'),
    'utf8'
  );
  const shellSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/walletShell.jsx'),
    'utf8'
  );
  const mainSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/indexMain.jsx'),
    'utf8'
  );
  const accountsSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/accounts.jsx'),
    'utf8'
  );
  const walletSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
    'utf8'
  );
  const css = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/styles.css'),
    'utf8'
  );

  test('tray has separate accounts and settings FABs that navigate to full screens', () => {
    expect(traysSrc).toContain('aria-label="Open accounts"');
    expect(traysSrc).toContain('aria-label="Open settings"');
    expect(traysSrc).toContain('MdAccountBalanceWallet');
    expect(traysSrc).toContain("go('/accounts')");
    expect(traysSrc).toContain("go('/settings')");
    expect(traysSrc).toContain('fab-accounts');
    expect(traysSrc).toContain('fab-settings');
    expect(traysSrc).not.toContain('MenuButton');
    expect(traysSrc).not.toContain('MenuList');
  });

  test('wallet home no longer embeds trays or accounts menu', () => {
    expect(walletSrc).not.toContain('wallet-tray-backdrop');
    expect(walletSrc).not.toContain('Open accounts');
    expect(walletSrc).not.toContain('MenuList');
  });

  test('WalletShell mounts trays with Outlet for nested routes', () => {
    expect(shellSrc).toContain('WalletTrays');
    expect(shellSrc).toContain('<Outlet');
    expect(mainSrc).toContain('WalletShell');
    expect(mainSrc).toContain('path="/accounts"');
    expect(mainSrc).toContain('path="/settings"');
    expect(mainSrc).toContain('path="/staking"');
    expect(mainSrc).toContain('path="/governance"');
  });

  test('accounts is a full-screen page with account actions', () => {
    expect(accountsSrc).toContain('data-testid="accounts-page"');
    expect(accountsSrc).toContain('switchAccount');
    expect(accountsSrc).toContain('New Wallet');
    expect(accountsSrc).toContain('Collateral');
    expect(accountsSrc).toContain('Delete Account');
    expect(accountsSrc).toContain('About');
  });

  test('dark-mode CSS defines fab-accounts alongside fab-settings', () => {
    expect(css).toMatch(/\.button\.fab-accounts[\s\S]*rgba\(255,\s*140,\s*0/);
    expect(css).toMatch(/\.button\.fab-settings[\s\S]*rgba\(220,\s*27,\s*250/);
  });
});
