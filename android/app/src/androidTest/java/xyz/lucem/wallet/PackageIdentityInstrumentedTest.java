package xyz.lucem.wallet;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Device-side identity checks. Package id must be Lucem, not the Capacitor
 * template default.
 */
@RunWith(AndroidJUnit4.class)
public class PackageIdentityInstrumentedTest {

  @Test
  public void applicationIdIsLucemWallet() {
    Context appContext =
      InstrumentationRegistry.getInstrumentation().getTargetContext();
    assertEquals("xyz.lucem.wallet", appContext.getPackageName());
  }

  @Test
  public void autoBackupFlagIsOff() {
    Context appContext =
      InstrumentationRegistry.getInstrumentation().getTargetContext();
    ApplicationInfo info = appContext.getApplicationInfo();
    assertEquals(
      0,
      info.flags & ApplicationInfo.FLAG_ALLOW_BACKUP
    );
  }
}
