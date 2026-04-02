# Commit Scope Discipline

**Trigger:** Agent is about to stage and commit changes.

## Rules
1. Each commit addresses exactly one logical change (feature, fix, refactor, or docs).
2. Do not bundle unrelated formatting, import reordering, or typo fixes into a feature commit.
3. Review `git diff --stat` before committing — if more than ~5 files changed, verify each is necessary.
4. Commit message format: imperative mood, ≤72 chars first line, optional body for "why."
5. Never commit generated build output (`build/`), secrets files, or `node_modules/`.

## Anti-patterns
- "Fix everything" commits touching 20+ files across unrelated areas.
- Committing debug logs, `console.log` statements, or temporary test scaffolding.
