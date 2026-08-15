/**
 * Fail the unit suite if the src/api TypeScript/checkJs project does not typecheck.
 * UI is intentionally outside this program.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../../..');

describe('src/api TypeScript + checkJs', () => {
  test('tsconfig.api.json enables checkJs for src/api and excludes UI', () => {
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(root, 'tsconfig.api.json'), 'utf8')
    );
    expect(tsconfig.compilerOptions.checkJs).toBe(true);
    expect(tsconfig.include).toEqual(
      expect.arrayContaining(['src/api/**/*.ts', 'src/api/**/*.js'])
    );
    expect(tsconfig.exclude).toContain('src/ui');
    expect(JSON.stringify(tsconfig.include)).not.toMatch(/src\/ui/);
  });

  test('tsc -p tsconfig.api.json', () => {
    execFileSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '-p',
        'tsconfig.api.json',
        '--pretty',
        'false',
      ],
      { cwd: root, stdio: 'pipe' }
    );
  });
});
