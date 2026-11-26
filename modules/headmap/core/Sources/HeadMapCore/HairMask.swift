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
}
