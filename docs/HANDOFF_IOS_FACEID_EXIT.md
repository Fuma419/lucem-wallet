# Handoff: iOS Face ID / saved-password sheet on Exit (X)

**Status:** iOS Face ID FILL was tied to the Accounts rename field (not Exit). Rename was restored as a **Display name** control with AutoFill-safe attributes (`autocomplete="nickname"`, readonly-until-focus, non-credential `name`/`id`, password-manager ignore hints). Do not revert to a plain “Account name” username-shaped input.

**Cancel:** Wallet create/import/HW setup uses `flowCancel.jsx` Cancel under CTAs; returns via `?from=` (fallback accounts/welcome).

---

## User-reported symptom (while Exit existed)

- On iOS, tapping the Exit / X control on **wallet import / creation** (and similar setup) pages triggered a **Face ID / password-manager** prompt.
- Confirmed timing (user answer **B**): the sheet appeared **AFTER pressing Exit** — a **“use your saved password” FILL** sheet (retrieve/autofill), not a “save this password?” sheet.
- User did **not** want the workaround of deleting the saved password; other users would hit the same issue.
- User asked whether converting Exit to a **Back** button would help, or whether a true fix is possible. Multiple DOM/attribute approaches failed on the reporter’s device.

---

## PRs related to Exit (all reverted)

| PR | What it did | Status |
|----|-------------|--------|
| [#169](https://github.com/Fuma419/lucem-wallet/pull/169) | Added Exit abort on setup/sign flows (`flowExit.jsx`, etc.) | **Reverted** |
| [#170](https://github.com/Fuma419/lucem-wallet/pull/170) | Exit returns to opener via `?from=` | **Reverted** |
| [#172](https://github.com/Fuma419/lucem-wallet/pull/172) | Exit → modal-style X; early password-prompt abort work | Reverted (#180) |
| [#173](https://github.com/Fuma419/lucem-wallet/pull/173) | Scrub fields on exit | Reverted (#180) |
| [#175](https://github.com/Fuma419/lucem-wallet/pull/175) | Detach password/`<form>` DOM; text-security; `location.replace` | Reverted (#180) |
| [#176](https://github.com/Fuma419/lucem-wallet/pull/176) | `autocomplete=new-password`; drop DOM hacks | Reverted (#180) |
| [#177](https://github.com/Fuma419/lucem-wallet/pull/177) | `readonly` until focus; re-arm on Exit | Reverted (#180) |
| [#179](https://github.com/Fuma419/lucem-wallet/pull/179) | On Exit flip `type` off password synchronously | Reverted (#180) |
| [#180](https://github.com/Fuma419/lucem-wallet/pull/180) | Reverted Face ID mitigations; kept Exit #169/#170 | Superseded by full Exit revert |

**Unrelated (not part of Exit):**

- [#174](https://github.com/Fuma419/lucem-wallet/pull/174) — CSL change leftover / fee dead-zone
- [#178](https://github.com/Fuma419/lucem-wallet/pull/178) — Soft-skip live Koios stake test on 429

---

## Delivery caveat (critical if reintroducing Exit)

`capacitor.config.ts` uses `webDir: 'build'` and **no** `server.url`. Native iOS/Android ships a **baked-in** `build/`. Merges to `main` update web (Vercel) only; TestFlight/native needs `npm run mobile:sync` + new binary + reinstall. Stale native builds made every prior “fix” look identical.

Confirm test environment before claiming a fix:

1. iPhone Safari at Vercel/web URL (hard-reload), or
2. Added-to-Home-Screen PWA, or
3. Native / TestFlight (must be rebuilt after `main` changes).

---

## Technical notes from failed attempts

Safari / iOS Password AutoFill is aggressive:

- `autocomplete="off"` is often ignored.
- `type="text"` + `-webkit-text-security` can still be treated as a password field.
- DOM detach / `location.replace` / readonly-until-focus / clearing on Exit did not stop the sheet for the reporter.
- jsdom / source-guard unit tests alone do **not** prove iOS behavior.

Prior analysis (may still be useful): destination routes after Exit (`/wallet`, `/accounts`, `/welcome`) generally do not mount password inputs on load; the FILL sheet was believed to be driven by the **setup page’s credential fields at/around the Exit tap**, not the destination — unless delivery/stale native invalidated that.

---

## If reintroducing Exit later

1. Baseline on a **fresh** web or rebuilt native build with no Exit present; confirm Face ID is gone when there is no Exit.
2. Design Exit so it never triggers Password AutoFill FILL (device-verified).
3. Do not re-land #172–#179 approaches without new on-device evidence.
4. Keep return-to-opener behavior intentional and tested.
5. Ship via `agent/<topic>` → PR → Jenkins → merged to `main`.

---

## Conversation reference

Transcript:  
`/home/dhanz/.cursor/projects/home-dhanz-lucem-wallet/agent-transcripts/6a20bf90-7a1c-4582-be79-2ae1a3008027/6a20bf90-7a1c-4582-be79-2ae1a3008027.jsonl`

Search: `Face ID`, `leaveSetupFlow`, `flowExit`, `Exit`.
