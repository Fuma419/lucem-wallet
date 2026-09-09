/**
 * @jest-environment jsdom
 */
const { applyPwaChrome, pwaSurfaceColor } = require('../../../ui/pwaChrome');

describe('PWA chrome', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    document.body.innerHTML = `
      <meta name="theme-color" content="#080808" />
      <meta name="theme-color" content="#080808" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#080808" media="(prefers-color-scheme: dark)" />
      <meta name="color-scheme" content="dark" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    `;
  });

  test('pwaSurfaceColor matches the app surface', () => {
    expect(pwaSurfaceColor('dark')).toBe('#080808');
    expect(pwaSurfaceColor('light')).toBe('#f4f6fb');
    expect(pwaSurfaceColor(undefined)).toBe('#080808');
  });

  test('dark mode paints every theme-color and keeps a black status bar', () => {
    applyPwaChrome('dark', document);
    const colors = [...document.querySelectorAll('meta[name="theme-color"]')].map(
      (el) => el.getAttribute('content')
    );
    expect(colors).toEqual(['#080808', '#080808', '#080808']);
    expect(
      document.querySelector('meta[name="color-scheme"]').getAttribute('content')
    ).toBe('dark');
    expect(
      document
        .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
        .getAttribute('content')
    ).toBe('black');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(8, 8, 8)');
  });

  test('light mode updates the Light-Mode theme-color so iOS does not stay white', () => {
    applyPwaChrome('light', document);
    const light = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]'
    );
    expect(light.getAttribute('content')).toBe('#f4f6fb');
    expect(
      document.querySelector('meta[name="color-scheme"]').getAttribute('content')
    ).toBe('light');
    expect(
      document
        .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
        .getAttribute('content')
    ).toBe('default');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
