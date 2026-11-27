import Foundation

/// MediaPipe Face Mesh landmark ids used by HeadMap (same as the Python reference).
public enum LandmarkID {
  public static let irisRight = 468
  public static let irisLeft = 473
  public static let browRightTop = 105
  public static let browLeftTop = 334
  public static let glabella = 9
  /// Image-left on a front camera is the subject's right side.
  public static let eyeRightOuter = 33
  public static let eyeLeftOuter = 263
  public static let count = 478
  /// Landmarks saved with each face photo for the scalp map: irises, glabella, nose tip, chin,
  /// both face edges and the top of the forehead.
  public static let mapAnchors = [468, 473, 9, 1, 152, 234, 454, 10]
}

/// Face landmarks in image pixel coordinates.
public struct FaceLandmarks: Sendable {
  public let points: [Point]

  public init?(points: [Point]) {
    guard points.count >= LandmarkID.count else { return nil }
    self.points = points
  }

  public subscript(_ id: Int) -> Point { points[id] }

  public var interPupil: Double { self[LandmarkID.irisRight].distance(to: self[LandmarkID.irisLeft]) }

  public var boundingBox: (min: Point, max: Point) {
    var lo = Point(.infinity, .infinity)
    var hi = Point(-.infinity, -.infinity)
    for p in points {
      lo = Point(min(lo.x, p.x), min(lo.y, p.y))
      hi = Point(max(hi.x, p.x), max(hi.y, p.y))
    }
    return (lo, hi)
  }

  public var faceWidth: Double { boundingBox.max.x - boundingBox.min.x }
}
