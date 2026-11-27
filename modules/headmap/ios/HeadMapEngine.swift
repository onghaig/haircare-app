import AVFoundation
import CoreImage
import MediaPipeTasksVision
import UIKit

/// Runs the two on-device MediaPipe models on a frame and hands the results to the pure-Swift
/// core (HeadMapCore sources compiled into this pod) for measurement and quality scoring.
/// Nothing leaves the device.
final class HeadMapEngine {
  enum EngineError: Error, LocalizedError {
    case modelMissing(String)
    var errorDescription: String? {
      switch self {
      case .modelMissing(let name): return "Model \(name) is missing from the app bundle. Run `npm run models`."
      }
    }
  }

  private let landmarker: FaceLandmarker
  private let segmenter: ImageSegmenter
  private let scorer = QualityScorer()
  private let mode: RunningMode

  /// `video` for the live camera (frames with timestamps), `image` for single photos.
  init(mode: RunningMode) throws {
    self.mode = mode
    let face = try HeadMapEngine.modelPath("face_landmarker", "task")
    let seg = try HeadMapEngine.modelPath("selfie_multiclass_256x256", "tflite")

    let lo = FaceLandmarkerOptions()
    lo.baseOptions.modelAssetPath = face
    lo.runningMode = mode
    lo.numFaces = 1
    lo.outputFacialTransformationMatrixes = true
    landmarker = try FaceLandmarker(options: lo)

    let so = ImageSegmenterOptions()
    so.baseOptions.modelAssetPath = seg
    so.runningMode = mode
    so.shouldOutputConfidenceMasks = true
    so.shouldOutputCategoryMask = false
    segmenter = try ImageSegmenter(options: so)
  }

  static func modelPath(_ name: String, _ ext: String) throws -> String {
    let bundles = [Bundle(for: HeadMapEngine.self), Bundle.main]
    for b in bundles {
      if let url = b.url(forResource: "HeadMapModels", withExtension: "bundle"),
         let res = Bundle(url: url), let p = res.path(forResource: name, ofType: ext) {
        return p
      }
      if let p = b.path(forResource: name, ofType: ext) { return p }
    }
    throw EngineError.modelMissing("\(name).\(ext)")
  }

  /// Live frame from the camera (portrait, already mirrored for the front camera).
  func analyse(pixelBuffer: CVPixelBuffer, timestampMs: Int, view: ScanView, baselineFaceWidth: Double?) throws -> QualityReport {
    let gray = HeadMapEngine.grayImage(from: pixelBuffer)
    let image = try MPImage(pixelBuffer: pixelBuffer)
    guard view.usesFaceTracking else {
      let seg = try segmenter.segment(videoFrame: image, timestampInMilliseconds: timestampMs)
      return scorer.evaluateWithoutFace(view: view, gray: gray, hair: hairMask(seg, gray: gray))
    }
    let faces = try landmarker.detect(videoFrame: image, timestampInMilliseconds: timestampMs)
    var seg: ImageSegmenterResult?
    if view.tracesHairline { seg = try segmenter.segment(videoFrame: image, timestampInMilliseconds: timestampMs) }
    return evaluate(faces: faces, seg: seg, gray: gray, view: view, baselineFaceWidth: baselineFaceWidth)
  }

  /// A captured still photo.
  func analyse(uiImage original: UIImage, view: ScanView, baselineFaceWidth: Double?) throws -> QualityReport {
    // Bake EXIF orientation into the pixels so MediaPipe and the gray image agree.
    let uiImage = original.normalisedUp()
    guard let gray = HeadMapEngine.grayImage(from: uiImage) else {
      return scorer.evaluate(view: view, landmarks: nil, pose: nil, hair: nil, gray: nil)
    }
    let image = try MPImage(uiImage: uiImage)
    guard view.usesFaceTracking else {
      return scorer.evaluateWithoutFace(view: view, gray: gray, hair: hairMask(try segmenter.segment(image: image), gray: gray))
    }
    let faces = try landmarker.detect(image: image)
    var seg: ImageSegmenterResult?
    if view.tracesHairline { seg = try segmenter.segment(image: image) }
    return evaluate(faces: faces, seg: seg, gray: gray, view: view, baselineFaceWidth: baselineFaceWidth)
  }

  private func evaluate(faces: FaceLandmarkerResult, seg: ImageSegmenterResult?, gray: GrayImage, view: ScanView,
                        baselineFaceWidth: Double?) -> QualityReport {
    let w = Double(gray.width), h = Double(gray.height)
    guard let first = faces.faceLandmarks.first,
          let lm = FaceLandmarks(points: first.map { Point(Double($0.x) * w, Double($0.y) * h) }) else {
      return scorer.evaluate(view: view, landmarks: nil, pose: nil, hair: nil, gray: gray)
    }
    var pose: PoseAngles?
    if let m = faces.facialTransformationMatrixes.first {
      var rowMajor = [Double](repeating: 0, count: 16)
      for r in 0..<4 { for c in 0..<4 { rowMajor[r * 4 + c] = Double(m.value(atRow: UInt(r), column: UInt(c))) } }
      pose = PoseAngles.from(rowMajor: rowMajor)
    }
    let hair = hairMask(seg, gray: gray)
    return scorer.evaluate(view: view, landmarks: lm, pose: pose, hair: hair, gray: gray, baselineFaceWidth: baselineFaceWidth)
  }

  /// The hair confidence mask (class 1) from the segmenter, sized to the gray image.
  private func hairMask(_ seg: ImageSegmenterResult?, gray: GrayImage) -> HairMask? {
    guard let masks = seg?.confidenceMasks, masks.count > 1 else { return nil }
    let mask = masks[1]  // class 1 = hair
    let mw = Int(mask.width), mh = Int(mask.height)
    let ptr = mask.float32Data
    return HairMask(width: mw, height: mh, values: Array(UnsafeBufferPointer(start: ptr, count: mw * mh)),
                    imageWidth: Double(gray.width), imageHeight: Double(gray.height))
  }

  // MARK: - Grayscale conversion

  static func grayImage(from pb: CVPixelBuffer) -> GrayImage {
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
    let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
    let stride = CVPixelBufferGetBytesPerRow(pb)
    var out = [UInt8](repeating: 0, count: w * h)
    guard let base = CVPixelBufferGetBaseAddress(pb)?.assumingMemoryBound(to: UInt8.self) else {
      return GrayImage(width: w, height: h, pixels: out)!
    }
    // kCVPixelFormatType_32BGRA
    for y in 0..<h {
      let row = base + y * stride
      for x in 0..<w {
        let p = row + x * 4
        let v = (29 * Int(p[0]) + 150 * Int(p[1]) + 77 * Int(p[2])) >> 8
        out[y * w + x] = UInt8(v)
      }
    }
    return GrayImage(width: w, height: h, pixels: out)!
  }

  static func grayImage(from image: UIImage) -> GrayImage? {
    guard let cg = image.cgImage else { return nil }
    let w = cg.width, h = cg.height
    var px = [UInt8](repeating: 0, count: w * h)
    let ok = px.withUnsafeMutableBytes { buf -> Bool in
      guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
      ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    return ok ? GrayImage(width: w, height: h, pixels: px) : nil
  }
}

extension UIImage {
  func normalisedUp() -> UIImage {
    guard imageOrientation != .up else { return self }
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = scale
    return UIGraphicsImageRenderer(size: size, format: format).image { _ in draw(in: CGRect(origin: .zero, size: size)) }
  }
}

// MARK: - Serialisation for JS

extension QualityReport {
  func toDictionary(frameWidth: Double, frameHeight: Double) -> [String: Any] {
    var d: [String: Any] = [
      "view": view.rawValue,
      "score": score,
      "allPassed": allPassed,
      "passed": passed.map(\.rawValue),
      "failed": failed.map(\.rawValue),
      "distance": distance.rawValue,
      "centring": centring.rawValue,
    ]
    if let top = topIssue { d["topIssue"] = top.rawValue }
    if let fw = faceWidth { d["faceWidthPx"] = fw }
    if let p = pose { d["pose"] = ["yaw": p.yaw, "pitch": p.pitch, "roll": p.roll] }
    if let e = poseError { d["poseError"] = e }
    if let s = stats {
      d["stats"] = ["sharpness": s.sharpness, "faceBrightness": s.faceBrightness, "backlit": s.backlit]
    }
    if let hl = hairline {
      var m: [String: Any] = ["foreheadVisible": hl.foreheadVisible, "interPupilPx": hl.interPupilPx]
      if let v = hl.centreMM { m["centreMM"] = v }
      if let v = hl.leftTempleMM { m["leftTempleMM"] = v }
      if let v = hl.rightTempleMM { m["rightTempleMM"] = v }
      if let v = hl.templeRecessionIPD { m["templeRecessionIPD"] = v }
      // Normalised 0..1 so JS can draw it over any preview size.
      m["curve"] = hl.curve.map { [$0.x / frameWidth, $0.y / frameHeight] }
      d["hairline"] = m
    }
    return d
  }
}
