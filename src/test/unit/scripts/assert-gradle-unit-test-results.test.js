const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '../../../..');
const script = path.join(root, 'scripts/assert-gradle-unit-test-results.py');

function writeSuite(dir, fileName, { tests, failures = 0, errors = 0 }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, fileName),
    `<?xml version="1.0"?>\n<testsuite name="x" tests="${tests}" failures="${failures}" errors="${errors}" skipped="0"></testsuite>\n`
  );
}

function run(resultDir) {
  return spawnSync('python3', [script, resultDir], { encoding: 'utf8' });
}

describe('assert-gradle-unit-test-results', () => {
  test('fails when the results directory is missing', () => {
    const dir = path.join(os.tmpdir(), `gradle-results-missing-${process.pid}`);
    fs.rmSync(dir, { recursive: true, force: true });
    const result = run(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no JUnit XML/);
  });

  test('fails when reports exist but ran 0 tests', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-results-empty-'));
    writeSuite(dir, 'TEST-empty.xml', { tests: 0 });
    const result = run(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/ran 0 tests/);
  });

  test('fails when a suite reported failures', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-results-fail-'));
    writeSuite(dir, 'TEST-fail.xml', { tests: 2, failures: 1 });
    const result = run(dir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/failures or errors/);
  });

  test('passes when at least one test succeeded', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-results-ok-'));
    writeSuite(
      dir,
      'TEST-xyz.lucem.wallet.EdgeGestureExclusionTest.xml',
      { tests: 3 }
    );
    const result = run(dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/3 tests/);
  });
});
