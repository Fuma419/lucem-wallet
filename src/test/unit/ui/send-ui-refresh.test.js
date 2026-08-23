/**
 * Guard the Send UI/UX refresh. These are the 20+ considered changes — if a
 * later edit drops the title, theme tokens, fee strip, percent chips, paste
 * control, or confirm breakdown, CI fails instead of silently regressing to
 * the old Nami-era black canvas.
 */
const fs = require('fs');
const path = require('path');

const sendSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/pages/send.jsx'),
  'utf8'
);
const stylesSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/styles.css'),
  'utf8'
);
const assetBadgeSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/assetBadge.jsx'),
  'utf8'
);

describe('Send UI refresh — structural contracts', () => {
  test('uses themed page chrome instead of a hardcoded black canvas', () => {
    expect(sendSrc).toContain('useSurfaceColors');
    expect(sendSrc).toContain('bg={pageBg}');
    expect(sendSrc).toContain('lucem-settings-shell');
    expect(sendSrc).not.toMatch(/bg="black"/);
  });

  test('has a real page title, network badge, and safe-area header', () => {
    expect(sendSrc).toContain('data-testid="send-page-title"');
    expect(sendSrc).toContain('data-testid="send-network-badge"');
    expect(sendSrc).toContain('network-banner-${networkId}');
    expect(sendSrc).not.toMatch(/isMainnet \? 'red\.500'/);
    expect(sendSrc).toContain('safe-area-inset-top');
    expect(sendSrc).toContain('safe-area-inset-bottom');
  });

  test('Send is one scrollport — form scrolls, page does not use 100vh inside #scroll', () => {
    expect(sendSrc).toContain('data-testid="send-form-scroll"');
    expect(sendSrc).toContain('lucem-send-page');
    expect(sendSrc).toContain('overscrollBehavior="contain"');
    expect(stylesSrc).toMatch(/\.lucem-send-page[\s\S]*?height:\s*100%/);
    expect(sendSrc).toMatch(/data-testid="send-page"[\s\S]*?h="100%"/);
    expect(sendSrc).not.toMatch(/data-testid="send-page"[\s\S]{0,200}minH="100vh"/);
    expect(sendSrc).not.toMatch(
      /data-testid="send-page"[\s\S]{0,240}minHeight:\s*'100dvh'/
    );
  });

  test('sections the form (To / Amount / Tokens / Note) on inset surfaces', () => {
    expect(sendSrc).toMatch(/To[\s\S]*Amount[\s\S]*Tokens[\s\S]*Note/);
    expect((sendSrc.match(/lucem-inset-surface/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  test('shows available balance and 25/50/75/Max chips', () => {
    expect(sendSrc).toContain('data-testid="send-available-balance"');
    expect(sendSrc).toContain("id: 'send-percent-25'");
    expect(sendSrc).toContain("id: 'send-percent-50'");
    expect(sendSrc).toContain("id: 'send-percent-75'");
    expect(sendSrc).toContain("id: 'send-percent-max'");
    expect(sendSrc).toContain('data-testid={chip.id}');
  });

  test('explains invalid amounts instead of a silent red border', () => {
    expect(sendSrc).toContain('Below the minimum ADA this output needs.');
    expect(sendSrc).toContain('Exceeds the available balance.');
    expect(sendSrc).toContain('data-testid="send-amount-hint"');
  });

  test('does not reserve an empty 200px token scroller', () => {
    expect(sendSrc).toContain('data-testid="send-tokens-empty"');
    expect(sendSrc).not.toContain("height: value.sendAll ? 'auto' : 'min(200px, 35vh)'");
  });

  test('shows a live fee/total strip and a blocked-reason helper', () => {
    expect(sendSrc).toContain('data-testid="send-fee-preview"');
    expect(sendSrc).toContain('data-testid="send-total-preview"');
    expect(sendSrc).toContain('data-testid="send-blocked-reason"');
    expect(sendSrc).toContain('Estimating fee…');
  });

  test('recipient has paste, clear, $handle resolution, and other-account picker', () => {
    expect(sendSrc).toContain('data-testid="send-recipient-paste"');
    expect(sendSrc).toContain('data-testid="send-recipient-clear"');
    expect(sendSrc).toContain('data-testid="send-handle-resolved"');
    expect(sendSrc).toContain('clipboard.readText');
    expect(sendSrc).toContain('data-testid="send-recipient-accounts"');
    expect(sendSrc).toContain('otherLoadedAccounts');
    expect(sendSrc).toContain('Sending to {sendingToAccount.name');
    expect(sendSrc).toContain('shortenAddress(row.paymentAddr)');
    expect(sendSrc).not.toMatch(
      /send-recipient-accounts[\s\S]{0,900}<MiddleEllipsis>/
    );
    expect(sendSrc).not.toMatch(
      /data-testid="send-recipient-accounts"[\s\S]{0,200}MenuButton/
    );
  });

  test('Enter submits when the tx is ready; confirm is a labeled breakdown', () => {
    expect(sendSrc).toContain("e.key === 'Enter'");
    expect(sendSrc).toContain('data-testid="send-confirm-breakdown"');
    expect(sendSrc).toContain('You send');
    expect(sendSrc).toContain('Total leaving wallet');
    expect(sendSrc).toContain('data-testid="send-confirm-to-address"');
    expect(sendSrc).toContain('shortenAddress(address.result)');
    expect(sendSrc).not.toMatch(
      /send-confirm-breakdown[\s\S]{0,800}<MiddleEllipsis>/
    );
  });

  test('Keystone send opens the review modal instead of jumping to the QR', () => {
    expect(sendSrc).toMatch(/ref\.current\?\.openModal\(idx\)/);
    expect(sendSrc).not.toMatch(
      /indexToHw\(idx\)\.device === HW\.keystone\s*\n\s*\) \{\s*\n\s*void startKeystoneQrSign\(\)/
    );
  });

  test('loading and success states have human copy', () => {
    expect(sendSrc).toContain('Loading your wallet…');
    expect(sendSrc).toContain('signedTx.slice(0, 8)');
  });

  test('token amounts use 0 decimals when metadata is missing, not ADA\'s 6', () => {
    expect(sendSrc).toMatch(/Native tokens default to 0 decimals/);
    expect(sendSrc).toMatch(/tokenDecimals/);
    expect(sendSrc).toMatch(/resolveTokenSendQuantity/);
    expect(sendSrc).toMatch(/matchSpendableToken/);
    expect(sendSrc).toMatch(/Always re-fetch spendable UTxOs/);
    expect(sendSrc).toMatch(/tokenDecimals\(live\)/);
    expect(sendSrc).not.toMatch(/toUnit\(_value\.ada \|\| '10000000'\)/);
    expect(sendSrc).toMatch(/toUnit\(_value\.ada \|\| '0'\)/);
    expect(sendSrc).toMatch(/assets\.current\[asset\.unit\]\.decimals = decimals/);
    expect(sendSrc).toMatch(/triggerTxUpdate\(\(\) =>/);
    expect(assetBadgeSrc).toMatch(/displayTokenAmount\(asset\.quantity/);
    expect(assetBadgeSrc).not.toMatch(/onInput\(1\)/);
    expect(assetBadgeSrc).not.toMatch(/onInput\('1'\)/);
  });
});
