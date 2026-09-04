import { POPUP, POPUP_WINDOW, TAB } from '../../config/config';
import { isNativePlatform } from '../../platform/capacitor';

export const LUCEM_LAYOUT = {
  extension: 'extension',
  touch: 'touch',
  desktop: 'desktop',
};

/** Laptop / desktop web: wide viewport plus a precise pointing device. */
export const DESKTOP_MIN_WIDTH = 1024;

/**
 * Chrome extension popup (main or dApp approval), not a full-page tab.
 * @param {Document | null | undefined} doc
 * @param {{ runtime?: { id?: string } } | null | undefined} chromeLike
 */
export function detectIsExtensionPopup(doc, chromeLike) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  const isMain = !!doc.querySelector(`#${POPUP.main}`);
  const isInternal = !!doc.querySelector(`#${POPUP.internal}`);
  return (
    (isMain || isInternal) &&
    !!chromeLike &&
    chromeLike.runtime != null &&
    typeof chromeLike.runtime.id !== 'undefined'
  );
}

/** Full-page extension tabs (HW, create wallet, Keystone sign). */
export function detectIsFullBleedWalletTab(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return false;
  return (
    !!doc.querySelector(`#${TAB.hw}`) ||
    !!doc.querySelector(`#${TAB.keystoneTx}`) ||
    !!doc.querySelector(`#${TAB.createWallet}`)
  );
}

/**
 * Pure surface picker — unit-testable without `window`.
 * @param {{
 *   isExtensionPopup?: boolean,
 *   isNative?: boolean,
 *   width?: number,
 *   finePointer?: boolean,
 *   hover?: boolean,
 * }} [opts]
 */
export function resolveLucemLayoutSurface({
  isExtensionPopup = false,
  isNative = false,
  width = 0,
  finePointer = false,
  hover = false,
} = {}) {
  if (isExtensionPopup) return LUCEM_LAYOUT.extension;
  if (isNative) return LUCEM_LAYOUT.touch;
  if (width >= DESKTOP_MIN_WIDTH && finePointer && hover) {
    return LUCEM_LAYOUT.desktop;
  }
  return LUCEM_LAYOUT.touch;
}

/**
 * @param {Window | null | undefined} [win]
 */
export function readLucemLayoutInputs(win) {
  const target = win || (typeof window !== 'undefined' ? window : null);
  if (!target) {
    return {
      isExtensionPopup: false,
      isNative: false,
      width: 0,
      finePointer: false,
      hover: false,
    };
  }
  const chromeLike =
    target.chrome ||
    (typeof chrome !== 'undefined' ? chrome : undefined);
  let finePointer = false;
  let hover = false;
  if (typeof target.matchMedia === 'function') {
    finePointer = !!target.matchMedia('(pointer: fine)').matches;
    hover = !!target.matchMedia('(hover: hover)').matches;
  }
  return {
    isExtensionPopup: detectIsExtensionPopup(target.document, chromeLike),
    isNative: isNativePlatform(),
    width: target.innerWidth || 0,
    finePointer,
    hover,
  };
}

/**
 * @param {Window | null | undefined} [win]
 */
export function detectLucemLayoutSurface(win) {
  return resolveLucemLayoutSurface(readLucemLayoutInputs(win));
}

/**
 * Chrome toolbar popups do not share a PWA/mobile viewport. `100vw` is often
 * the monitor width, and `width=device-width` can shrink chrome to specks.
 * Pin the document to the popup box so corner FABs stay the same CSS size
 * as the phone / Capacitor shell.
 * @param {Document | null | undefined} doc
 * @param {{ width?: number, height?: number }} [size]
 */
export function applyExtensionPopupDocument(
  doc,
  { width = POPUP_WINDOW.width, height = POPUP_WINDOW.height } = {}
) {
  if (!doc || !doc.documentElement) return;
  const root = doc.documentElement;
  root.style.setProperty('--lucem-popup-width', `${width}px`);
  root.style.setProperty('--lucem-popup-height', `${height}px`);
  const meta = doc.querySelector('meta[name="viewport"]');
  if (meta) {
    meta.setAttribute(
      'content',
      `width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no`
    );
  }
}
