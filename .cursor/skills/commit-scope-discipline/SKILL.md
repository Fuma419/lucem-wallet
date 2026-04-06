# Commit Scope Discipline

**Trigger:** Agent is about to stage and commit.

## Rules
1. **Default:** one logical change per commit. **When the user asks to batch:** combine up to **10 related features** into a single commit, then **one push** (not one push per feature). Each “feature” should still be a coherent slice (code + its tests). Use a commit body listing the bundled items if helpful.
2. Review `git diff --stat` — if many files, verify each belongs to the batch.
3. Imperative mood, ≤72 chars first line, optional body.
4. Never commit: `build/`, `secrets.*.js` (except `secrets.testing.js`), `node_modules/`, `.vercel/`.
5. **Before push (required):** run `NODE_ENV=test npx jest` (full suite must pass), then `npm run build` (must succeed — same as CI). When many files changed, also run ESLint as in `AGENTS.md`.
6. **After tests and build succeed:** **always** `git push origin main` before treating the task as finished (commit first if the change is not committed). Do not stop at green tests/build without pushing. Exceptions: the user explicitly asked not to push, or you are intentionally on a non-`main` branch for a PR-only flow — then push that branch and state that `main` was not updated. If push fails (auth, network), report it after the gates. See `AGENTS.md` → *Agent ship policy*.
