package expo.modules.headmap.core

import kotlin.math.floor

/**
 * Per-pixel hair confidence (0 to 1) from the selfie multiclass segmenter (class 1). The mask can
 * be lower resolution than the image; sampling scales coordinates. Port of HairMask.swift.
 */
class HairMask private constructor(
  val width: Int,
  val height: Int,
  val values: FloatArray,
  /** Size of the image the landmarks refer to. */
  val imageWidth: Double,
  val imageHeight: Double,
) {
  /** Bilinear sample at image coordinates. Outside the image is 0, like OpenCV's constant border. */
  fun sample(x: Double, y: Double): Double {
    val mx = (x + 0.5) * width / imageWidth - 0.5
    val my = (y + 0.5) * height / imageHeight - 0.5
    val x0 = floor(mx).toInt()
    val y0 = floor(my).toInt()
    val fx = mx - x0
    val fy = my - y0
    fun v(xi: Int, yi: Int): Double =
      if (xi < 0 || yi < 0 || xi >= width || yi >= height) 0.0 else values[yi * width + xi].toDouble()
    val top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx
    val bottom = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx
    return top * (1 - fy) + bottom * fy
  }

  /** Share of mask cells inside a region (fractions of the frame, 0 to 1) that are hair. */
  fun coverage(
    x: ClosedFloatingPointRange<Double> = 0.2..0.8,
    y: ClosedFloatingPointRange<Double> = 0.2..0.8,
    threshold: Float = 0.5f,
  ): Double {
    val x0 = maxOf(0, (x.start * width).toInt())
    val x1 = minOf(width, (x.endInclusive * width).toInt())
    val y0 = maxOf(0, (y.start * height).toInt())
    val y1 = minOf(height, (y.endInclusive * height).toInt())
    if (x1 <= x0 || y1 <= y0) return 0.0
    var hair = 0
    for (yi in y0 until y1) for (xi in x0 until x1) if (values[yi * width + xi] >= threshold) hair++
    return hair.toDouble() / ((x1 - x0) * (y1 - y0))
  }

  companion object {
    fun of(width: Int, height: Int, values: FloatArray, imageWidth: Double, imageHeight: Double): HairMask? =
      if (width > 0 && height > 0 && values.size == width * height && imageWidth > 0 && imageHeight > 0) {
        HairMask(width, height, values, imageWidth, imageHeight)
      } else null
  }
}
