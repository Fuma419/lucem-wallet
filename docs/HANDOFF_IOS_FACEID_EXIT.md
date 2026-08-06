# Handoff: iOS Face ID / saved-password sheet on Exit (X)

**Status:** Failed mitigation attempts were **reverted** (see below). Baseline after that revert is Exit navigation from #169/#170 **without** the Face ID DOM/autocomplete hacks from #172–#179.

**Goal for the next agent:** After a baseline check on a **fresh web or rebuilt native build**, fix the iOS Face ID / “use your saved password” sheet that appears when the user taps the upper-right Exit/X control on wallet import/create (and related setup) pages — **without** requiring users to delete saved passwords from the iOS Password Manager.

---

## User-reported symptom

- On iOS, tapping the Exit / X control on **wallet import / creation** (and similar setup) pages triggers a **Face ID / password-manager** prompt.
- Confirmed timing (user answer **B**): the sheet appears **AFTER pressing Exit** — a **“use your saved password” FILL** sheet (retrieve/autofill), not a “save this password?” sheet.
- User does **not** want the workaround of deleting the saved password; other users will hit the same issue. A plain Exit must not open the password manager.
- User asked whether converting Exit to a **Back** button would help, or whether a true fix is possible. Prior agents tried DOM/attribute hacks; the issue **persisted** through multiple merges.

---

## What was tried and reverted

These PRs were merged then **reverted together** (do not re-apply blindly):

| PR | Idea | Result |
|----|------|--------|
| [#172](https://github.com/Fuma419/lucem-wallet/pull/172) | Polish Exit → modal-style X; early “stop password prompt on abort” | Insufficient |
| [#173](https://github.com/Fuma419/lucem-wallet/pull/173) | Scrub fields on exit (`autocomplete`, names, `type`, `data-lpignore`, rAF delay) | Persisted |
| [#175](https://github.com/Fuma419/lucem-wallet/pull/175) | Detach password/`<form>` DOM; `type=text` + `-webkit-text-security`; `location.replace` | Persisted |
| [#176](https://github.com/Fuma419/lucem-wallet/pull/176) | Revert hacks; `type=password` + `autocomplete=new-password`; jsdom DOM tests | Persisted |
| [#177](https://github.com/Fuma419/lucem-wallet/pull/177) | `readonly` until focus; on Exit clear value + re-arm `readonly` | Persisted |
| [#179](https://github.com/Fuma419/lucem-wallet/pull/179) | On Exit also set `type=text`, `autocomplete=off` synchronously before nav | Persisted (per user) |

**Kept (not Face ID hacks):**

- [#169](https://github.com/Fuma419/lucem-wallet/pull/169) — Add Exit abort on setup/sign flows (`flowExit.jsx`, etc.)
- [#170](https://github.com/Fuma419/lucem-wallet/pull/170) — Exit returns to the page that opened the flow (`?from=` / return path)

**Unrelated (do not revert for this issue):**

- [#174](https://github.com/Fuma419/lucem-wallet/pull/174) — CSL change leftover / fee dead-zone
- [#178](https://github.com/Fuma419/lucem-wallet/pull/178) — Soft-skip live Koios stake test on 429

---

## Important product / delivery facts

### Capacitor native vs web

`capacitor.config.ts` uses `webDir: 'build'` and **no** `server.url`. The **native iOS/Android app ships a baked-in copy of `build/`**.

- Merging to `main` updates the **web** app (Vercel), **not** an already-installed TestFlight/native binary.
- To get web changes onto a device native build: `npm run mobile:sync` (or equivalent) → new native binary → reinstall.
- If the reporter only tested a **stale native build**, every web fix would look identical (“persists”). **Always confirm environment first:**
  1. iPhone Safari at the Vercel/web URL (hard-reload), or
  2. Added-to-Home-Screen PWA, or
  3. Native / TestFlight / Xcode build (must be rebuilt after `main` changes).

### Where password fields live

- Setup flows: `src/ui/app/tabs/createWallet.jsx`, `src/ui/app/tabs/hw.jsx` (account name + password + confirm).
- Main app boot: `src/ui/indexMain.jsx` — Exit lands on `/wallet`, `/accounts`, `/welcome`, etc.
- Prior analysis: destination routes generally **do not** mount password inputs on load (main-app passwords tend to live in modals like `confirmModal.jsx`). So the FILL sheet is likely driven by the **setup page’s own credential fields at/around the Exit tap / navigation**, not by a password field on the destination — unless environment/delivery invalidates that conclusion.

### Platform navigation

- Web: `src/platform/web.js` (`openMainPage` / tab open → `location.assign` / `href`, etc.)
- Extension: `src/platform/extension.js`
- Exit helpers: `src/ui/app/components/flowExit.jsx` (`leaveSetupFlow`, `leaveSignTabFlow`, `leaveDappApprovalFlow`, header close control)

---

## Technical notes from failed attempts (do not treat as settled truth)

Safari / iOS Password AutoFill is aggressive:

- `autocomplete="off"` is often **ignored**.
- `type="text"` + `-webkit-text-security: disc` can still be treated as a password field; without `new-password` it may worsen FILL vs create heuristics.
- Physically removing nodes / `location.replace` did **not** stop the sheet for the reporter.
- Unit tests that only regex-guard source (or jsdom attribute checks) **do not prove** iOS behavior. Any new fix needs a strategy that either (a) is verified on a real iOS device/build, or (b) encodes a stronger, device-backed check — jsdom alone is insufficient as a sole gate.

User constraint: **do not** solve by telling users to delete the saved login in Settings → Passwords.

Ideas mentioned but not proven:

- True Back (in-flow history) vs Exit that does a full main-page navigation (might change when WebKit runs autofill).
- Ensuring no credential-shaped field exists at the moment WebKit decides to present the sheet (timing relative to blur/focus/unload/navigation).
- Confirming whether the sheet’s “behind” UI is still the create/password screen or already the destination (user was asked; answer may still be unknown).

---

## Suggested starting procedure for the next agent

1. **Baseline check**
   - Confirm current `main` has the revert of #172/#173/#175/#176/#177/#179 (Exit feature #169/#170 still present).
   - Confirm how the user tests (Safari web vs native). If native: rebuild after baseline.
   - Reproduce: open import/create → reach password (or earlier) step → tap Exit/X → note whether Face ID FILL appears, and which screen is behind the sheet.

2. **Do not** re-land the reverted approaches without new evidence they work on the user’s actual environment.

3. Prefer a fix that:
   - Avoids opening Password AutoFill on Exit,
   - Does not break legitimate password entry during setup,
   - Keeps Exit returning to the correct opener page (#170 behavior),
   - Ships with a test that fails for the *mechanism* you claim — knowing jsdom cannot fully simulate iOS AutoFill.

4. Follow repo ship policy: `agent/<topic>` branch → PR to `main` → auto-merge → watch Jenkins until **merged**.

---

## Key files

| Path | Role |
|------|------|
| `src/ui/app/components/flowExit.jsx` | Exit/X control + `leaveSetupFlow` / leave helpers |
| `src/ui/app/tabs/createWallet.jsx` | Create / import UI + password fields |
| `src/ui/app/tabs/hw.jsx` | HW setup + local password fields |
| `src/platform/web.js` / `extension.js` | Navigation after Exit |
| `src/ui/indexMain.jsx` | Main app routes after return |
| `capacitor.config.ts` | Native packs `build/` (no live `server.url`) |
| `src/test/unit/ui/flow-exit.test.js` | Exit source/behavior guards (after revert: pre-Face-ID-hack state) |

---

## Conversation reference

Full prior transcript (JSONL):  
`/home/dhanz/.cursor/projects/home-dhanz-lucem-wallet/agent-transcripts/6a20bf90-7a1c-4582-be79-2ae1a3008027/6a20bf90-7a1c-4582-be79-2ae1a3008027.jsonl`

Search that file for: `Face ID`, `leaveSetupFlow`, `clearFlowCredentials`, `readonly`, `new-password`, `B` (timing answer).
