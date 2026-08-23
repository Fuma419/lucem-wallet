const fs = require('fs');
const path = require('path');
import {
  applyExtensionPopupDocument,
  DESKTOP_MIN_WIDTH,
  detectIsExtensionPopup,
  detectIsFullBleedWalletTab,
  LUCEM_LAYOUT,
  resolveLucemLayoutSurface,
} from '../../../ui/layout/surface';
import { POPUP, POPUP_WINDOW, TAB } from '../../../config/config';

describe('resolveLucemLayoutSurface', () => {
  test('extension popup wins over a wide fine-pointer viewport', () => {
    expect(
      resolveLucemLayoutSurface({
        isExtensionPopup: true,
        isNative: false,
        width: 1440,
        finePointer: true,
        hover: true,
      })
    ).toBe(LUCEM_LAYOUT.extension);
  });

  test('native Capacitor stays on the touch layout', () => {
    expect(
      resolveLucemLayoutSurface({
        isExtensionPopup: false,
        isNative: true,
        width: 1440,
        finePointer: true,
        hover: true,
      })
    ).toBe(LUCEM_LAYOUT.touch);
  });

  test('wide laptop with hover and a fine pointer is desktop', () => {
    expect(
      resolveLucemLayoutSurface({
        isExtensionPopup: false,
        isNative: false,
        width: DESKTOP_MIN_WIDTH,
        finePointer: true,
        hover: true,
      })
    ).toBe(LUCEM_LAYOUT.desktop);
  });

  test('touchscreen / coarse pointer stays on the compact layout', () => {
    expect(
      resolveLucemLayoutSurface({
        isExtensionPopup: false,
        isNative: false,
        width: 1440,
        finePointer: false,
        hover: false,
      })
    ).toBe(LUCEM_LAYOUT.touch);
  });

  test('narrow browser window stays on the compact layout', () => {
    expect(
      resolveLucemLayoutSurface({
        isExtensionPopup: false,
        isNative: false,
        width: DESKTOP_MIN_WIDTH - 1,
        finePointer: true,
        hover: true,
      })
    ).toBe(LUCEM_LAYOUT.touch);
  });
});

describe('applyExtensionPopupDocument', () => {
  test('sets popup size CSS vars and a fixed viewport width', () => {
    const meta = { setAttribute: jest.fn() };
    const root = { style: { setProperty: jest.fn() } };
    const doc = {
      documentElement: root,
      querySelector: (sel) => (sel === 'meta[name="viewport"]' ? meta : null),
    };
    applyExtensionPopupDocument(doc, POPUP_WINDOW);
    expect(root.style.setProperty).toHaveBeenCalledWith(
      '--lucem-popup-width',
      `${POPUP_WINDOW.width}px`
    );
    expect(root.style.setProperty).toHaveBeenCalledWith(
      '--lucem-popup-height',
      `${POPUP_WINDOW.height}px`
    );
    expect(meta.setAttribute).toHaveBeenCalledWith(
      'content',
      `width=${POPUP_WINDOW.width}, initial-scale=1, maximum-scale=1, user-scalable=no`
    );
  });

  test('is a no-op without a document element', () => {
    expect(() => applyExtensionPopupDocument(null)).not.toThrow();
    expect(() => applyExtensionPopupDocument({})).not.toThrow();
  });
});

describe('detectIsExtensionPopup / detectIsFullBleedWalletTab', () => {
  const queryDoc = (id) => ({
    querySelector: (sel) => (sel === `#${id}` ? {} : null),
  });

  test('main popup with chrome.runtime.id is an extension popup', () => {
    expect(
      detectIsExtensionPopup(queryDoc(POPUP.main), { runtime: { id: 'ext' } })
    ).toBe(true);
  });

  test('main popup HTML on the web (no chrome.runtime) is not an extension popup', () => {
    expect(detectIsExtensionPopup(queryDoc(POPUP.main), undefined)).toBe(false);
  });

  test('create-wallet tab is full-bleed', () => {
    expect(detectIsFullBleedWalletTab(queryDoc(TAB.createWallet))).toBe(true);
    expect(detectIsFullBleedWalletTab(queryDoc(POPUP.main))).toBe(false);
  });
});

describe('desktop layout source contracts', () => {
  const read = (rel) =>
    fs.readFileSync(path.join(__dirname, '../../../', rel), 'utf8');

  test('index.jsx caps width at 480px only for the touch surface', () => {
    const src = read('ui/index.jsx');
    expect(src).toContain('isPhoneColumn');
    expect(src).toContain('LUCEM_LAYOUT.touch');
    expect(src).toContain("maxW={isPhoneColumn ? '480px' : undefined}");
    expect(src).toContain('LayoutSurfaceProvider');
    expect(src).not.toMatch(
      /maxW=\{isExtensionPopup \|\| isFullBleedWalletTab \? undefined : '480px'\}/
    );
  });

  test('WalletShell uses DesktopNav on desktop and WalletTrays otherwise', () => {
    const src = read('ui/app/components/walletShell.jsx');
    expect(src).toContain('DesktopNav');
    expect(src).toContain('WalletTrays');
    expect(src).toContain('LUCEM_LAYOUT.desktop');
    expect(src).toContain('lucem-desktop-shell');
    expect(src).toContain('data-testid="lucem-desktop-shell"');
  });

  test('wallet home has a desktop two-column assets/history pane', () => {
    const src = read('ui/app/pages/wallet.jsx');
    expect(src).toContain('lucem-wallet-home');
    expect(src).toContain('wallet-desktop-panels');
    expect(src).toContain('lucem-tray-clearance');
  });

  test('styles.css pins extension popup chrome and enlarges corner controls', () => {
    const css = read('ui/app/components/styles.css');
    expect(css).toMatch(
      /html\[data-layout=['"]extension['"]\][\s\S]*--lucem-popup-width/
    );
    expect(css).toMatch(
      /html\[data-layout=['"]extension['"]\] \.lucem-header-orb/
    );
    expect(css).toMatch(
      /html\[data-layout=['"]extension['"]\] \.button\.fab-toggle/
    );
    expect(css).toMatch(
      /\.button\.fab-toggle[\s\S]*padding:\s*0/
    );
    expect(css).toContain('.lucem-header-orb');
  });

  test('wallet.jsx marks header orbs and asset tabs for extension sizing', () => {
    const src = read('ui/app/pages/wallet.jsx');
    expect(src).toContain("className: 'lucem-header-orb'");
    expect(src).toContain('lucem-wallet-asset-tabs');
  });

  test('styles.css scopes the sidebar to html[data-layout=desktop]', () => {
    const css = read('ui/app/components/styles.css');
    expect(css).toMatch(
      /html\[data-layout=['"]desktop['"]\] \.lucem-desktop-nav/
    );
    expect(css).toMatch(
      /html\[data-layout=['"]desktop['"]\] \.lucem-desktop-main/
    );
    expect(css).toMatch(
      /html\[data-layout=['"]desktop['"]\] \.lucem-tray-clearance/
    );
  });
});
