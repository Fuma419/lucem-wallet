# Lucem Wallet

Cardano browser extension wallet + PWA web app. React 18, Chakra UI, Webpack 5, Koios API. Platform adapter (`src/platform/`) lets one build serve both Chrome extension and web app.

## Architecture

| Bundle | Source | Purpose |
|--------|--------|---------|
| `mainPopup` | `src/ui/indexMain.jsx` | Primary wallet UI |
| `internalPopup` | `src/ui/indexInternal.jsx` | dApp approval prompts |
| `createWalletTab` | `src/ui/app/tabs/createWallet.jsx` | Wallet creation flow |
| `hwTab` / `trezorTx` | `src/ui/app/tabs/` | Hardware wallet flows |
| `background` | `src/pages/Background/index.js` | Extension service worker (extension-only) |
| `contentScript` / `injected` | `src/pages/Content/` | CIP-30 dApp connector (extension-only) |

**Key paths:** `src/api/extension/index.js` (wallet API, ~2250 lines), `wallet.js` (tx building), `src/api/koios-endpoints.js` (API defs), `src/api/util.js` (helpers), `src/platform/` (adapter), `src/config/` (constants), `src/migrations/` (storage migrations).

## Cursor Cloud instructions

### Setup
```bash
nvm use 20.19.0                          # .nvmrc pinned
NODE_ENV=development npm install         # env has NODE_ENV=production globally
cp secrets.testing.js secrets.development.js  # if missing
cp secrets.testing.js secrets.production.js   # if missing
```

### Commands
| Task | Command |
|------|---------|
| Build | `npm run build` |
| Dev server | `npm start` (localhost:3000) |
| Test | `NODE_ENV=test npx jest` |
| Lint | `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx` |
| Deploy web | `vercel deploy --prod --token $VERCEL_TOKEN --scope my-team-5c660a1c --yes` |

### Test baselines
- **Jest:** 53/53 tests pass. 3/5 suites fail (known WASM import issue — not regressions).
- **ESLint:** 237 problems (85 errors, 152 warnings) — all pre-existing in WASM/webpack code.

### CSL v15 API (critical renames)
`Credential.from_keyhash` · `encrypt/decrypt_with_password` · `Value.new_with_assets` · `as_bytes`/`from_bytes` (not `to_raw_bytes`) · `Bip32PublicKey.from_hex` · `NetworkInfo.testnet_preprod`

### CI
GitHub Actions on `main`: `npm ci` → `npm test` → secrets → `npm run build` → upload artifact.

## Model & Token Budget
- Default fastest model. Escalate only for crypto/architecture/security.
- Targeted reads. One change per commit. See `.cursor/rules/` and `.cursor/skills/`.
