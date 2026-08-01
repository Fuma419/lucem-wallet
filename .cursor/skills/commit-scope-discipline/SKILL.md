# Commit Scope Discipline

**Trigger:** Agent is about to stage and commit.

## Rules
1. **Default:** one logical change per commit. **When the user asks to batch:** combine up to **10 related features** into a single commit, then **one push** (not one push per feature). Each “feature” should still be a coherent slice (code + its tests). Use a commit body listing the bundled items if helpful.
2. Review `git diff --stat` — if many files, verify each belongs to the batch.
3. Imperative mood, ≤72 chars first line, optional body.
4. Never commit: `build/`, `secrets.*.js` (except `secrets.testing.js`), `node_modules/`, `.vercel/`.
5. **Before push:** optionally run `NODE_ENV=test npx jest` for fast feedback. Do **not** run local webpack/`npm run build` — Jenkins owns Build / Unit / Functional gates. If you change CSS/UI strings that unit tests assert, update those tests in the **same** commit.
6. **Ship via PR:** push the **feature/agent branch** (never directly to `main` unless the user explicitly asked). Open/update the PR, then **follow through** per `.cursor/skills/pr-follow-through/SKILL.md` and `.cursor/rules/git-push-policy.mdc` until the PR is **merged** (poll Jenkins/`gh pr checks`, fix failures, merge `main` if behind). Do not stop at “pushed” or “PR opened.” Exceptions: the user explicitly asked not to push/merge, or push auth fails (report it).
