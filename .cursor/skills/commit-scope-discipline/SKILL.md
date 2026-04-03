# Commit Scope Discipline

**Trigger:** Agent is about to stage and commit.

## Rules
1. One logical change per commit. No unrelated formatting or refactors.
2. Review `git diff --stat` — if >5 files, verify each is necessary.
3. Imperative mood, ≤72 chars first line, optional body.
4. Never commit: `build/`, `secrets.*.js` (except `secrets.testing.js`), `node_modules/`, `.vercel/`.
5. Before commit: `NODE_ENV=test npx jest` (53 pass), ESLint (237 baseline), `npm run build`.
