import Foundation

/// The five fixed views of the guided scan, with the head pose each one expects.
public enum ScanView: String, CaseIterable, Sendable {
  case front, leftTemple, rightTemple, top, crown

  /// Target head pose relative to the phone. Temples turn 45 degrees, the top view tilts down 60.
  public var targetPose: PoseAngles {
    switch self {
    case .front: return PoseAngles(yaw: 0, pitch: 0, roll: 0)
    case .leftTemple: return PoseAngles(yaw: -45, pitch: 0, roll: 0)
    case .rightTemple: return PoseAngles(yaw: 45, pitch: 0, roll: 0)
    case .top: return PoseAngles(yaw: 0, pitch: -60, roll: 0)
    case .crown: return PoseAngles(yaw: 0, pitch: 0, roll: 0)
    }
  }

  /// Face tracking only works while the face is visible: front and temples. The top view (head
  /// tilted right down) and the crown (rear camera) are judged on the image and the hair in it.
  public var usesFaceTracking: Bool { self == .front || self == .leftTemple || self == .rightTemple }
  /// Views that must show mostly hair: the top of the head and the crown.
  public var checksHairCoverage: Bool { !usesFaceTracking }
  /// Hairline position is measured on the front view only.
  public var measuresHairline: Bool { self == .front }
  public var needsForehead: Bool { self == .front }
}
