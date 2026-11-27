import Foundation

/// 8-bit grayscale image (row-major), for sharpness and exposure checks.
public struct GrayImage: Sendable {
  public let width: Int
  public let height: Int
  public let pixels: [UInt8]

  public init?(width: Int, height: Int, pixels: [UInt8]) {
    guard width > 0, height > 0, pixels.count == width * height else { return nil }
    self.width = width
    self.height = height
    self.pixels = pixels
  }

  @inline(__always) public func at(_ x: Int, _ y: Int) -> Double { Double(pixels[y * width + x]) }

  /// Crop clamped to the image. Returns nil when the box is empty.
  public func crop(x0: Int, y0: Int, x1: Int, y1: Int) -> GrayImage? {
    let a = max(0, min(x0, width)), b = max(0, min(y0, height))
    let c = max(0, min(x1, width)), d = max(0, min(y1, height))
    guard c > a, d > b else { return nil }
    var out = [UInt8]()
    out.reserveCapacity((c - a) * (d - b))
    for y in b..<d { out.append(contentsOf: pixels[(y * width + a)..<(y * width + c)]) }
    return GrayImage(width: c - a, height: d - b, pixels: out)
  }

  /// Bilinear resize so the longer side is `longSide` pixels.
  public func resized(longSide: Int) -> GrayImage {
    let scale = Double(longSide) / Double(max(width, height))
    let w = max(1, Int((Double(width) * scale).rounded()))
    let h = max(1, Int((Double(height) * scale).rounded()))
    var out = [UInt8](repeating: 0, count: w * h)
    for y in 0..<h {
      let sy = min(max((Double(y) + 0.5) / scale - 0.5, 0), Double(height - 1))
      let y0 = Int(sy), y1 = min(y0 + 1, height - 1), fy = sy - Double(y0)
      for x in 0..<w {
        let sx = min(max((Double(x) + 0.5) / scale - 0.5, 0), Double(width - 1))
        let x0 = Int(sx), x1 = min(x0 + 1, width - 1), fx = sx - Double(x0)
        let v = (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy
        out[y * w + x] = UInt8(max(0, min(255, v.rounded())))
      }
    }
    return GrayImage(width: w, height: h, pixels: out)!
  }

  public var mean: Double { pixels.reduce(0.0) { $0 + Double($1) } / Double(pixels.count) }

  /// Variance of the 4-neighbour Laplacian (OpenCV `Laplacian(ksize=1)`, reflect-101 border).
  /// Higher is sharper.
  public var laplacianVariance: Double {
    func r(_ i: Int, _ n: Int) -> Int { n == 1 ? 0 : (i < 0 ? -i : (i >= n ? 2 * n - 2 - i : i)) }
    var sum = 0.0, sq = 0.0
    for y in 0..<height {
      for x in 0..<width {
        let l = at(r(x - 1, width), y) + at(r(x + 1, width), y) + at(x, r(y - 1, height)) + at(x, r(y + 1, height)) - 4 * at(x, y)
        sum += l
        sq += l * l
      }
    }
    let n = Double(width * height)
    let m = sum / n
    return sq / n - m * m
  }
}

public struct ImageStats: Equatable, Sendable {
  public var sharpness: Double
  public var faceBrightness: Double
  public var backgroundBrightness: Double
  public var backlit: Bool

  /// Face crop resized to 256 px for a resolution-independent sharpness score, mean face
  /// brightness, and backlight (background much brighter than the face).
  public static func compute(gray: GrayImage, faceMin: Point, faceMax: Point) -> ImageStats? {
    let x0 = Int(faceMin.x), y0 = Int(faceMin.y), x1 = Int(faceMax.x), y1 = Int(faceMax.y)
    guard let face = gray.crop(x0: x0, y0: y0, x1: x1, y1: y1) else { return nil }
    let sharp = face.resized(longSide: 256).laplacianVariance
    let faceMean = face.mean
    let total = gray.mean * Double(gray.width * gray.height)
    let faceArea = Double(face.width * face.height)
    let bgArea = Double(gray.width * gray.height) - faceArea
    let bgMean = bgArea > 0 ? (total - faceMean * faceArea) / bgArea : faceMean
    return ImageStats(sharpness: sharp, faceBrightness: faceMean, backgroundBrightness: bgMean, backlit: bgMean - faceMean > 60)
  }
}
