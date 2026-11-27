import Foundation

/// Per-pixel hair confidence (0 to 1) from the selfie multiclass segmenter (class 1).
/// The mask can be lower resolution than the image; sampling scales coordinates.
public struct HairMask: Sendable {
  public let width: Int
  public let height: Int
  public let values: [Float]
  /// Size of the image the landmarks refer to.
  public let imageWidth: Double
  public let imageHeight: Double

  public init?(width: Int, height: Int, values: [Float], imageWidth: Double, imageHeight: Double) {
    guard width > 0, height > 0, values.count == width * height, imageWidth > 0, imageHeight > 0 else { return nil }
    self.width = width
    self.height = height
    self.values = values
    self.imageWidth = imageWidth
    self.imageHeight = imageHeight
  }

  /// Bilinear sample at image coordinates. Outside the image is 0, like OpenCV's constant border.
  public func sample(_ x: Double, _ y: Double) -> Double {
    let mx = (x + 0.5) * Double(width) / imageWidth - 0.5
    let my = (y + 0.5) * Double(height) / imageHeight - 0.5
    let x0 = Int(floor(mx))
    let y0 = Int(floor(my))
    let fx = mx - Double(x0)
    let fy = my - Double(y0)
    func v(_ xi: Int, _ yi: Int) -> Double {
      guard xi >= 0, yi >= 0, xi < width, yi < height else { return 0 }
      return Double(values[yi * width + xi])
    }
    let top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx
    let bottom = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx
    return top * (1 - fy) + bottom * fy
  }

  /// Share of mask cells inside a region (fractions of the frame, 0 to 1) that are hair.
  public func coverage(x: ClosedRange<Double> = 0.2...0.8, y: ClosedRange<Double> = 0.2...0.8, threshold: Float = 0.5) -> Double {
    let x0 = max(0, Int(x.lowerBound * Double(width))), x1 = min(width, Int(x.upperBound * Double(width)))
    let y0 = max(0, Int(y.lowerBound * Double(height))), y1 = min(height, Int(y.upperBound * Double(height)))
    guard x1 > x0, y1 > y0 else { return 0 }
    var hair = 0
    for yi in y0..<y1 {
      for xi in x0..<x1 where values[yi * width + xi] >= threshold { hair += 1 }
    }
    return Double(hair) / Double((x1 - x0) * (y1 - y0))
  }

  /// Mean hair confidence per cell of a cols x rows grid over the frame, row-major from the top
  /// left. Small enough (a few hundred numbers) to save with each scan for the scalp map.
  public func grid(cols: Int = 12, rows: Int = 16) -> HairGrid {
    var out = [Double](repeating: 0, count: cols * rows)
    for r in 0..<rows {
      let y0 = r * height / rows, y1 = max(y0 + 1, (r + 1) * height / rows)
      for c in 0..<cols {
        let x0 = c * width / cols, x1 = max(x0 + 1, (c + 1) * width / cols)
        var sum = 0.0, n = 0
        for yi in y0..<min(y1, height) {
          for xi in x0..<min(x1, width) { sum += Double(values[yi * width + xi]); n += 1 }
        }
        out[r * cols + c] = n > 0 ? sum / Double(n) : 0
      }
    }
    return HairGrid(cols: cols, rows: rows, values: out)
  }

  /// Where the hair sits in the frame (0 to 1 each way) and what share of the frame is hair.
  /// Nil when no cell passes the threshold.
  public func centroid(threshold: Float = 0.5) -> (centre: Point, share: Double)? {
    var sx = 0.0, sy = 0.0, n = 0
    for yi in 0..<height {
      for xi in 0..<width where values[yi * width + xi] >= threshold {
        sx += Double(xi) + 0.5; sy += Double(yi) + 0.5; n += 1
      }
    }
    guard n > 0 else { return nil }
    return (Point(sx / Double(n) / Double(width), sy / Double(n) / Double(height)), Double(n) / Double(width * height))
  }
}

/// Hair confidence averaged over a coarse grid. Values are 0 to 1, row-major from the top left.
public struct HairGrid: Equatable, Sendable {
  public let cols: Int
  public let rows: Int
  public let values: [Double]
  public init(cols: Int, rows: Int, values: [Double]) { self.cols = cols; self.rows = rows; self.values = values }
}
