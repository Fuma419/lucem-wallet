export const PWA_THEME_COLOR = {
  light: '#f4f6fb',
  dark: '#080808',
};

export const pwaSurfaceColor = (colorMode) =>
  PWA_THEME_COLOR[colorMode] || PWA_THEME_COLOR.dark;

/**
 * Paint iOS / Android PWA chrome from the *app* theme, not the OS
 * `prefers-color-scheme`. Safari uses a white status-bar band around the
 * Dynamic Island when the Light-Mode theme-color is missing or when it
 * forgets the meta after a background/resume.
 */
export const applyPwaChrome = (colorMode, doc = document) => {
  if (!doc) return;
  const color = pwaSurfaceColor(colorMode);
  const isLight = colorMode === 'light';
  const root = doc.documentElement;
  if (root) {
    root.style.backgroundColor = color;
    root.style.colorScheme = isLight ? 'light' : 'dark';
  }
  if (doc.body) {
    doc.body.style.backgroundColor = color;
  }
  const themeTags = doc.querySelectorAll('meta[name="theme-color"]');
  themeTags.forEach((meta) => {
    meta.setAttribute('content', color);
  });
  const scheme = doc.querySelector('meta[name="color-scheme"]');
  if (scheme) {
    scheme.setAttribute('content', isLight ? 'light' : 'dark');
  }
  const bar = doc.querySelector(
    'meta[name="apple-mobile-web-app-status-bar-style"]'
  );
  if (bar) {
    bar.setAttribute('content', isLight ? 'default' : 'black');
  }
};
