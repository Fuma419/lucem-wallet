/**
 * @jest-environment jsdom
 */
const {
  NETWORK_ACCENT,
  syncNetworkAccentDom,
} = require('../../../ui/networkAccent');

describe('network accent', () => {
  test('maps Cardano networks the same way as the delegation portal', () => {
    expect(NETWORK_ACCENT.mainnet).toBe('lime');
    expect(NETWORK_ACCENT.preprod).toBe('cyan');
    expect(NETWORK_ACCENT.preview).toBe('magenta');
    expect(NETWORK_ACCENT.testnet).toBe('magenta');
  });

  test('syncNetworkAccentDom writes data-network on the document', () => {
    document.documentElement.removeAttribute('data-network');
    syncNetworkAccentDom('preprod');
    expect(document.documentElement.getAttribute('data-network')).toBe(
      'preprod'
    );
    syncNetworkAccentDom('preview');
    expect(document.documentElement.getAttribute('data-network')).toBe(
      'preview'
    );
  });
});

describe('portal page background wiring', () => {
  const fs = require('fs');
  const path = require('path');
  const stylesSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/styles.css'),
    'utf8'
  );
  const themeSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/theme.jsx'),
    'utf8'
  );
  const storeSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/store.jsx'),
    'utf8'
  );

  test('theme mounts the portal-style page background', () => {
    expect(themeSrc).toContain('PageBackground');
    expect(themeSrc).toContain('<PageBackground />');
  });

  test('store stamps html[data-network] when settings load', () => {
    expect(storeSrc).toContain('syncNetworkAccentDom');
  });

  test('CSS carries network accent tokens and the page wash', () => {
    expect(stylesSrc).toContain('--lucem-accent:');
    expect(stylesSrc).toContain("html[data-network='preprod']");
    expect(stylesSrc).toContain("html[data-network='preview']");
    expect(stylesSrc).toContain('.lucem-page-bg-gradient');
    expect(stylesSrc).toContain('.lucem-page-bg-dots');
    expect(stylesSrc).toContain('--lucem-page-glow-left');
    expect(stylesSrc).toContain('rgba(var(--lucem-accent)');
  });
});
