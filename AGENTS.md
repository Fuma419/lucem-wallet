# Lucem Wallet - Agent Instructions

Lucem is a Cardano blockchain browser extension wallet (Chrome/Firefox/Edge), forked from Nami. It uses React 18, Chakra UI, Webpack 5, and communicates with the Cardano blockchain via Koios API.

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

Each should export dummy API keys (see `secrets.testing.js` for the format). Without these files, `npm run build` and `npm start` will fail with a module-not-found error.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `NODE_ENV=development npm install` |
| Lint | `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx` |
| Test | `NODE_ENV=test npx jest` |
| Build (production) | `npm run build` |
| Dev server | `npm start` |

### Dev server

`npm start` runs webpack-dev-server on `http://localhost:3000`. It writes built files to `build/` on disk. The extension pages (e.g. `mainPopup.html`, `createWalletTab.html`) are served from this URL, but they require Chrome extension APIs (`chrome.storage`, etc.) to function correctly, so they must be loaded as an unpacked extension in Chrome.

### Testing the extension in a browser

1. Run `npm run build` or `npm start` (dev server writes to `build/`).
2. Open Chrome → `chrome://extensions/` → Enable Developer mode → Load unpacked → select the `build/` directory.
3. Click the Lucem extension icon to open the popup UI.

### Jest test limitations

3 of 5 test suites fail due to pre-existing WASM import issues (`@emurgo/cardano-serialization-lib-browser` uses ESM `import` syntax that Jest cannot parse in Node.js). The `jest.config.js` has a `moduleNameMapper` for `@dcspark/cardano-multiplatform-lib-nodejs` but that package is not a dependency. The 2 passing suites (`koios-endpoints.test.js`, `eventRegistration.test.js`) cover 53 tests total.

### ESLint baseline

ESLint reports pre-existing errors (mostly `FinalizationRegistry` undefined in generated WASM code and an unused `TerserPlugin` import in `webpack.config.js`). These are not caused by agent changes.

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
