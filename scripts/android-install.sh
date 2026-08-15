#!/usr/bin/env bash
# Sync web assets, assemble a debug APK, install it, and launch Lucem.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=android-env.sh
source "${ROOT}/scripts/android-env.sh"
cd "${ROOT}"
npm run mobile:sync
cd android
# A prior ./gradlew under sdkman Java 11 leaves a daemon that AGP 8.7 cannot use.
./gradlew --stop >/dev/null 2>&1 || true
./gradlew assembleDebug
APK="app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "${APK}" ]; then
  echo "error: assembleDebug succeeded but ${APK} is missing" >&2
  exit 1
fi
adb install -r "${APK}"
adb shell am start -n xyz.lucem.wallet/.MainActivity
echo "Installed and launched ${APK}"
