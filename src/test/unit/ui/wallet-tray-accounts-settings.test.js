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

  test('right tray action FABs show visible text descriptors', () => {
    expect(traysSrc).toContain('TrayLabeledButton');
    expect(traysSrc).toContain('label="Vote"');
    expect(traysSrc).toContain('label="Accounts"');
    expect(traysSrc).toContain('label="Settings"');
    expect(traysSrc).toMatch(
      /label=\{delegation\?\.active \? 'Stake' : 'Delegate'\}/
    );
    expect(traysSrc).toContain('trayActionLabelProps');
    expect(traysSrc).toContain('labelSide');
  });

  test('left network tray options match circular labeled FAB style', () => {
    expect(traysSrc).toContain('TrayLabeledButton');
    expect(traysSrc).toContain('label={networkOption.label}');
    expect(traysSrc).toContain('MdPublic');
    expect(traysSrc).toContain('MdScience');
    expect(traysSrc).toContain('MdVisibility');
    expect(css).toMatch(
      /\.button\.network-mainnet[\s\S]*border-radius:\s*9999px/
    );
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
    expect(accountsSrc).toContain('WalletSetupButtons');
    expect(accountsSrc).toContain('Collateral');
    expect(accountsSrc).toContain('Delete Account');
    expect(accountsSrc).toMatch(
      /WalletSetupButtons[\s\S]*Delete Account[\s\S]*Collateral[\s\S]*<\/WalletSetupButtons>/
    );
    expect(accountsSrc).not.toContain('About');
    expect(accountsSrc).not.toContain("import About from '../components/about'");
    const setupSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/components/walletSetupFlow.jsx'),
      'utf8'
    );
    expect(setupSrc).toContain('Create Mnemonic');
    expect(setupSrc).toContain('Import Mnemonic');
    expect(setupSrc).toContain('Import HW');
    expect(setupSrc).toContain('Import Backup');
    expect(setupSrc).toContain('showBackupImport');
    expect(setupSrc).toContain('importAppData');
    expect(setupSrc).toContain('lucem-wallet-setup-actions');
    // HardwareWalletModal must expose Continue → createTab(TAB.hw). The Exit
    // revert (#181) accidentally dropped it and left only Close.
    expect(setupSrc).toContain('data-testid="hw-import-continue"');
    expect(setupSrc).toMatch(
      /createTab\(\s*TAB\.hw,\s*appendFlowReturnQuery\('', returnTo\)\)/
    );
    expect(setupSrc).toMatch(
      /HardwareWalletModal[\s\S]*hw-import-continue[\s\S]*Continue/
    );
    const welcomeSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/welcome.jsx'),
      'utf8'
    );
    expect(welcomeSrc).toContain('showBackupImport');
    expect(setupSrc).toContain('{children}');
    expect(css).toMatch(
      /\.lucem-equal-width-actions[\s\S]*width:\s*max-content/
    );
    expect(css).toMatch(
      /\.lucem-wallet-setup-actions[\s\S]*width:\s*max-content/
    );
    expect(css).toMatch(
      /\.lucem-equal-width-actions \.button[\s\S]*width:\s*100%/
    );
    expect(css).toMatch(
      /\.lucem-wallet-setup-actions \.chakra-button[\s\S]*width:\s*100%/
    );
    expect(css).toMatch(/\.lucem-tray-equal-actions/);
    expect(traysSrc).toContain('lucem-tray-equal-actions');
    expect(traysSrc).toContain('lucem-tray-action-label');
  });

  test('accounts selected row is visually and accessibly marked', () => {
    expect(accountsSrc).toContain('data-testid="accounts-selected-badge"');
    expect(accountsSrc).toContain('Selected');
    expect(accountsSrc).toContain("aria-current={isCurrent ? 'true' : undefined}");
    expect(accountsSrc).toContain("data-selected={isCurrent ? 'true' : undefined}");
    expect(accountsSrc).toContain('currentRowBg');
    expect(accountsSrc).toContain('isSameAccountIndex');
    expect(accountsSrc).toContain(
      'Switch the active account. Create, import, or connect hardware to'
    );
    expect(css).toMatch(
      /\.lucem-inset-row\.is-current[\s\S]*0 0 0 2px rgba\(255,\s*140,\s*0/
    );
  });

  test('accounts selection compares indexes across string/number forms', () => {
    expect(accountsSrc).toContain(
      "import { isSameAccountIndex } from '../utils/accountIndex'"
    );
    expect(accountsSrc).toContain(
      'isSameAccountIndex(currentIndex, accountKey)'
    );
    expect(accountsSrc).toContain('await switchAccount(accountKey)');
  });

  test('accounts content uses inset panels instead of edge-to-edge windows', () => {
    expect(accountsSrc).toContain('data-testid="accounts-list-panel"');
    expect(accountsSrc).toContain('data-testid="accounts-actions-panel"');
    expect(accountsSrc).toContain('useSurfaceColors');
    expect(accountsSrc).toContain('lucem-inset-surface');
    expect(accountsSrc).toMatch(/rounded="3xl"/);
    expect(accountsSrc).toMatch(/px=\{\{\s*base:\s*4,\s*md:\s*6\s*\}\}/);
    expect(accountsSrc).toMatch(/AlertDialogContent[\s\S]*mx=\{4\}/);
  });

  test('dark-mode CSS defines fab-accounts alongside fab-settings', () => {
    expect(css).toMatch(/\.button\.fab-accounts[\s\S]*rgba\(255,\s*140,\s*0/);
    expect(css).toMatch(/\.button\.fab-settings[\s\S]*rgba\(220,\s*27,\s*250/);
  });

  test('right tray toggle becomes a Home button on tray destination pages', () => {
    expect(traysSrc).toContain('MdHome');
    expect(traysSrc).toContain('isOnNavPage');
    expect(traysSrc).toMatch(
      /navPaths\s*=\s*\[\s*'\/accounts',\s*'\/settings',\s*'\/staking',\s*'\/governance'\s*\]/
    );
    expect(traysSrc).toContain('data-testid="wallet-home-fab"');
    expect(traysSrc).toContain('aria-label="Go to wallet home"');
    expect(traysSrc).toContain("go('/wallet')");
  });

  test('tray destination pages drop their own top back arrows', () => {
    const governanceSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/governance.jsx'),
      'utf8'
    );
    const stakingSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/staking.jsx'),
      'utf8'
    );
    const settingsSrc = fs.readFileSync(
      path.join(__dirname, '../../../ui/app/pages/settings.jsx'),
      'utf8'
    );

    expect(accountsSrc).not.toContain('aria-label="Go back"');
    expect(accountsSrc).not.toContain('ChevronLeftIcon');
    expect(settingsSrc).not.toContain('aria-label="Go back"');
    expect(settingsSrc).not.toContain('ChevronLeftIcon');
    expect(settingsSrc).toContain('AboutContent');
    expect(settingsSrc).toContain('lucem-equal-width-actions');
    expect(settingsSrc).toContain('data-testid="settings-primary-actions"');
    expect(settingsSrc).toContain('data-testid="settings-swap-trays"');
    expect(settingsSrc).toContain('swapTrays');
    expect(settingsSrc).toContain('data-testid="settings-glow-effects"');
    expect(settingsSrc).toContain('glowEffects');
    expect(traysSrc).toContain('swapTrays');
    expect(traysSrc).toContain('glowEffects');
    expect(traysSrc).toContain('className="button fab-vote"');
    expect(traysSrc).toContain('className="button fab-toggle"');
    expect(traysSrc).toContain('color="white"');
    expect(traysSrc).not.toContain('useColorModeValue');
    expect(traysSrc).not.toContain('fabColor');
    expect(traysSrc).toContain('data-tray-side');
    expect(shellSrc).toContain('swapTrays={Boolean(settings.swapTrays)}');
    expect(shellSrc).toContain('glowEffects={settings.glowEffects !== false}');
    // Send/Receive keep neon classes always; glow is CSS-only via data-glow.
    // Conditional className on glowEffects made dark+glow-off look like light mode.
    expect(walletSrc).toContain("className={receiveBtnClass}");
    expect(walletSrc).toContain("className={sendBtnClass}");
    expect(walletSrc).toContain(
      "const receiveBtnClass = 'button import-wallet'"
    );
    expect(walletSrc).toContain("const sendBtnClass = 'button new-wallet'");
    expect(walletSrc).not.toMatch(
      /receiveBtnClass\s*=\s*glowOn\s*\?/
    );
    expect(walletSrc).not.toMatch(/background=\{receiveButton\}/);
    expect(walletSrc).not.toMatch(/background=\{sendButton\}/);
    expect(governanceSrc).not.toContain('ArrowBackIcon');
    expect(stakingSrc).not.toContain('ArrowBackIcon');
  });
});
