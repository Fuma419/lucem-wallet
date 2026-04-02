# Wallet & Crypto Safety Checklist

**Trigger:** Agent modifies files in `src/api/extension/`, `src/migrations/`, `src/wasm/`, or any code handling keys, mnemonics, passwords, signing, or encrypted storage.

## Pre-edit checklist
- [ ] Understand the existing encrypt/decrypt flow before changing it (see `src/api/extension/wallet.js`).
- [ ] Identify all callers of the function being modified (`Grep` for the function name).
- [ ] Check if a migration version file is needed (`src/migrations/versions/`).

## Post-edit checklist
- [ ] No private key, mnemonic, or password is logged, exposed to DOM, or sent to external APIs.
- [ ] `encryptWithPassword` / `decryptWithPassword` usage unchanged unless intentional.
- [ ] BIP39 mnemonic generation/validation logic unmodified unless explicitly requested.
- [ ] Hardware wallet signing paths (Ledger/Trezor) still receive the same data structures.
- [ ] Run `NODE_ENV=test npx jest` — confirm the 2 passing suites still pass (53 tests).

## Escalation
- If unsure about a crypto change, escalate to a more capable model tier and explain the security context.
- Never silently swallow errors in signing or decryption paths.
