/**
 * Fail the unit suite if the money-path TypeScript project does not typecheck.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '../../../..');

describe('money-path TypeScript', () => {
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
