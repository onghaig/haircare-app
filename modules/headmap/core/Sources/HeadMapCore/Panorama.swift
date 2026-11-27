import Foundation

/// The whole-head panorama: after the five photos, one continuous capture that covers the entire
/// head. The head is split into 25 regions (12 slices around the head at the hairline and sides,
/// 12 higher up, and the top). Frames are grabbed continuously and each region keeps its best one.
///
/// Two parts, because no single camera can see the whole head:
/// - `face`: front camera, phone still, you turn your head from shoulder to shoulder and tilt it
///   down. Where the camera is looking on your head comes from the face tracker's head pose.
/// - `back`: back camera, someone helping walks the phone around the back of your head (or you
///   hold it up behind your head). Where it is looking comes from the phone's motion sensors,
///   relative to where it pointed when this part started (straight at the back of the head).
///
/// Angles: azimuth 0 is the front of the head and grows around it (180 is the back); elevation
/// 0 is the hairline band and 90 the very top.
public enum PanoramaMode: String, Sendable { case off, face, back }

public enum PanoramaCells {
  public static let slices = 12
  public static let sliceDeg = 360.0 / Double(slices)
  /// Elevation where the upper band starts, and where the top cap starts.
  public static let upperFromDeg = 35.0
  public static let topFromDeg = 70.0
  public static let count = slices * 2 + 1
  public static let top = slices * 2

  /// Region index for a point on the head, 0 ..< count.
  public static func cell(azimuth: Double, elevation: Double) -> Int {
    if elevation >= topFromDeg { return top }
    let a = wrap(azimuth)
    let slice = min(slices - 1, Int(a / sliceDeg))
    return (elevation >= upperFromDeg ? slices : 0) + slice
  }

  /// Centre of a region, for drawing and for stitching.
  public static func centre(of cell: Int) -> (azimuth: Double, elevation: Double) {
    if cell >= top { return (0, 82) }
    let upper = cell >= slices
    return ((Double(cell % slices) + 0.5) * sliceDeg, upper ? 52 : 17)
  }

  /// Front camera: the camera looks at the head from the front, so it sees the point the head
  /// has turned toward it. Turning one way shows the other side; tilting down shows higher up.
  /// Elevation starts at 15 degrees (a camera at eye level sees the hairline band) and rises as
  /// the head tilts down (pitch is negative tilting down).
  public static func faceAngles(yaw: Double, pitch: Double) -> (azimuth: Double, elevation: Double) {
    (wrap(-yaw), min(90, max(0, 15 + max(0, -pitch))))
  }

  /// Back camera: it starts pointed at the back of the head, and its turn since then is how far
  /// round the head it has moved. Pointing down steeply looks at the top.
  public static func backAngles(heading: Double, startHeading: Double, pitchDown: Double) -> (azimuth: Double, elevation: Double) {
    (wrap(180 + heading - startHeading), min(90, max(0, pitchDown)))
  }

  /// Whether a frame is good enough to stand for its region.
  public static func accepts(_ r: QualityReport, mode: PanoramaMode) -> Bool {
    if r.failed.contains(.sharpness) || r.failed.contains(.exposure) { return false }
    switch mode {
    case .off: return false
    case .face: return !r.failed.contains(.faceFound) && r.pose != nil
    case .back: return !r.failed.contains(.hairInFrame) && r.stats != nil
    }
  }

  /// Ranks frames within a region: quality, then sharpness (capped).
  public static func rank(_ r: QualityReport) -> Double {
    Double(r.score) + min(r.stats?.sharpness ?? 0, 400) / 40
  }

  public static func wrap(_ a: Double) -> Double {
    let w = a.truncatingRemainder(dividingBy: 360)
    return w < 0 ? w + 360 : w
  }
}

/// Keeps the best frame per region. `Frame` is whatever the camera stores (JPEG data on iOS).
public struct PanoramaCollector<Frame> {
  public struct Entry {
    public var rank: Double
    public var frame: Frame
    public var azimuth: Double
    public var elevation: Double
    public var mode: PanoramaMode
  }

  public private(set) var entries: [Int: Entry] = [:]
  /// A new frame must beat the kept one by this much to replace it (saves re-encoding).
  public var replaceMargin = 5.0

  public init() {}

  public var filled: [Int] { entries.keys.sorted() }
  public var isComplete: Bool { entries.count >= PanoramaCells.count }

  public mutating func reset() { entries = [:] }

  /// Whether a frame for this region would be kept. Call before making the frame (it costs).
  public func wants(cell: Int, rank: Double) -> Bool {
    guard let e = entries[cell] else { return true }
    return rank > e.rank + replaceMargin
  }

  /// Keeps the frame if it is wanted. Returns true when the region was empty until now.
  @discardableResult
  public mutating func offer(cell: Int, rank: Double, frame: Frame, azimuth: Double, elevation: Double, mode: PanoramaMode) -> Bool {
    guard wants(cell: cell, rank: rank) else { return false }
    let isNew = entries[cell] == nil
    entries[cell] = Entry(rank: rank, frame: frame, azimuth: azimuth, elevation: elevation, mode: mode)
    return isNew
  }
}
