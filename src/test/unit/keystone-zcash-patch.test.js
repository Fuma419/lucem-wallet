const fs = require('fs');
const path = require('path');

describe('keystone zcash registry patch', () => {
  const root = path.join(__dirname, '../..', '..');
  const patchFile = path.join(
    root,
    'patches/@keystonehq+bc-ur-registry-zcash+0.1.2.patch'
  );

  test('postinstall is wired to reapply patches after npm ci', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.postinstall).toBe('patch-package');
    expect(pkg.devDependencies['patch-package']).toBeTruthy();
    expect(fs.existsSync(patchFile)).toBe(true);
  });

  test('the installed package no longer logs on import, and still registers tags', () => {
    const cjs = fs.readFileSync(
      require.resolve('@keystonehq/bc-ur-registry-zcash'),
      'utf8'
    );
    expect(cjs).not.toMatch(/Registering Zcash UR Registry Types/);
    expect(cjs).toMatch(/patchTags/);

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.isolateModules(() => {
      require('@keystonehq/bc-ur-registry-zcash');
    });
    const logged = spy.mock.calls.flat().join('\n');
    spy.mockRestore();
    expect(logged).not.toMatch(/Registering Zcash UR Registry Types/);
  });
});
