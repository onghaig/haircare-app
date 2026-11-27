package expo.modules.headmap.core


/** 8-bit grayscale image (row-major), for sharpness and exposure checks. Port of ImageStats.swift. */
class GrayImage private constructor(val width: Int, val height: Int, val pixels: ByteArray) {
  fun at(x: Int, y: Int): Double = (pixels[y * width + x].toInt() and 0xFF).toDouble()

  /** Crop clamped to the image. Returns null when the box is empty. */
  fun crop(x0: Int, y0: Int, x1: Int, y1: Int): GrayImage? {
    val a = x0.coerceIn(0, width); val b = y0.coerceIn(0, height)
    val c = x1.coerceIn(0, width); val d = y1.coerceIn(0, height)
    if (c <= a || d <= b) return null
    val out = ByteArray((c - a) * (d - b))
    var i = 0
    for (y in b until d) {
      System.arraycopy(pixels, y * width + a, out, i, c - a)
      i += c - a
    }
    return GrayImage(c - a, d - b, out)
  }

  /** Bilinear resize so the longer side is `longSide` pixels. */
  fun resized(longSide: Int): GrayImage {
    val scale = longSide.toDouble() / maxOf(width, height)
    val w = maxOf(1, roundAway(width * scale).toInt())
    val h = maxOf(1, roundAway(height * scale).toInt())
    val out = ByteArray(w * h)
    for (y in 0 until h) {
      val sy = ((y + 0.5) / scale - 0.5).coerceIn(0.0, (height - 1).toDouble())
      val y0 = sy.toInt(); val y1 = minOf(y0 + 1, height - 1); val fy = sy - y0
      for (x in 0 until w) {
        val sx = ((x + 0.5) / scale - 0.5).coerceIn(0.0, (width - 1).toDouble())
        val x0 = sx.toInt(); val x1 = minOf(x0 + 1, width - 1); val fx = sx - x0
        val v = (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy
        out[y * w + x] = roundAway(v).toInt().coerceIn(0, 255).toByte()
      }
    }
    return GrayImage(w, h, out)
  }

  val mean: Double
    get() {
      var s = 0L
      for (b in pixels) s += b.toInt() and 0xFF
      return s.toDouble() / pixels.size
    }

  /** Variance of the 4-neighbour Laplacian (OpenCV `Laplacian(ksize=1)`, reflect-101 border). */
  val laplacianVariance: Double
    get() {
      fun r(i: Int, n: Int) = if (n == 1) 0 else if (i < 0) -i else if (i >= n) 2 * n - 2 - i else i
      var sum = 0.0
      var sq = 0.0
      for (y in 0 until height) for (x in 0 until width) {
        val l = at(r(x - 1, width), y) + at(r(x + 1, width), y) + at(x, r(y - 1, height)) + at(x, r(y + 1, height)) - 4 * at(x, y)
        sum += l
        sq += l * l
      }
      val n = (width * height).toDouble()
      val m = sum / n
      return sq / n - m * m
    }

  companion object {
    fun of(width: Int, height: Int, pixels: ByteArray): GrayImage? =
      if (width > 0 && height > 0 && pixels.size == width * height) GrayImage(width, height, pixels) else null
  }
}

data class ImageStats(
  val sharpness: Double,
  val faceBrightness: Double,
  val backgroundBrightness: Double,
  val backlit: Boolean,
) {
  companion object {
    /** Face crop resized to 256 px for a resolution-independent sharpness score, mean face brightness, and backlight. */
    fun compute(gray: GrayImage, faceMin: Point, faceMax: Point): ImageStats? {
      val face = gray.crop(faceMin.x.toInt(), faceMin.y.toInt(), faceMax.x.toInt(), faceMax.y.toInt()) ?: return null
      val sharp = face.resized(256).laplacianVariance
      val faceMean = face.mean
      val total = gray.mean * gray.width * gray.height
      val faceArea = (face.width * face.height).toDouble()
      val bgArea = (gray.width * gray.height).toDouble() - faceArea
      val bgMean = if (bgArea > 0) (total - faceMean * faceArea) / bgArea else faceMean
      return ImageStats(sharp, faceMean, bgMean, bgMean - faceMean > 60)
    }
  }
}
