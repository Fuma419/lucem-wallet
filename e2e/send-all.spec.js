const { test, expect } = require('@playwright/test');
const { openSeededWallet } = require('./helpers');

test.describe('Send all warning UX', () => {
  test('shows explicit high-risk warning when enabled', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 400, height: 720 });
    await openSeededWallet(page, '/send');

    await page.getByTestId('send-page').waitFor({ state: 'visible', timeout: 60_000 });
    const sendAllToggle = page.getByTestId('send-all-toggle');
    await sendAllToggle.scrollIntoViewIfNeeded();
    await expect(sendAllToggle).toBeEnabled({ timeout: 30_000 });
    await sendAllToggle.click();

    await expect(page.getByTestId('send-all-warning')).toBeVisible();
    await expect(
      page.getByText('I understand this is a high-risk action')
    ).toBeVisible();
  });
});
