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
