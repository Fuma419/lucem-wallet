# Testing Guide

**Trigger:** Agent needs to verify changes work.

## Commands
```bash
NODE_ENV=test npx jest              # 53 tests pass (3 suites fail — known WASM)
NODE_ENV=test npx jest koios        # Koios endpoints only (42 tests, fast)
NODE_ENV=test npx jest eventReg     # Event registration only (11 tests)
npm run build                       # Production build
./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx  # ESLint (237 baseline)
```

## Per-change test matrix
| Change area | Extension | Web | Jest | ESLint |
|-------------|-----------|-----|------|--------|
| UI components | Reload popup | Check web | — | ✅ |
| Platform adapter | Reload popup | Check web | — | ✅ |
| Koios API | Reload popup | Check web | `jest koios` | ✅ |
| Crypto/signing | Reload popup | Check web | `jest` (all) | ✅ |
| Build config | `npm run build` | Vercel deploy | — | — |
