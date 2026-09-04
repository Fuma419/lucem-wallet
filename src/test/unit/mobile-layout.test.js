/**
 * Tests for mobile layout fixes.
 * Validates that hardcoded pixel values that cause overflow on mobile
 * have been replaced with responsive alternatives.
 */
const fs = require('fs');
const path = require('path');

describe('mobile layout - no hardcoded overflow widths', () => {
  test('createWallet.jsx full-page shell should not cap width at 500px (desktop background)', () => {
    const tabSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    expect(tabSrc).not.toMatch(
      /CreateWalletShell[\s\S]{0,400}maxWidth=\{?["']500px["']\}?/
    );
  });

  test('wallet.jsx Receive/Send buttons should not use gap="250px"', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).not.toMatch(/gap=["']250px["']/);
  });

  test('wallet.jsx Receive/Send button container should use responsive gap', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    // Should use Chakra responsive object syntax for gap
    expect(walletSrc).toMatch(/gap=\{\{/);
  });

  test('wallet.jsx should not overlay delegation on the action row (absolute 85% band)', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).not.toMatch(/top=["']85%["']/);
  });

  test('wallet.jsx exposes test ids for layout automation', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    const traysSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/walletTrays.jsx'),
      'utf8'
    );
    expect(walletSrc).toMatch(/data-testid="wallet-receive"/);
    expect(walletSrc).toMatch(/data-testid="wallet-send"/);
    expect(traysSrc).toMatch(/data-testid="wallet-delegation"/);
  });

  test('wallet.jsx hero should not use minHeight token 52 (too short; caused absolute overlap)', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).not.toMatch(/minHeight=\{?["']52["']\}?/);
  });

  test('wallet.jsx should use main column class for wide PWA / desktop readability', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).toMatch(/lucem-wallet-main-column/);
  });

  test('wallet.jsx header orbs share shell props and Lucem logo overscans to match the avatar chip', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).toContain('walletHeaderOrbShellProps');
    expect(walletSrc).toContain('WALLET_HEADER_LOGO_BG_SIZE');
    expect(walletSrc).toMatch(/WALLET_HEADER_LOGO_BG_SIZE\s*=\s*'138%'/);
    expect(walletSrc).toContain('backgroundImage={`url(${Logo})`}');
    expect(walletSrc).toContain('lucem-wallet-header');
    expect(walletSrc).toMatch(
      /calc\(0\.75rem \+ env\(safe-area-inset-top, 0px\)\)/
    );
    expect(walletSrc).not.toContain('lucem-wallet-network-row');
  });

  test('createWallet.jsx should use scroll region + viewport-capped modal card', () => {
    const tabSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    expect(tabSrc).toMatch(/lucem-create-wallet-scroll/);
    expect(tabSrc).toMatch(/lucem-modal-card/);
    expect(tabSrc).toMatch(/lucem-setup-flow-actions/);
    expect(tabSrc).toMatch(/SetupFlowActions/);
  });

  test('createWallet.jsx hides top Lucem banner on mobile for generate/verify/import only', () => {
    const tabSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    expect(tabSrc).toContain('hideHeaderLogoOnMobile');
    expect(tabSrc).toContain("'/generate'");
    expect(tabSrc).toContain("'/verify'");
    expect(tabSrc).toContain("'/import'");
  });

  test('styles.css should define safe-area tokens and scroll utility', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/styles.css'),
      'utf8'
    );
    expect(css).toMatch(/--lucem-safe-top/);
    expect(css).toMatch(/\.lucem-create-wallet-scroll/);
    expect(css).toMatch(/\.create-wallet-modal\.lucem-modal-card[\s\S]*height:\s*min\(/);
    expect(css).toMatch(/\.lucem-setup-flow-actions/);
    expect(css).toMatch(/overflow-y:\s*scroll/);
  });

  test('create/import shells pad past Android edge-back gesture insets', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/styles.css'),
      'utf8'
    );
    const createSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    const hwSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/hw.jsx'),
      'utf8'
    );
    expect(css).toMatch(/overscroll-behavior-x:\s*none/);
    expect(css).toMatch(/\.lucem-setup-inset/);
    expect(css).toMatch(/system-gesture-inset-left/);
    expect(createSrc).toContain('lucem-setup-inset');
    expect(hwSrc).toContain('lucem-setup-inset');
  });

  test('Android MainActivity excludes the mid-screen edge-back zone', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../../../android/app/src/main/java/xyz/lucem/wallet/MainActivity.java'
      ),
      'utf8'
    );
    expect(src).toContain('setSystemGestureExclusionRects');
    expect(src).toContain('EXCLUSION_HEIGHT_DP');
    expect(src).toContain('setDecorFitsSystemWindows(window, true)');
    expect(src).toContain('LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT');
    expect(src).toContain('setAppearanceLightStatusBars(false)');
  });

  test('Android themes opt out of API 35 edge-to-edge so the camera stays in chrome', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '../../../android/app/src/main/res/values/styles.xml'
      ),
      'utf8'
    );
    expect(src).toContain('windowOptOutEdgeToEdgeEnforcement');
    expect(src).toContain('android:statusBarColor');
    expect(src).toContain('#080808');
  });

  test('send.jsx should not pin the primary action bar with position absolute bottom', () => {
    const sendSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/send.jsx'),
      'utf8'
    );
    expect(sendSrc).not.toMatch(
      /position=["']absolute["'][\s\S]{0,120}bottom=["']3["']/
    );
  });

  test('settings.jsx should not overlay back control with absolute positioning', () => {
    const settingsSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/settings.jsx'),
      'utf8'
    );
    expect(settingsSrc).not.toMatch(
      /position=["']absolute["'][\s\S]{0,80}top=["']24["']/
    );
  });

  test('settings page is a flat single screen without nested settings routes', () => {
    const settingsSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/settings.jsx'),
      'utf8'
    );
    const mainSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/indexMain.jsx'),
      'utf8'
    );
    const legalSrc = fs.readFileSync(
      path.join(__dirname, '../../features/settings/legal/LegalSettings.tsx'),
      'utf8'
    );

    expect(settingsSrc).toContain('data-testid="settings-page"');
    expect(settingsSrc).toContain('Whitelisted sites');
    expect(settingsSrc).toContain('<LegalSettings');
    expect(settingsSrc).not.toContain('<Routes');
    expect(settingsSrc).not.toContain('General settings');
    expect(settingsSrc).not.toContain("navigate('general')");
    expect(settingsSrc).not.toContain("navigate('whitelisted')");
    expect(settingsSrc).not.toContain("navigate('legal')");
    expect(mainSrc).toContain('path="/settings"');
    expect(mainSrc).not.toContain('path="/settings/*"');
    expect(legalSrc).toContain('Terms of Use');
    expect(legalSrc).toContain('Privacy Policy');
    expect(legalSrc).not.toContain('SettingsPageTitle');
  });

  test('enable.jsx should use safe-area footer padding for action buttons', () => {
    const enableSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/enable.jsx'),
      'utf8'
    );
    expect(enableSrc).toMatch(/safe-area-inset-bottom/);
    expect(enableSrc).not.toMatch(
      /position=["']absolute["'][\s\S]{0,120}bottom=["']3["']/
    );
  });

  test('signData.jsx should use lucem-sign-payload-scroll instead of fixed 278px height', () => {
    const signDataSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/signData.jsx'),
      'utf8'
    );
    expect(signDataSrc).toMatch(/lucem-sign-payload-scroll/);
    expect(signDataSrc).not.toMatch(/height=["']278px["']/);
  });

  test('account.jsx header uses flex row (no absolute logo stack)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/account.jsx'),
      'utf8'
    );
    expect(src).toContain('<Flex align="center"');
    expect(src).not.toMatch(/position=["']absolute["'][\s\S]{0,40}top=["']13px["']/);
  });

  test('welcome.jsx uses column shell with safe-area padding (no absolute header/footer)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/welcome.jsx'),
      'utf8'
    );
    expect(src).toMatch(/--lucem-safe-top|safe-area-inset-top/);
    expect(src).toMatch(/safe-area-inset-bottom/);
    expect(src).not.toMatch(/position=["']absolute["'][\s\S]{0,30}top=["']9["']/);
  });

  test('welcome.jsx logo uses padded asset with object-fit contain (full mark)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/welcome.jsx'),
      'utf8'
    );
    expect(src).toMatch(/assets\/img\/logo\.png/);
    expect(src).toMatch(/objectFit="contain"/);
    expect(src).toMatch(/height="auto"/);
  });

  test('hw.jsx hardware tab uses minHeight 100dvh shell (no fixed 100vh center only)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/hw.jsx'),
      'utf8'
    );
    expect(src).toMatch(/100dvh/);
    expect(src).not.toMatch(/left=["']70px["']/);
  });

  test('signTx.jsx DetailsModal should not use 88vh Scrollbars wrapper', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/signTx.jsx'),
      'utf8'
    );
    expect(src).not.toMatch(/height:\s*['"]88vh['"]/);
    expect(src).toMatch(/WebkitOverflowScrolling/);
  });

  test('assetsModal.jsx should match full-screen modal scroll pattern (no 88vh)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/assetsModal.jsx'),
      'utf8'
    );
    expect(src).not.toMatch(/88vh/);
    expect(src).toMatch(/WebkitOverflowScrolling/);
  });

  test('index.jsx Main Scrollbars use 100% (never 100vw — Chrome popup vw is the monitor)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/index.jsx'),
      'utf8'
    );
    expect(src).toMatch(/id="scroll"/);
    expect(src).toMatch(/isExtensionPopup/);
    expect(src).toMatch(/isPhoneColumn/);
    expect(src).toMatch(/applyExtensionPopupDocument/);
    expect(src).toMatch(/height:\s*['"]100%['"]/);
    expect(src).not.toMatch(/width:\s*['"]100vw['"]/);
  });

  test('store.jsx loading shell shows full logo (contain) with dvh-aware minHeight', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/store.jsx'),
      'utf8'
    );
    expect(src).toMatch(/minH="100vh"/);
    expect(src).toMatch(/100dvh/);
    expect(src).toMatch(/objectFit="contain"/);
    expect(src).toMatch(/assets\/img\/logo\.png/);
  });

  test('Capacitor splash fits full logo (CENTER_INSIDE, not CENTER_CROP)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../capacitor.config.ts'),
      'utf8'
    );
    expect(src).toMatch(/androidScaleType:\s*'CENTER_INSIDE'/);
    expect(src).not.toMatch(/CENTER_CROP/);
    expect(src).toMatch(/overlaysWebView:\s*false/);
    expect(src).toMatch(/style:\s*'LIGHT'/);
  });

  test('termsOfUse.jsx legal scroll region should cap height with viewport (not fixed 400px only)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/termsOfUse.jsx'),
      'utf8'
    );
    expect(src).toMatch(/min\(25rem/);
    expect(src).not.toMatch(/height:\s*['"]400px['"]/);
  });

  test('privacyPolicy.jsx legal scroll region should cap height with viewport (not fixed 400px only)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/privacyPolicy.jsx'),
      'utf8'
    );
    expect(src).toMatch(/min\(25rem/);
    expect(src).not.toMatch(/height:\s*['"]400px['"]/);
  });

  test('send.jsx primary Send button should not use fixed width="366px"', () => {
    const sendSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/send.jsx'),
      'utf8'
    );
    // Should NOT have width={'366px'} without maxWidth
    // The fix uses width={{ base: '90%', md: '366px' }} with maxWidth
    expect(sendSrc).not.toMatch(/width=\{['"]366px['"]\}/);
  });

  test('send.jsx should use maxWidth for Send button', () => {
    const sendSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/send.jsx'),
      'utf8'
    );
    expect(sendSrc).toMatch(/maxWidth=["']366px["']/);
  });

  test('send.jsx asset containers should use maxWidth instead of fixed width={385}', () => {
    const sendSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/send.jsx'),
      'utf8'
    );
    // The "No Assets" and spinner boxes should use maxWidth={385} not width={385}
    expect(sendSrc).toMatch(/maxWidth=\{385\}/);
  });

  test('assetPopover.jsx should use maxWidth instead of fixed width={330}', () => {
    const assetPopoverSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/assetPopover.jsx'),
      'utf8'
    );
    expect(assetPopoverSrc).toMatch(/maxWidth=\{330\}/);
    expect(assetPopoverSrc).not.toMatch(/\bwidth=\{330\}/);
  });

  test('collectiblesViewer shows assets in two columns', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/collectiblesViewer.jsx'),
      'utf8'
    );
    expect(src).toMatch(/columns=\{2\}/);
    expect(src).not.toMatch(/columns=\{3\}/);
    expect(src).toMatch(/px="15%"/);
    expect(src).not.toMatch(/width="full" px=\{1\} pb=\{6\}/);
  });
});

describe('mobile layout - iOS PWA top chrome', () => {
  test('mainPopup.html does not use viewport-fit=cover (avoids iOS 27 shell shift)', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../../pages/Popup/mainPopup.html'),
      'utf8'
    );
    expect(html).not.toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/apple-mobile-web-app-status-bar-style" content="black"/);
    expect(html).not.toMatch(/black-translucent/);
    expect(html).not.toMatch(/class="lucem-ios-top-edge"/);
    expect(html).toMatch(/theme-color" content="#080808"/);
    expect(html).not.toMatch(/theme-color" content="#000000"/);
    expect(html).not.toMatch(/background-color: #000000/);
  });

  test('wallet/settings/accounts do not force a standalone 59px top floor', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    const settingsSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/settings.jsx'),
      'utf8'
    );
    const accountsSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/accounts.jsx'),
      'utf8'
    );
    const css = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/styles.css'),
      'utf8'
    );
    expect(walletSrc).not.toMatch(/pt="var\(--lucem-safe-top\)"/);
    expect(settingsSrc).not.toMatch(/calc\(1rem \+ var\(--lucem-safe-top\)\)/);
    expect(accountsSrc).not.toMatch(/calc\(1rem \+ var\(--lucem-safe-top\)\)/);
    expect(css).not.toMatch(/--lucem-safe-top:\s*max\(env\(safe-area-inset-top/);
  });

  test('theme.jsx keeps PWA theme-color on the app surface', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../ui/theme.jsx'),
      'utf8'
    );
    expect(src).toMatch(/SyncPwaThemeColor/);
    expect(src).toMatch(/#080808/);
    expect(src).toMatch(/#f4f6fb/);
    expect(src).toMatch(/apple-mobile-web-app-status-bar-style/);
    expect(src).toMatch(/colorMode === 'light' \? 'default' : 'black'/);
  });
});

describe('mobile layout - UnitDisplay handles zero correctly', () => {
  test('UnitDisplay should render "0" when quantity is 0, not "..."', () => {
    const unitDisplaySrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/components/unitDisplay.jsx'),
      'utf8'
    );
    // The condition should handle quantity === 0
    expect(unitDisplaySrc).toMatch(/quantity === 0/);
  });
});
