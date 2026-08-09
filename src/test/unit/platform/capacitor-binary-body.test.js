/**
 * @jest-environment jsdom
 *
 * Regression guard for the native (Capacitor) tx-submit corruption.
 *
 * With `CapacitorHttp` enabled the native bridge rewrites `fetch`: its
 * `convertBody` UTF-8 text-decodes a raw `Uint8Array`/`Buffer` request body
 * unless the Content-Type is exactly `application/octet-stream`, and the native
 * `HttpRequestHandler` then re-encodes that string as UTF-8 — so a serialized
 * CBOR transaction (`application/cbor`) is mangled and every submit is rejected.
 * A `File` is the one body form the bridge base64-encodes and the native side
 * base64-DECODES back to raw bytes (`bodyType === "file"`), with the
 * Content-Type preserved. `nativeSafeBinaryBody` picks the right form per
 * platform; this test locks that behavior down.
 */

const CBOR = Uint8Array.from([0x84, 0x00, 0xff, 0x1a, 0x00, 0x0f, 0x42, 0x40]);

const loadHelper = () => {
  jest.resetModules();
  // eslint-disable-next-line global-require
  return require('../../../platform/capacitor').nativeSafeBinaryBody;
};

describe('nativeSafeBinaryBody', () => {
  afterEach(() => {
    delete window.Capacitor;
  });

  test('web / extension: returns the raw bytes unchanged (real fetch sends binary)', () => {
    delete window.Capacitor;
    const nativeSafeBinaryBody = loadHelper();
    const bytes = Buffer.from(CBOR);
    const body = nativeSafeBinaryBody(bytes, 'application/cbor');
    expect(body).toBe(bytes);
    expect(body instanceof File).toBe(false);
  });

  test('native: wraps the bytes in a File so the CBOR survives Capacitor', () => {
    window.Capacitor = { isNativePlatform: () => true };
    const nativeSafeBinaryBody = loadHelper();
    const body = nativeSafeBinaryBody(Buffer.from(CBOR), 'application/cbor');

    // A File (not a Uint8Array) is the only body Capacitor base64-round-trips.
    expect(body instanceof File).toBe(true);
    // Content-Type is preserved so the node still sees application/cbor.
    expect(body.type).toBe('application/cbor');
    // All bytes are wrapped (nothing dropped/expanded by text-decoding).
    expect(body.size).toBe(CBOR.length);
  });

  test('native but no File constructor: falls back to raw bytes (no throw)', () => {
    window.Capacitor = { isNativePlatform: () => true };
    const RealFile = global.File;
    // eslint-disable-next-line no-global-assign
    delete global.File;
    try {
      const nativeSafeBinaryBody = loadHelper();
      const bytes = Buffer.from(CBOR);
      expect(nativeSafeBinaryBody(bytes, 'application/cbor')).toBe(bytes);
    } finally {
      global.File = RealFile;
    }
  });
});
