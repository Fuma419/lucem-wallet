import { POPUP_WINDOW } from '../config/config';

const DB_NAME = 'lucem-wallet';
const STORE_NAME = 'storage';

let dbPromise = null;
let dbInstance = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      dbInstance = request.result;
      // Ensure deleteDatabase can proceed after a wipe request.
      dbInstance.onversionchange = () => {
        try {
          dbInstance.close();
        } catch (_) {
          /* ignore */
        }
      };
      resolve(dbInstance);
    };
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
};

const idbGet = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    if (key) {
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      const store = tx.objectStore(STORE_NAME);
      const result = {};
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          result[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    }
  });
};

const idbSet = async (item) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    Object.entries(item).forEach(([k, v]) => store.put(v, k));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const idbRemove = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const idbClear = async () => {
  const existingPromise = dbPromise;
  dbPromise = null;
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (_) {
      /* ignore */
    }
    dbInstance = null;
  }
  if (existingPromise) {
    try {
      const existingDb = await existingPromise;
      existingDb.close();
    } catch (_) {
      /* ignore */
    }
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolveOnce();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolveOnce();
    // Browser-specific IDB edge cases can leave this request pending forever.
    window.setTimeout(resolveOnce, 2500);
  });
};

const webAdapter = {
  storage: {
    get: idbGet,
    set: idbSet,
    remove: idbRemove,
    clear: idbClear,
  },

  navigation: {
    createPopup: async (popup) => {
      window.open(
        popup + '.html',
        '_blank',
        `width=${POPUP_WINDOW.width},height=${POPUP_WINDOW.height}`
      );
      return { id: Date.now(), windowId: Date.now() };
    },

    createTab: (tab, query = '') => {
      window.location.href = tab + '.html' + query;
      return Promise.resolve({ id: Date.now() });
    },

    closeCurrentTab: () => {
      window.location.href = 'mainPopup.html';
      return Promise.resolve(true);
    },

    /**
     * Leave a full-page flow (create/import wallet, HW, …) and open a main-app
     * route. Web uses path URLs that Vercel rewrites to mainPopup.html.
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
      if (typeof window !== 'undefined') {
        window.location.assign(`${window.location.origin}${safe}`);
      }
      return Promise.resolve(true);
    },

    /** After full data wipe: land on /welcome (rewrites to mainPopup.html) without stacked SPA paths */
    reloadToWalletBootstrap: () => {
      if (typeof window !== 'undefined') {
        const isNative =
          !!window.Capacitor &&
          typeof window.Capacitor.isNativePlatform === 'function' &&
          window.Capacitor.isNativePlatform();
        // A packaged app has no server to rewrite /welcome -> app shell, so
        // reload the bundled entry (index.html) and let bootstrap route to
        // /welcome; the web/extension build keeps the same-origin /welcome path.
        const target = isNative
          ? `${window.location.origin}/index.html`
          : `${window.location.origin}/welcome`;
        window.location.replace(target);
      }
      return Promise.resolve(true);
    },

    getCurrentWebpage: async () => ({
      url: window.location.origin,
      favicon: null,
      tabId: 0,
    }),
  },

  events: {
    broadcastToTabs: (message) => {
      window.dispatchEvent(
        new CustomEvent('lucem-wallet-event', { detail: message })
      );
    },
  },

  icons: {
    getFaviconUrl: (origin) =>
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`,
  },
};

export default webAdapter;
