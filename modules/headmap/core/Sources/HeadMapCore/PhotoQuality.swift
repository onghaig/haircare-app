/// Photo quality levels, mirroring AVCapturePhotoOutput.QualityPrioritization (same raw values),
/// so the clamping rule can be tested without AVFoundation.
public enum PhotoQuality: Int, Sendable, Comparable {
  case speed = 1
  case balanced = 2
  case quality = 3

  public static func < (a: PhotoQuality, b: PhotoQuality) -> Bool { a.rawValue < b.rawValue }

  /// The level to request: `wanted`, lowered to the output's `max`. Requesting more than the max
  /// makes AVCapturePhotoOutput throw an Objective-C exception, which crashes the app.
  /// An unknown max (a raw value this enum doesn't know) is treated as the safest level, `.speed`.
  public static func clamped(_ wanted: PhotoQuality, maxRawValue: Int) -> PhotoQuality {
    guard let max = PhotoQuality(rawValue: maxRawValue) else { return .speed }
    return Swift.min(wanted, max)
  }
}
