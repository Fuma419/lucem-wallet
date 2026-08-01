/**
 * Native (Capacitor) shell integration.
 *
 * Intentionally has NO static `@capacitor/*` imports: the web and extension
 * bundles must stay unchanged, and the Capacitor plugin packages are only
 * needed by the native projects. On a device the native bridge injects
 * `window.Capacitor` (and `window.Capacitor.Plugins`), which we reach lazily
 * so every function here is a safe no-op on web / extension.
 */

/** True only inside a packaged iOS/Android app running under Capacitor. */
export function isNativePlatform() {
  return (
    typeof window !== 'undefined' &&
    !!window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );
}

/** Look up a registered native plugin from the Capacitor bridge, or null. */
function nativePlugin(name) {
  if (
    typeof window === 'undefined' ||
    !window.Capacitor ||
    !window.Capacitor.Plugins
  ) {
    return null;
  }
  return window.Capacitor.Plugins[name] || null;
}

/**
 * Configure native chrome (status bar + splash) and the Android hardware back
 * button. No-op on web / extension.
 */
export async function initNativeShell() {
  if (!isNativePlatform()) return;

  const statusBar = nativePlugin('StatusBar');
  if (statusBar) {
    try {
      // Dark app surface -> light status-bar content. Do not overlay the WebView;
      // the UI already pads for `env(safe-area-inset-*)`.
      await statusBar.setStyle({ style: 'DARK' });
      if (typeof statusBar.setOverlaysWebView === 'function') {
        await statusBar.setOverlaysWebView({ overlay: false });
      }
    } catch (_) {
      /* status bar styling is non-critical */
    }
  }

  const splash = nativePlugin('SplashScreen');
  if (splash && typeof splash.hide === 'function') {
    try {
      await splash.hide();
    } catch (_) {
      /* ignore */
    }
  }

  const app = nativePlugin('App');
  if (app && typeof app.addListener === 'function') {
    // Android hardware back: walk history, exit at the root instead of white-screening.
    app.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else if (typeof app.exitApp === 'function') {
        app.exitApp();
      }
    });
  }
}
