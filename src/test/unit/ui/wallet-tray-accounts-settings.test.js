const fs = require('fs');
const path = require('path');

describe('wallet tray accounts vs settings FABs', () => {
  const walletSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/pages/wallet.jsx'),
    'utf8'
  );
  const css = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/styles.css'),
    'utf8'
  );

  test('tray has separate accounts menu FAB and settings navigation FAB', () => {
    expect(walletSrc).toContain('aria-label="Open accounts"');
    expect(walletSrc).toContain('aria-label="Open settings"');
    expect(walletSrc).toContain('MdAccountBalanceWallet');
    expect(walletSrc).toContain("navigate('/settings')");
    expect(walletSrc).toContain('fab-accounts');
    expect(walletSrc).toContain('fab-settings');
  });

  test('accounts menu no longer nests a Settings menu item', () => {
    // Settings is a tray FAB; the MenuList should not duplicate it.
    expect(walletSrc).not.toMatch(
      /MenuItem[\s\S]*?navigate\('\/settings'\)[\s\S]*?Settings[\s\S]*?<\/MenuItem>/
    );
  });

  test('dark-mode CSS defines fab-accounts alongside fab-settings', () => {
    expect(css).toMatch(/\.button\.fab-accounts[\s\S]*rgba\(255,\s*140,\s*0/);
    expect(css).toMatch(/\.button\.fab-settings[\s\S]*rgba\(220,\s*27,\s*250/);
  });
});
