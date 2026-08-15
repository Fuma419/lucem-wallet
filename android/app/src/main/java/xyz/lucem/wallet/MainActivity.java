package xyz.lucem.wallet;

import android.graphics.Rect;
import android.os.Bundle;
import android.view.View;
import android.view.ViewTreeObserver;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;

/**
 * Capacitor host. Also keeps Android's edge-back gesture handle off the
 * mid-screen left/right edges so create/import seed grids are usable.
 */
public class MainActivity extends BridgeActivity {
  private static final int EXCLUSION_WIDTH_DP = 48;
  private static final int EXCLUSION_HEIGHT_DP = 200;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
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

  private void applyEdgeGestureExclusion(View view) {
    int width = view.getWidth();
    int height = view.getHeight();
    if (width <= 0 || height <= 0) {
      return;
    }
    float density = getResources().getDisplayMetrics().density;
    int edge = Math.max(1, Math.round(EXCLUSION_WIDTH_DP * density));
    int excludeH = Math.min(height, Math.round(EXCLUSION_HEIGHT_DP * density));
    int top = Math.max(0, (height - excludeH) / 2);
    Rect left = new Rect(0, top, Math.min(edge, width), top + excludeH);
    Rect right = new Rect(Math.max(0, width - edge), top, width, top + excludeH);
    view.setSystemGestureExclusionRects(Arrays.asList(left, right));
  }
}
