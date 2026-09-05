/**
 * Light-mode neon buttons must stay readable on #f4f6fb.
 *
 * The dark-mode recipe (0.85 opacity + a 50% black gradient stop + white type)
 * composites to a muddy mid-tone, so Send/Receive labels and tray FABs
 * washed out. Light mode paints a tinted fill and dark type instead.
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(
  path.join(__dirname, '../../../ui/app/components/styles.css'),
  'utf8'
);

const lightButtonsStart = css.indexOf('/*\n * Light mode neon buttons.');
const lightButtonsEnd = css.indexOf('/* In-flow testnet badge');

describe('light-mode neon button contrast', () => {
  test('the light-mode button block is present and self-contained', () => {
    expect(lightButtonsStart).toBeGreaterThan(-1);
    expect(lightButtonsEnd).toBeGreaterThan(lightButtonsStart);
  });

  test('drops the dark-mode black veil and 0.85 fade', () => {
    const block = css.slice(lightButtonsStart, lightButtonsEnd);
    expect(block).toMatch(/html\[data-theme='light'\] \.button \{[\s\S]*opacity:\s*1;/);
    expect(block).toContain('color: #1a2233 !important;');
    expect(block).not.toMatch(/rgba\(\s*0,\s*0,\s*0/);
    expect(block).not.toMatch(/opacity:\s*\.85/);
    expect(block).not.toMatch(/opacity:\s*0\.85/);
    expect(block).not.toMatch(/opacity:\s*0\.95/);
  });

  test('tints every neon variant via --btn-fill instead of a black stop', () => {
    const block = css.slice(lightButtonsStart, lightButtonsEnd);
    const variants = [
      '.button.new-wallet',
      '.button.new-account',
      '.button.import-wallet',
      '.button.import-backup',
      '.button.settings',
      '.button.enter-wallet',
      '.button.hw-wallet',
      '.button.fab-vote',
      '.button.fab-stake',
      '.button.fab-accounts',
      '.button.fab-settings',
      '.button.fab-toggle',
      '.button.fab-account-toggle',
    ];
    for (const selector of variants) {
      expect(block).toContain(selector);
    }
    expect(block).toContain('--btn-fill:');
    expect(block).toMatch(
      /background:\s*radial-gradient\([\s\S]*rgba\(var\(--btn-fill\),\s*0\.82\)/
    );
    expect(block).toContain('rgba(var(--btn-fill), 0.48)');
  });

  test('paints dark glyphs on tray FABs so they read on the tinted fill', () => {
    const block = css.slice(lightButtonsStart, lightButtonsEnd);
    expect(block).toContain(
      "html[data-theme='light'] .button.fab-toggle svg"
    );
    expect(block).toContain(
      "html[data-theme='light'] .button.fab-account-toggle svg"
    );
    expect(block).toMatch(
      /\.button\.fab-account-toggle svg \{[\s\S]*color:\s*#1a2233\s*!important;/
    );
  });

  test('does not paint a fill over account-option avatars', () => {
    const block = css.slice(lightButtonsStart, lightButtonsEnd);
    const fillProp = 'rgba(var(--btn-fill), 0.82)';
    const propAt = block.indexOf(fillProp);
    expect(propAt).toBeGreaterThan(-1);
    const ruleOpen = block.lastIndexOf('{', propAt);
    const prevClose = block.lastIndexOf('}', ruleOpen - 1);
    const selectors = block.slice(prevClose + 1, ruleOpen);
    expect(selectors).toContain('.button.fab-account-toggle');
    expect(selectors).not.toMatch(/\.button\.fab-account[\s,]/);
  });
});
