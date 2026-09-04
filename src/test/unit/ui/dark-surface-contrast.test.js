/**
 * Legibility contract for the shared surface tokens used by Send, Delegate and Vote.
 *
 * The pages were reported as "dark on dark": nested cards and inputs were painted
 * with translucent *black* over a near-black page, so every surface sank into its
 * parent instead of rising above it, and disabled CTAs were unreadable.
 */
jest.mock('@chakra-ui/react', () => ({
  useColorModeValue: (light, dark) => ({ __light: light, __dark: dark }),
}));

// Aliased away from the `use*` name on purpose: with useColorModeValue mocked to
// a plain function this is just a token map, not a hook call in a component.
const surfaceTokens =
  require('../../../ui/app/hooks/useSurfaceColors').default;
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const dark = (key) => surfaceTokens()[key].__dark;
const light = (key) => surfaceTokens()[key].__light;

/** Alpha of an `rgba(...)` string, or null when the token is not rgba. */
const rgbaAlpha = (value) => {
  const match = /^rgba\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)[\s,]+([\d.]+)\s*\)$/.exec(
    value
  );
  return match ? { r: +match[1], a: parseFloat(match[4]) } : null;
};

/** Numeric weight of a Chakra whiteAlpha.N / blackAlpha.N token. */
const alphaToken = (value) => {
  const match = /^(white|black)Alpha\.(\d+)$/.exec(value);
  return match ? +match[2] : null;
};

describe('dark surface tokens keep stacked surfaces readable', () => {
  it('elevates nested surfaces with white overlays, never black ones', () => {
    // A black overlay on a #080808 page is darker than the panel it sits in,
    // which is what made status cards and inputs read as holes.
    for (const key of ['insetBg', 'cardBg', 'cardHoverBg', 'poolIdleBg']) {
      const rgba = rgbaAlpha(dark(key));
      expect(rgba).not.toBeNull();
      expect({ key, r: rgba.r }).toEqual({ key, r: 255 });
      expect(rgba.a).toBeGreaterThan(0);
    }
  });

  it('draws a hairline edge on panels in both color modes', () => {
    // Soft shadows alone left panel edges invisible against a near-black page.
    expect(dark('panelBorder')).not.toBe('transparent');
    expect(light('panelBorder')).not.toBe('transparent');
    expect(rgbaAlpha(dark('panelBorder')).a).toBeGreaterThan(0);
  });

  it('keeps disabled CTA labels readable against their own background', () => {
    const bg = alphaToken(dark('disabledBg'));
    const fg = alphaToken(dark('disabledFg'));
    expect(bg).not.toBeNull();
    expect(fg).not.toBeNull();
    // Old pairing was bg 200 / text 500, roughly 2:1 contrast.
    expect(fg).toBeGreaterThanOrEqual(700);
    expect(fg - bg).toBeGreaterThanOrEqual(400);
  });

  it('holds secondary text and placeholders above the old dim floor', () => {
    expect(alphaToken(dark('mutedFg'))).toBeGreaterThanOrEqual(800);
    expect(alphaToken(dark('subtleFg'))).toBeGreaterThanOrEqual(700);
    expect(alphaToken(dark('placeholder'))).toBeGreaterThanOrEqual(600);
    expect(alphaToken(dark('inputBorder'))).toBeGreaterThanOrEqual(200);
  });
});

describe('panel surface CSS', () => {
  const css = read('src/ui/app/components/styles.css');
  const block = (selector) => {
    const start = css.indexOf(selector + ' {');
    expect(start).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf('}', start));
  };

  it('rings .lucem-inset-surface with an inset hairline in both modes', () => {
    // An inset ring instead of a real border: no 1px reflow on panels that
    // declare `border: none`.
    expect(block('.lucem-inset-surface')).toMatch(
      /inset 0 0 0 1px rgba\(255, 255, 255/
    );
    expect(block("html[data-theme='light'] .lucem-inset-surface")).toMatch(
      /inset 0 0 0 1px rgba\(15, 23, 42/
    );
  });

  it('does not fade the bottom of a panel back into the page', () => {
    const gradient = block('.lucem-inset-surface');
    const stops = [...gradient.matchAll(/rgba\(255, 255, 255, ([\d.]+)\)/g)]
      .map((m) => parseFloat(m[1]))
      .filter((a) => a < 0.1);
    expect(stops.length).toBeGreaterThan(0);
    expect(Math.min(...stops)).toBeGreaterThanOrEqual(0.04);
  });
});

describe('Send, Delegate and Vote share one action language', () => {
  const pages = {
    'send.jsx': read('src/ui/app/pages/send.jsx'),
    'staking.jsx': read('src/ui/app/pages/staking.jsx'),
    'governance.jsx': read('src/ui/app/pages/governance.jsx'),
    'inlineSignAction.jsx': read('src/ui/app/components/inlineSignAction.jsx'),
  };

  it('never reintroduces the unreadable disabled pairing', () => {
    for (const [name, source] of Object.entries(pages)) {
      expect({ name, hit: /bg: 'whiteAlpha\.200',\s*\n\s*color: 'whiteAlpha\.500'/.test(source) }).toEqual({
        name,
        hit: false,
      });
    }
  });

  it('commits every flow with the same yellow primary button', () => {
    // Governance shipped a solid cyan CTA while Send and Delegate used brand
    // yellow, so the same action looked like a different control per page.
    const cta = pages['governance.jsx'].slice(
      pages['governance.jsx'].indexOf('governance-custom-drep-delegate')
    );
    const button = cta.slice(0, cta.indexOf('</Button>'));
    expect(button).toMatch(/bg="yellow\.400"/);
    expect(button).toMatch(/color="gray\.900"/);
    expect(button).not.toMatch(/colorScheme="cyan"/);
  });
});
