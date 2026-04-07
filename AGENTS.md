# Lucem Wallet

Lucem is a Cardano blockchain browser extension wallet (Chrome/Firefox/Edge) **and web app**, forked from Nami. It uses React 18, Chakra UI, Webpack 5, and communicates with the Cardano blockchain via Koios API. A platform adapter layer (`src/platform/`) allows the same build to run as both a Chrome extension and a standalone web app (deployed on Vercel).

## Architecture Overview

### Entry points (webpack bundles)

| Bundle | Source | Purpose |
|--------|--------|--------|
| `mainPopup` | `src/ui/indexMain.jsx` | Primary wallet UI (popup or web root) |
| `internalPopup` | `src/ui/indexInternal.jsx` | dApp approval prompts (enable/signTx/signData) |
| `createWalletTab` | `src/ui/app/tabs/createWallet.jsx` | Full-page wallet creation flow |
| `hwTab` | `src/ui/app/tabs/hw.jsx` | Hardware wallet connection (Ledger USB, Keystone QR) |
| `keystoneTx` | `src/ui/app/tabs/keystoneTx.jsx` | Full-tab Keystone air-gapped transaction signing |
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
| `src/test/integration/` | **Optional** live Koios tests (excluded from default Jest; see below) |
| `e2e/` | Playwright layout + screenshot specs (`playwright.config.js`, `e2e/serve-e2e.json`) |

### Agent quick map (where to look first)

- **dApp connector / CIP-30:** `src/pages/Content/injected.js`, `src/api/extension/index.js` (enable, `signTx`, `submitTx`).
- **Build + sign + submit (software):** `src/api/extension/wallet.js` (`initTx`, `buildTx`, `signAndSubmit`), `signTx` / `submitTx` in `src/api/extension/index.js`.
- **Koios HTTP:** `src/api/util.js` (`koiosRequest`, `koiosRequestEnhanced`), `src/config/provider.js` (API keys: `KOIOS_API_KEY_PREVIEW`, `KOIOS_API_KEY_PREPROD`, …).
- **Networks:** `src/config/config.js` — `NETWORK_ID`, `NODE` (preview / preprod Koios base URLs).
- **Do not edit:** `src/wasm/` (generated).

### Platform adapter pattern

`src/platform/index.js` auto-selects the correct adapter at runtime:
- **Extension** (`chrome.runtime.id` exists): `src/platform/extension.js` — uses `chrome.storage.local`, `chrome.tabs`, `chrome.windows`
- **Web** (no `chrome.runtime.id`): `src/platform/web.js` — uses IndexedDB, `window.location`, `CustomEvent`, Google Favicons API

Files that import the platform adapter: `src/api/extension/index.js`, `enable.jsx`, `signData.jsx`, `signTx.jsx`, `settings.jsx`, `createWallet.jsx`.

## Cursor Cloud instructions

### Setup
```bash
nvm use 20.19.0                          # .nvmrc pinned
NODE_ENV=development npm install         # env has NODE_ENV=production globally
cp secrets.testing.js secrets.development.js  # if missing
cp secrets.testing.js secrets.production.js   # if missing
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
| Build | `npm run build` |
| Dev server | `npm start` (localhost:3000) |
| Test (unit, no live chain) | `NODE_ENV=test npx jest` |
| Integration (Preview/Preprod send; optional secrets) | `npm run test:integration` |
| Playwright (needs `build/`) | `npm run test:screenshots:only` or `npm run test:e2e` |
| Lint | `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx` |
| Deploy web | `vercel deploy --prod --token $VERCEL_TOKEN --scope my-team-5c660a1c --yes` |

**Preprod send integration tests** (`src/test/integration/send-transaction-preview-preprod.integration.test.js`): not run by default Jest. They call Koios **Preprod** and submit a small **tADA self-transfer** from **account 0** (CIP-1852), using only **ADA-only** UTxOs. Mnemonic is **BIP-39: space-separated words, whole phrase in double quotes** in `.env` — see **`.env.example`**. `npm run test:integration` loads `.env` via `dotenv`.

**GitHub Actions** runs `npm run test:integration` on every push/PR to `main` and passes `secrets.LUCEM_INTEGRATION_PREPROD_MNEMONIC`. Set that secret on the repo (BIP-39 phrase, no quotes in the Actions UI). Pushes to `main` on this repo **fail** the job if it is missing. Fork PRs use `continue-on-error` on that step so missing secrets do not block merges. Optional: `KOIOS_API_KEY_PREPROD`.

| Variable | Purpose |
|----------|---------|
| `LUCEM_INTEGRATION_PREPROD_MNEMONIC` | 12/15/24 words; funded Preprod account 0 |
| `KOIOS_API_KEY_PREPROD` | Optional Bearer token for Koios |
| `LUCEM_INTEGRATION_SEND_LOVELACE` | Optional amount (default `3000000`) |
| `LUCEM_INTEGRATION_POLL_TX=1` | After submit, poll Koios `/tx_status` until visible (optional) |
| `LUCEM_RUN_INTEGRATION=1` | Set automatically by `npm run test:integration` |

`npm start` runs webpack-dev-server on `http://localhost:3000`. It writes built files to `build/` on disk. For extension testing, load the `build/` directory as an unpacked extension. For web testing, visit `http://localhost:3000/mainPopup.html` directly.

### CSL v15 API (common renames)

`Credential.from_keyhash` · `encrypt`/`decrypt_with_password` · `Value.new(coin)` for ADA-only · `Value.new_with_assets(coin, multiasset)` when tokens matter · **`Transaction` / `Value` / `PlutusData` / UTxO: `from_bytes` / `to_bytes` (not `from_cbor_*`)** · CBOR as hex string: `Transaction.from_hex(hex)` · binary: `from_bytes(Buffer.from(hex, 'hex'))` · over the wire: `Buffer.from(x.to_bytes()).toString('hex')` · `Bip32PublicKey.from_hex` · `NetworkInfo.testnet_preview` / `testnet_preprod` (not `testnet()`).

### CI

GitHub Actions (`ci.yml`) runs on PRs/pushes to `main`: `npm ci` → generate secrets → `npm run build` (Jest unit + webpack) → Playwright screenshots → `npm run test:integration` (Preprod self-send; requires `LUCEM_INTEGRATION_PREPROD_MNEMONIC` repo secret) → upload `build` and `e2e-screenshots` artifacts. Confirm which git branch Vercel Production is tied to in project settings (`release` vs `main`).

### Testing the extension

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

### Jest / ESLint baselines

Jest uses `@emurgo/cardano-serialization-lib-nodejs` mapping and `testPathIgnorePatterns` for vendored trees. ESLint may report pre-existing issues in WASM/webpack code.

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

### Agent ship policy (push to `main`)

When an agent **finishes** a feature or bugfix (code ready, not a draft):

1. Run **`NODE_ENV=test npx jest`** (full unit suite).
2. Run **`npm run build`** so webpack compiles (same as CI).
3. If both succeed, **commit** with a clear message, then **`git push origin main`** (or push the current branch if your workflow uses PRs — default here is **direct push to `main`** when the working tree is intended to land on main).

Do not stop after tests alone if the build fails; fix or revert until `npm run build` passes. If credentials forbid push, report that after the gate.

### Edit discipline
- One logical change per commit. No unrelated refactors.
- Never modify generated WASM files in `src/wasm/`.
- See `.cursor/rules/cost-optimizer.mdc` and `.cursor/skills/` for detailed guidance.
