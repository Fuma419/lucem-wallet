/**
 * Tests for mobile layout fixes.
 * Validates that hardcoded pixel values that cause overflow on mobile
 * have been replaced with responsive alternatives.
 */
const fs = require('fs');
const path = require('path');

describe('mobile layout - no hardcoded overflow widths', () => {
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
