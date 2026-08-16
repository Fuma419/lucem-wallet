# Lucem mobile (iOS / Android) via Capacitor

Lucem ships to the App Store and Google Play by wrapping the exact same web
build (`build/`) that powers the Vercel web app in a native shell using
[Capacitor](https://capacitorjs.com). Inside the WebView `chrome.runtime.id`
is absent, so the app runs through the web platform adapter
([`src/platform/web.js`](src/platform/web.js), IndexedDB storage) with no
rewrite. Configuration lives in [`capacitor.config.ts`](capacitor.config.ts).

v1 scope is the core software wallet (create/restore, balances, receive, send,
staking, governance) plus the **Keystone** air-gapped hardware wallet, which is
QR/camera-based (no Bluetooth or USB) and works inside the WebView. Ledger
(native Bluetooth), Trezor, and the CIP-30 dApp connector are a later phase; see
"Deferred" below.

## Prerequisites

- Node 20.x (`.nvmrc` is `20.19.0`). Capacitor is pinned to the v7 line so it
  runs on Node 20; do not bump to Capacitor 8 (needs Node >= 22).
- Android: Android Studio (any OS) + an emulator or device. The CLI build needs
  **JDK 17+** (AGP 8.7). sdkman Java 11 will fail. Use
  `npm run mobile:android:install` (sets `JAVA_HOME` + `adb`) or
  `source scripts/android-env.sh` before `./gradlew`. Google Play Console
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
- `npm run mobile:sync:android` - same, Android only (skips CocoaPods).
- `npm run mobile:android` - sync and open Android Studio.
- `npm run mobile:android:install` / `mobile:android:refresh` - boot an emulator if needed, sync web assets, assemble a debug APK, `adb install`, launch. Use this after pulling `main` or a full webpack rebuild.
- `npm run mobile:ios` - sync and open Xcode (Mac).

Run on a device/emulator from Android Studio / Xcode (or `npx cap run android`).
Smoke test end to end: create wallet, restore, view balance (Koios), send,
staking, governance, and connect a Keystone + sign a transaction (see below).

Networking note: a packaged app has no Vercel `/api/koios/*` proxy, so
[`src/api/util.js`](src/api/util.js) calls Koios directly on native, and
`CapacitorHttp` (enabled in the config) routes fetch/XHR through native
networking to avoid WebView CORS.

## Keystone (air-gapped hardware wallet)

Keystone needs the phone camera to scan the device's animated QR — both when
connecting (`hwTab.html`, "Connect Hardware Wallet" > Keystone) and when signing
(`keystoneTx.html`). The UI uses the WebView's `getUserMedia`; on native we
pre-request the OS camera permission via `ensureCameraPermission()` in
[`src/platform/capacitor.js`](src/platform/capacitor.js) (a no-op on web /
extension, where the browser prompts on its own) so the WebView stream is
allowed. The generated native projects must declare the camera permission —
`npx cap sync` does not add these for you:

- **Android** — in `android/app/src/main/AndroidManifest.xml`:

  ```xml
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-feature android:name="android.hardware.camera" android:required="false" />
  ```

- **iOS** — in `ios/App/App/Info.plist`:

  ```xml
  <key>NSCameraUsageDescription</key>
  <string>Lucem uses the camera to scan Keystone QR codes for connecting and signing.</string>
  ```

Tip: point the camera at the Keystone screen in a well-lit spot; the animated QR
transfers over several frames, so hold steady. Ledger (Bluetooth) and Trezor are
not available on mobile in v1 — the hardware screen shows guidance to that effect
on phones.

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
- Camera QR for the receive screen (scan an address into Send).
- Ledger over BLE and Trezor on mobile, plus dApp connectivity (in-app dApp
  browser injecting CIP-30, or WalletConnect / CIP-45) - each its own project.
