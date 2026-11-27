package expo.modules.headmap.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Port of PanoramaTests.swift. */
class PanoramaTest {
  @Test fun twentyFiveRegionsCoverTheWholeHead() {
    val seen = mutableSetOf<Int>()
    for (az in 0 until 360 step 5) for (el in 0..90 step 5) seen.add(PanoramaCells.cell(az.toDouble(), el.toDouble()))
    assertEquals((0 until PanoramaCells.COUNT).toSet(), seen)
    for (c in 0 until PanoramaCells.COUNT) {
      val ctr = PanoramaCells.centre(c)
      assertEquals(c, PanoramaCells.cell(ctr.azimuth, ctr.elevation))
    }
  }

  @Test fun faceSweepCoversTheFrontHalfAndTiltingDownGoesHigher() {
    val front = PanoramaCells.faceAngles(0.0, 0.0)
    assertEquals(0, PanoramaCells.cell(front.azimuth, front.elevation))
    val turned = PanoramaCells.faceAngles(-65.0, 0.0)
    assertEquals(2, PanoramaCells.cell(turned.azimuth, turned.elevation))
    val other = PanoramaCells.faceAngles(65.0, 0.0)
    assertEquals(9, PanoramaCells.cell(other.azimuth, other.elevation))
    val down = PanoramaCells.faceAngles(0.0, -30.0)
    assertEquals(PanoramaCells.SLICES, PanoramaCells.cell(down.azimuth, down.elevation))
  }

  @Test fun backPartStartsAtTheBackAndFollowsThePhoneRound() {
    val start = PanoramaCells.backAngles(40.0, 40.0, 10.0)
    assertEquals(180.0, start.azimuth)
    assertEquals(6, PanoramaCells.cell(start.azimuth, start.elevation))
    assertEquals(7, PanoramaCells.cell(PanoramaCells.backAngles(75.0, 40.0, 10.0).azimuth, 10.0))
    assertEquals(PanoramaCells.TOP, PanoramaCells.backAngles(0.0, 0.0, 80.0).let { PanoramaCells.cell(it.azimuth, it.elevation) })
  }

  @Test fun collectorKeepsTheBestFramePerRegion() {
    val c = PanoramaCollector<String>()
    assertTrue(c.offer(3, 80.0, "a", 100.0, 10.0, PanoramaMode.FACE))
    assertFalse(c.wants(3, 84.0))
    assertFalse(c.offer(3, 90.0, "b", 100.0, 10.0, PanoramaMode.FACE))
    assertEquals("b", c.entries[3]!!.frame)
    assertEquals(listOf(3), c.filled)
    assertFalse(c.isComplete)
    for (i in 0 until PanoramaCells.COUNT) c.offer(i, 50.0, "x", 0.0, 0.0, PanoramaMode.BACK)
    assertTrue(c.isComplete)
  }
}
