# Wallet & Crypto Safety

**Trigger:** Agent modifies `src/api/extension/`, `src/migrations/`, `src/platform/` (storage), or any code handling keys, mnemonics, passwords, signing.

## Key paths
| Operation | Function | File |
|-----------|----------|------|
| Encrypt/decrypt root key | `encryptWithPassword` / `decryptWithPassword` | `index.js` |
| Derive account keys | `requestAccountKey` | `index.js` |
| Sign tx/data | `signTx`, `signDataCIP30` | `index.js` |
| Build tx | `buildTx`, `delegationTx` | `wallet.js` |
| Create wallet | `createWallet` | `index.js` |

## CSL v15 API (critical)
- `Credential.from_keyhash()` not `new_pub_key()`. `Value.new_with_assets()` not `Value.new(coin, ma)`.
- `encrypt_with_password` / `decrypt_with_password` (no `emip3_` prefix). `as_bytes()` not `to_raw_bytes()`.
- `Bip32PublicKey.from_hex()` not `from_bytes()`. `NetworkInfo.testnet_preprod()` not `testnet()`.

## Checklist
- [ ] No private key/mnemonic logged, exposed to DOM, or sent to external APIs.
- [ ] Both platform adapters handle storage changes (IndexedDB web + chrome.storage extension).
- [ ] `NODE_ENV=test npx jest` — 53 tests still pass.
