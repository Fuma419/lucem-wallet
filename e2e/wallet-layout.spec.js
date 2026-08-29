const { test, expect } = require('@playwright/test');
const { openSeededWallet } = require('./helpers');

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
      test.setTimeout(90_000);
      await page.setViewportSize(vp);
      await openSeededWallet(page, '/wallet');

      const receive = page.getByTestId('wallet-receive');
      await receive.waitFor({ state: 'visible', timeout: 60_000 });

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
