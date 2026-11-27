package expo.modules.headmap.core

import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

data class Point(val x: Double, val y: Double) {
  operator fun plus(b: Point) = Point(x + b.x, y + b.y)
  operator fun minus(b: Point) = Point(x - b.x, y - b.y)
  operator fun times(k: Double) = Point(x * k, y * k)
  fun distance(p: Point): Double = hypot(x - p.x, y - p.y)
}

/**
 * Rotation about a centre that levels a tilted eye line, matching OpenCV's
 * `getRotationMatrix2D(centre, angleDegrees, 1)` used by the Python reference.
 * Port of Geometry.swift.
 */
class Rotation(val centre: Point, angleRadians: Double) {
  val cosA = cos(angleRadians)
  val sinA = sin(angleRadians)

  /** Image coordinates to levelled coordinates. */
  fun apply(p: Point): Point {
    val dx = p.x - centre.x
    val dy = p.y - centre.y
    return Point(cosA * dx + sinA * dy + centre.x, -sinA * dx + cosA * dy + centre.y)
  }

  /** Levelled coordinates back to image coordinates. */
  fun invert(p: Point): Point {
    val dx = p.x - centre.x
    val dy = p.y - centre.y
    return Point(cosA * dx - sinA * dy + centre.x, sinA * dx + cosA * dy + centre.y)
  }
}

/** Swift's `rounded()`: halves round away from zero (Kotlin's `round` rounds halves to even). */
internal fun roundAway(x: Double): Double = if (x >= 0) kotlin.math.floor(x + 0.5) else -kotlin.math.floor(-x + 0.5)
