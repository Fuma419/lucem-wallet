---
name: lucem
description: >-
  Lucem Wallet repo workflows for agents — verify changes, Cardano/CSL patterns,
  and Jenkins-gated shipping. Use for feature work, bugs, HW wallets, or CI in
  this project.
---

# Lucem Wallet — project skill

## Before you finish a task

1. Run **`NODE_ENV=test npx jest`** for any non-trivial code change when practical.
2. Do **not** require local **`npm run build`** / webpack before every push — Jenkins owns Build / Unit / Integration / Functional.
3. If touching **signing, HW (Ledger/Keystone/Trezor), CIP-30, or collateral**, prefer local unit tests, then watch Jenkins Integration + Functional.
4. Do not edit **`src/wasm/`** by hand.
5. Ship via PR and **follow through until merged** (`.cursor/skills/pr-follow-through/SKILL.md`).

## Cardano / CSL

SDK or non-CSL transaction assembly must become Emurgo CSL before `signTx` / HW paths. Prefer `src/api/sdk-to-csl.js`. See `.cursor/rules/cardano-sdk-csl-bridge.mdc`.

## Env & local services

- `nvm use` (`.nvmrc`); `NODE_ENV=development npm install` if global `NODE_ENV=production`.
- Secrets: copy `secrets.testing.js` → `secrets.development.js` / `secrets.production.js` (gitignored).
- Integration: `.env` from `.env.example`; **never mainnet** for live send tests.

## Full CI

- **Jenkins** (required): Build → Unit → Integration → Functional; statuses `Jenkins / …`.
- See **`.github/MERGE_GATE.md`**.

## Telegram (host)

- Clarifying questions: `tg-ask` (skill `telegram-clarify`)
- Task done / reminders: `tg-send` (skill `telegram-notify`)
- Lucem bot drives this repo via `~/tg-agent-bridge` (`tg-bridge status`)

## Git

Never push directly to `main`. Definition of done is **merged**. See **`git-push-policy.mdc`**.
