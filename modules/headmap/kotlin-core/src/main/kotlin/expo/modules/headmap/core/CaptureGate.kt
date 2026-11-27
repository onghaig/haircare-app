package expo.modules.headmap.core

/**
 * Turns a stream of per-frame quality reports into user-facing moments: a soft tick when the head
 * first lines up, and auto-capture once every check has stayed green for a short, steady hold.
 * Small flickers do not reset the hold. Port of CaptureGate.swift.
 */
class CaptureGate(val holdFrames: Int = 8, val graceFrames: Int = 1) {
  enum class Event { ALIGNED, LOST, CAPTURE }

  var greenRun = 0
    private set
  private var redRun = 0
  private var aligned = false
  var captured = false
    private set

  fun reset() {
    greenRun = 0; redRun = 0; aligned = false; captured = false
  }

  /** Feed one frame. Returns the events it triggers, in order. */
  fun update(allPassed: Boolean): List<Event> {
    if (captured) return emptyList()
    val events = mutableListOf<Event>()
    if (allPassed) {
      redRun = 0
      greenRun += 1
      if (!aligned) {
        aligned = true
        events += Event.ALIGNED
      }
      if (greenRun >= holdFrames) {
        captured = true
        events += Event.CAPTURE
      }
    } else {
      redRun += 1
      if (redRun > graceFrames) {
        greenRun = 0
        if (aligned) {
          aligned = false
          events += Event.LOST
        }
      }
    }
    return events
  }
}
