/**
 * Functional coverage: Cancel on create / import / HW setup returns to initiator.
 *
 * Requires a production build (same as other e2e specs).
 */
const { test, expect } = require('@playwright/test');

test.describe('setup Cancel returns to initiator', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('create generate Cancel → welcome when from=/welcome', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=generate&from=/welcome', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('New Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    const cancel = page.getByTestId('setup-cancel-button');
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await page.waitForURL(/\/welcome(?:\?|#|$)/, { timeout: 30_000 });
    await expect(page.getByText('Wallet Setup')).toBeVisible({ timeout: 30_000 });
  });

  test('import seed Cancel → welcome when from=/welcome', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(
      '/createWalletTab.html?type=import&length=24&from=/welcome',
      { waitUntil: 'load' }
    );
    await page.getByText('Import Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    const cancel = page.getByTestId('setup-cancel-button');
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await page.waitForURL(/\/welcome(?:\?|#|$)/, { timeout: 30_000 });
    await expect(page.getByText('Wallet Setup')).toBeVisible({ timeout: 30_000 });
  });

  test('HW connect Cancel → welcome when from=/welcome', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/hwTab.html?from=/welcome', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('Connect Hardware Wallet').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    const cancel = page.getByTestId('setup-cancel-button');
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await page.waitForURL(/\/welcome(?:\?|#|$)/, { timeout: 30_000 });
    await expect(page.getByText('Wallet Setup')).toBeVisible({ timeout: 30_000 });
  });

  test('create verify step has Cancel that returns to welcome', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=generate&from=/welcome', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('New Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('checkbox').click({ force: true });
    await page.getByRole('button', { name: /^Next$/i }).click();
    await page.getByText('Verify Seed Phrase').waitFor({ state: 'visible', timeout: 30_000 });
    const cancel = page.getByTestId('setup-cancel-button');
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await page.waitForURL(/\/welcome(?:\?|#|$)/, { timeout: 30_000 });
    await expect(page.getByText('Wallet Setup')).toBeVisible({ timeout: 30_000 });
  });

  test('create account step has Cancel that returns to welcome', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/createWalletTab.html?type=generate&from=/welcome', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('New Seed Phrase').waitFor({ state: 'visible', timeout: 60_000 });
    await page.getByRole('checkbox').click({ force: true });
    await page.getByRole('button', { name: /^Next$/i }).click();
    await page.getByText('Verify Seed Phrase').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /^Skip$/i }).click();
    await page
      .getByText(/Create Account|Add Wallet/i)
      .waitFor({ state: 'visible', timeout: 30_000 });
    const cancel = page.getByTestId('setup-cancel-button');
    await cancel.scrollIntoViewIfNeeded();
    await expect(cancel).toBeVisible();
    await cancel.click();
    await page.waitForURL(/\/welcome(?:\?|#|$)/, { timeout: 30_000 });
    await expect(page.getByText('Wallet Setup')).toBeVisible({ timeout: 30_000 });
  });
});
