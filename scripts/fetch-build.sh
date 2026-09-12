#!/usr/bin/env bash
# Download a build Jenkins already made, instead of rebuilding it locally.
#
# Webpack needs ~4 GB of heap and several minutes; on a laptop that is the slow
# part of testing a change that CI has already compiled. Every green build of
# lucem-wallet archives dist/lucem-wallet-<version>-extension.zip and the Android
# debug APK, so any machine that can reach Jenkins can just fetch them.
#
#   ./scripts/fetch-build.sh                   # newest green main: extension zip
#   ./scripts/fetch-build.sh --extract         # ...and unzip it here
#   ./scripts/fetch-build.sh --branch PR-326   # a pull request's build
#   ./scripts/fetch-build.sh --apk -o ~/Downloads
#
# Credentials (Jenkins requires auth; anonymous requests get a login redirect):
# JENKINS_USER and JENKINS_API_TOKEN from the environment, or from
# ~/.config/lucem/jenkins.env. Create the token at <jenkins>/me/security.
#
# Only curl and unzip are used, so this runs on a stock macOS shell.
set -euo pipefail

JENKINS_URL="${JENKINS_URL:-https://jenkins-zaicore.mysynology.net}"
JOB="${LUCEM_JENKINS_JOB:-lucem-wallet}"
BRANCH="main"
OUT="."
WANT="extension"
EXTRACT=0

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

usage() {
  # The comment block above is the help text; stop at the first line of code.
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
  exit 0
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch|-b) BRANCH="${2:-}"; shift 2 || die "--branch needs a value" ;;
    --out|-o)    OUT="${2:-}"; shift 2 || die "--out needs a directory" ;;
    --apk)       WANT="apk"; shift ;;
    --extract|-x) EXTRACT=1; shift ;;
    --url)       JENKINS_URL="${2:-}"; shift 2 || die "--url needs a value" ;;
    -h|--help)   usage ;;
    *)           die "unknown argument: $1" ;;
  esac
done

if [ -z "${JENKINS_USER:-}" ] || [ -z "${JENKINS_API_TOKEN:-}" ]; then
  ENV_FILE="${HOME}/.config/lucem/jenkins.env"
  # shellcheck source=/dev/null
  [ -r "$ENV_FILE" ] && . "$ENV_FILE"
fi
[ -n "${JENKINS_USER:-}" ] && [ -n "${JENKINS_API_TOKEN:-}" ] || die \
  "set JENKINS_USER and JENKINS_API_TOKEN, or put them in ~/.config/lucem/jenkins.env"

[ -d "$OUT" ] || die "no such directory: $OUT"

BUILD_URL="${JENKINS_URL}/job/${JOB}/job/${BRANCH}/lastSuccessfulBuild"
AUTH=(-u "${JENKINS_USER}:${JENKINS_API_TOKEN}")

meta="$(curl -fsS "${AUTH[@]}" \
  "${BUILD_URL}/api/json?tree=number,artifacts%5BrelativePath%5D" 2>/dev/null)" \
  || die "cannot reach ${BUILD_URL} — check the URL, your token, and that ${BRANCH} has a green build"

number="$(printf '%s' "$meta" | sed -n 's/.*"number":\([0-9]*\).*/\1/p')"

case "$WANT" in
  extension) pattern='[^"]*extension\.zip' ;;
  apk)       pattern='[^"]*\.apk' ;;
esac
artifact="$(printf '%s' "$meta" | tr ',' '\n' \
  | sed -n "s/.*\"relativePath\":\"\(${pattern}\)\".*/\1/p" | head -1)"

if [ -z "$artifact" ]; then
  die "build #${number} of ${BRANCH} archived no ${WANT}; older builds predate
       the packaging step, so try a build from after it merged"
fi

target="${OUT%/}/$(basename "$artifact")"
printf 'fetching %s build #%s -> %s\n' "$BRANCH" "$number" "$target"
# A progress bar is welcome for 40-70 MB interactively, but not in a pipe or log.
if [ -t 1 ]; then PROGRESS=(--progress-bar); else PROGRESS=(-sS); fi
curl -fL "${PROGRESS[@]}" "${AUTH[@]}" -o "$target" "${BUILD_URL}/artifact/${artifact}"

# BUILD-INFO.txt says which commit this is, which matters when the download
# outlives your memory of what was merged.
curl -fsS "${AUTH[@]}" "${BUILD_URL}/artifact/dist/BUILD-INFO.txt" 2>/dev/null || true

if [ "$EXTRACT" = 1 ] && [ "$WANT" = "extension" ]; then
  command -v unzip >/dev/null || die "unzip not found"
  rm -rf "${OUT%/}/build"
  unzip -q "$target" -d "${OUT%/}"
  printf 'extracted to %s/build — load that folder at chrome://extensions\n' "${OUT%/}"
fi
