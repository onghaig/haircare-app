package expo.modules.headmap.core

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Port of HairlineMeasurerTests.swift. */
class HairlineMeasurerTest {
  private val measurer = HairlineMeasurer()
  private val tol = 0.04 // IPD; about 2.5 mm, under the 3.4 mm minimum detectable change

  private fun measure(ipd: Double = 100.0, roll: Double = 0.0, hairCentre: Double = 1.0, hairTemple: Double = 1.3, maskScale: Int = 1, noHair: Boolean = false): HairlineMeasure {
    val w = (ipd * 5).toInt()
    val h = (ipd * 6).toInt()
    val c = Point(w / 2.0, h * 0.55)
    val lm = Fixture.landmarks(c, ipd, roll)
    val hair = Fixture.hairMask(w, h, c, ipd, roll, hairCentre, hairTemple, maskScale, noHair)
    return measurer.measure(lm, hair)
  }

  @Test fun levelFaceMeasuresCentreAndTemples() {
    val m = measure()
    assertEquals(1.0, m.centreIPD!!, tol)
    assertEquals(1.3, m.leftTempleIPD!!, tol)
    assertEquals(1.3, m.rightTempleIPD!!, tol)
    assertEquals(0.3, m.templeRecessionIPD!!, tol)
    assertTrue(m.foreheadVisible)
    assertTrue(m.hairlineFound)
    assertEquals(100.0, m.interPupilPx, 1e-9)
  }

  @Test fun convertsToMillimetresWithA63mmPupilDistance() {
    val m = measure()
    assertEquals(m.centreIPD!! * 63, m.centreMM!!, 1e-9)
    assertEquals(63.0, m.centreMM!!, tol * 63)
  }

  @Test fun tiltedHeadGivesTheSameResult() {
    for (roll in listOf(-12.0, 8.0)) {
      val m = measure(roll = roll)
      assertEquals(1.0, m.centreIPD!!, tol, "roll $roll")
      assertEquals(1.3, m.leftTempleIPD!!, tol, "roll $roll")
      assertEquals(1.3, m.rightTempleIPD!!, tol, "roll $roll")
    }
  }

  @Test fun cameraDistanceCancelsOut() {
    val near = measure(ipd = 120.0)
    val far = measure(ipd = 60.0)
    assertEquals(near.centreIPD!!, far.centreIPD!!, tol)
    assertEquals(near.leftTempleIPD!!, far.leftTempleIPD!!, tol)
  }

  @Test fun lowResolutionMaskStillWorks() {
    assertEquals(1.0, measure(maskScale = 2).centreIPD!!, tol * 1.5)
  }

  @Test fun detectsRecedingTemples() {
    assertEquals(0.8, measure(hairCentre = 1.0, hairTemple = 1.8).templeRecessionIPD!!, tol)
  }

  @Test fun fringeOnTheForeheadFailsTheForeheadCheck() {
    assertFalse(measure(hairCentre = 0.25, hairTemple = 0.25).foreheadVisible)
  }

  @Test fun noHairFound() {
    val m = measure(noHair = true)
    assertNull(m.centreIPD)
    assertNull(m.templeRecessionIPD)
    assertFalse(m.hairlineFound)
    assertTrue(m.curve.isEmpty())
  }

  @Test fun curveFollowsTheHairlineInImageCoordinates() {
    val ipd = 100.0
    val m = measure(ipd = ipd, roll = 10.0)
    assertTrue(m.curve.size > 35)
    val c = Point(250.0, 330.0)
    val r = -10 * PI / 180
    for (p in m.curve) {
      val ix = p.x - c.x
      val iy = p.y - c.y
      val lx = (cos(r) * ix - sin(r) * iy) / ipd
      val ly = (sin(r) * ix + cos(r) * iy) / ipd
      assertEquals(-0.35 - Fixture.hairHeight(lx, 1.0, 1.3), ly, 0.05)
    }
  }
}
