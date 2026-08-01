import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native (iOS/Android) shell for the Lucem wallet. It wraps the exact same web
 * build that ships to Vercel and the browser extension (see webpack output
 * `build/`); inside the WebView `chrome.runtime.id` is absent, so the app runs
 * through the web platform adapter (`src/platform/web.js`, IndexedDB storage).
 *
 * `npm run mobile:sync` builds `build/` and copies it into the native projects.
 */
const config: CapacitorConfig = {
  appId: 'xyz.lucem.wallet',
  appName: 'Lucem',
  webDir: 'build',
  plugins: {
    // Route the app's fetch/XHR through native networking. A packaged app has no
    // Vercel `/api/koios/*` proxy, and WebView CORS would otherwise block direct
    // Koios / Blockfrost / CoinGecko calls. This makes them work with no proxy.
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#000000',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
