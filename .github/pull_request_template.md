## Summary
-

## Test plan
- [ ] Jenkins **Unit tests** / **Build** / **Functional tests** (extension popup + PWA/webpack layouts). Do not treat a native-only change as an excuse to skip these.
- [ ] Jenkins **Integration tests** if tx, network, or submit code changed (Preview/Preprod only).
- [ ] Jenkins **Mobile Android** if `android/` or Capacitor config changed (`assembleDebug` + `testDebugUnitTest`).
- [ ] **iOS is not in Jenkins** (Linux agent, no Xcode). If you changed `ios/`, build on a Mac (`npm run mobile:ios`) before calling it done.
