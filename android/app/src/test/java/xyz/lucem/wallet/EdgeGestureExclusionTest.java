package xyz.lucem.wallet;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * Host-side check that the seed-grid exclusion bands stay in the vertical
 * middle of the screen. Replaces Capacitor's 2+2 placeholder.
 */
public class EdgeGestureExclusionTest {

  @Test
  public void emptyLayoutHasNoBands() {
    assertEquals(0, EdgeGestureExclusion.midEdges(0, 1920, 1f).length);
    assertEquals(0, EdgeGestureExclusion.midEdges(1080, 0, 1f).length);
  }

  @Test
  public void mdpiPhoneKeeps48dpEdgesInTheVerticalMiddle() {
    EdgeGestureExclusion.Band[] bands =
      EdgeGestureExclusion.midEdges(1080, 1920, 1f);
    assertEquals(2, bands.length);

    assertEquals(0, bands[0].left);
    assertEquals(48, bands[0].right);
    assertEquals(860, bands[0].top);
    assertEquals(1060, bands[0].bottom);

    assertEquals(1032, bands[1].left);
    assertEquals(1080, bands[1].right);
    assertEquals(bands[0].top, bands[1].top);
    assertEquals(bands[0].bottom, bands[1].bottom);
  }

  @Test
  public void xhdpiScalesEdgeWidthAndKeepsBandsOnScreen() {
    EdgeGestureExclusion.Band[] bands =
      EdgeGestureExclusion.midEdges(1080, 1920, 2f);
    assertEquals(2, bands.length);
    assertEquals(96, bands[0].right);
    assertEquals(984, bands[1].left);
    assertTrue(bands[0].bottom <= 1920);
    assertTrue(bands[1].left >= 0);
  }
}
