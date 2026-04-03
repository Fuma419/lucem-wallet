# Lucem Wallet - Agent Instructions

Lucem is a Cardano blockchain browser extension wallet (Chrome/Firefox/Edge) **and web app**, forked from Nami. It uses React 18, Chakra UI, Webpack 5, and communicates with the Cardano blockchain via Koios API. A platform adapter layer (`src/platform/`) allows the same build to run as both a Chrome extension and a standalone web app (deployed on Vercel).

## Architecture Overview

### Entry points (webpack bundles)

| Bundle | Source | Purpose |
|--------|--------|---------|
| `mainPopup` | `src/ui/indexMain.jsx` | Primary wallet UI (popup or web root) |
| `internalPopup` | `src/ui/indexInternal.jsx` | dApp approval prompts (enable/signTx/signData) |
| `createWalletTab` | `src/ui/app/tabs/createWallet.jsx` | Full-page wallet creation flow |
| `hwTab` | `src/ui/app/tabs/hw.jsx` | Ledger hardware wallet connection |
| `trezorTx` | `src/ui/app/tabs/trezorTx.jsx` | Trezor transaction signing |
| `background` | `src/pages/Background/index.js` | Extension service worker (extension-only) |
| `contentScript` | `src/pages/Content/index.js` | dApp connector bridge (extension-only) |
| `injected` | `src/pages/Content/injected.js` | CIP-30 API injection (extension-only) |

### Key directories

| Path | Contents |
|------|----------|
| `src/platform/` | **Platform adapter** — runtime detection routes chrome.* calls to extension or web implementation |
| `src/api/extension/` | Core wallet logic: storage, key management, signing, Koios API calls |
| `src/api/extension/wallet.js` | Transaction building: `initTx`, `buildTx`, `signAndSubmit`, `delegationTx` |
| `src/api/util.js` | HTTP helpers, UTXO/value conversions, HW wallet encoding, Plutus Data |
| `src/api/koios-endpoints.js` | All Koios REST endpoint definitions and request builders |
| `src/api/loader.js` | WASM module loader (`@emurgo/cardano-serialization-lib-browser`) |
| `src/config/config.js` | Constants: `STORAGE` keys, `NETWORK_ID`, `METHOD`, `ERROR`, `EVENT` |
| `src/config/provider.js` | Koios base URLs, API key resolution from secrets + env vars |
| `src/migrations/` | Version-based storage migration system (12 versions: 1.0.0 → 3.3.0) |
| `src/features/` | Feature modules (terms-and-privacy, settings/legal) |
| `src/wasm/` | Generated WASM code — **never modify** |

### Platform adapter pattern

`src/platform/index.js` auto-selects the correct adapter at runtime:
- **Extension** (`chrome.runtime.id` exists): `src/platform/extension.js` — uses `chrome.storage.local`, `chrome.tabs`, `chrome.windows`
- **Web** (no `chrome.runtime.id`): `src/platform/web.js` — uses IndexedDB, `window.location`, `CustomEvent`, Google Favicons API

Files that import the platform adapter: `src/api/extension/index.js`, `enable.jsx`, `signData.jsx`, `signTx.jsx`, `settings.jsx`, `createWallet.jsx`.

## Cursor Cloud specific instructions

### Node.js version

The project requires Node.js 20.x (pinned to 20.19.0 in `.nvmrc`). Use `nvm use` to activate.

### Installing dependencies

The environment has `NODE_ENV=production` set globally. You **must** run:

```
NODE_ENV=development npm install
```

Otherwise devDependencies (webpack, eslint, jest, etc.) will be skipped.

### Secrets files

Webpack resolves `import secrets from 'secrets'` via an alias to `secrets.{NODE_ENV}.js`. These files are gitignored. Before building, create them if they don't exist:

- `secrets.production.js`
- `secrets.development.js`

Each should export dummy API keys (see `secrets.testing.js` for the format). `utils/build.js` auto-generates `secrets.production.js` from the template for CI builds.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `NODE_ENV=development npm install` |
| Lint | `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx` |
| Test | `NODE_ENV=test npx jest` |
| Build (production) | `npm run build` |
| Dev server | `npm start` |

### Dev server

`npm start` runs webpack-dev-server on `http://localhost:3000`. It writes built files to `build/` on disk. For extension testing, load the `build/` directory as an unpacked extension. For web testing, visit `http://localhost:3000/mainPopup.html` directly.

### Testing the extension in a browser

1. Run `npm run build` or `npm start`.
2. Chrome → `chrome://extensions/` → Developer mode → Load unpacked → select `build/`.
3. Click the Lucem extension icon to open the popup UI.

### Testing the web app

1. Run `npm run build`.
2. Deploy: `vercel deploy --prod --token $VERCEL_TOKEN --scope my-team-5c660a1c` or visit `https://lucem-wallet.vercel.app/`.
3. The web app uses IndexedDB for storage, same-tab navigation, and the Google Favicons API.

### Vercel deployment

The project deploys to Vercel via `vercel.json`:
- **Build command:** `npm run build`
- **Output directory:** `build/`
- **Rewrites:** `/` → `mainPopup.html`, SPA routes → appropriate HTML entry points
- **Node version:** 20.x (configured in Vercel project settings)
- Secrets auto-generated in `utils/build.js` — no manual setup required.
- **Vercel CLI auth:** requires `VERCEL_TOKEN` secret. Scope: `my-team-5c660a1c`. Project: `lucem-wallet`.

### Jest test limitations

3 of 5 test suites fail due to pre-existing WASM import issues (`@emurgo/cardano-serialization-lib-browser` uses ESM `import` syntax that Jest cannot parse in Node.js). The 2 passing suites (`koios-endpoints.test.js`, `eventRegistration.test.js`) cover 53 tests total.

### ESLint baseline

ESLint reports pre-existing errors (mostly `FinalizationRegistry` undefined in generated WASM code and an unused `TerserPlugin` import in `webpack.config.js`). These are not caused by agent changes.

### CI pipeline

GitHub Actions (`ci.yml`) runs on PRs/pushes to `main`: `npm ci` → `npm test` → generate secrets → `npm run build` → upload artifact. The `release` branch is the production branch (Vercel production deployments track `release`).

## Model & Token Budget Policy

### Model tier selection
- Use the fastest/cheapest model for routine edits, searches, lint fixes, and docs.
- Escalate to a capable model **only** for: complex debugging, architecture decisions, or security-sensitive wallet/crypto logic.
- Downgrade immediately after the complex step.

### Token efficiency
- Concise outputs by default; bullet lists over paragraphs.
- Targeted file reads with `Grep`/`Glob` filters — avoid broad `**/*` scans.
- Read large files with `offset`/`limit`; don't read entire files when only a section is needed.

### Validation cadence
- **During iteration:** validate only changed files (single-file lint, single test suite).
- **Before commit:** run repo-wide gates once: `NODE_ENV=test npx jest`, `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx`, `npm run build`.

### Edit discipline
- One logical change per commit. No unrelated refactors.
- Never modify generated WASM files in `src/wasm/`.
- See `.cursor/rules/cost-optimizer.mdc` and `.cursor/skills/` for detailed guidance.
