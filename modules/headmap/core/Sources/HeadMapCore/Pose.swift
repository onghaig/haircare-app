import Foundation

/// Head pose in degrees. Yaw turns left and right, pitch nods, roll tilts.
public struct PoseAngles: Equatable, Sendable {
  public var yaw: Double
  public var pitch: Double
  public var roll: Double

  public init(yaw: Double, pitch: Double, roll: Double) {
    self.yaw = yaw
    self.pitch = pitch
    self.roll = roll
  }

  /// From MediaPipe's 4x4 facial transformation matrix, given row-major.
  /// Same decomposition as the Python reference.
  public static func from(rowMajor m: [Double]) -> PoseAngles? {
    guard m.count >= 16 else { return nil }
    func r(_ i: Int, _ j: Int) -> Double { m[i * 4 + j] }
    let deg = 180.0 / Double.pi
    let pitch = atan2(-r(1, 2), r(2, 2)) * deg
    let yaw = asin(max(-1, min(1, r(0, 2)))) * deg
    let roll = atan2(-r(0, 1), r(0, 0)) * deg
    return PoseAngles(yaw: yaw, pitch: pitch, roll: roll)
  }

  /// Largest absolute difference from a target pose, in degrees.
  public func maxDeviation(from t: PoseAngles) -> Double {
    max(abs(yaw - t.yaw), abs(pitch - t.pitch), abs(roll - t.roll))
  }
}
