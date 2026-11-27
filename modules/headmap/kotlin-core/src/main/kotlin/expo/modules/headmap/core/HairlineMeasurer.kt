package expo.modules.headmap.core

import kotlin.math.atan2

/**
 * Hairline position from one front view: distance from the brow line up to the hairline at the
 * centre and above each temple, divided by the distance between the pupils (so camera distance
 * cancels out), shown in estimated mm using a 63 mm average pupil distance.
 * Port of HairlineMeasurer.swift (itself a port of photo-model-v0/vision/headmap.py).
 */
data class HairlineMeasure(
  val centreIPD: Double?,
  val leftTempleIPD: Double?,
  val rightTempleIPD: Double?,
  /** Mean temple height minus centre height. Positive means the temples sit higher (receded). */
  val templeRecessionIPD: Double?,
  /** Hairline trace in image pixel coordinates, for the overlay. */
  val curve: List<Point>,
  /** Skin, not hair or a fringe, just above the brows. */
  val foreheadVisible: Boolean,
  val interPupilPx: Double,
) {
  val centreMM: Double? get() = centreIPD?.times(HairlineMeasurer.MEAN_INTER_PUPIL_MM)
  val leftTempleMM: Double? get() = leftTempleIPD?.times(HairlineMeasurer.MEAN_INTER_PUPIL_MM)
  val rightTempleMM: Double? get() = rightTempleIPD?.times(HairlineMeasurer.MEAN_INTER_PUPIL_MM)
  val hairlineFound: Boolean get() = centreIPD != null
}

class HairlineMeasurer(
  /** Smoothed hair confidence above which a row counts as hair. */
  val hairThreshold: Double = 0.5,
  /** How far above the brows to search, in pupil distances. */
  val searchHeightIPD: Double = 3.5,
  val curvePoints: Int = 41,
) {
  companion object {
    const val MEAN_INTER_PUPIL_MM = 63.0
  }

  fun measure(lm: FaceLandmarks, hair: HairMask): HairlineMeasure {
    val irisR = lm[LandmarkID.IRIS_RIGHT]
    val irisL = lm[LandmarkID.IRIS_LEFT]
    val eyeMid = (irisR + irisL) * 0.5
    val rot = Rotation(eyeMid, atan2(irisL.y - irisR.y, irisL.x - irisR.x))
    val ipd = lm.interPupil
    val width = hair.imageWidth.toInt()
    val height = hair.imageHeight.toInt()

    fun pr(id: Int) = rot.apply(lm[id])
    val browY = (pr(LandmarkID.BROW_RIGHT_TOP).y + pr(LandmarkID.BROW_LEFT_TOP).y + pr(LandmarkID.GLABELLA).y) / 3
    val xCentre = pr(LandmarkID.GLABELLA).x
    val xRight = pr(LandmarkID.EYE_RIGHT_OUTER).x
    val xLeft = pr(LandmarkID.EYE_LEFT_OUTER).x

    /** Hair confidence in the levelled image at integer pixel (x, y). */
    fun hairLevelled(x: Int, y: Int): Double {
      if (x < 0 || y < 0 || x >= width || y >= height) return 0.0
      val p = rot.invert(Point(x.toDouble(), y.toDouble()))
      return hair.sample(p.x, p.y)
    }

    val y0 = browY.toInt() - 2
    val stop = maxOf((browY - searchHeightIPD * ipd).toInt(), 0)

    /** First row above the brow line where hair dominates, scanning up. */
    fun hairlineY(x: Double): Double? {
      val xi = roundAway(x).toInt()
      if (xi < 0 || xi >= width || ipd <= 0 || y0 <= stop) return null
      val c0 = maxOf(xi - 2, 0)
      val c1 = minOf(xi + 3, width)
      val lo = maxOf(stop - 5, 0)
      val hi = y0 + 2
      val band = DoubleArray(hi - lo + 1)
      for (y in lo..hi) {
        if (y >= height) continue
        var s = 0.0
        for (c in c0 until c1) s += hairLevelled(c, y)
        band[y - lo] = s / (c1 - c0)
      }
      fun smooth(y: Int): Double {
        var s = 0.0
        for (k in -2..2) {
          val yy = y + k
          if (yy in lo..hi && yy < height) s += band[yy - lo]
        }
        return s / 5
      }
      var y = y0
      while (y > stop) {
        if (smooth(y) > hairThreshold && smooth(maxOf(y - 3, 0)) > hairThreshold) return y.toDouble()
        y -= 1
      }
      return null
    }

    fun heightIPD(x: Double): Double? = hairlineY(x)?.let { (browY - it) / ipd }

    val c = heightIPD(xCentre)
    val rt = heightIPD(xRight)
    val lt = heightIPD(xLeft)

    val curve = mutableListOf<Point>()
    val cx0 = xRight - 0.15 * ipd
    val cx1 = xLeft + 0.15 * ipd
    for (i in 0 until curvePoints) {
      val x = cx0 + (cx1 - cx0) * i / maxOf(curvePoints - 1, 1)
      hairlineY(x)?.let { curve += rot.invert(Point(x, it)) }
    }

    val temples = listOfNotNull(rt, lt)
    val recession = if (temples.isEmpty() || c == null) null else temples.sum() / temples.size - c

    // Forehead strip just above the brows should be skin, not hair.
    val r0 = maxOf((browY - 0.35 * ipd).toInt(), 0)
    val r1 = maxOf((browY - 0.05 * ipd).toInt(), 0)
    val f0 = maxOf(minOf(xRight, xLeft).toInt(), 0)
    val f1 = maxOf(maxOf(xRight, xLeft).toInt(), 0)
    var sum = 0.0
    var n = 0
    for (y in r0 until r1) {
      var x = f0
      while (x < f1) {
        sum += hairLevelled(x, y)
        n += 1
        x += 2
      }
    }
    var foreheadVisible = n > 0 && sum / n < 0.35
    // A hairline point far below the others means a fringe is lying on the forehead.
    val pts = listOfNotNull(c, rt, lt)
    if (pts.isNotEmpty()) {
      val lo = pts.min()
      val hi = pts.max()
      if (lo < 0.45 || lo < 0.6 * hi) foreheadVisible = false
    }

    return HairlineMeasure(c, lt, rt, recession, curve, foreheadVisible, ipd)
  }
}
