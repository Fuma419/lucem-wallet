#!/usr/bin/env bash
# Pull latest main and build every local release artifact (extension zip, web
# build/, Android debug APK, iOS Capacitor sync / simulator build).
#
# Does not cut a semver tag, deploy Vercel, or upload to Play / TestFlight.
#
# Usage:
#   npm run build:all
#   npm run build:all -- --no-pull
#   npm run build:all -- --current
#   npm run build:all -- --skip-android --skip-ios
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

PULL=1
USE_MAIN=1
SKIP_ANDROID=0
SKIP_IOS=0
RUN_TESTS=0

usage() {
  cat <<'EOF'
Usage: scripts/build-all.sh [options]

  --no-pull         Skip git fetch/pull
  --current         Pull the current branch instead of checking out main
  --skip-android    Skip the debug APK
  --skip-ios        Skip iOS sync / simulator build
  --test            Run unit tests before webpack
  -h, --help        Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-pull) PULL=0 ;;
    --current) USE_MAIN=0 ;;
    --skip-android) SKIP_ANDROID=1 ;;
    --skip-ios) SKIP_IOS=1 ;;
    --test) RUN_TESTS=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

log() {
  printf '\n=== %s ===\n' "$*"
}

if [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
  nvm use
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty. Commit, stash, or clean before build:all." >&2
  git status --short >&2
  exit 1
fi

if [ "${PULL}" -eq 1 ]; then
  log "Pull latest"
  git fetch origin
  if [ "${USE_MAIN}" -eq 1 ]; then
    git checkout main
    git pull --ff-only origin main
  else
    git pull --ff-only
  fi
fi

log "Install dependencies"
NODE_ENV=development npm install

if [ "${RUN_TESTS}" -eq 1 ]; then
  log "Unit tests"
  NODE_ENV=test npx jest
fi

log "Stamp native versions from package.json"
npm run mobile:sync-version

log "Webpack (extension + web + Capacitor webDir)"
npm run mobile:build

VERSION="$(node -p "require('./package.json').version")"
mkdir -p dist
ZIP="dist/lucem-wallet-${VERSION}-extension.zip"
rm -f "${ZIP}"
# README tells users to extract and load the build/ folder.
zip -qry "${ZIP}" build
log "Extension zip ${ZIP}"

if [ "${SKIP_ANDROID}" -eq 0 ] && [ -d android ]; then
  log "Android debug APK"
  # shellcheck source=android-env.sh
  source "${ROOT}/scripts/android-env.sh"
  npx cap sync android
  (
    cd android
    ./gradlew --stop >/dev/null 2>&1 || true
    ./gradlew assembleDebug
  )
  APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
  APK_DST="dist/lucem-wallet-${VERSION}-debug.apk"
  if [ ! -f "${APK_SRC}" ]; then
    echo "error: assembleDebug succeeded but ${APK_SRC} is missing" >&2
    exit 1
  fi
  cp "${APK_SRC}" "${APK_DST}"
  echo "Android APK ${APK_DST}"
elif [ "${SKIP_ANDROID}" -eq 1 ]; then
  echo "Skipping Android (--skip-android)."
else
  echo "Skipping Android (no android/ directory)."
fi

if [ "${SKIP_IOS}" -eq 0 ] && [ -d ios ]; then
  log "iOS Capacitor sync"
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "Skipping iOS build (not macOS). Synced web assets only if cap sync ran."
  else
    npx cap sync ios
    if command -v xcodebuild >/dev/null 2>&1; then
      log "iOS Simulator debug build"
      xcodebuild \
        -workspace ios/App/App.xcworkspace \
        -scheme App \
        -configuration Debug \
        -destination 'generic/platform=iOS Simulator' \
        CODE_SIGNING_ALLOWED=NO \
        build
    else
      echo "Skipping xcodebuild (Xcode not installed). Capacitor sync is done."
    fi
  fi
elif [ "${SKIP_IOS}" -eq 1 ]; then
  echo "Skipping iOS (--skip-ios)."
else
  echo "Skipping iOS (no ios/ directory)."
fi

log "Artifacts"
ls -lh dist
cat <<EOF

Done. Local artifacts (not uploaded):

  unpacked web/extension   build/
  extension zip            ${ZIP}
  Android debug APK        dist/lucem-wallet-${VERSION}-debug.apk  (if built)

Vercel production, Play AAB, and TestFlight stay manual.
EOF
