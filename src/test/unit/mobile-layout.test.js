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
    expect(walletSrc).toMatch(/data-testid="wallet-receive"/);
    expect(walletSrc).toMatch(/data-testid="wallet-send"/);
    expect(walletSrc).toMatch(/data-testid="wallet-delegation"/);
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

  test('wallet.jsx header orbs share shell props and logo uses background overscan (not raw Image cover)', () => {
    const walletSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/pages/wallet.jsx'),
      'utf8'
    );
    expect(walletSrc).toContain('walletHeaderOrbShellProps');
    expect(walletSrc).toContain('WALLET_HEADER_LOGO_BG_SIZE');
    expect(walletSrc).toContain('backgroundImage={`url(${Logo})`}');
  });

  test('createWallet.jsx should use scroll region + viewport-capped modal card', () => {
    const tabSrc = fs.readFileSync(
      path.join(__dirname, '../../ui/app/tabs/createWallet.jsx'),
      'utf8'
    );
    expect(tabSrc).toMatch(/lucem-create-wallet-scroll/);
    expect(tabSrc).toMatch(/lucem-modal-card/);
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
