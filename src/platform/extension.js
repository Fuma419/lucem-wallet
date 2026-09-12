// @ts-nocheck
import {
  FULL_PAGE_VIEW,
  isFullPageView,
  POPUP,
  POPUP_WINDOW,
  TAB,
} from '../config/config';

const FULL_PAGE_QUERY = `${FULL_PAGE_VIEW.param}=${FULL_PAGE_VIEW.value}`;

/**
 * URL of the main UI for anything that is not the toolbar popup. Without the
 * marker `mainPopup.html` pins itself to POPUP_WINDOW, which letterboxes a
 * 533px column inside a full window.
 */
export const mainPageUrl = (next) => {
  const base = `${chrome.runtime.getURL('mainPopup.html')}?${FULL_PAGE_QUERY}`;
  return next ? `${base}&next=${encodeURIComponent(next)}` : base;
};

const FLOW_TAB_PAGES = new Set(Object.values(TAB));

/** True when this document is a dedicated flow page, not the toolbar popup. */
const isExtensionFlowTab = () => {
  if (typeof window === 'undefined' || !window.location) return false;
  if (isFullPageView(window.location.search)) return true;
  try {
    const name = String(window.location.pathname || '')
      .split('/')
      .pop()
      .replace(/\.html$/i, '');
    return FLOW_TAB_PAGES.has(name);
  } catch (/** @type {any} */ _e) {
    return false;
  }
};

const isExtensionPageUrl = (url) => {
  try {
    const parsed = new URL(String(url || ''));
    const name = parsed.pathname.split('/').pop().replace(/\.html$/i, '');
    if (FLOW_TAB_PAGES.has(name)) return true;
    return name === POPUP.main && isFullPageView(parsed.search);
  } catch (/** @type {any} */ _e) {
    return false;
  }
};

/** Center a window of `size` on the last focused browser window. */
const windowPlacement = async (size) => {
  try {
    const lastFocused = await new Promise((res) => {
      chrome.windows.getLastFocused((windowObject) => res(windowObject));
    });
    return {
      top: lastFocused.top,
      left: lastFocused.left + Math.round((lastFocused.width - size.width) / 2),
    };
  } catch (_) {
    const { screenX, screenY, outerWidth } = window;
    return {
      top: Math.max(screenY, 0),
      left: Math.max(screenX + (outerWidth - size.width), 0),
    };
  }
};

/**
 * Open an extension page as its own window.
 *
 * Used only for the CIP-30 dApp approval dialog (`type: 'popup'`). Lucem
 * never opens a `normal` browser window. Hardware pairing uses a temporary
 * tab (`createTab`) because Chrome cancels `requestDevice()` in popup
 * windows.
 *
 * `tabs.create` + `windows.create({tabId})` left a background tab in the last
 * focused window *and* a popup, so CIP-30 sign/enable looked like two
 * concurrent transactions. Open the window directly.
 */
const openExtensionWindow = async (url, size, type = 'popup') => {
  const { left, top } = await windowPlacement(size);
  const popupWindow = await new Promise((res, rej) =>
    chrome.windows.create(
      {
        url,
        type,
        focused: true,
        width: size.width,
        height: size.height,
        left,
        top,
      },
      function (newWindow) {
        if (chrome.runtime.lastError || !newWindow) {
          rej(chrome.runtime.lastError || new Error('Failed to open popup'));
          return;
        }
        res(newWindow);
      }
    )
  );

  if (popupWindow.left !== left && popupWindow.state !== 'fullscreen') {
    await new Promise((res) => {
      chrome.windows.update(popupWindow.id, { left, top }, () => res());
    });
  }
  const tab = popupWindow.tabs && popupWindow.tabs[0];
  if (!tab) {
    throw new Error('Popup window opened without a tab');
  }
  return tab;
};

const extensionAdapter = {
  storage: {
    get: (key) =>
      new Promise((res, rej) =>
        chrome.storage.local.get(key, (result) => {
          if (chrome.runtime.lastError) rej(undefined);
          res(key ? result[key] : result);
        })
      ),
    set: (item) =>
      new Promise((res, rej) =>
        chrome.storage.local.set(item, () => {
          if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
          res(true);
        })
      ),
    remove: (item) =>
      new Promise((res, rej) =>
        chrome.storage.local.remove(item, () => {
          if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
          res(true);
        })
      ),
    clear: () =>
      new Promise((res, rej) =>
        chrome.storage.local.clear(() => {
          if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
          else res();
        })
      ),
  },

  navigation: {
    createPopup: (popup) =>
      openExtensionWindow(
        chrome.runtime.getURL(`${popup}.html`),
        POPUP_WINDOW
      ),

    /**
     * Host a setup flow (hardware wallet, Keystone / Ledger signing) that the
     * toolbar popup cannot run: Chrome cancels the device chooser there.
     * Opens a temporary tab in the existing browser window — never a new
     * window, and never `mainPopup.html` (the main wallet stays in the
     * toolbar popup).
     */
    openFlowWindow: (page, query = '') =>
      extensionAdapter.navigation.createTab(page, query),

    createTab: (tab, query = '') => {
      const url = chrome.runtime.getURL(`${tab}.html${query || ''}`);
      // Toolbar action popups cannot host another extension page: Chrome
      // closes them on location.assign, so create/import looked like a no-op.
      // Open a tab in the existing browser window (no extra windows.create).
      return new Promise((res, rej) => {
        chrome.tabs.create({ url, active: true }, (created) => {
          if (chrome.runtime.lastError || !created) {
            rej(
              chrome.runtime.lastError || new Error('Failed to open tab')
            );
            return;
          }
          res(created);
        });
      });
    },

    /**
     * Whether a WebUSB / WebHID / Web Bluetooth chooser can run here. Chrome
     * cancels the chooser in `popup` windows — the toolbar action popup and
     * the dApp prompt both are — and reports "No device selected". A tab in
     * the user's existing window can pair, so callers hand the step to a
     * temporary tab instead of opening a window.
     */
    canHostDeviceChooser: async () => {
      try {
        const current = await chrome.windows.getCurrent();
        return !!current && current.type === 'normal';
      } catch (/** @type {any} */ _e) {
        return false;
      }
    },

    /**
     * Close a temporary flow tab. Never navigates this document to
     * `mainPopup.html` — that would open the main wallet in the browser.
     */
    closeCurrentTab: () => extensionAdapter.navigation.finishFlowWindow(),

    /**
     * Leave a flow and return to the toolbar popup. A flow tab is closed;
     * the toolbar popup navigates in place. Never loads the main app in a
     * browser tab or window.
     */
    openMainRoute: (path = '/wallet') => {
      if (isExtensionFlowTab()) {
        return extensionAdapter.navigation.finishFlowWindow(path);
      }
      const allowed = new Set([
        '/wallet',
        '/accounts',
        '/welcome',
        '/settings',
        '/staking',
        '/governance',
        '/send',
      ]);
      const safe = allowed.has(path) ? path : '/wallet';
      if (typeof window !== 'undefined' && chrome?.runtime?.getURL) {
        const base = chrome.runtime.getURL('mainPopup.html');
        window.location.href =
          safe === '/wallet' ? base : `${base}?next=${encodeURIComponent(safe)}`;
      }
      return Promise.resolve(true);
    },

    /**
     * Finish a temporary flow tab (HW pairing, Keystone, Ledger signing):
     * close the tab and hand the user back to the toolbar popup. Never
     * opens a window and never turns the tab into the main wallet.
     */
    finishFlowWindow: async () => {
      try {
        const currentWin = await chrome.windows.getCurrent();
        if (currentWin && currentWin.type === 'popup') {
          return true;
        }
        let tabId;
        try {
          const self = await chrome.tabs.getCurrent();
          if (self && self.id != null) tabId = self.id;
        } catch (/** @type {any} */ _e) {
          /* fall through */
        }
        if (tabId == null) {
          const [active] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          if (active && active.id != null && isExtensionPageUrl(active.url)) {
            tabId = active.id;
          }
        }
        if (tabId != null) {
          try {
            if (chrome.action && typeof chrome.action.openPopup === 'function') {
              await chrome.action.openPopup({
                windowId: currentWin && currentWin.id,
              });
            }
          } catch (/** @type {any} */ _e) {
            /* Chrome may refuse without a gesture; the icon still works. */
          }
          await chrome.tabs.remove(tabId);
          return true;
        }
      } catch (/** @type {any} */ _e) {
        /* leave the flow page as-is rather than loading the wallet here */
      }
      return true;
    },

    /**
     * After full data wipe: reload entry HTML so SPA path is not stuck on
     * /settings/…. Keeps the current surface — a wipe from a flow window must
     * not come back pinned to the toolbar popup box.
     */
    reloadToWalletBootstrap: () => {
      if (isExtensionFlowTab()) {
        return extensionAdapter.navigation.finishFlowWindow();
      }
      if (typeof window !== 'undefined' && chrome?.runtime?.getURL) {
        window.location.replace(chrome.runtime.getURL('mainPopup.html'));
      }
      return Promise.resolve(true);
    },

    getCurrentWebpage: () =>
      new Promise((res) => {
        chrome.tabs.query(
          {
            active: true,
            lastFocusedWindow: true,
            status: 'complete',
            windowType: 'normal',
          },
          function (tabs) {
            res({
              url: new URL(tabs[0].url).origin,
              favicon: tabs[0].favIconUrl,
              tabId: tabs[0].id,
            });
          }
        );
      }),
  },

  events: {
    broadcastToTabs: (message) => {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach((tab) =>
          chrome.tabs.sendMessage(tab.id, message, () => {
            if (chrome.runtime.lastError) {
              // Expected for tabs without content scripts
            }
          })
        );
      });
    },
  },

  icons: {
    getFaviconUrl: (origin) =>
      `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${origin}&size=32`,
  },
};

export default extensionAdapter;
