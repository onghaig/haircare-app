package expo.modules.headmap.core

import kotlin.math.max
import kotlin.math.min

/**
 * The whole-head panorama, port of Panorama.swift: 25 regions of the head (12 slices round the
 * hairline band, 12 higher up, and the top), each keeping its best frame. `FACE` uses the front
 * camera and the head pose; `BACK` uses the back camera and the phone's motion sensors.
 */
enum class PanoramaMode(val raw: String) {
  OFF("off"), FACE("face"), BACK("back");

  companion object {
    fun from(raw: String?): PanoramaMode = entries.firstOrNull { it.raw == raw } ?: OFF
  }
}

data class PanoramaAngles(val azimuth: Double, val elevation: Double)

object PanoramaCells {
  const val SLICES = 12
  const val SLICE_DEG = 360.0 / SLICES
  const val UPPER_FROM_DEG = 35.0
  const val TOP_FROM_DEG = 70.0
  const val COUNT = SLICES * 2 + 1
  const val TOP = SLICES * 2

  fun cell(azimuth: Double, elevation: Double): Int {
    if (elevation >= TOP_FROM_DEG) return TOP
    val slice = min(SLICES - 1, (wrap(azimuth) / SLICE_DEG).toInt())
    return (if (elevation >= UPPER_FROM_DEG) SLICES else 0) + slice
  }

  fun centre(cell: Int): PanoramaAngles =
    if (cell >= TOP) PanoramaAngles(0.0, 82.0) else PanoramaAngles(((cell % SLICES) + 0.5) * SLICE_DEG, if (cell >= SLICES) 52.0 else 17.0)

  fun faceAngles(yaw: Double, pitch: Double) = PanoramaAngles(wrap(-yaw), min(90.0, max(0.0, 15 + max(0.0, -pitch))))

  fun backAngles(heading: Double, startHeading: Double, pitchDown: Double) =
    PanoramaAngles(wrap(180 + heading - startHeading), min(90.0, max(0.0, pitchDown)))

  fun accepts(r: QualityReport, mode: PanoramaMode): Boolean {
    if (r.failed.contains(QualityCheck.SHARPNESS) || r.failed.contains(QualityCheck.EXPOSURE)) return false
    return when (mode) {
      PanoramaMode.OFF -> false
      PanoramaMode.FACE -> !r.failed.contains(QualityCheck.FACE_FOUND) && r.pose != null
      PanoramaMode.BACK -> !r.failed.contains(QualityCheck.HAIR_IN_FRAME) && r.stats != null
    }
  }

  fun rank(r: QualityReport): Double = r.score + min(r.stats?.sharpness ?: 0.0, 400.0) / 40

  fun wrap(a: Double): Double {
    val w = a % 360
    return if (w < 0) w + 360 else w
  }
}

/** Keeps the best frame per region. */
class PanoramaCollector<F> {
  data class Entry<F>(val rank: Double, val frame: F, val azimuth: Double, val elevation: Double, val mode: PanoramaMode)

  private val map = sortedMapOf<Int, Entry<F>>()
  var replaceMargin = 5.0

  val entries: Map<Int, Entry<F>> get() = map
  val filled: List<Int> get() = map.keys.toList()
  val isComplete: Boolean get() = map.size >= PanoramaCells.COUNT

  fun reset() = map.clear()

  fun wants(cell: Int, rank: Double): Boolean {
    val e = map[cell] ?: return true
    return rank > e.rank + replaceMargin
  }

  /** Keeps the frame if wanted. Returns true when the region was empty until now. */
  fun offer(cell: Int, rank: Double, frame: F, azimuth: Double, elevation: Double, mode: PanoramaMode): Boolean {
    if (!wants(cell, rank)) return false
    val isNew = map[cell] == null
    map[cell] = Entry(rank, frame, azimuth, elevation, mode)
    return isNew
  }
}
