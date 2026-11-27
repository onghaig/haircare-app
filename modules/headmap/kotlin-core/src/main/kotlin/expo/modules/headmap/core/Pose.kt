package expo.modules.headmap.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2

/** Head pose in degrees. Yaw turns left and right, pitch nods, roll tilts. Port of Pose.swift. */
data class PoseAngles(val yaw: Double, val pitch: Double, val roll: Double) {
  /** Largest absolute difference from a target pose, in degrees. */
  fun maxDeviation(t: PoseAngles): Double = maxOf(abs(yaw - t.yaw), abs(pitch - t.pitch), abs(roll - t.roll))

  companion object {
    /** From MediaPipe's 4x4 facial transformation matrix, given row-major. */
    fun fromRowMajor(m: DoubleArray): PoseAngles? {
      if (m.size < 16) return null
      fun r(i: Int, j: Int) = m[i * 4 + j]
      val deg = 180.0 / PI
      val pitch = atan2(-r(1, 2), r(2, 2)) * deg
      val yaw = asin(r(0, 2).coerceIn(-1.0, 1.0)) * deg
      val roll = atan2(-r(0, 1), r(0, 0)) * deg
      return PoseAngles(yaw, pitch, roll)
    }
  }
}
