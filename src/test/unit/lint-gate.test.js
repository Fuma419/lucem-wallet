/**
 * Lint is a CI gate, and it has to stay pointed at the code that matters.
 *
 * Before this gate existed, `signData.jsx` called an undefined `capture()` for
 * long enough to ship: a dApp got a ReferenceError instead of the signature the
 * user had approved. ESLint reported it as a no-undef error the whole time, but
 * nothing ran ESLint, and `.eslintignore` excluded the wallet's most critical
 * files while linting the generated WASM tree that nobody edits.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('lint gate', () => {
  const ignore = read('.eslintignore');
  const ignored = ignore
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  test('CI runs lint, and package.json exposes it', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.lint).toMatch(/eslint/);
    // Errors must fail the stage; --max-warnings would freeze the warning count.
    expect(pkg.scripts.lint).not.toMatch(/--max-warnings/);

    const jenkins = read('Jenkinsfile');
    expect(jenkins).toMatch(/stage\('Lint'\)/);
    expect(jenkins).toMatch(/npm run lint/);
    expect(jenkins).toMatch(/publishGithubStatus\('Lint', 'failure'/);
  });

  test('lint runs before the build, so it fails fast', () => {
    const jenkins = read('Jenkinsfile');
    expect(jenkins.indexOf("stage('Lint')")).toBeLessThan(
      jenkins.indexOf("stage('Build')")
    );
  });

  test('generated code is ignored — it is never hand-edited', () => {
    expect(ignored).toContain('src/wasm/');
    expect(ignored).toContain('android/app/src/main/assets/');
  });

  test('no hand-written source file is excluded from linting', () => {
    // Whole directories of generated output may be ignored; individual source
    // files may not. That is how the critical files disappeared before.
    const sourceFiles = ignored.filter((entry) => /\.(js|jsx|ts|tsx)$/.test(entry));
    expect(sourceFiles).toEqual([]);
  });

  test('the files that move funds are linted', () => {
    for (const critical of [
      'src/api/extension/wallet.js', // initTx / buildTx / signAndSubmit
      'src/api/extension/index.js', // CIP-30 surface
      'src/api/loader.js',
      'src/ui/app/pages/send.jsx',
      'src/ui/app/pages/signData.jsx',
      'src/ui/app/pages/signTx.jsx',
    ]) {
      expect(ignore).not.toContain(critical);
    }
  });

  test('tests are linted too, with the jest globals they need', () => {
    expect(ignored).not.toContain('*.test.js');
    expect(ignored).not.toContain('*.spec.js');
    const config = read('.eslintrc');
    expect(config).toMatch(/"env":\s*\{\s*"jest":\s*true\s*\}/);
  });
});
