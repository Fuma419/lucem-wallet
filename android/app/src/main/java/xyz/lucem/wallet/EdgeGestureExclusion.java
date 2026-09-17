package xyz.lucem.wallet;

/**
 * Mid-screen left/right exclusion bands so Android's edge-back gesture does
 * not steal taps from the create/import seed grid. Pure math so JVM unit
 * tests can cover it without Robolectric.
 */
final class EdgeGestureExclusion {
  static final int WIDTH_DP = 48;
  static final int HEIGHT_DP = 200;

  private EdgeGestureExclusion() {}

  static final class Band {
    final int left;
    final int top;
    final int right;
    final int bottom;

    Band(int left, int top, int right, int bottom) {
      this.left = left;
      this.top = top;
      this.right = right;
      this.bottom = bottom;
    }
  }

  static Band[] midEdges(int widthPx, int heightPx, float density) {
    if (widthPx <= 0 || heightPx <= 0) {
      return new Band[0];
    }
    int edge = Math.max(1, Math.round(WIDTH_DP * density));
    int excludeH = Math.min(heightPx, Math.round(HEIGHT_DP * density));
    int top = Math.max(0, (heightPx - excludeH) / 2);
    Band left = new Band(0, top, Math.min(edge, widthPx), top + excludeH);
    Band right =
      new Band(Math.max(0, widthPx - edge), top, widthPx, top + excludeH);
    return new Band[] { left, right };
  }
}
