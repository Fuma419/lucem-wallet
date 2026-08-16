#!/usr/bin/env bash
# Resolve JDK 17+ and the Android SDK for local CLI builds.
# Usage:
#   source scripts/android-env.sh
#   scripts/android-env.sh ./gradlew assembleDebug
#
# sdkman on this machine defaults to Java 11, which cannot run AGP 8.7.

lucem_resolve_java_home() {
  if [ -n "${LUCEM_JDK_ROOT:-}" ] && [ -x "${LUCEM_JDK_ROOT}/bin/javac" ]; then
    printf '%s\n' "${LUCEM_JDK_ROOT}"
    return 0
  fi
  if [ -x /usr/libexec/java_home ]; then
    local home v
    for v in 21 17; do
      home=$(/usr/libexec/java_home -v "$v" 2>/dev/null || true)
      if [ -n "$home" ] && [ -x "${home}/bin/javac" ]; then
        printf '%s\n' "$home"
        return 0
      fi
    done
  fi
  local sdkman="${HOME}/.sdkman/candidates/java"
  local cand
  for cand in "${sdkman}"/21* "${sdkman}"/17*; do
    if [ -x "${cand}/bin/javac" ]; then
      printf '%s\n' "$cand"
      return 0
    fi
  done
  echo "error: need JDK 17+ (Java 11 from sdkman cannot run Android Gradle Plugin 8.7)." >&2
  echo "Install Temurin 17 or use Android Studio's JBR, then retry." >&2
  return 1
}

lucem_resolve_android_sdk() {
  if [ -n "${ANDROID_HOME:-}" ] && [ -x "${ANDROID_HOME}/platform-tools/adb" ]; then
    printf '%s\n' "${ANDROID_HOME}"
    return 0
  fi
  if [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -x "${ANDROID_SDK_ROOT}/platform-tools/adb" ]; then
    printf '%s\n' "${ANDROID_SDK_ROOT}"
    return 0
  fi
  local default="${HOME}/Library/Android/sdk"
  if [ -x "${default}/platform-tools/adb" ]; then
    printf '%s\n' "$default"
    return 0
  fi
  echo "error: Android SDK not found. Expected ${default} (Android Studio default)." >&2
  return 1
}

JAVA_HOME="$(lucem_resolve_java_home)" || return 1 2>/dev/null || exit 1
ANDROID_HOME="$(lucem_resolve_android_sdk)" || return 1 2>/dev/null || exit 1
export JAVA_HOME
export ANDROID_HOME
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${JAVA_HOME}/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

lucem_adb_has_device() {
  adb devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit !found }'
}

# Boot the first AVD (or $LUCEM_ANDROID_AVD) when no phone/emulator is connected.
lucem_ensure_android_device() {
  if lucem_adb_has_device; then
    return 0
  fi
  local avd="${LUCEM_ANDROID_AVD:-}"
  if [ -z "$avd" ]; then
    avd=$(emulator -list-avds 2>/dev/null | head -1 || true)
  fi
  if [ -z "$avd" ]; then
    echo "error: no Android device or AVD. Create one in Android Studio Device Manager, or set LUCEM_ANDROID_AVD." >&2
    return 1
  fi
  echo "Starting Android emulator ${avd} ..."
  emulator -avd "$avd" -netdelay none -netspeed full >/tmp/lucem-emulator.log 2>&1 &
  adb wait-for-device
  local i=0
  local boot=""
  while [ "$i" -lt 90 ]; do
    boot=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    if [ "$boot" = "1" ]; then
      echo "Emulator ${avd} is ready."
      return 0
    fi
    sleep 2
    i=$((i + 1))
  done
  echo "error: emulator ${avd} started but did not finish booting. See /tmp/lucem-emulator.log" >&2
  return 1
}

# Do not wrap follow-on commands in `bash -lc`: sdkman login shells reset JAVA_HOME to 11.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  if [ "$#" -eq 0 ]; then
    echo "JAVA_HOME=${JAVA_HOME}"
    echo "ANDROID_HOME=${ANDROID_HOME}"
    java -version
    adb version | head -1
    exit 0
  fi
  exec "$@"
fi
