import Foundation

/// Hairline position from one front view, as in the spec: distance from the brow line up to the
/// hairline at the centre and above each temple, divided by the distance between the pupils (so
/// camera distance cancels out), shown in estimated mm using a 63 mm average pupil distance.
///
/// Port of `photo-model-v0/vision/headmap.py` (HeadMap.analyse). The image is levelled on the
/// eye line first, then each column is scanned upward from the brow line until hair dominates.
public struct HairlineMeasure: Equatable, Sendable {
  public var centreIPD: Double?
  public var leftTempleIPD: Double?
  public var rightTempleIPD: Double?
  /// Mean temple height minus centre height. Positive means the temples sit higher (receded).
  public var templeRecessionIPD: Double?
  /// Hairline trace in image pixel coordinates, for the overlay.
  public var curve: [Point]
  /// Skin, not hair or a fringe, just above the brows.
  public var foreheadVisible: Bool
  public var interPupilPx: Double

  public var centreMM: Double? { centreIPD.map { $0 * HairlineMeasurer.meanInterPupilMM } }
  public var leftTempleMM: Double? { leftTempleIPD.map { $0 * HairlineMeasurer.meanInterPupilMM } }
  public var rightTempleMM: Double? { rightTempleIPD.map { $0 * HairlineMeasurer.meanInterPupilMM } }
  public var hairlineFound: Bool { centreIPD != nil }
}

public struct HairlineMeasurer: Sendable {
  public static let meanInterPupilMM = 63.0
  /// Smoothed hair confidence above which a row counts as hair.
  public var hairThreshold = 0.5
  /// How far above the brows to search, in pupil distances.
  public var searchHeightIPD = 3.5
  public var curvePoints = 41

  public init() {}

  public func measure(landmarks lm: FaceLandmarks, hair: HairMask) -> HairlineMeasure {
    let irisR = lm[LandmarkID.irisRight]
    let irisL = lm[LandmarkID.irisLeft]
    let eyeMid = (irisR + irisL) * 0.5
    let rot = Rotation(centre: eyeMid, angleRadians: atan2(irisL.y - irisR.y, irisL.x - irisR.x))
    let ipd = lm.interPupil
    let width = Int(hair.imageWidth)
    let height = Int(hair.imageHeight)

    let pr = { (id: Int) in rot.apply(lm[id]) }
    let browY = (pr(LandmarkID.browRightTop).y + pr(LandmarkID.browLeftTop).y + pr(LandmarkID.glabella).y) / 3
    let xCentre = pr(LandmarkID.glabella).x
    let xRight = pr(LandmarkID.eyeRightOuter).x
    let xLeft = pr(LandmarkID.eyeLeftOuter).x

    /// Hair confidence in the levelled image at integer pixel (x, y).
    func hairLevelled(_ x: Int, _ y: Int) -> Double {
      guard x >= 0, y >= 0, x < width, y < height else { return 0 }
      let p = rot.invert(Point(Double(x), Double(y)))
      return hair.sample(p.x, p.y)
    }

    let y0 = Int(browY) - 2
    let stop = max(Int(browY - searchHeightIPD * ipd), 0)

    /// First row above the brow line where hair dominates, scanning up.
    func hairlineY(_ x: Double) -> Double? {
      let xi = Int((x).rounded())
      guard xi >= 0, xi < width, ipd > 0, y0 > stop else { return nil }
      let cols = max(xi - 2, 0)..<min(xi + 3, width)
      // Raw band (mean across 5 columns) for the rows the 5-row smoothing needs.
      let lo = max(stop - 5, 0)
      let hi = y0 + 2
      var band = [Double](repeating: 0, count: hi - lo + 1)
      for y in lo...hi where y < height {
        var s = 0.0
        for c in cols { s += hairLevelled(c, y) }
        band[y - lo] = s / Double(cols.count)
      }
      func smooth(_ y: Int) -> Double {
        var s = 0.0
        for k in -2...2 {
          let yy = y + k
          if yy >= lo, yy <= hi, yy < height { s += band[yy - lo] }
        }
        return s / 5
      }
      var y = y0
      while y > stop {
        if smooth(y) > hairThreshold && smooth(max(y - 3, 0)) > hairThreshold { return Double(y) }
        y -= 1
      }
      return nil
    }

    func heightIPD(_ x: Double) -> Double? { hairlineY(x).map { (browY - $0) / ipd } }

    let c = heightIPD(xCentre)
    let rt = heightIPD(xRight)
    let lt = heightIPD(xLeft)

    var curve: [Point] = []
    let x0 = xRight - 0.15 * ipd
    let x1 = xLeft + 0.15 * ipd
    for i in 0..<curvePoints {
      let x = x0 + (x1 - x0) * Double(i) / Double(max(curvePoints - 1, 1))
      if let y = hairlineY(x) { curve.append(rot.invert(Point(x, y))) }
    }

    let temples = [rt, lt].compactMap { $0 }
    let recession: Double? = (temples.isEmpty || c == nil) ? nil : temples.reduce(0, +) / Double(temples.count) - c!

    // Forehead strip just above the brows should be skin, not hair.
    let rows = max(Int(browY - 0.35 * ipd), 0)..<max(Int(browY - 0.05 * ipd), 0)
    let colsF = max(Int(min(xRight, xLeft)), 0)..<max(Int(max(xRight, xLeft)), 0)
    var sum = 0.0
    var n = 0
    for y in rows {
      for x in stride(from: colsF.lowerBound, to: colsF.upperBound, by: 2) {
        sum += hairLevelled(x, y)
        n += 1
      }
    }
    var foreheadVisible = n > 0 && sum / Double(n) < 0.35
    // A hairline point far below the others means a fringe is lying on the forehead.
    let pts = [c, rt, lt].compactMap { $0 }
    if let lo = pts.min(), let hi = pts.max(), lo < 0.45 || lo < 0.6 * hi { foreheadVisible = false }

    return HairlineMeasure(
      centreIPD: c, leftTempleIPD: lt, rightTempleIPD: rt, templeRecessionIPD: recession,
      curve: curve, foreheadVisible: foreheadVisible, interPupilPx: ipd)
  }
}
