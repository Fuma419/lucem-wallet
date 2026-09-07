const fs = require('fs');
const path = require('path');
const {
  isVercelPreviewDeploy,
} = require('../../../ui/app/components/stagingEnv');

describe('Vercel staging hosting', () => {
  const vercel = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../../vercel.json'), 'utf8')
  );
  const webpackSrc = fs.readFileSync(
    path.join(__dirname, '../../../../webpack.config.js'),
    'utf8'
  );
  const themeSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/theme.jsx'),
    'utf8'
  );
  const bannerSrc = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/stagingBanner.jsx'),
    'utf8'
  );
  const css = fs.readFileSync(
    path.join(__dirname, '../../../ui/app/components/styles.css'),
    'utf8'
  );

  test('ignoreCommand builds Production and the staging branch, skips other Previews', () => {
    const cmd = vercel.ignoreCommand;
    expect(cmd).toContain('VERCEL_ENV');
    expect(cmd).toContain('production');
    expect(cmd).toContain('VERCEL_GIT_COMMIT_REF');
    expect(cmd).toContain('staging');
    expect(cmd).toContain('exit 1');
    expect(cmd).toContain('exit 0');
    expect(cmd).toContain('Skipping Vercel preview deployment');
    expect(cmd).toContain('staging branch');
  });

  test('webpack inlines VERCEL_ENV for the staging chip', () => {
    expect(webpackSrc).toMatch(/VERCEL_ENV:\s*process\.env\.VERCEL_ENV \|\| ''/);
  });

  test('theme mounts the staging banner', () => {
    expect(themeSrc).toContain("from './app/components/stagingBanner'");
    expect(themeSrc).toContain('<StagingBanner />');
    expect(bannerSrc).toContain("from './stagingEnv'");
    expect(bannerSrc).toContain('isVercelPreviewDeploy');
    expect(bannerSrc).toContain('data-testid="lucem-staging-banner"');
    expect(css).toMatch(
      /\.lucem-staging-banner \{[\s\S]*?pointer-events:\s*none/
    );
  });

  test('isVercelPreviewDeploy is true only for Vercel Preview', () => {
    expect(isVercelPreviewDeploy('preview')).toBe(true);
    expect(isVercelPreviewDeploy('production')).toBe(false);
    expect(isVercelPreviewDeploy('development')).toBe(false);
    expect(isVercelPreviewDeploy('')).toBe(false);
    expect(isVercelPreviewDeploy(undefined)).toBe(false);
  });
});
