const fs = require('fs');
const path = require('path');

describe('android CLI env helper', () => {
  const envSrc = fs.readFileSync(
    path.join(__dirname, '../../../../scripts/android-env.sh'),
    'utf8'
  );
  const installSrc = fs.readFileSync(
    path.join(__dirname, '../../../../scripts/android-install.sh'),
    'utf8'
  );
  const pkg = fs.readFileSync(
    path.join(__dirname, '../../../../package.json'),
    'utf8'
  );

  test('prefers JDK 17+ over sdkman Java 11', () => {
    expect(envSrc).toContain('java_home');
    expect(envSrc).toMatch(/for v in 21 17/);
    expect(envSrc).toContain('platform-tools');
  });

  test('install script sources the env helper and launches Lucem', () => {
    expect(installSrc).toContain('android-env.sh');
    expect(installSrc).toContain('assembleDebug');
    expect(installSrc).toContain('adb install');
    expect(pkg).toContain('mobile:android:install');
  });
});
