package expo.modules.headmap.core

/** MediaPipe Face Mesh landmark ids used by HeadMap (same as the Python reference). */
object LandmarkID {
  const val IRIS_RIGHT = 468
  const val IRIS_LEFT = 473
  const val BROW_RIGHT_TOP = 105
  const val BROW_LEFT_TOP = 334
  const val GLABELLA = 9
  /** Image-left on a front camera is the subject's right side. */
  const val EYE_RIGHT_OUTER = 33
  const val EYE_LEFT_OUTER = 263
  const val COUNT = 478
  /** Landmarks saved with each face photo for the scalp map (see Landmarks.swift). */
  val MAP_ANCHORS = listOf(468, 473, 9, 1, 152, 234, 454, 10)
}

/** Face landmarks in image pixel coordinates. Port of Landmarks.swift. */
class FaceLandmarks private constructor(val points: List<Point>) {
  operator fun get(id: Int): Point = points[id]

  val interPupil: Double get() = this[LandmarkID.IRIS_RIGHT].distance(this[LandmarkID.IRIS_LEFT])

  val boundingBox: Pair<Point, Point>
    get() {
      var lx = Double.POSITIVE_INFINITY
      var ly = Double.POSITIVE_INFINITY
      var hx = Double.NEGATIVE_INFINITY
      var hy = Double.NEGATIVE_INFINITY
      for (p in points) {
        lx = minOf(lx, p.x); ly = minOf(ly, p.y); hx = maxOf(hx, p.x); hy = maxOf(hy, p.y)
      }
      return Point(lx, ly) to Point(hx, hy)
    }

  val faceWidth: Double get() = boundingBox.let { it.second.x - it.first.x }

  companion object {
    fun of(points: List<Point>): FaceLandmarks? = if (points.size >= LandmarkID.COUNT) FaceLandmarks(points) else null
  }
}
