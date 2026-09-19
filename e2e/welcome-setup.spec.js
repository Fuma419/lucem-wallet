/**
 * Welcome CTAs must open the matching setup modal / route.
 * Setup Cancel return paths are covered by setup-cancel.spec.js.
 */
const { test, expect } = require('@playwright/test');

test.describe('welcome setup click-through', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('Create Wallet accepts terms and opens the new seed screen', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
    await page.getByText('Wallet Setup').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('welcome-create-wallet').click();
    await page.getByRole('dialog').getByText('Create a wallet').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await page.getByRole('dialog').getByRole('checkbox').click({ force: true });
    await page.getByRole('dialog').getByRole('button', { name: /^Continue$/i }).click();
    await page.getByText('New Seed Phrase').waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await expect(page.getByTestId('setup-cancel-button')).toBeVisible();
  });

  test('Restore Wallet opens the restore warning dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
    await page.getByText('Wallet Setup').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('welcome-restore-wallet').click();
    await page.getByRole('dialog').getByText('Restore a wallet').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await expect(
      page.getByRole('dialog').getByRole('button', { name: /^Continue$/i })
    ).toBeDisabled();
  });

  test('Connect Hardware opens the hardware wallet dialog', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/welcome', { waitUntil: 'domcontentloaded' });
    await page.getByText('Wallet Setup').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('welcome-connect-hardware').click();
    await page.getByRole('dialog').getByText('Hardware wallet').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  });
});
