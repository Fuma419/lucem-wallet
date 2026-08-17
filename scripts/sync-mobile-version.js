#!/usr/bin/env node
/**
 * Stamp native app versions from package.json (the single semver source).
 *
 * versionName / CFBundleShortVersionString = X.Y.Z
 * versionCode / CFBundleVersion            = major*10000 + minor*100 + patch
 *   e.g. 4.0.5 → 40005
 *
 * Minor and patch must stay 0–99 so codes stay monotonic and unique.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GRADLE_PATH = path.join(ROOT, 'android/app/build.gradle');
const PLIST_PATH = path.join(ROOT, 'ios/App/App/Info.plist');

function parseSemver(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function versionCodeFromSemver(version) {
  const { major, minor, patch } = parseSemver(version);
  if (minor > 99 || patch > 99) {
    throw new Error(
      `minor/patch must be 0–99 for versionCode encoding (got ${version})`
    );
  }
  return major * 10000 + minor * 100 + patch;
}

function readPackageVersion() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
  return pkg.version;
}

function replaceOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) {
    throw new Error(`could not find ${label}`);
  }
  return text.replace(pattern, replacement);
}

function syncGradle(versionName, versionCode) {
  if (!fs.existsSync(GRADLE_PATH)) {
    return false;
  }
  let text = fs.readFileSync(GRADLE_PATH, 'utf8');
  text = replaceOnce(
    text,
    /versionCode\s+\d+/,
    `versionCode ${versionCode}`,
    'android versionCode'
  );
  text = replaceOnce(
    text,
    /versionName\s+"[^"]+"/,
    `versionName "${versionName}"`,
    'android versionName'
  );
  fs.writeFileSync(GRADLE_PATH, text);
  return true;
}

function replacePlistString(text, key, value) {
  const pattern = new RegExp(
    `(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`
  );
  if (!pattern.test(text)) {
    throw new Error(`could not find Info.plist ${key}`);
  }
  return text.replace(pattern, `$1${value}$3`);
}

function syncIosPlist(versionName, versionCode) {
  if (!fs.existsSync(PLIST_PATH)) {
    return false;
  }
  let text = fs.readFileSync(PLIST_PATH, 'utf8');
  text = replacePlistString(text, 'CFBundleShortVersionString', versionName);
  text = replacePlistString(text, 'CFBundleVersion', String(versionCode));
  fs.writeFileSync(PLIST_PATH, text);
  return true;
}

function syncMobileVersion(version) {
  const { major, minor, patch } = parseSemver(version);
  const versionName = `${major}.${minor}.${patch}`;
  const versionCode = versionCodeFromSemver(versionName);
  const updated = [];
  if (syncGradle(versionName, versionCode)) {
    updated.push(`android ${versionName} (${versionCode})`);
  }
  if (syncIosPlist(versionName, versionCode)) {
    updated.push(`ios ${versionName} (${versionCode})`);
  }
  if (updated.length === 0) {
    throw new Error('no native project files found to update');
  }
  return { versionName, versionCode, updated };
}

function main() {
  const version = process.argv[2] || readPackageVersion();
  const result = syncMobileVersion(version);
  process.stdout.write(
    `synced mobile version ${result.versionName} / ${result.versionCode}: ${result.updated.join(', ')}\n`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`sync-mobile-version: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseSemver,
  versionCodeFromSemver,
  syncMobileVersion,
};
