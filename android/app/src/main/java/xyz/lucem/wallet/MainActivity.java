package xyz.lucem.wallet;

import android.graphics.Color;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;

/**
 * Capacitor host. Also keeps Android's edge-back gesture handle off the
 * mid-screen left/right edges so create/import seed grids are usable.
 */
public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applySystemChrome();
    final View content = findViewById(android.R.id.content);
    if (content == null) {
      return;
    }
    content
      .getViewTreeObserver()
      .addOnGlobalLayoutListener(
        new ViewTreeObserver.OnGlobalLayoutListener() {
          @Override
          public void onGlobalLayout() {
            View target = content;
            if (getBridge() != null && getBridge().getWebView() != null) {
              target = getBridge().getWebView();
            }
            applyEdgeGestureExclusion(target);
          }
        }
      );
  }

  /**
   * Keep the WebView below the status bar / display cutout. Target SDK 35
   * otherwise paints the wallet into the centered punch-hole camera.
   */
  private void applySystemChrome() {
    Window window = getWindow();
    if (window == null) {
      return;
    }
    WindowCompat.setDecorFitsSystemWindows(window, true);
    window.setStatusBarColor(Color.parseColor("#080808"));
    window.setNavigationBarColor(Color.parseColor("#080808"));
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams params = window.getAttributes();
      params.layoutInDisplayCutoutMode =
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
      window.setAttributes(params);
    }
    WindowInsetsControllerCompat insets =
      WindowCompat.getInsetsController(window, window.getDecorView());
    insets.setAppearanceLightStatusBars(false);
  }

  private void applyEdgeGestureExclusion(View view) {
    EdgeGestureExclusion.Band[] bands = EdgeGestureExclusion.midEdges(
      view.getWidth(),
      view.getHeight(),
      getResources().getDisplayMetrics().density
    );
    if (bands.length == 0) {
      return;
    }
    view.setSystemGestureExclusionRects(
      Arrays.asList(
        new Rect(bands[0].left, bands[0].top, bands[0].right, bands[0].bottom),
        new Rect(bands[1].left, bands[1].top, bands[1].right, bands[1].bottom)
      )
    );
  }
}
