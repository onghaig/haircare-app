import Foundation
@testable import HeadMapCore

/// Synthetic faces and hair masks with a known hairline, so expected values are exact.
enum Fixture {
  /// Canonical level face, eye midpoint at the origin, pupils `ipd` apart. Brow line sits 0.35 IPD above the eyes.
  static func landmarks(centre: Point, ipd: Double, rollDeg: Double = 0) -> FaceLandmarks {
    var pts = (0..<LandmarkID.count).map { i -> Point in
      let a = Double(i) / Double(LandmarkID.count) * 2 * Double.pi
      return Point(cos(a) * 1.1 * ipd, 0.4 * ipd + sin(a) * 1.6 * ipd)
    }
    pts[LandmarkID.irisRight] = Point(-0.5 * ipd, 0)
    pts[LandmarkID.irisLeft] = Point(0.5 * ipd, 0)
    pts[LandmarkID.eyeRightOuter] = Point(-0.75 * ipd, 0)
    pts[LandmarkID.eyeLeftOuter] = Point(0.75 * ipd, 0)
    pts[LandmarkID.browRightTop] = Point(-0.5 * ipd, -0.35 * ipd)
    pts[LandmarkID.browLeftTop] = Point(0.5 * ipd, -0.35 * ipd)
    pts[LandmarkID.glabella] = Point(0, -0.35 * ipd)
    let r = rollDeg * Double.pi / 180
    return FaceLandmarks(points: pts.map { p in
      Point(cos(r) * p.x - sin(r) * p.y + centre.x, sin(r) * p.x + cos(r) * p.y + centre.y)
    })!
  }

  /// Hair height above the brow line (in IPD) at level-frame x: `centre` in the middle,
  /// rising linearly to `temple` at the outer eye corners and beyond.
  static func hairHeight(_ xIPD: Double, centre: Double, temple: Double) -> Double {
    let t = min(abs(xIPD) / 0.75, 1)
    return centre + (temple - centre) * t
  }

  static func hairMask(
    width: Int, height: Int, centre: Point, ipd: Double, rollDeg: Double = 0,
    hairCentre: Double = 1.0, hairTemple: Double = 1.3, maskScale: Int = 1, noHair: Bool = false
  ) -> HairMask {
    let mw = width / maskScale, mh = height / maskScale
    let r = -rollDeg * Double.pi / 180
    var v = [Float](repeating: 0, count: mw * mh)
    if !noHair {
      for my in 0..<mh {
        for mx in 0..<mw {
          // mask pixel centre -> image coords -> level frame (in IPD units)
          let ix = (Double(mx) + 0.5) * Double(maskScale) - 0.5 - centre.x
          let iy = (Double(my) + 0.5) * Double(maskScale) - 0.5 - centre.y
          let lx = (cos(r) * ix - sin(r) * iy) / ipd
          let ly = (sin(r) * ix + cos(r) * iy) / ipd
          let hairlineY = -0.35 - hairHeight(lx, centre: hairCentre, temple: hairTemple)
          if abs(lx) < 1.3 && ly < hairlineY && ly > -3.0 { v[my * mw + mx] = 1 }
        }
      }
    }
    return HairMask(width: mw, height: mh, values: v, imageWidth: Double(width), imageHeight: Double(height))!
  }

  /// Mid-grey textured image (sharp), optionally with a bright background.
  static func gray(width: Int, height: Int, faceMin: Point, faceMax: Point, face: Int = 128, background: Int = 128, textured: Bool = true) -> GrayImage {
    var px = [UInt8](repeating: 0, count: width * height)
    for y in 0..<height {
      for x in 0..<width {
        let inFace = Double(x) >= faceMin.x && Double(x) < faceMax.x && Double(y) >= faceMin.y && Double(y) < faceMax.y
        let base = inFace ? face : background
        let tex = textured ? ((x * 7 + y * 13) % 5 - 2) * 20 : 0
        px[y * width + x] = UInt8(max(0, min(255, base + tex)))
      }
    }
    return GrayImage(width: width, height: height, pixels: px)!
  }

  static func rotationMatrix(yaw: Double = 0, pitch: Double = 0, roll: Double = 0) -> [Double] {
    // R = Rz(roll) * Ry(yaw) * Rx(pitch); for single-axis tests only one is non-zero.
    let d = Double.pi / 180
    let (cy, sy) = (cos(yaw * d), sin(yaw * d))
    let (cp, sp) = (cos(pitch * d), sin(pitch * d))
    let (cr, sr) = (cos(roll * d), sin(roll * d))
    let ry: [[Double]] = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    let rx: [[Double]] = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]]
    let rz: [[Double]] = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]]
    func mul(_ a: [[Double]], _ b: [[Double]]) -> [[Double]] {
      (0..<3).map { i in (0..<3).map { j in (0..<3).reduce(0.0) { $0 + a[i][$1] * b[$1][j] } } }
    }
    let r = mul(rz, mul(ry, rx))
    return [r[0][0], r[0][1], r[0][2], 0, r[1][0], r[1][1], r[1][2], 0, r[2][0], r[2][1], r[2][2], 0, 0, 0, 0, 1]
  }
}
