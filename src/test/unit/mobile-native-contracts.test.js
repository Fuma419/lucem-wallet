/**
 * Native store contracts that webpack / Playwright cannot see. Keep these
 * assertions in Jest so an extension-only change cannot drop Android/iOS
 * permissions the packaged apps need.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../..');
const androidManifest = fs.readFileSync(
  path.join(root, 'android/app/src/main/AndroidManifest.xml'),
  'utf8'
);
const iosInfoPlist = fs.readFileSync(
  path.join(root, 'ios/App/App/Info.plist'),
  'utf8'
);

describe('Android Keystone camera', () => {
  test('declares CAMERA because the Capacitor Camera plugin does not merge it', () => {
    expect(androidManifest).toMatch(
      /<uses-permission android:name="android.permission.CAMERA" \/>/
    );
    expect(androidManifest).toMatch(
      /<uses-feature android:name="android.hardware.camera" android:required="false" \/>/
    );
  });

  test('does not require a camera so USB-only phones can still install', () => {
    expect(androidManifest).not.toMatch(
      /android.hardware.camera" android:required="true"/
    );
  });
});

describe('Android backup', () => {
  test('disables Auto Backup of the WebView wallet store', () => {
    expect(androidManifest).toMatch(/android:allowBackup="false"/);
    expect(androidManifest).not.toMatch(/android:allowBackup="true"/);
  });

  test('excludes cloud backup and device-to-device transfer', () => {
    expect(androidManifest).toMatch(
      /android:dataExtractionRules="@xml\/data_extraction_rules"/
    );
    const rules = fs.readFileSync(
      path.join(root, 'android/app/src/main/res/xml/data_extraction_rules.xml'),
      'utf8'
    );
    expect(rules).toMatch(/<cloud-backup>/);
    expect(rules).toMatch(/<device-transfer>/);
    expect(rules).toMatch(/<exclude domain="root" \/>/);
  });
});

describe('iOS App Store export compliance', () => {
  test('declares exempt encryption so TestFlight upload is not blocked', () => {
    expect(iosInfoPlist).toMatch(
      /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/
    );
  });
});

describe('iOS required device capabilities', () => {
  test('requires arm64 so App Store does not list 32-bit iPhones', () => {
    expect(iosInfoPlist).toMatch(
      /<key>UIRequiredDeviceCapabilities<\/key>\s*<array>\s*<string>arm64<\/string>\s*<\/array>/
    );
    expect(iosInfoPlist).not.toMatch(/<string>armv7<\/string>/);
  });
});

describe('Android gradle tests', () => {
  test('does not keep Capacitor template tests under com.getcapacitor.myapp', () => {
    expect(
      fs.existsSync(
        path.join(
          root,
          'android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java'
        )
      )
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          root,
          'android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java'
        )
      )
    ).toBe(false);
  });

  test('ships Lucem host and device tests under xyz.lucem.wallet', () => {
    expect(
      fs.existsSync(
        path.join(
          root,
          'android/app/src/test/java/xyz/lucem/wallet/EdgeGestureExclusionTest.java'
        )
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          root,
          'android/app/src/androidTest/java/xyz/lucem/wallet/PackageIdentityInstrumentedTest.java'
        )
      )
    ).toBe(true);
    const instrumented = fs.readFileSync(
      path.join(
        root,
        'android/app/src/androidTest/java/xyz/lucem/wallet/PackageIdentityInstrumentedTest.java'
      ),
      'utf8'
    );
    expect(instrumented).toMatch(/assertEquals\("xyz\.lucem\.wallet"/);
    expect(instrumented).not.toMatch(/assertEquals\("com\.getcapacitor/);
  });
});

describe('Android FileProvider paths', () => {
  const filePaths = fs.readFileSync(
    path.join(root, 'android/app/src/main/res/xml/file_paths.xml'),
    'utf8'
  );

  test('does not share the device external storage tree', () => {
    expect(filePaths).not.toMatch(/<external-path\b/);
    expect(filePaths).not.toMatch(/<root-path\b/);
  });

  test('only shares app cache and app-private Pictures', () => {
    expect(filePaths).toMatch(/<cache-path name="my_cache_images" path="\." \/>/);
    expect(filePaths).toMatch(
      /<external-files-path name="my_images" path="Pictures\/" \/>/
    );
  });

  test('FileProvider itself is not exported', () => {
    expect(androidManifest).toMatch(
      /<provider[\s\S]*?android:name="androidx\.core\.content\.FileProvider"[\s\S]*?android:exported="false"/
    );
    expect(androidManifest).toMatch(
      /android:authorities="\$\{applicationId\}\.fileprovider"/
    );
  });
});

describe('Mobile Android CI', () => {
  const ciScript = fs.readFileSync(
    path.join(root, 'scripts/ci-mobile-android.sh'),
    'utf8'
  );
  const jenkinsfile = fs.readFileSync(path.join(root, 'Jenkinsfile'), 'utf8');

  test('runs host unit tests as well as assembleDebug', () => {
    expect(ciScript).toMatch(/assembleDebug/);
    expect(ciScript).toMatch(/testDebugUnitTest/);
  });

  test('hard-gates Mobile Android without skipping later Jenkins stages', () => {
    expect(jenkinsfile).toMatch(
      /catchError\(buildResult: 'FAILURE', stageResult: 'FAILURE'\)/
    );
    expect(jenkinsfile).toMatch(
      /publishGithubStatus\('Mobile Android', 'failure', 'Mobile Android failed in Jenkins'\)/
    );
    expect(jenkinsfile).not.toMatch(/soft-gated/);
    expect(jenkinsfile).toMatch(
      /return \['Build', 'Unit tests', 'Mobile Android', 'Integration tests', 'Functional tests'\]/
    );
  });
});

describe('iOS is not in Jenkins', () => {
  const jenkinsfile = fs.readFileSync(path.join(root, 'Jenkinsfile'), 'utf8');
  const mobileMd = fs.readFileSync(path.join(root, 'MOBILE.md'), 'utf8');
  const agentsMd = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

  test('Jenkinsfile has no iOS or xcodebuild stage that would fail on Linux', () => {
    expect(jenkinsfile).not.toMatch(/stage\(['"]iOS/);
    expect(jenkinsfile).not.toMatch(/xcodebuild/);
    expect(jenkinsfile).not.toMatch(/npx cap sync ios/);
    expect(jenkinsfile).toMatch(/iOS is intentionally omitted/);
  });

  test('docs say Jenkins does not build iOS', () => {
    expect(mobileMd).toMatch(/Jenkins does not build iOS|Not in Jenkins/);
    expect(agentsMd).toMatch(/iOS is not in Jenkins/);
  });

  test('PR template says Jenkins does not cover iOS', () => {
    const template = fs.readFileSync(
      path.join(root, '.github/pull_request_template.md'),
      'utf8'
    );
    expect(template).toMatch(/iOS is not in Jenkins/);
    expect(template).toMatch(/Mobile Android/);
    expect(template).toMatch(/Functional tests/);
  });
});
