# Required merge gate (GitHub settings)

Merges are gated by **Jenkins commit statuses**, not by GitHub-hosted Actions jobs.

Required contexts (published by the repo `Jenkinsfile`):

1. **`Jenkins / Build`**
2. **`Jenkins / Unit tests`**
3. **`Jenkins / Integration tests`**
4. **`Jenkins / Functional tests`**

GitHub Actions `ci.yml` is **diagnostics-only** (or lightweight). Optional workflow `jenkins-multibranch-scan.yml` marks those contexts `pending` and pings the Jenkins multibranch indexer when `JENKINS_MULTIBRANCH_WEBHOOK_URL` is set.

## Enable in GitHub (classic branch protection)

1. Open **Settings → Branches → Branch protection rules** (edit the rule for `main`, or add one).
2. Turn on **Require status checks to pass before merging**.
3. Turn on **Require branches to be up to date before merging** (recommended).
4. In **Status checks that are required**, add:
   - `Jenkins / Build`
   - `Jenkins / Unit tests`
   - `Jenkins / Integration tests`
   - `Jenkins / Functional tests`
5. Remove any older GitHub Actions job names if they are still listed as required.
6. Save the rule.

### If the UI says there are no status checks

GitHub only offers checks that have **already run** at least once. Open a PR (or push) so Jenkins publishes the four contexts, then refresh the protection UI.

Alternatively, the optional **Jenkins multibranch scan** workflow posts `pending` statuses on PRs (owner repo only).

## Enable in repository rulesets

1. **Settings → Rules → Rulesets** → edit the ruleset that targets `main`.
2. Under **Rules**, enable **Require status checks to pass**.
3. Add the four **`Jenkins / …`** contexts above.

## Owner auto-merge

`owner-auto-merge.yml` enables auto-merge for owner PRs immediately. Branch protection still blocks the merge until the Jenkins statuses are green.

`agent-auto-pr.yml` opens/updates PRs for pushes to `agent/**` branches.

## Secrets / Jenkins

| Item | Purpose |
|------|---------|
| Jenkins credential `github-status-token` | PAT with `commit_statuses:write` used by `Jenkinsfile` |
| Jenkins credential `lucem-wallet-dotenv` | Secret file injected for build / integration / e2e |
| Actions secret `JENKINS_MULTIBRANCH_WEBHOOK_URL` | Optional immediate rescan of job `lucem-wallet` |

## Why this exists

Self-hosted Jenkins runs the heavy pipeline (webpack build, Jest, live integration, Playwright). Publishing explicit `Jenkins / …` statuses gives GitHub a stable set of required checks without relying on GitHub-hosted runners for the merge gate.
