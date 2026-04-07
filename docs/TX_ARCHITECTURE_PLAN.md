# Transaction pipeline architecture (Lucem)

## Goals

- **Single place** for Koios → protocol-parameter normalization and CSL builder configuration.
- **Correct Conway-era behavior**: coin-selection strategy, `set_ttl_bignum`, witness-aware fees, optional fee alignment without needing the user’s private key (dummy vkey witnesses for `min_fee` only).
- **Signing boundary**: all software and hardware paths keep consuming **Emurgo CSL `Transaction`** (or CBOR from it). See `src/api/sdk-to-csl.js` and `.cursor/rules/cardano-sdk-csl-bridge.mdc` for any future `@cardano-sdk/*` integration.

## Layering

| Layer | Responsibility | Primary code |
|-------|----------------|--------------|
| **Chain context** | Tip slot, epoch params, UTxO fetch | `src/api/util.js` (Koios), `src/api/tx/protocol-params.js` |
| **Unsigned tx assembly** | Input selection, outputs, change, TTL, fee | `src/api/tx/csl-unsigned-tx.js` |
| **Canonical CBOR (CIP-21)** | HW-friendly encoding | `cardano-hw-interop-lib` inside tx builder |
| **Signing** | Vkey / Ledger / Trezor / Keystone | `src/api/extension/index.js` (unchanged contract) |
| **Submit** | CBOR POST | `submitTx` |

## Phased work

### Phase 1 — Foundation (current)

1. Add `src/api/tx/protocol-params.js` — normalize Koios `/epoch_params` + `/tip` into the existing `protocolParameters` object shape used by the UI.
2. Add `src/api/tx/csl-unsigned-tx.js` — `buildUnsignedSimpleTx` for payment-style txs (used by `buildTx`).
3. Refactor `src/api/extension/wallet.js` — `initTx` / `buildTx` call the new modules; remove ad-hoc debug logging; fix `add_inputs_from` strategy, `add_required_signer`, TTL API, and fee alignment.
4. Unit-test protocol normalization (pure functions).

### Phase 2 — Certificates / withdrawals

5. Route `delegationTx` through shared **builder config** helper (same fee/TTL/signing conventions).
6. Rework `withdrawalTx` to use `add_inputs_from` + change (instead of a single raw input) where safe; align with CSL v15 APIs.
7. Re-evaluate `undelegateTx` (separate Conway builder API) for consistency or document as legacy path.

### Phase 3 — Cardano SDK (optional)

8. Upgrade `@cardano-sdk/core` and add `@cardano-sdk/input-selection` (or tx-construction packages) **only** if versions align with webpack/extension constraints.
9. Use SDK for **selection / planning**; **always** serialize or convert to CSL before `signTx` / HW encoders (`sdk-to-csl.js`).

### Phase 4 — Hardening

10. Regression matrix: software send, Ledger, Trezor, Keystone UR, dApp `signTx` partial sign.
11. Extend integration test patterns to preview if needed.

## Non-goals (short term)

- Rewriting `txToLedger` / Keystone protobufs — they stay tied to CSL `Transaction`.
- Modifying `src/wasm/`.
