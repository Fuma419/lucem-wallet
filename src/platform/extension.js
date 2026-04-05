import { POPUP_WINDOW } from '../config/config';

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
      new Promise((res) => chrome.storage.local.clear(() => res())),
  },

  navigation: {
    createPopup: async (popup) => {
      let left = 0;
      let top = 0;
      try {
        const lastFocused = await new Promise((res) => {
          chrome.windows.getLastFocused((windowObject) => res(windowObject));
        });
        top = lastFocused.top;
        left =
          lastFocused.left +
          Math.round((lastFocused.width - POPUP_WINDOW.width) / 2);
      } catch (_) {
        const { screenX, screenY, outerWidth } = window;
        top = Math.max(screenY, 0);
        left = Math.max(screenX + (outerWidth - POPUP_WINDOW.width), 0);
      }

      const { popupWindow, tab } = await new Promise((res) =>
        chrome.tabs.create(
          {
            url: chrome.runtime.getURL(popup + '.html'),
            active: false,
          },
          function (tab) {
            chrome.windows.create(
              {
                tabId: tab.id,
                type: 'popup',
                focused: true,
                ...POPUP_WINDOW,
                left,
                top,
              },
              function (newWindow) {
                return res({ popupWindow: newWindow, tab });
              }
            );
          }
        )
      );

      if (popupWindow.left !== left && popupWindow.state !== 'fullscreen') {
        await new Promise((res) => {
          chrome.windows.update(popupWindow.id, { left, top }, () => res());
        });
      }
      return tab;
    },

    createTab: (tab, query = '') =>
      new Promise((res) =>
        chrome.tabs.create(
          {
            url: chrome.runtime.getURL(tab + '.html' + query),
            active: true,
          },
          function (tab) {
            chrome.windows.create(
              {
                tabId: tab.id,
                focused: true,
              },
              function () {
                res(tab);
              }
            );
          }
        )
      ),

    /**
     * Leave full-page flows (hw, create wallet, Trezor/Keystone tabs) and return
     * to the main UI. `window.close()` is blocked for tabs opened via
     * `chrome.tabs.create`; `tabs.getCurrent` / `tabs.remove` are brittle without the `tabs` permission.
     * In-document navigation always works for extension pages.
     */
    closeCurrentTab: () => {
      if (typeof window !== 'undefined' && chrome?.runtime?.getURL) {
        window.location.href = chrome.runtime.getURL('mainPopup.html');
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
