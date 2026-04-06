# Commit Scope Discipline

**Trigger:** Agent is about to stage and commit.

## Rules
1. **Default:** one logical change per commit. **When the user asks to batch:** combine up to **10 related features** into a single commit, then **one push** (not one push per feature). Each “feature” should still be a coherent slice (code + its tests). Use a commit body listing the bundled items if helpful.
2. Review `git diff --stat` — if many files, verify each belongs to the batch.
3. Imperative mood, ≤72 chars first line, optional body.
4. Never commit: `build/`, `secrets.*.js` (except `secrets.testing.js`), `node_modules/`, `.vercel/`.
5. Before push: `NODE_ENV=test npx jest`, then `npm run build` (and ESLint when touching many files).
6. **After a finished feature or bugfix:** if jest + build are green, **push to `origin/main`** (unless the user’s workflow is PR-only — then push the branch and say so). See `AGENTS.md` → *Agent ship policy*.
