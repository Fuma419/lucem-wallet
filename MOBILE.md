# Lucem mobile (iOS / Android) via Capacitor

Lucem ships to the App Store and Google Play by wrapping the exact same web
build (`build/`) that powers the Vercel web app in a native shell using
[Capacitor](https://capacitorjs.com). Inside the WebView `chrome.runtime.id`
is absent, so the app runs through the web platform adapter
([`src/platform/web.js`](src/platform/web.js), IndexedDB storage) with no
rewrite. Configuration lives in [`capacitor.config.ts`](capacitor.config.ts).

v1 scope is the core software wallet (create/restore, balances, receive, send,
staking, governance). Hardware wallets (native Bluetooth) and the CIP-30 dApp
connector are a later phase; see "Deferred" below.

## Prerequisites

- Node 20.x (`.nvmrc` is `20.19.0`). Capacitor is pinned to the v7 line so it
  runs on Node 20; do not bump to Capacitor 8 (needs Node >= 22).
- Android: Android Studio (any OS) + an emulator or device. Google Play Console
  account ($25 one-time).
- iOS: a Mac with Xcode. Apple Developer Program ($99/yr) enrolled as an
  ORGANIZATION (see the blocker below).

### iOS account blocker (read first)

App Store Review Guideline 3.1.5(b) allows cryptocurrency wallet apps only from
Apple Developer accounts enrolled as an Organization. An Individual account will
be rejected. Get a (free) D-U-N-S number and enroll a legal entity as an
Organization before doing any App Store submission. You can still build and test
on device locally with any account.

## One-time: generate the native projects

```bash
nvm use            # Node 20
NODE_ENV=development npm install
npm run mobile:build      # builds build/ (and copies mainPopup.html -> index.html)
npx cap add android       # creates android/
npx cap add ios           # creates ios/ (Mac only)
```

App icons and splash (provide a 1024x1024 `resources/icon.png` and optional
`resources/splash.png`, then):

```bash
npm run mobile:assets
```

## Everyday loop

- `npm run mobile:sync` - rebuild web assets and copy them into `android/`/`ios/`.
- `npm run mobile:android` - sync and open Android Studio.
- `npm run mobile:ios` - sync and open Xcode (Mac).

Run on a device/emulator from Android Studio / Xcode (or `npx cap run android`).
Smoke test end to end: create wallet, restore, view balance (Koios), send,
staking, governance.

Networking note: a packaged app has no Vercel `/api/koios/*` proxy, so
[`src/api/util.js`](src/api/util.js) calls Koios directly on native, and
`CapacitorHttp` (enabled in the config) routes fetch/XHR through native
networking to avoid WebView CORS.

## Android release

1. In `android/app/build.gradle` set `applicationId` (`xyz.lucem.wallet`),
   `versionCode`, `versionName`.
2. Create an upload keystore (Android Studio > Build > Generate Signed
   Bundle/APK) and keep it safe; opt into Play App Signing on first upload.
3. Build a release Android App Bundle (`.aab`).
4. Play Console: create the app; complete Store listing, Content rating, Data
   safety, a Privacy Policy URL, and the Financial features / crypto
   declaration; mark it a non-custodial wallet.
5. Upload the `.aab` to Internal testing, verify on real devices, then promote
   (a new personal account must run a closed test with ~12 testers for 14 days
   before requesting production access) and submit for review.

## iOS release (Mac, Organization account)

1. In App Store Connect create the app record with bundle id `xyz.lucem.wallet`.
2. Open `ios/App/App.xcworkspace`; set the bundle id + Team, automatic signing,
   add app icons.
3. In `Info.plist` set `ITSAppUsesNonExemptEncryption` (standard-crypto wallets
   typically claim the exemption - verify for your case).
4. Product > Archive, upload to App Store Connect, test via TestFlight.
5. Submit for review; in notes state it is a non-custodial self-hosted wallet,
   keys stored on-device, and include test steps.

## Deferred (post-v1)

- Move the password-encrypted key from IndexedDB to iOS Keychain / Android
  Keystore + biometric unlock (add a `native` branch beside the web adapter).
- Camera QR (receive scanning, Keystone) via `@capacitor/camera`.
- Hardware wallets over BLE and mobile dApp connectivity (in-app dApp browser
  injecting CIP-30, or WalletConnect / CIP-45) - each its own project.
