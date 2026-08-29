/**
 * Guard the CIP-30 connection approval refresh. If a later edit drops the
 * themed shell, origin chip, permission card, or sticky Connect footer, CI
 * fails instead of silently regressing to the old 100vh Nami leftover.
 */
const fs = require('fs');
const path = require('path');

const enableSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/pages/enable.jsx'),
  'utf8'
);
const stylesSrc = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/styles.css'),
  'utf8'
);

describe('CIP-30 enable UI refresh — structural contracts', () => {
  test('uses themed page chrome instead of leftover gray permission cards', () => {
    expect(enableSrc).toContain('useSurfaceColors');
    expect(enableSrc).toContain('bg={pageBg}');
    expect(enableSrc).toContain('lucem-settings-shell');
    expect(enableSrc).toContain('lucem-inset-surface');
    expect(enableSrc).toContain('lucem-sign-origin');
    expect(enableSrc).not.toContain("background={background}");
    expect(enableSrc).not.toContain("color={'yellow'}");
  });

  test('fills the popup instead of 100vh (monitor height in Chrome)', () => {
    expect(enableSrc).toContain('data-testid="enable-page"');
    expect(enableSrc).toContain('lucem-sign-page');
    expect(enableSrc).toContain('overscrollBehavior="contain"');
    expect(enableSrc).toMatch(/data-testid="enable-page"[\s\S]*?h="100%"/);
    expect(enableSrc).not.toMatch(/minH="100vh"/);
    expect(stylesSrc).toMatch(/\.lucem-sign-page[\s\S]*?height:\s*100%/);
  });

  test('has a title, origin chip, and explicit permission list', () => {
    expect(enableSrc).toContain('data-testid="enable-page-title"');
    expect(enableSrc).toContain('Connect to this site');
    expect(enableSrc).toContain('data-testid="enable-origin"');
    expect(enableSrc).toContain('data-testid="enable-permissions"');
    expect(enableSrc).toContain('View your balance and addresses');
    expect(enableSrc).toContain('Request approval for transactions');
    expect(enableSrc).toContain('View governance keys (DRep and stake)');
  });

  test('Connect footer stays in the popup — same pattern as Sign', () => {
    expect(enableSrc).toContain('data-testid="enable-footer"');
    expect(enableSrc).toContain('lucem-sign-footer');
    expect(enableSrc).toContain('data-testid="enable-connect"');
    expect(enableSrc).toContain('data-testid="enable-cancel"');
    expect(enableSrc).toContain("bg=\"yellow.400\"");
    expect(enableSrc).toContain('fontWeight="black"');
    expect(enableSrc).toContain('safe-area-inset-bottom');
    expect(enableSrc).toContain('Connect');
    expect(enableSrc).not.toMatch(/>\s*Access\s*</);
  });

  test('keeps whitelist grant/refuse wiring', () => {
    expect(enableSrc).toContain('setWhitelisted(request.origin)');
    expect(enableSrc).toContain('APIError.Refused');
    expect(enableSrc).toContain('controller.returnData');
    expect(enableSrc).toContain('getFaviconUrl(request.origin)');
  });
});
