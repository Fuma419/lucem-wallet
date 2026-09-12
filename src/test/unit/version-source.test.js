const fs = require('fs');
const path = require('path');

describe('single version source of truth', () => {
  const root = path.join(__dirname, '../../..');
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8')
  );
  const webpackSrc = fs.readFileSync(
    path.join(root, 'webpack.config.js'),
    'utf8'
  );

  test('package.json owns the app version', () => {
    expect(typeof packageJson.version).toBe('string');
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('src/manifest.json does not declare its own version', () => {
    expect(manifest.version).toBeUndefined();
  });

  test('webpack stamps npm_package_version onto the built manifest last', () => {
    // Source manifest is spread first, then version is overwritten from npm.
    expect(webpackSrc).toMatch(
      /const base = process\.env\.npm_package_version/
    );
    expect(webpackSrc).toMatch(
      /\.\.\.manifest,[\s\S]{0,80}version:\s*stampedVersion\(base,/
    );
    // The old bug: inject package fields then spread manifest over them.
    expect(webpackSrc).not.toMatch(
      /version:\s*stampedVersion\([\s\S]{0,120}\.\.\.manifest/
    );
  });

  test('webpack labels the build without touching the plain version', () => {
    const {
      stampedVersion,
      versionLabel,
    } = require('../../../scripts/build-version');

    // A local build must keep producing exactly what it produces today.
    expect(stampedVersion('4.0.6')).toBe('4.0.6');
    expect(versionLabel({ version: '4.0.6' })).toBeNull();

    // Under CI the build number becomes a fourth component, which is what
    // makes the browser see a reload as an upgrade.
    expect(stampedVersion('4.0.6', '312')).toBe('4.0.6.312');
    expect(
      versionLabel({
        version: '4.0.6',
        build: '312',
        branch: 'main',
        commit: '014f6294d81247c42422557d85509830e46e240f',
      })
    ).toBe('4.0.6 (main #312, 014f629)');
    expect(versionLabel({ version: '4.0.6', build: '2', branch: 'PR-329' })).toBe(
      '4.0.6 (PR-329 #2)'
    );
  });

  test('manifest version stays loadable for prereleases and huge builds', () => {
    const {
      stampedVersion,
      versionLabel,
    } = require('../../../scripts/build-version');

    // Chrome rejects a manifest version that is not 1-4 integers, so the
    // prerelease suffix has to live in version_name instead.
    expect(stampedVersion('3.8.5-beta4')).toBe('3.8.5');
    expect(versionLabel({ version: '3.8.5-beta4' })).toBe('3.8.5-beta4');
    expect(stampedVersion('3.8.5-beta4', '7')).toBe('3.8.5.7');

    // Each component must stay under 65536 rather than failing the build.
    expect(stampedVersion('4.0.6', 65536)).toBe('4.0.6.0');
    expect(() => stampedVersion('4.0.6', 'main')).toThrow(/non-negative/);
    expect(() => stampedVersion('nope')).toThrow(/invalid semver/);
  });

  test('android gradle versions match package.json via versionCode encoding', () => {
    const {
      versionCodeFromSemver,
    } = require('../../../scripts/sync-mobile-version');
    const gradle = fs.readFileSync(
      path.join(root, 'android/app/build.gradle'),
      'utf8'
    );
    const expectedCode = versionCodeFromSemver(packageJson.version);
    expect(versionCodeFromSemver('4.0.5')).toBe(40005);
    expect(versionCodeFromSemver('10.2.3')).toBe(100203);
    expect(() => versionCodeFromSemver('4.100.0')).toThrow(/0–99/);
    expect(gradle).toMatch(
      new RegExp(`versionName\\s+"${packageJson.version.replace(/\./g, '\\.')}"`)
    );
    expect(gradle).toMatch(new RegExp(`versionCode\\s+${expectedCode}\\b`));
  });

  test('android build stamp names the build without moving versionCode', () => {
    const {
      parseArgs,
      syncMobileVersion,
    } = require('../../../scripts/sync-mobile-version');

    expect(parseArgs(['--build', '312'])).toEqual({
      version: null,
      build: '312',
    });
    expect(parseArgs(['4.0.6'])).toEqual({ version: '4.0.6', build: null });
    expect(() => parseArgs(['--build', 'main'])).toThrow(/non-negative/);

    // Store codes must not depend on which Jenkins job built the APK, so only
    // the display name carries the build number.
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    try {
      expect(syncMobileVersion('4.0.6')).toMatchObject({
        versionName: '4.0.6',
        versionCode: 40006,
      });
      expect(syncMobileVersion('4.0.6', { build: '312' })).toMatchObject({
        versionName: '4.0.6.312',
        versionCode: 40006,
      });
    } finally {
      fs.writeFileSync.mockRestore();
    }
  });

  test('ios Info.plist versions match package.json via versionCode encoding', () => {
    const {
      versionCodeFromSemver,
    } = require('../../../scripts/sync-mobile-version');
    const plist = fs.readFileSync(
      path.join(root, 'ios/App/App/Info.plist'),
      'utf8'
    );
    const expectedCode = versionCodeFromSemver(packageJson.version);
    const escaped = packageJson.version.replace(/\./g, '\\.');
    expect(plist).toMatch(
      new RegExp(
        `<key>CFBundleShortVersionString</key>\\s*<string>${escaped}</string>`
      )
    );
    expect(plist).toMatch(
      new RegExp(
        `<key>CFBundleVersion</key>\\s*<string>${expectedCode}</string>`
      )
    );
    expect(plist).toContain('NSCameraUsageDescription');
    expect(plist).toMatch(/Keystone QR/);
  });

  test('runtime version consumers import package.json, not the extension manifest', () => {
    const about = fs.readFileSync(
      path.join(root, 'src/ui/app/components/about.jsx'),
      'utf8'
    );
    const settings = fs.readFileSync(
      path.join(root, 'src/ui/app/pages/settings.jsx'),
      'utf8'
    );
    const migration = fs.readFileSync(
      path.join(root, 'src/migrations/migration.js'),
      'utf8'
    );
    const provider = fs.readFileSync(
      path.join(root, 'src/config/provider.js'),
      'utf8'
    );
    expect(about).toMatch(/require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/package\.json['"]\)/);
    expect(about).toContain('data-testid="settings-app-version"');
    expect(about).toContain('data-testid="settings-about"');
    expect(settings).toContain('AboutContent');
    expect(migration).toMatch(/require\(['"]\.\.\/\.\.\/package\.json['"]\)/);
    expect(provider).toMatch(/from ['"]\.\.\/\.\.\/package\.json['"]/);
  });
});
