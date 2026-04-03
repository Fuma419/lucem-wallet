# Extension & Web App Testing

**Trigger:** Agent needs to verify changes work in the Chrome extension and/or web app.

## Build

```bash
npm run build          # Production build → build/
npm start              # Dev server with HMR → localhost:3000 + build/
```

## Extension testing

1. `npm run build`
2. Chrome → `chrome://extensions/` → Developer mode → Load unpacked → select `build/`
3. If already loaded, click the reload button on the extension card.
4. Click the Lucem icon in the toolbar to open the popup.
5. Key flows to verify: Greetings → New Wallet → Seed Phrase → Create Account.

## Web app testing

1. `npm run build`
2. Visit `https://lucem-wallet.vercel.app/` (or deploy with `vercel deploy`)
3. Verify the Greetings page loads (not a loading spinner — spinner means platform adapter is broken).
4. Key flows: same as extension, but navigation uses same-tab (`window.location.href`).

## Automated tests

```bash
NODE_ENV=test npx jest                # All suites (2 pass, 3 fail — known WASM issue)
NODE_ENV=test npx jest koios          # Just koios-endpoints (fast, 42 tests)
NODE_ENV=test npx jest eventRegistration  # Just event registration (11 tests)
```

## Lint

```bash
./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx           # Full repo
./node_modules/.bin/eslint src/api/extension/index.js          # Single file
./node_modules/.bin/eslint src/platform/                       # Platform files
```

## What to verify per change type

| Change area | Extension test | Web test | Jest | ESLint |
|-------------|---------------|----------|------|--------|
| UI components | ✅ Popup | ✅ Web app | — | ✅ |
| Platform adapter | ✅ Popup | ✅ Web app | — | ✅ |
| Koios API | ✅ Popup | ✅ Web app | ✅ koios | ✅ |
| Crypto/signing | ✅ Popup | ✅ Web app | ✅ all | ✅ |
| Build config | ✅ Build | ✅ Vercel | — | — |
| Content scripts | ✅ dApp test | — | — | ✅ |

## Anti-patterns
- Testing only in the extension and assuming the web version works (or vice versa).
- Skipping `npm run build` before loading the extension (stale `build/` directory).
- Running `npm test` without `NODE_ENV=test` (wrong jest environment).
