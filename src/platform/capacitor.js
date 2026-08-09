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

/**
 * Wrap raw bytes for a binary POST (e.g. the CBOR tx submit) so they survive
 * Capacitor's `fetch` patch on a device.
 *
 * With `CapacitorHttp` enabled, the native bridge rewrites `fetch`. Its
 * `convertBody` UTF-8 *text-decodes* a `Uint8Array`/`Buffer` request body
 * (unless the Content-Type is exactly `application/octet-stream`) and the
 * native `HttpRequestHandler` then re-encodes that string as UTF-8 — so
 * arbitrary bytes like a serialized transaction get mangled (invalid CBOR ⇒ the
 * node rejects every submit). A `File`, however, is base64-encoded by the
 * bridge and base64-DECODED back to raw bytes natively (`bodyType === "file"`),
 * with the Content-Type preserved. So on a device we hand `fetch` a `File`; on
 * web / extension (real `fetch`) we keep the raw bytes unchanged.
 *
 * @param {Uint8Array|Buffer} bytes - request body bytes
 * @param {string} contentType - preserved as the File's MIME type
 * @returns {Uint8Array|Buffer|File}
 */
export function nativeSafeBinaryBody(bytes, contentType) {
  if (isNativePlatform() && typeof File !== 'undefined') {
    return new File([bytes], 'body.bin', { type: contentType });
  }
  return bytes;
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
 * Ensure the OS camera permission is granted before a WebView `getUserMedia`
 * call (Keystone QR scanning). On Android the WebView only receives the camera
 * stream once the app already holds the runtime permission, so we pre-request
 * it via the Camera plugin; iOS answers the same prompt from its Info.plist
 * usage string. On web / extension there is nothing to pre-grant — the browser
 * shows its own prompt when `getUserMedia` runs — so this resolves to `true`.
 *
 * Returns `true` when scanning may proceed, `false` only when a native prompt
 * was explicitly denied.
 */
export async function ensureCameraPermission() {
  if (!isNativePlatform()) return true;

  const camera = nativePlugin('Camera');
  // No plugin registered: let `getUserMedia` attempt (and prompt) on its own.
  if (!camera || typeof camera.checkPermissions !== 'function') return true;

  try {
    let status = await camera.checkPermissions();
    if (
      status &&
      status.camera !== 'granted' &&
      typeof camera.requestPermissions === 'function'
    ) {
      status = await camera.requestPermissions({ permissions: ['camera'] });
    }
    return !!status && status.camera === 'granted';
  } catch (_) {
    // Permission API unavailable/errored: don't block; let getUserMedia try.
    return true;
  }
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
