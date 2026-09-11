// @ts-nocheck
import {
  FLOW_WINDOW,
  FULL_PAGE_VIEW,
  isFullPageView,
  POPUP_WINDOW,
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
 * `tabs.create` + `windows.create({tabId})` left a background tab in the last
 * focused window *and* a popup, so CIP-30 sign/enable looked like two
 * concurrent transactions. Open the window directly.
 *
 * `type` matters: Chrome cancels WebHID / WebUSB / Web Bluetooth
 * `requestDevice()` in `popup` windows (same NotFoundError as a cancelled
 * chooser). Hardware pairing needs `normal`. CIP-30 approval stays `popup`.
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
     * Host a setup flow (hardware wallet, Keystone signing) that the toolbar
     * popup cannot run: the device chooser closes an action popup mid-pairing.
     * A wallet-sized `normal` window keeps the user out of their browsing
     * tabs. `popup` type is not used here — Chrome closes the BLE/USB
     * chooser in those windows and reports "No device selected".
     */
    openFlowWindow: (page, query = '') =>
      openExtensionWindow(
        chrome.runtime.getURL(`${page}.html${query || ''}`),
        FLOW_WINDOW,
        'normal'
      ),

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
     * Leave full-page flows (hw, create wallet, Keystone tab) and return
     * to the main UI. In-document navigation always works for extension pages.
     */
    closeCurrentTab: () => {
      if (typeof window !== 'undefined' && chrome?.runtime?.getURL) {
        window.location.href = mainPageUrl();
      }
      return Promise.resolve(true);
    },

    /**
     * Leave a full-page flow and open a main-app route. Extension pages load
     * `mainPopup.html`; non-default routes are passed as `next=` so bootstrap
     * can land on /accounts (etc.) instead of always /wallet.
     */
    openMainRoute: (path = '/wallet') => {
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
        window.location.href = mainPageUrl(safe === '/wallet' ? null : safe);
      }
      return Promise.resolve(true);
    },

    /**
     * After full data wipe: reload entry HTML so SPA path is not stuck on
     * /settings/…. Keeps the current surface — a wipe from a flow window must
     * not come back pinned to the toolbar popup box.
     */
    reloadToWalletBootstrap: () => {
      if (typeof window !== 'undefined' && chrome?.runtime?.getURL) {
        window.location.replace(
          isFullPageView(window.location.search)
            ? mainPageUrl()
            : chrome.runtime.getURL('mainPopup.html')
        );
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
