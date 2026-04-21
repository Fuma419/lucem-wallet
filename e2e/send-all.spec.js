const { test, expect } = require('@playwright/test');

test.describe('Send all warning UX', () => {
  test('shows explicit high-risk warning when enabled', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
    await page.goto('/send', { waitUntil: 'domcontentloaded' });

    const sendAllToggle = page.getByTestId('send-all-toggle');
    const hasToggle = await sendAllToggle
      .isVisible({ timeout: 8000 })
      .catch(() => false);
    if (!hasToggle) {
      test.skip(
        true,
        'Send page not accessible in this environment (wallet may be locked or not initialized).'
      );
      return;
    }

    await sendAllToggle.click();

    await expect(page.getByTestId('send-all-warning')).toBeVisible();
    await expect(
      page.getByText('I understand this is a high-risk action')
    ).toBeVisible();
  });
});
