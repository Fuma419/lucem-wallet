/**
 * Interactive click-through coverage for seeded wallet screens.
 *
 * Jenkins Functional tests (`npm run test:e2e`) already run every spec in e2e/.
 * Screenshots capture appearance; these assert navigation, labels, and review
 * state with the shared Koios mock.
 *
 * Prefer direct routes over the action tray so a missing FAB cannot stall the
 * Playwright web server (which takes the rest of the suite down with it).
 */
const { test, expect } = require('@playwright/test');
const { E2E_PAYMENT_ADDR, openSeededWallet } = require('./helpers');

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ txBuilt: boolean, alertText: string }>}
 */
async function waitForSendTxReady(page) {
  const errorAlert = page.getByTestId('send-error-alert');
  const reviewButton = page.getByTestId('send-primary-action');
  let alertText = '';
  for (let i = 0; i < 30; i += 1) {
    await page.waitForTimeout(1_000);
    if (await errorAlert.count()) {
      alertText = (await errorAlert.textContent()) || '';
      break;
    }
    if (await reviewButton.isEnabled()) {
      return { txBuilt: true, alertText: '' };
    }
  }
  return { txBuilt: false, alertText };
}

test.describe('seeded wallet click-through', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 720 });
  });

  test('home shows preview banner and spendable ADA', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');
    await page.getByTestId('wallet-send').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await expect(page.getByTestId('wallet-network-banner')).toHaveText(
      /Preview/i
    );
    await expect
      .poll(async () => page.getByTestId('wallet-total-ada').innerText(), {
        timeout: 30_000,
      })
      .toMatch(/100/);
  });

  test('Receive opens QR popover with the payment address', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');
    await page.getByTestId('wallet-receive').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('wallet-receive').click();
    await page.getByTestId('receive-popover').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
    await expect(page.getByTestId('receive-qr')).toBeVisible();
    await expect(page.getByTestId('receive-address')).toHaveText(
      E2E_PAYMENT_ADDR
    );
    await expect(page.getByTestId('receive-copy-address')).toBeVisible();
  });

  test('History tab labels the mocked payment as Send', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');
    await page.getByTestId('wallet-send').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    const historyTab = page.getByTestId('wallet-history-tab');
    await historyTab.waitFor({ state: 'visible', timeout: 15_000 });
    await historyTab.click();
    await expect(historyTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('history-tx-label')).toHaveText(/Send/i, {
      timeout: 20_000,
    });
  });

  test('Send review opens confirm breakdown for a built payment', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/send');
    await page.getByTestId('send-page').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await page.getByTestId('send-recipient-input').fill(E2E_PAYMENT_ADDR);
    await page.getByTestId('send-ada-amount').fill('5');
    const { txBuilt, alertText } = await waitForSendTxReady(page);
    expect(txBuilt, `Send did not build a tx; alert: ${alertText || '(none)'}`).toBe(
      true
    );
    await page.getByTestId('send-primary-action').click();
    await expect(page.getByTestId('send-confirm-breakdown')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('send-confirm-to-address')).toContainText(
      'addr_test1'
    );
  });

  test('Settings switches network and tray layout', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/settings');
    await page.getByTestId('settings-page').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    const network = page.getByTestId('settings-network-panel');
    await expect(network.getByRole('radio', { name: 'Preview' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await network.getByRole('radio', { name: 'Preprod' }).click();
    await expect(
      network.getByRole('radio', { name: 'Preprod' })
    ).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
    await page
      .getByTestId('settings-swap-trays')
      .getByRole('radio', { name: 'Swapped' })
      .click();
    await expect(
      page.getByTestId('settings-swap-trays').getByRole('radio', { name: 'Swapped' })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('settings-provider-test')).toBeVisible();
  });

  test('Accounts applies a display name', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/accounts');
    await page.getByTestId('accounts-page').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    const input = page.getByTestId('accounts-rename-input');
    await input.click();
    await input.fill('E2E Wallet');
    await page.getByTestId('accounts-rename-apply').click();
    await expect(input).toHaveValue('E2E Wallet', { timeout: 15_000 });
  });

  test('Stake center lists HODLR and shows pool details', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/staking');
    await page.getByTestId('stake-center-page').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await expect(page.getByTestId('stake-current-status')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId('stake-pool-search').fill('HODLR');
    const hodlr = page.getByTestId('stake-pool-result-HODLR');
    await hodlr.waitFor({ state: 'visible', timeout: 20_000 });
    await hodlr.click();
    await expect(page.getByTestId('stake-pool-details')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Vote page exposes DRep and always-abstain actions', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/governance');
    await page.getByTestId('governance-page').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    await expect(page.getByTestId('governance-drep-id-input')).toBeVisible();
    await page.getByTestId('governance-drep-id-input').fill('drep1e2etestid');
    await expect(
      page.getByTestId('governance-custom-drep-delegate')
    ).toBeEnabled();
    await expect(page.getByTestId('governance-delegate-actions')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Always Abstain/i })
    ).toBeVisible();
  });

  test('action tray opens Settings from wallet home', async ({ page }) => {
    test.setTimeout(90_000);
    await openSeededWallet(page, '/wallet');
    await page.getByTestId('wallet-send').waitFor({
      state: 'visible',
      timeout: 60_000,
    });
    const toggle = page.getByTestId('wallet-action-tray-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 15_000 });
    await toggle.click();
    await page.getByTestId('wallet-settings-nav').click({ timeout: 10_000 });
    await page.getByTestId('settings-page').waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  });
});
