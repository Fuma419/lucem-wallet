# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Lucem Wallet is a Cardano blockchain browser extension (Chrome/Firefox/Edge) forked from Nami Wallet. It is a single-package JavaScript/React project (not a monorepo) built with Webpack 5. No databases, Docker, or backend services are required — all state is stored in `chrome.storage.local` and blockchain data comes from the remote Koios API.

### Key commands

See `package.json` scripts. Summary:

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies (uses `legacy-peer-deps=true` via `.npmrc`) |
| `npm run build` | Production build to `build/` directory |
| `npm start` | Webpack dev server on port 3000 with HMR (writes to `build/`) |
| `npm test` | Run Jest tests |
| `npx eslint --ext .js,.jsx,.ts,.tsx src/` | Lint |
| `npm run prettier` | Format code |

### Secrets files

The build requires `secrets.<NODE_ENV>.js` files at the repo root (e.g. `secrets.development.js`, `secrets.production.js`). These are not checked in. Create them from the template in `secrets.testing.js` with dummy values. Without these files, the webpack build will fail with `Module not found: Error: Can't resolve 'secrets'`.

### Environment file

Create a `.env` file at the root (optional). Koios API keys are optional — the wallet works without them:
```
NAMI_HEADER=dummy
```

### Known test limitations

- Only the `koios-endpoints.test.js` suite (48 tests) runs cleanly. Other test suites fail due to pre-existing WASM import issues (`@emurgo/cardano-serialization-lib-browser` uses ESM `import` which Jest cannot handle) and a missing `jest-environment-jsdom` dependency. These are pre-existing issues, not environment problems.

### Extension loading in Chrome

1. Run `npm run build` to create a clean production build in `build/`
2. Open `chrome://extensions`, enable Developer mode
3. Click "Load unpacked" and select the `build/` directory
4. **Important**: Do NOT load the extension while `npm start` (dev server) is running, as it injects HMR WebSocket code into the bundles which causes errors in the extension context. Always use `npm run build` for the extension, then reload via `chrome://extensions`.
5. If the webpack filesystem cache is stale (e.g. you previously ran `npm start`), clear it with `rm -rf node_modules/.cache` before `npm run build`.

### Gotcha: popup "Continue" button

The popup's "Continue" button on the Terms of Service screen may not reliably open the wallet creation tab. If this happens, navigate directly to `chrome-extension://<EXTENSION_ID>/createWalletTab.html?type=generate` (find the extension ID on `chrome://extensions`).
