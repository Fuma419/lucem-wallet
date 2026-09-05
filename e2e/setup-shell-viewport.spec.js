const { test, expect } = require('@playwright/test');

/**
 * The full-page setup tabs put a modal card sized to nearly a whole viewport
 * (.create-wallet-modal.lucem-modal-card) underneath a logo header. A shell
 * that only sets minHeight grows to header + card + padding, so the bottom of
 * the card — the primary action on Sign with Keystone — sat below the fold with
 * no page scrollbar to reach it.
 *
 * These pages render their shell before any wallet state resolves, so no seeded
 * wallet is needed: keystoneTx lands on its "sign session expired" branch and
 * still lays out the same card.
 */

const PAGES = [
  { name: 'Sign with Keystone', url: '/keystoneTx.html?signId=layout-probe' },
  { name: 'Connect hardware wallet', url: '/hwTab.html' },
  { name: 'Create wallet', url: '/createWalletTab.html' },
];

const VIEWPORTS = [
  { width: 400, height: 600 },
  { width: 393, height: 851 },
  { width: 1280, height: 720 },
  { width: 1280, height: 560 },
];

test.describe('Full-page setup tabs fit the viewport', () => {
  for (const { name, url } of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${name} at ${vp.width}×${vp.height}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.goto(url, { waitUntil: 'networkidle' });

        const card = page.locator('.lucem-modal-card').first();
        await card.waitFor({ state: 'visible', timeout: 30_000 });

        const metrics = await page.evaluate(() => {
          const de = document.documentElement;
          // react-custom-scrollbars owns the real scrollport inside #scroll.
          const view = document.querySelector('#scroll')?.firstElementChild;
          return {
            documentOverflow: de.scrollHeight - de.clientHeight,
            shellOverflow: view ? view.scrollHeight - view.clientHeight : 0,
            viewportHeight: window.innerHeight,
          };
        });

        expect(metrics.documentOverflow, 'document scrolls past the viewport')
          .toBeLessThanOrEqual(1);
        expect(metrics.shellOverflow, 'shell scrolls past the viewport')
          .toBeLessThanOrEqual(1);

        const box = await card.boundingBox();
        expect(box, 'card has a layout box').toBeTruthy();
        expect(
          Math.round(box.y + box.height),
          'card bottom is cut off below the fold'
        ).toBeLessThanOrEqual(metrics.viewportHeight);
      });
    }
  }
});
