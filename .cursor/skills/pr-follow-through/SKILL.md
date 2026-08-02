---
name: pr-follow-through
description: >-
  After opening or updating a PR, keep watching CI and auto-merge until the
  change is merged to main (or the user stops the task). Use whenever an agent
  ships a branch/PR.
---

# PR follow-through (mandatory)

**Trigger:** You opened a PR, pushed to an existing PR branch, or finished a feature that requires shipping.

**Definition of done:** the PR is **merged to `main`**. Opening the PR or seeing a green local test run is **not** done.

## Required loop

1. Confirm the PR exists (`gh pr view` / `gh pr list --head <branch>`). Enable auto-merge if missing (`gh pr merge --auto --squash` when allowed).
2. Poll checks until terminal: `gh pr checks <n>` and/or Jenkins (`job/lucem-wallet/job/PR-<n>`). Do not end the turn while required checks are `pending` unless blocked on the user.
3. On **any** required failure:
   - Pull console/log for the failing stage (unit / functional / build).
   - Fix in scope (code, tests, or merge `main` if behind).
   - Push and **repeat from step 2**.
4. If the PR is `BEHIND` / conflicts: merge or rebase `origin/main`, push, re-watch CI.
5. Only stop when `gh pr view` shows `state: MERGED`, or the user explicitly stops babysitting.
6. **Telegram notify:** when the PR **merges**, or you are **blocked awaiting the user**, send one concise `tg-send` including `lucem-wallet` + PR URL (skill `telegram-notify`). Do not narrate every CI poll.

## Do not

- Treat “PR created” or “pushed” as finished.
- Ignore non-gating flakes while a **required** check (e.g. Unit tests, Integration tests, Functional tests, Build) is red or stuck pending.
- Change CI workflows only to make a bad change pass.

## Related

- Always-on rule: `.cursor/rules/git-push-policy.mdc`
- Merge gate: `.github/MERGE_GATE.md`
- CI babysit details: Cursor `babysit` skill
- Commit scope (no local webpack — Jenkins builds): `.cursor/skills/commit-scope-discipline/SKILL.md`
- Host notify / clarify: `telegram-notify`, `telegram-clarify`
