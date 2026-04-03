# Platform Adapter Development

**Trigger:** Agent adds or modifies code that interacts with browser/extension APIs, storage, navigation, or event broadcasting.

## Architecture

`src/platform/index.js` detects runtime context and exports the correct adapter:
- `chrome.runtime.id` exists → `src/platform/extension.js` (Chrome extension APIs)
- Otherwise → `src/platform/web.js` (IndexedDB, window.location, CustomEvent)

## Rules

1. **Never add direct `chrome.*` calls in shared code.** All chrome API usage must go through `platform.*`.
2. Shared code lives in: `src/api/`, `src/ui/`, `src/config/`, `src/features/`, `src/migrations/`.
3. Extension-only code lives in: `src/pages/Background/`, `src/pages/Content/`, `src/api/messaging.js`.
4. When adding a new platform capability, add it to **both** `extension.js` and `web.js`.
5. The web adapter's `createTab` uses `window.location.href` (same-tab), not `window.open` (popup-blocked).

## Platform adapter API

```
platform.storage.get(key)        // Returns value for key, or all if key is undefined
platform.storage.set(item)       // Sets {key: value} pairs
platform.storage.remove(key)     // Removes a key
platform.storage.clear()         // Clears all storage

platform.navigation.createPopup(name)       // Opens approval popup
platform.navigation.createTab(name, query)  // Opens full-page tab
platform.navigation.getCurrentWebpage()     // Returns {url, favicon, tabId}

platform.events.broadcastToTabs(message)    // Sends event to all tabs/listeners
platform.icons.getFaviconUrl(origin)        // Returns favicon URL for a domain
```

## Testing both targets

1. **Extension:** `npm run build` → load `build/` as unpacked extension → test popup
2. **Web:** `npm run build` → `vercel deploy` or serve locally → test at `/mainPopup.html`
3. After any platform change, verify both targets before committing.

## Anti-patterns
- Adding `if (typeof chrome !== 'undefined')` checks in UI components — use `platform.*` instead.
- Assuming `window.open` works for navigation on web (browsers block popup windows).
- Importing `src/platform/extension.js` directly instead of `src/platform/index.js`.
