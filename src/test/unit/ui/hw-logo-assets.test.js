/**
 * Regression guard for the hardware-wallet account icons.
 *
 * Keystone and Ledger accounts render their brand logo inside a small circular
 * avatar (tray, accounts list, header). The upstream brand assets are wide
 * *wordmarks* (logo + text): Keystone shipped 284x64 (~4.4:1) and Ledger
 * 452x118 (~3.8:1). Dropped into a round avatar those shrink to an illegible
 * sliver, so we crop them to the mark only, reframed to a square viewBox.
 *
 * These assertions lock that in: each logo must be (near-)square so it fills the
 * avatar, and must carry no live <text> (the mark, not the wordmark). If someone
 * re-imports the full wordmark asset, this fails instead of regressing the UI.
 */
const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '../../../assets/img');

const LOGOS = [
  { name: 'Keystone', file: 'imgKeystone.svg' },
  { name: 'Ledger', file: 'ledgerLogo.svg' },
];

const readSvg = (file) =>
  fs.readFileSync(path.join(ASSET_DIR, file), 'utf8');

const viewBoxAspect = (svg) => {
  const m = svg.match(/viewBox\s*=\s*"([^"]+)"/i);
  expect(m).toBeTruthy();
  const parts = m[1].trim().split(/[\s,]+/).map(Number);
  expect(parts).toHaveLength(4);
  const [, , w, h] = parts;
  expect(w).toBeGreaterThan(0);
  expect(h).toBeGreaterThan(0);
  return w / h;
};

describe('hardware-wallet logo assets are square marks, not wide wordmarks', () => {
  test.each(LOGOS)('$name logo has a near-square viewBox', ({ file }) => {
    const aspect = viewBoxAspect(readSvg(file));
    // A wordmark is >3:1; a mark sits close to 1:1. Allow a little slack.
    expect(aspect).toBeGreaterThanOrEqual(0.8);
    expect(aspect).toBeLessThanOrEqual(1.25);
  });

  test.each(LOGOS)('$name logo carries no rendered text (mark only)', ({ file }) => {
    const svg = readSvg(file);
    expect(svg).not.toMatch(/<text[\s>]/i);
    expect(svg).not.toMatch(/<tspan[\s>]/i);
  });
});
