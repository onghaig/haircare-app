package expo.modules.headmap.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Synthetic faces and hair masks with a known hairline, so expected values are exact. Port of Fixtures.swift. */
object Fixture {
  /** Canonical level face, eye midpoint at `centre`, pupils `ipd` apart. Brow line 0.35 IPD above the eyes. */
  fun landmarks(centre: Point, ipd: Double, rollDeg: Double = 0.0): FaceLandmarks {
    val pts = (0 until LandmarkID.COUNT).map { i ->
      val a = i.toDouble() / LandmarkID.COUNT * 2 * PI
      Point(cos(a) * 1.1 * ipd, 0.4 * ipd + sin(a) * 1.6 * ipd)
    }.toMutableList()
    pts[LandmarkID.IRIS_RIGHT] = Point(-0.5 * ipd, 0.0)
    pts[LandmarkID.IRIS_LEFT] = Point(0.5 * ipd, 0.0)
    pts[LandmarkID.EYE_RIGHT_OUTER] = Point(-0.75 * ipd, 0.0)
    pts[LandmarkID.EYE_LEFT_OUTER] = Point(0.75 * ipd, 0.0)
    pts[LandmarkID.BROW_RIGHT_TOP] = Point(-0.5 * ipd, -0.35 * ipd)
    pts[LandmarkID.BROW_LEFT_TOP] = Point(0.5 * ipd, -0.35 * ipd)
    pts[LandmarkID.GLABELLA] = Point(0.0, -0.35 * ipd)
    val r = rollDeg * PI / 180
    return FaceLandmarks.of(pts.map { p -> Point(cos(r) * p.x - sin(r) * p.y + centre.x, sin(r) * p.x + cos(r) * p.y + centre.y) })!!
  }

  /** Hair height above the brow line (in IPD) at level-frame x. */
  fun hairHeight(xIPD: Double, centre: Double, temple: Double): Double {
    val t = min(abs(xIPD) / 0.75, 1.0)
    return centre + (temple - centre) * t
  }

  fun hairMask(
    width: Int, height: Int, centre: Point, ipd: Double, rollDeg: Double = 0.0,
    hairCentre: Double = 1.0, hairTemple: Double = 1.3, maskScale: Int = 1, noHair: Boolean = false,
  ): HairMask {
    val mw = width / maskScale
    val mh = height / maskScale
    val r = -rollDeg * PI / 180
    val v = FloatArray(mw * mh)
    if (!noHair) {
      for (my in 0 until mh) for (mx in 0 until mw) {
        val ix = (mx + 0.5) * maskScale - 0.5 - centre.x
        val iy = (my + 0.5) * maskScale - 0.5 - centre.y
        val lx = (cos(r) * ix - sin(r) * iy) / ipd
        val ly = (sin(r) * ix + cos(r) * iy) / ipd
        val hairlineY = -0.35 - hairHeight(lx, hairCentre, hairTemple)
        if (abs(lx) < 1.3 && ly < hairlineY && ly > -3.0) v[my * mw + mx] = 1f
      }
    }
    return HairMask.of(mw, mh, v, width.toDouble(), height.toDouble())!!
  }

  /** Mid-grey textured image (sharp), optionally with a bright background. */
  fun gray(width: Int, height: Int, faceMin: Point, faceMax: Point, face: Int = 128, background: Int = 128, textured: Boolean = true): GrayImage {
    val px = ByteArray(width * height)
    for (y in 0 until height) for (x in 0 until width) {
      val inFace = x >= faceMin.x && x < faceMax.x && y >= faceMin.y && y < faceMax.y
      val base = if (inFace) face else background
      val tex = if (textured) ((x * 7 + y * 13) % 5 - 2) * 20 else 0
      px[y * width + x] = (base + tex).coerceIn(0, 255).toByte()
    }
    return GrayImage.of(width, height, px)!!
  }

  fun rotationMatrix(yaw: Double = 0.0, pitch: Double = 0.0, roll: Double = 0.0): DoubleArray {
    val d = PI / 180
    val cy = cos(yaw * d); val sy = sin(yaw * d)
    val cp = cos(pitch * d); val sp = sin(pitch * d)
    val cr = cos(roll * d); val sr = sin(roll * d)
    val ry = arrayOf(doubleArrayOf(cy, 0.0, sy), doubleArrayOf(0.0, 1.0, 0.0), doubleArrayOf(-sy, 0.0, cy))
    val rx = arrayOf(doubleArrayOf(1.0, 0.0, 0.0), doubleArrayOf(0.0, cp, -sp), doubleArrayOf(0.0, sp, cp))
    val rz = arrayOf(doubleArrayOf(cr, -sr, 0.0), doubleArrayOf(sr, cr, 0.0), doubleArrayOf(0.0, 0.0, 1.0))
    fun mul(a: Array<DoubleArray>, b: Array<DoubleArray>) =
      Array(3) { i -> DoubleArray(3) { j -> (0 until 3).sumOf { k -> a[i][k] * b[k][j] } } }
    val r = mul(rz, mul(ry, rx))
    return doubleArrayOf(r[0][0], r[0][1], r[0][2], 0.0, r[1][0], r[1][1], r[1][2], 0.0, r[2][0], r[2][1], r[2][2], 0.0, 0.0, 0.0, 0.0, 1.0)
  }
}
