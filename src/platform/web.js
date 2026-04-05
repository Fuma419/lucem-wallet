import { POPUP_WINDOW } from '../config/config';

const DB_NAME = 'lucem-wallet';
const STORE_NAME = 'storage';

let dbPromise = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
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
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
