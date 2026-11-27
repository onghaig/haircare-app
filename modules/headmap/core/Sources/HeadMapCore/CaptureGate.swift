import Foundation

/// Turns a stream of per-frame quality reports into user-facing moments:
/// a soft tick when the head first lines up, and auto-capture once every check has stayed
/// green for a short, steady hold. Small flickers do not reset the hold.
public struct CaptureGate: Sendable {
  public enum Event: Equatable, Sendable {
    /// All checks just turned green (play the soft tick haptic).
    case aligned
    /// Alignment lost after being aligned.
    case lost
    /// Held long enough: take the photo now (firm tap haptic).
    case capture
  }

  /// Consecutive green frames needed before capture (about 0.5 s at 15 analysed frames a second).
  public var holdFrames: Int
  /// Red frames tolerated inside a hold before it resets.
  public var graceFrames: Int

  public private(set) var greenRun = 0
  private var redRun = 0
  private var aligned = false
  public private(set) var captured = false

  public init(holdFrames: Int = 8, graceFrames: Int = 1) {
    self.holdFrames = holdFrames
    self.graceFrames = graceFrames
  }

  public mutating func reset() {
    greenRun = 0
    redRun = 0
    aligned = false
    captured = false
  }

  /// Feed one frame. Returns the events it triggers, in order.
  public mutating func update(allPassed: Bool) -> [Event] {
    guard !captured else { return [] }
    var events: [Event] = []
    if allPassed {
      redRun = 0
      greenRun += 1
      if !aligned {
        aligned = true
        events.append(.aligned)
      }
      if greenRun >= holdFrames {
        captured = true
        events.append(.capture)
      }
    } else {
      redRun += 1
      if redRun > graceFrames {
        greenRun = 0
        if aligned {
          aligned = false
          events.append(.lost)
        }
      }
    }
    return events
  }
}
