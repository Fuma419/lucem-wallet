/**
 * Send must prepare a transaction under the extension's Content Security
 * Policy. Regression for "Unable to prepare transaction: Evaluating a string
 * as JavaScript violates the following Content Security Policy directive…":
 * fee sizing used PrivateKey.generate_ed25519(), whose browser-WASM entropy
 * shim runs `new Function(...)` and is rejected by `script-src 'self'
 * 'wasm-unsafe-eval'`.
 *
 * The CSP is injected per-test rather than set on the shared e2e server: the
 * web app (PWA) is deliberately allowed to run wallet-creation keygen, which
 * this policy blocks, so enforcing it server-wide would fail unrelated specs.
 */
const { test, expect } = require('@playwright/test');
const {
  E2E_PAYMENT_ADDR,
  isChainApiUrl,
  mockAllKoios,
  seedTestWallet,
} = require('./helpers');

// Mirrors src/manifest.json content_security_policy.extension_pages.
const EXTENSION_CSP =
  "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; frame-src https://connect.trezor.io/;";

test.describe('Send under the extension CSP', () => {
  test('prepares a payment without an eval/CSP error', async ({ page }) => {
    test.setTimeout(120_000);

    const evalErrors = [];
    const collect = (text) => {
      if (/unsafe-eval|Content Security Policy|EvalError/i.test(text)) {
        evalErrors.push(text);
      }
    };
    page.on('pageerror', (e) => collect(e.message));
    page.on('console', (m) => collect(m.text()));

    await mockAllKoios(page);
    // Registered after the Koios mock so this handler runs first (Playwright
    // matches routes last-added-first) and only rewrites document responses.
    await page.route('**/*', async (route) => {
      if (
        route.request().resourceType() !== 'document' ||
        isChainApiUrl(route.request().url())
      ) {
        return route.fallback();
      }
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy': EXTENSION_CSP,
        },
      });
    });

    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });
    await seedTestWallet(page, '/wallet');
    await page.goto('/mainPopup.html', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('wallet-send').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('wallet-send').click();
    await page
      .getByTestId('send-page')
      .waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByTestId('send-recipient-input').fill(E2E_PAYMENT_ADDR);
    await page.getByTestId('send-ada-amount').fill('5');

    // Preparation is debounced (300ms) and then runs a WASM fee pass. Poll for
    // a definite outcome instead of waiting on a locator that may never appear
    // (an absent element with no explicit timeout would hang the whole test).
    const errorAlert = page.getByTestId('send-error-alert');
    const reviewButton = page.getByTestId('send-primary-action');
    let alertText = '';
    let txBuilt = false;
    for (let i = 0; i < 45; i += 1) {
      await page.waitForTimeout(1_000);
      if (await errorAlert.count()) {
        alertText = (await errorAlert.textContent()) || '';
        break;
      }
      // Review stays disabled until `tx` is set, so enabled == tx built.
      if (await reviewButton.isEnabled()) {
        txBuilt = true;
        break;
      }
    }

    expect(alertText).not.toMatch(/Content Security Policy|unsafe-eval/i);
    expect(evalErrors, `CSP/eval errors: ${evalErrors.join(' | ')}`).toEqual([]);
    expect(txBuilt, `Send did not build a tx; alert: ${alertText || '(none)'}`).toBe(
      true
    );
  });
});
