# Lucem Wallet

Lucem is a Cardano blockchain browser extension wallet (Chrome/Firefox/Edge) **and web app**, forked from Nami. It uses React 18, Chakra UI, Webpack 5, and communicates with the Cardano blockchain via Koios API. A platform adapter layer (`src/platform/`) allows the same build to run as both a Chrome extension and a standalone web app (deployed on Vercel).

## Architecture Overview

### Entry points (webpack bundles)

| Bundle | Source | Purpose |
|--------|--------|--------|
| `mainPopup` | `src/ui/indexMain.jsx` | Primary wallet UI (popup or web root) |
| `internalPopup` | `src/ui/indexInternal.jsx` | dApp approval prompts (enable/signTx/signData) |
| `createWalletTab` | `src/ui/app/tabs/createWallet.jsx` | Full-page wallet creation flow |
| `hwTab` | `src/ui/app/tabs/hw.jsx` | Hardware wallet connection (Ledger USB, Keystone QR) |
| `keystoneTx` | `src/ui/app/tabs/keystoneTx.jsx` | Full-tab Keystone air-gapped transaction signing |
| `trezorTx` | `src/ui/app/tabs/trezorTx.jsx` | Trezor transaction signing |
| `background` | `src/pages/Background/index.js` | Extension service worker (extension-only) |
| `contentScript` | `src/pages/Content/index.js` | dApp connector bridge (extension-only) |
| `injected` | `src/pages/Content/injected.js` | CIP-30 API injection (extension-only) |

### Key directories

| Path | Contents |
|------|----------|
| `src/platform/` | **Platform adapter** — runtime detection routes chrome.* calls to extension or web implementation |
| `src/api/extension/` | Core wallet logic: storage, key management, signing, Koios API calls |
| `src/api/extension/wallet.js` | Transaction orchestration: `initTx`, `buildTx`, `signAndSubmit`, `delegationTx` |
| `src/api/tx/` | **Tx pipeline** — Koios protocol snapshot (`protocol-params.js`), CSL unsigned payment txs (`csl-unsigned-tx.js`); see `docs/TX_ARCHITECTURE_PLAN.md` |
| `src/api/util.js` | HTTP helpers, UTXO/value conversions, HW wallet encoding, Plutus Data |
| `src/api/koios-endpoints.js` | All Koios REST endpoint definitions and request builders |
| `src/api/loader.js` | WASM module loader (`@emurgo/cardano-serialization-lib-browser`) |
| `src/config/config.js` | Constants: `STORAGE` keys, `NETWORK_ID`, `METHOD`, `ERROR`, `EVENT` |
| `src/config/provider.js` | Koios base URLs, API key resolution from secrets + env vars |
| `src/migrations/` | Version-based storage migration system (12 versions: 1.0.0 → 3.3.0) |
| `src/features/` | Feature modules (terms-and-privacy, settings/legal) |
| `src/wasm/` | Generated WASM code — **never modify** |
| `src/test/integration/` | **Optional** live Koios tests (excluded from default Jest; see below) |
| `e2e/` | Playwright layout + screenshot specs (`playwright.config.js`, `e2e/serve-e2e.json`) |

### Agent quick map (where to look first)

- **dApp connector / CIP-30:** `src/pages/Content/injected.js`, `src/api/extension/index.js` (enable, `signTx`, `submitTx`).
- **Build + sign + submit (software):** `src/api/extension/wallet.js` (`initTx`, `buildTx`, `signAndSubmit`), `signTx` / `submitTx` in `src/api/extension/index.js`.
- **Cardano SDK → CSL:** Any `@cardano-sdk/*` (or other) transaction assembly must end as an Emurgo CSL `Transaction` (or equivalent CBOR via `Transaction.from_bytes`) before `signTx`, hardware encoders (`txToLedger`, `txToTrezor`), or Keystone. Use `src/api/sdk-to-csl.js` at that boundary.
- **Koios HTTP:** `src/api/util.js` (`koiosRequest`, `koiosRequestEnhanced`), `src/config/provider.js` (API keys: `KOIOS_API_KEY_PREVIEW`, `KOIOS_API_KEY_PREPROD`, …).
- **Networks:** `src/config/config.js` — `NETWORK_ID`, `NODE` (preview / preprod Koios base URLs).
- **Do not edit:** `src/wasm/` (generated).

### Platform adapter pattern

`src/platform/index.js` auto-selects the correct adapter at runtime:
- **Extension** (`chrome.runtime.id` exists): `src/platform/extension.js` — uses `chrome.storage.local`, `chrome.tabs`, `chrome.windows`
- **Web** (no `chrome.runtime.id`): `src/platform/web.js` — uses IndexedDB, `window.location`, `CustomEvent`, Google Favicons API

Files that import the platform adapter: `src/api/extension/index.js`, `enable.jsx`, `signData.jsx`, `signTx.jsx`, `settings.jsx`, `createWallet.jsx`.

## Cursor Cloud instructions

### Setup
```bash
nvm use 20.19.0                          # .nvmrc pinned
NODE_ENV=development npm install         # env has NODE_ENV=production globally
cp secrets.testing.js secrets.development.js  # if missing
cp secrets.testing.js secrets.production.js   # if missing
```

Otherwise devDependencies (webpack, eslint, jest, etc.) will be skipped.

### Secrets files

Webpack resolves `import secrets from 'secrets'` via an alias to `secrets.{NODE_ENV}.js`. These files are gitignored. Before building, create them if they don't exist:

- `secrets.production.js`
- `secrets.development.js`

Each should export dummy API keys (see `secrets.testing.js` for the format). `utils/build.js` auto-generates `secrets.production.js` from the template for CI builds.

### Key commands

| Task | Command |
|------|---------|
| Build | `npm run build` |
| Dev server | `npm start` (localhost:3000) |
| Test (unit, no live chain) | `NODE_ENV=test npx jest` |
| Integration (Preview self-send + Preprod 0→1; never mainnet) | `npm run test:integration` |
| Playwright (needs `build/`) | `npm run test:screenshots:only` or `npm run test:e2e` |
| Lint | `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx` |
| Deploy web | `vercel deploy --prod --token $VERCEL_TOKEN --scope my-team-5c660a1c --yes` |

**Live send integration tests** (`src/test/integration/send-transaction-preview-preprod.integration.test.js`): not run by default Jest. **Cardano mainnet is forbidden** (URL allowlist + `addr_test1` + Blockfrost key prefix; Jenkins unsets mainnet credentials). Only the two testnets:

| Network | Transfer |
|---------|----------|
| **Preview** | Self-send: account 0 → same address |
| **Preprod** | Account 0 → account 1 (different address in the wallet) |

Uses ADA-only UTxOs on a **dedicated testnet-only mnemonic** (do not reuse a seed that holds mainnet ADA). Mnemonic is **BIP-39: space-separated words, whole phrase in double quotes** in `.env` — see **`.env.example`**. `npm run test:integration` loads `.env` via `dotenv`. CI also snapshots the mnemonic’s mainnet-twin address before/after submits and asserts history did not change.

**GitHub Actions** does not run live integration by default. Local runs use `.env` only; Jenkins runs Preview + Preprod with `lucem-wallet-dotenv`.

| Variable | Purpose |
|----------|---------|
| `LUCEM_INTEGRATION_PREVIEW_MNEMONIC` | 12/15/24 words; funded Preview account 0 |
| `LUCEM_INTEGRATION_PREPROD_MNEMONIC` | 12/15/24 words; funded Preprod account 0 |
| `BLOCKFROST_PREVIEW_PROJECT_ID` / `BLOCKFROST_PREPROD_PROJECT_ID` | Preferred submit provider (key must match network prefix) |
| `KOIOS_API_KEY_PREVIEW` / `KOIOS_API_KEY_PREPROD` | Optional Bearer fallback |
| `LUCEM_INTEGRATION_SEND_LOVELACE` | Optional amount (default `5000000`) |
| `LUCEM_INTEGRATION_POLL_TX=1` | After submit, poll Koios `/tx_status` until visible (optional) |
| `LUCEM_RUN_INTEGRATION=1` | Set automatically by `npm run test:integration` |

`npm start` runs webpack-dev-server on `http://localhost:3000`. It writes built files to `build/` on disk. For extension testing, load the `build/` directory as an unpacked extension. For web testing, visit `http://localhost:3000/mainPopup.html` directly.

### CSL v15 API (common renames)

`Credential.from_keyhash` · `encrypt`/`decrypt_with_password` · `Value.new(coin)` for ADA-only · `Value.new_with_assets(coin, multiasset)` when tokens matter · **`Transaction` / `Value` / `PlutusData` / UTxO: `from_bytes` / `to_bytes` (not `from_cbor_*`)** · CBOR as hex string: `Transaction.from_hex(hex)` · binary: `from_bytes(Buffer.from(hex, 'hex'))` · over the wire: `Buffer.from(x.to_bytes()).toString('hex')` · `Bip32PublicKey.from_hex` · `NetworkInfo.testnet_preview` / `testnet_preprod` (not `testnet()`).

### CI

GitHub Actions (`ci.yml`) runs on PRs/pushes to `main` with two gates:
- **Quick checks (GitHub-hosted):** `npm ci` → `npm run test`
- **Heavy checks (self-hosted Linux):** `npm ci` → `npm run build:webpack` → Playwright screenshots → upload `build` and `e2e-screenshots` artifacts

Use this with `agent-auto-pr.yml` so agent branches auto-open PRs and enable auto-merge after checks. **GitHub settings** (below) must match that intent: agents push as your GitHub user, so rules like “approval from someone other than the last pusher” block auto-merge until you change protection or add a bypass.

#### GitHub: trust your own PRs, still review outsiders

Agents authenticate as **you** (or your PAT), so GitHub treats their commits like yours. To avoid review friction on **your** PRs while keeping **external** contributors under review:

1. Prefer **repository rulesets** (Settings → Code and automation → **Rules** → **Rulesets**), targeting `main` (or a `release` branch if that is what you protect).
2. Enable **Require a pull request before merging** and set **required approvals** to what you want for **everyone who is not on the bypass list** (often **1**).
3. Under **Bypass list**, add **your user** (and only accounts you fully trust to merge without extra review). Use bypass mode **For pull requests only** if you want to keep the PR + CI audit trail while skipping the “extra human approval” and the “not the last pusher” deadlock. Do **not** add casual collaborators to the bypass list.
4. If you still use **classic branch protection** on the same ref, either align it with the ruleset or remove duplicate rules — two layers can both block merges.
5. If you stay on **classic** protection only: turn off **Require approval from someone other than the person who last pushed** (wording varies). That alone fixes solo owner + agent pushes when you are okay with your own approval counting; it does **not** by itself require reviews only for forks — for that, use rulesets + a narrow bypass list as above.

Confirm which git branch Vercel Production is tied to in project settings (`release` vs `main`).

### Testing the extension

1. Run `npm run build` or `npm start`.
2. Chrome → `chrome://extensions/` → Developer mode → Load unpacked → select `build/`.
3. Click the Lucem extension icon to open the popup UI.

### Testing the web app

1. Run `npm run build`.
2. Deploy: `vercel deploy --prod --token $VERCEL_TOKEN --scope my-team-5c660a1c`.
3. The web app uses IndexedDB for storage, same-tab navigation, and the Google Favicons API.

### Vercel deployment

The project deploys to Vercel via `vercel.json`:
- **Build command:** `npm run build`
- **Output directory:** `build/`
- **Rewrites:** `/` → `mainPopup.html`, SPA routes → appropriate HTML entry points
- **Node version:** 20.x (configured in Vercel project settings)
- Secrets auto-generated in `utils/build.js` — no manual setup required.
- **Vercel CLI auth:** requires `VERCEL_TOKEN` secret. Scope: `my-team-5c660a1c`. Project: `lucem-wallet`.

### Jest / ESLint baselines

Jest uses `@emurgo/cardano-serialization-lib-nodejs` mapping and `testPathIgnorePatterns` for vendored trees. ESLint may report pre-existing issues in WASM/webpack code.

## Model & Token Budget Policy

### Model tier selection
- Use the fastest/cheapest model for routine edits, searches, lint fixes, and docs.
- Escalate to a capable model **only** for: complex debugging, architecture decisions, or security-sensitive wallet/crypto logic.
- Downgrade immediately after the complex step.

### Token efficiency
- Concise outputs by default; bullet lists over paragraphs.
- Targeted file reads with `Grep`/`Glob` filters — avoid broad `**/*` scans.
- Read large files with `offset`/`limit`; don't read entire files when only a section is needed.

### Validation cadence
- **During iteration:** validate only changed files (single-file lint, single test suite).
- **Before commit:** run repo-wide gates once: `NODE_ENV=test npx jest`, `./node_modules/.bin/eslint . --ext .js,.jsx,.ts,.tsx`, `npm run build`.

### Agent ship policy (PR, auto-merge, fix until merged)

Same policy as **`.cursor/rules/git-push-policy.mdc`** (always-on) and **`.cursor/skills/pr-follow-through/SKILL.md`**. Summary:

1. **Branch** from up-to-date `main`: prefer **`agent/<topic>`**, or `fix/<issue>` / `feat/<topic>`.
2. Run **`NODE_ENV=test npx jest`** and **`npm run build:webpack`** (local parity for CI) before push. When changing CSS/UI contracts covered by unit tests, update those tests in the same commit.
3. **Commit and push** to `origin` on that branch only (never directly to `main`).
4. **Open a PR** to `main` (`gh pr create` or confirm **`Agent Auto PR`** created/updated it). Enable **auto-merge** when available.
5. **Stay on the task until merge:** poll `gh pr checks` / Jenkins PR job; on failure, read the failing stage log, fix, push, and re-poll. If the PR is behind `main` or conflicted, merge/rebase `main` and re-run CI. Do **not** stop after “PR opened” or “CI started.”
6. Only treat the work as finished when the PR is **`MERGED`** (or the user explicitly stops babysitting).

**Definition of done:** changes are **merged to `main`**, not only pushed to a branch or sitting in an open PR.

### GitHub token helper

Every agent shell loads `GH_TOKEN` from `~/.config/agent-secrets/github_pat` via the shared loader in `~/.bashrc`/`~/.profile`. Run `set-gh-token` once to store a fine-grained PAT; future shells automatically see it, and you only need to rerun `set-gh-token` when rotating tokens (`clear-gh-token` removes it).

### Jenkins CI (local host)

Jenkins runs as a Docker container on this host. Agents have full access to debug and improve CI.

| Item | Value |
|------|-------|
| URL | `http://192.168.68.143:8080` |
| Container | `docker exec jenkins ...` |
| JENKINS_HOME (host) | `~/jenkins_home` |
| JENKINS_HOME (container) | `/var/jenkins_home` |
| CasC source | `~/jenkins-deployment/jenkins/casc/` |
| Plugins list | `~/jenkins-deployment/jenkins/plugins.txt` |
| Build agent label | `lucem-wallet` |
| Multibranch job | `lucem-wallet` (discovers PRs via `refs/pull/*/head`) |

**Key files:**
- `~/jenkins_home/credentials.xml` — runtime credentials (auto-generated from CasC)
- `~/jenkins_home/secrets/github-status-token` — PAT for publishing commit statuses
- `~/jenkins_home/secrets/lucem-wallet.env` — env file injected into integration/e2e stages

**Reloading CasC:** `docker restart jenkins` (picks up `~/jenkins-deployment/jenkins/casc/*.yaml`).

**GitHub status publishing:** The `Jenkinsfile` uses `withCredentials('github-status-token')` + `curl` to post `Jenkins / Build`, `Jenkins / Unit tests`, etc. The PAT stored in `github-status-token` must have **`commit_statuses:write`** permission on this repository.

**Troubleshooting:**
- Build logs: `~/jenkins_home/jobs/lucem-wallet/branches/PR-<n>/builds/<num>/log`
- Indexing log: `~/jenkins_home/jobs/lucem-wallet/indexing/indexing.log`
- Plugin issues: check `~/jenkins_home/plugins/` against `~/jenkins-deployment/jenkins/plugins.txt`

### MCP Servers (`.cursor/mcp.json`)

Only servers that provide **unique** capabilities beyond native tools are configured:

| Server | Purpose | Notes |
|--------|---------|-------|
| `code-rag` | BM25 keyword search over chunked source index | Rebuild: call `code_rag_rebuild_index` tool or run indexer script |
| `jenkins` | Jenkins REST API (jobs, builds, logs, pipelines) | Needs `JENKINS_API_TOKEN` env var; generate in Jenkins → admin → Configure → API Token |

**Removed (redundant with native tools):** `@modelcontextprotocol/server-filesystem` (→ Read/Write/Glob/Grep), `server-git` (→ Shell git), `server-github` (→ github-* MCP tools), `server-fetch` (→ WebFetch), `server-puppeteer` (→ puppeteer-* tools).

### Edit discipline
- One logical change per commit. No unrelated refactors.
- Never modify generated WASM files in `src/wasm/`.
- See `.cursor/rules/cost-optimizer.mdc` and `.cursor/skills/` for detailed guidance.
