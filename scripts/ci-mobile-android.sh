#!/usr/bin/env bash
# Lightweight Android CI: Capacitor sync + debug APK assemble.
# Reuses webpack `build/` (must already exist). Bootstraps a user-local
# Android SDK under $HOME/.local/android-sdk when ANDROID_SDK_ROOT is unset.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f build/index.html ] && [ ! -f build/mainPopup.html ]; then
  echo "error: build/ is missing. Run npm run build:webpack (or mobile:build) first." >&2
  exit 1
fi

# Capacitor webDir root is index.html (utils/build.js copies mainPopup.html).
if [ ! -f build/index.html ] && [ -f build/mainPopup.html ]; then
  cp build/mainPopup.html build/index.html
fi

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/.local/android-sdk}}"
export ANDROID_SDK_ROOT
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"

JDK_ROOT="${LUCEM_JDK_ROOT:-$HOME/.local/jdk-21}"
ensure_jdk21() {
  if [ -x "${JDK_ROOT}/bin/javac" ]; then
    return 0
  fi
  # Prefer a system JDK 21 if present (full JDK, not JRE-only).
  for candidate in \
    /usr/lib/jvm/java-21-openjdk-amd64 \
    /usr/lib/jvm/temurin-21-jdk-amd64 \
    /usr/lib/jvm/jdk-21
  do
    if [ -x "${candidate}/bin/javac" ]; then
      JDK_ROOT="${candidate}"
      return 0
    fi
  done
  echo "Bootstrapping JDK 21 into ${JDK_ROOT} ..."
  mkdir -p "$(dirname "${JDK_ROOT}")"
  TMP_TAR="$(mktemp -t jdk21.XXXXXX.tar.gz)"
  curl -fsSL \
    "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk" \
    -o "${TMP_TAR}"
  TMP_DIR="$(mktemp -d -t jdk21-extract.XXXXXX)"
  tar -xzf "${TMP_TAR}" -C "${TMP_DIR}"
  rm -f "${TMP_TAR}"
  EXTRACTED="$(find "${TMP_DIR}" -maxdepth 1 -type d -name 'jdk-21*' | head -1)"
  if [ -z "${EXTRACTED}" ]; then
    echo "error: failed to extract JDK 21" >&2
    rm -rf "${TMP_DIR}"
    exit 1
  fi
  rm -rf "${JDK_ROOT}"
  mv "${EXTRACTED}" "${JDK_ROOT}"
  rm -rf "${TMP_DIR}"
}

ensure_jdk21
export JAVA_HOME="${JDK_ROOT}"
export PATH="${JAVA_HOME}/bin:${PATH}"
if ! command -v javac >/dev/null 2>&1; then
  echo "error: javac not found after JDK bootstrap" >&2
  exit 1
fi
echo "Using JAVA_HOME=${JAVA_HOME} ($(javac -version 2>&1))"

CMDLINE_VERSION="${LUCEM_ANDROID_CMDLINE_VERSION:-13114758}"
COMPILE_SDK="${LUCEM_ANDROID_COMPILE_SDK:-35}"
BUILD_TOOLS="${LUCEM_ANDROID_BUILD_TOOLS:-35.0.0}"

ensure_sdk() {
  if [ -x "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" ]; then
    return 0
  fi
  echo "Bootstrapping Android cmdline-tools into ${ANDROID_SDK_ROOT} ..."
  mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools"
  TMP_ZIP="$(mktemp -t android-cmdline.XXXXXX.zip)"
  curl -fsSL \
    "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_VERSION}_latest.zip" \
    -o "${TMP_ZIP}"
  rm -rf "${ANDROID_SDK_ROOT}/cmdline-tools/latest" "${ANDROID_SDK_ROOT}/cmdline-tools/bootstrap"
  mkdir -p "${ANDROID_SDK_ROOT}/cmdline-tools/bootstrap"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "${TMP_ZIP}" -d "${ANDROID_SDK_ROOT}/cmdline-tools/bootstrap"
  else
    python3 - "${TMP_ZIP}" "${ANDROID_SDK_ROOT}/cmdline-tools/bootstrap" <<'PY'
import sys, zipfile
zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])
PY
  fi
  rm -f "${TMP_ZIP}"
  # Google zip extracts to cmdline-tools/; move into the "latest" slot sdkmanager expects.
  mv "${ANDROID_SDK_ROOT}/cmdline-tools/bootstrap/cmdline-tools" \
    "${ANDROID_SDK_ROOT}/cmdline-tools/latest"
  rm -rf "${ANDROID_SDK_ROOT}/cmdline-tools/bootstrap"
  chmod +x "${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin/"* || true
}

accept_licenses_and_install() {
  mkdir -p "${ANDROID_SDK_ROOT}/licenses"
  # Pre-accept common SDK licenses so non-interactive CI works.
  cat > "${ANDROID_SDK_ROOT}/licenses/android-sdk-license" <<'EOF'
24333f8a63b6825ea9c5514f83c2829b004d1fee
EOF
  cat > "${ANDROID_SDK_ROOT}/licenses/android-sdk-preview-license" <<'EOF'
84831b9409646a918e30573bab4c9c91346d8abd
EOF
  yes 2>/dev/null | sdkmanager --sdk_root="${ANDROID_SDK_ROOT}" --licenses >/dev/null || true
  sdkmanager --sdk_root="${ANDROID_SDK_ROOT}" \
    "platform-tools" \
    "platforms;android-${COMPILE_SDK}" \
    "build-tools;${BUILD_TOOLS}"
}

ensure_sdk
accept_licenses_and_install

echo "sdk.dir=${ANDROID_SDK_ROOT}" > android/local.properties

echo "=== Capacitor sync (android) ==="
npx cap sync android

echo "=== Gradle assembleDebug ==="
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon --stacktrace

APK="$(find app/build/outputs/apk/debug -name '*.apk' 2>/dev/null | head -1 || true)"
if [ -z "${APK}" ]; then
  echo "error: assembleDebug succeeded but no debug APK was found" >&2
  exit 1
fi
echo "Mobile Android OK: ${APK}"
