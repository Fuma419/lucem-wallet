# Minimal Codebase Exploration

**Trigger:** Agent needs to locate a symbol, understand structure, or find a file.

## Key files (don't re-search)

| Need | File |
|------|------|
| Storage keys, errors, network IDs | `src/config/config.js` |
| API URLs, secrets | `src/config/provider.js` |
| Webpack entries, aliases | `webpack.config.js` |
| Wallet API functions | `src/api/extension/index.js` |
| Tx building | `src/api/extension/wallet.js` |
| Koios endpoints | `src/api/koios-endpoints.js` |
| WASM loader | `src/api/loader.js` |
| Platform adapter | `src/platform/index.js` |
| Jest config | `jest.config.js` |
| Live Preview/Preprod send tests (opt-in) | `src/test/integration/` · `npm run test:integration` |
| Playwright | `e2e/` · `playwright.config.js` |
| Vercel config | `vercel.json` |

## Rules
1. `Grep` with `glob`/`type` filter first. `Glob` with targeted pattern — never `**/*`.
2. `offset`/`limit` for files > 200 lines. `src/api/extension/index.js` is ~2250 lines — never read it fully.
3. `explore` subagent at `"quick"` unless architectural question.
4. Don't re-search the same symbol twice per session.
