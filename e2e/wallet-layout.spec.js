const { test, expect } = require('@playwright/test');

/** @param {{ x: number; y: number; width: number; height: number }} a */
/** @param {{ x: number; y: number; width: number; height: number }} b */
function intersects(a, b) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

test.describe('Wallet header action row', () => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 400, height: 600 },
  ];

  for (const vp of viewports) {
    test(`Receive / Delegate / Send do not overlap at ${vp.width}×${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await page.goto('/wallet', { waitUntil: 'domcontentloaded' });

      const receive = page.getByTestId('wallet-receive');
      const visible = await receive
        .isVisible({ timeout: 8000 })
        .catch(() => false);
      if (!visible) {
        test.skip(
          true,
          'Wallet home not shown (no stored wallet or still on welcome). Build the app, serve build/, open an unlocked wallet, then re-run.'
        );
        return;
      }

      const send = page.getByTestId('wallet-send');
      const delegation = page.getByTestId('wallet-delegation');

      const rReceive = await receive.boundingBox();
      const rSend = await send.boundingBox();
      expect(rReceive, 'Receive visible').toBeTruthy();
      expect(rSend, 'Send visible').toBeTruthy();

      expect(intersects(rReceive, rSend), 'Receive and Send overlap').toBe(
        false
      );

      if (await delegation.isVisible().catch(() => false)) {
        const rDel = await delegation.boundingBox();
        expect(rDel, 'Delegation visible').toBeTruthy();
        expect(
          intersects(rReceive, rDel),
          'Receive and delegation overlap'
        ).toBe(false);
        expect(intersects(rDel, rSend), 'Delegation and Send overlap').toBe(
          false
        );
      }
    });
  }
});
