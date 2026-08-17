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
      /\.\.\.manifest[\s\S]{0,120}version:\s*process\.env\.npm_package_version/
    );
    // The old bug: inject package fields then spread manifest over them.
    expect(webpackSrc).not.toMatch(
      /version:\s*process\.env\.npm_package_version[\s\S]{0,80}\.\.\.JSON\.parse/
    );
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
