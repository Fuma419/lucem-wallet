const fs = require('fs');
const path = require('path');

describe('build:all local release shortcut', () => {
  const root = path.join(__dirname, '../../../..');
  const script = fs.readFileSync(
    path.join(root, 'scripts/build-all.sh'),
    'utf8'
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  );
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  test('package.json exposes build:all', () => {
    expect(pkg.scripts['build:all']).toBe('bash scripts/build-all.sh');
  });

  test('pulls origin main by default and can skip or stay on the current branch', () => {
    expect(script).toContain('git fetch origin');
    expect(script).toContain('git pull --ff-only origin main');
    expect(script).toContain('--no-pull');
    expect(script).toContain('--current');
  });

  test('builds webpack, zips build/ for the extension, and assembles a debug APK', () => {
    expect(script).toContain('npm run mobile:build');
    expect(script).toContain('zip -qry');
    expect(script).toContain('lucem-wallet-${VERSION}-extension.zip');
    expect(script).toContain('npx cap sync android');
    expect(script).toContain('assembleDebug');
    expect(script).toContain('npx cap sync ios');
  });

  test('does not deploy or upload store binaries', () => {
    expect(script).not.toMatch(/vercel deploy/);
    expect(script).not.toMatch(/repo-release/);
    expect(script).toMatch(/Play AAB/);
    expect(script).toMatch(/TestFlight/);
  });

  test('dist/ is gitignored and README documents the shortcut', () => {
    expect(gitignore).toMatch(/^\/dist$/m);
    expect(readme).toContain('npm run build:all');
  });
});
