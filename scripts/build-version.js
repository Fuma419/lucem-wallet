#!/usr/bin/env node
/**
 * Build identity for the extension manifest.
 *
 * package.json still owns the semver. CI adds the build number on top so two
 * builds of the same version are distinguishable in chrome://extensions, and so
 * the browser treats a freshly loaded build as newer than the one it replaced.
 *
 *   version      4.0.6.312           what the browser compares
 *   version_name 4.0.6 (main #312, 014f629)   what the browser displays
 *
 * Without a build number — every local `npm run build` — version is the plain
 * X.Y.Z and version_name is omitted, so dev output is unchanged.
 */
'use strict';

// Chrome accepts one to four dot-separated integers, each 0–65535. Anything
// else (a `-beta4` suffix, a fifth part) makes the extension refuse to load,
// which is why the numeric prefix is all that reaches `version`.
const MAX_COMPONENT = 65535;

function numericPrefix(version) {
  const match = String(version == null ? '' : version).match(
    /^(\d+)\.(\d+)\.(\d+)/
  );
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function parseBuild(build) {
  if (build === undefined || build === null || build === '') {
    return null;
  }
  const n = Number(build);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`build must be a non-negative integer (got ${build})`);
  }
  // Wraps rather than throwing: a failed build at #65536 would be a worse
  // outcome than a version number that restarts, and version_name still
  // carries the real build.
  return n % (MAX_COMPONENT + 1);
}

function stampedVersion(version, build) {
  const base = numericPrefix(version);
  const n = parseBuild(build);
  return n === null ? base : `${base}.${n}`;
}

/**
 * Human-readable label, or null when there is nothing to add beyond `version`.
 */
function versionLabel({ version, build, branch, commit } = {}) {
  const full = String(version == null ? '' : version);
  numericPrefix(full); // reject nonsense early, same rule as stampedVersion
  const n = parseBuild(build);
  const origin = [branch, n === null ? null : `#${n}`].filter(Boolean).join(' ');
  const parts = [origin, commit ? String(commit).slice(0, 7) : null].filter(
    Boolean
  );
  if (parts.length === 0) {
    // No build context. Still worth a label when the semver carries a
    // prerelease suffix, since `version` had to drop it to stay loadable.
    return full === stampedVersion(full, build) ? null : full;
  }
  return `${full} (${parts.join(', ')})`;
}

module.exports = { numericPrefix, parseBuild, stampedVersion, versionLabel };
