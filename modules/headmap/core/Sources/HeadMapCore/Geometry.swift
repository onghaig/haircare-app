import Foundation

public struct Point: Equatable, Sendable {
  public var x: Double
  public var y: Double
  public init(_ x: Double, _ y: Double) {
    self.x = x
    self.y = y
  }

  public static func + (a: Point, b: Point) -> Point { Point(a.x + b.x, a.y + b.y) }
  public static func - (a: Point, b: Point) -> Point { Point(a.x - b.x, a.y - b.y) }
  public static func * (a: Point, k: Double) -> Point { Point(a.x * k, a.y * k) }
  public func distance(to p: Point) -> Double { hypot(x - p.x, y - p.y) }
}

/// Rotation about a centre that levels a tilted eye line, matching OpenCV's
/// `getRotationMatrix2D(centre, angleDegrees, 1)` used by the Python reference.
public struct Rotation: Sendable {
  public let centre: Point
  public let cosA: Double
  public let sinA: Double

  public init(centre: Point, angleRadians: Double) {
    self.centre = centre
    cosA = cos(angleRadians)
    sinA = sin(angleRadians)
  }

  /// Image coordinates to levelled coordinates.
  public func apply(_ p: Point) -> Point {
    let dx = p.x - centre.x
    let dy = p.y - centre.y
    return Point(cosA * dx + sinA * dy + centre.x, -sinA * dx + cosA * dy + centre.y)
  }

  /// Levelled coordinates back to image coordinates.
  public func invert(_ p: Point) -> Point {
    let dx = p.x - centre.x
    let dy = p.y - centre.y
    return Point(cosA * dx - sinA * dy + centre.x, sinA * dx + cosA * dy + centre.y)
  }
}
