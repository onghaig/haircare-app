package expo.modules.headmap.core

/** The five fixed views of the guided scan, with the head pose each one expects. Port of ScanView.swift. */
enum class ScanView(val raw: String) {
  FRONT("front"), LEFT_TEMPLE("leftTemple"), RIGHT_TEMPLE("rightTemple"), TOP("top"), CROWN("crown");

  /** Target head pose relative to the phone. Temples turn 45 degrees, the top view tilts down 60. */
  val targetPose: PoseAngles
    get() = when (this) {
      FRONT, CROWN -> PoseAngles(0.0, 0.0, 0.0)
      LEFT_TEMPLE -> PoseAngles(-45.0, 0.0, 0.0)
      RIGHT_TEMPLE -> PoseAngles(45.0, 0.0, 0.0)
      TOP -> PoseAngles(0.0, -60.0, 0.0)
    }

  /** Face tracking only works while the face is visible: front and temples. */
  val usesFaceTracking: Boolean get() = this == FRONT || this == LEFT_TEMPLE || this == RIGHT_TEMPLE
  /** Views that must show mostly hair: the top of the head and the crown. */
  val checksHairCoverage: Boolean get() = !usesFaceTracking
  /** Hairline position is measured on the front view only. */
  val measuresHairline: Boolean get() = this == FRONT
  val needsForehead: Boolean get() = this == FRONT
  /** The hairline is traced (for the green line) on the front and both temple views. */
  val tracesHairline: Boolean get() = usesFaceTracking

  companion object {
    fun from(raw: String?): ScanView = entries.firstOrNull { it.raw == raw } ?: FRONT
  }
}
