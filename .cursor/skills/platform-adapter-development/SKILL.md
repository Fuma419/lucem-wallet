# Platform Adapter Development

**Trigger:** Agent adds/modifies code interacting with storage, navigation, events, or browser APIs.

## API
```
platform.storage.get(key) / .set(item) / .remove(key) / .clear()
platform.navigation.createPopup(name) / .createTab(name, query) / .getCurrentWebpage()
platform.events.broadcastToTabs(message)
platform.icons.getFaviconUrl(origin)
```

## Rules
1. Never add `chrome.*` in shared code. Use `platform.*`.
2. New platform capabilities → add to both `extension.js` and `web.js`.
3. Web `createTab` uses same-tab navigation (`location.assign`), not `window.open`.
4. Extension `createTab` is for hardware / Keystone full pages (`chrome.tabs.create` in the current window). Create/import seed flows stay **inside** the popup SPA (`navigate` to `/generate` or `/import`) so Chrome does not close the toolbar popup.
5. Test both: extension (reload in Chrome) and web (Vercel or `npx serve build`).

## Files importing platform
`src/api/extension/index.js`, `enable.jsx`, `signData.jsx`, `signTx.jsx`, `settings.jsx`, `createWallet.jsx`.
