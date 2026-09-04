/**
 * Guard the CIP-30 sign popup refresh. If a later edit drops the neon
 * shell, title, origin chip, or sticky Sign footer, CI fails instead of
 * silently regressing to the old Nami-era leftover layout.
 */
const fs = require('fs');
const path = require('path');

const signSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/pages/signTx.jsx'),
  'utf8'
);
const stylesSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/styles.css'),
  'utf8'
);
const accountSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/account.jsx'),
  'utf8'
);
const internalSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/indexInternal.jsx'),
  'utf8'
);
const inlineActionSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/inlineSignAction.jsx'),
  'utf8'
);

describe('CIP-30 sign UI refresh — structural contracts', () => {
  test('uses themed page chrome instead of a leftover gray card', () => {
    expect(signSrc).toContain('useSurfaceColors');
    expect(signSrc).toContain('bg={pageBg}');
    expect(signSrc).toContain('lucem-settings-shell');
    expect(signSrc).toContain('lucem-inset-surface');
    expect(signSrc).toContain('lucem-sign-hero');
    expect(signSrc).not.toMatch(/color=\{lovelace <= 0 \? 'yellow\.400' : 'red\.400'\}/);
  });

  test('fills the popup instead of 100vh (monitor height in Chrome)', () => {
    expect(signSrc).toContain("'data-testid': 'sign-tx-page'");
    expect(signSrc).toContain('lucem-sign-page');
    expect(signSrc).toContain('overscrollBehavior="contain"');
    expect(stylesSrc).toMatch(/\.lucem-sign-page[\s\S]*?height:\s*100%/);
    expect(signSrc).toMatch(/'data-testid': 'sign-tx-page'[\s\S]*?h: '100%'/);
    expect(signSrc).not.toMatch(
      /'data-testid': 'sign-tx-page'[\s\S]{0,240}minH: '100vh'/
    );
    expect(internalSrc).toMatch(/overflowX:\s*['"]hidden['"]/);
    expect(internalSrc).toMatch(/height:\s*['"]100%['"]/);
  });

  test('has a title, origin chip, and neon spend/receive amount', () => {
    expect(signSrc).toContain('data-testid="sign-tx-page-title"');
    expect(signSrc).toContain('Sign transaction');
    expect(signSrc).toContain('data-testid="sign-tx-origin"');
    expect(signSrc).toContain('lucem-sign-origin');
    expect(signSrc).toContain('lucem-sign-amount-out');
    expect(signSrc).toContain('lucem-sign-amount-in');
    expect(signSrc).toContain('data-testid="sign-tx-fee"');
    expect(signSrc).toContain('Network fee');
    expect(stylesSrc).toContain('.lucem-sign-amount-out');
    expect(stylesSrc).toContain('#e31cff');
    expect(stylesSrc).toContain('#cefa00');
  });

  test('Sign footer stays in the popup — same pattern as Send', () => {
    expect(signSrc).toContain('data-testid="sign-tx-footer"');
    expect(signSrc).toContain('lucem-sign-footer');
    expect(signSrc).toContain('safe-area-inset-bottom');
    expect(stylesSrc).toMatch(
      /html\[data-layout=['"]extension['"]\] \.lucem-sign-footer/
    );
    // The footer actions live in InlineSignAction, which derives the testids
    // sign-tx-primary-action / sign-tx-cancel from this prefix.
    expect(signSrc).toContain('<InlineSignAction');
    expect(signSrc).toContain('testId="sign-tx"');
    expect(inlineActionSrc).toContain('${testId}-primary-action');
    expect(inlineActionSrc).toContain('${testId}-cancel');
    expect(inlineActionSrc).toContain('bg="yellow.400"');
    expect(inlineActionSrc).toContain('fontWeight="black"');
  });

  test('a software account signs on the page, without a password dialog', () => {
    // Password entry is inline, so approving is one screen. Only hardware
    // accounts, which have device prompts to run, open the dialog.
    expect(signSrc).toMatch(
      /isHw=\{isHW\(account\.index\)\}[\s\S]{0,800}onHwRequest=\{\(\) =>\s*ref\.current\.openModal\(account\.index\)\}/
    );
    expect(inlineActionSrc).toContain('${testId}-password');
    expect(inlineActionSrc).toContain('ERROR.wrongPassword');
    expect(inlineActionSrc).toContain('autoComplete="current-password"');
  });

  test('keeps origin, Details, and dApp decline/sign wiring', () => {
    expect(signSrc).toContain('getFaviconUrl(request.origin)');
    expect(signSrc).toContain('data-testid="sign-tx-details"');
    expect(signSrc).toContain('detailsModalRef.current.openModal()');
    expect(signSrc).toContain('TxSignError.UserDeclined');
    expect(signSrc).toContain('ref.current.openModal(account.index)');
    expect(signSrc).toContain('signTxHW');
    expect(signSrc).toContain('signTx(');
  });

  test('account header orbs use the extension sizing class', () => {
    expect(accountSrc).toContain('lucem-header-orb');
    expect((accountSrc.match(/lucem-header-orb/g) || []).length).toBeGreaterThanOrEqual(
      2
    );
  });
});
