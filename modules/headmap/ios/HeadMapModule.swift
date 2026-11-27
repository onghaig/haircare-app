import AVFoundation
import ExpoModulesCore
import UIKit

public final class HeadMapModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HeadMap")

    Constant("meanInterPupilMM") { HairlineMeasurer.meanInterPupilMM }

    /// Camera permission is asked only at the scan, with a one-line reason (spec).
    AsyncFunction("requestCameraPermissionAsync") { () async -> String in
      switch AVCaptureDevice.authorizationStatus(for: .video) {
      case .authorized: return "granted"
      case .denied, .restricted: return "denied"
      case .notDetermined:
        return await AVCaptureDevice.requestAccess(for: .video) ? "granted" : "denied"
      @unknown default: return "denied"
      }
    }

    /// Voice coaching must be heard with the ring/silent switch on and over other audio, ducking
    /// music while it speaks. Called when a scan starts.
    AsyncFunction("prepareVoiceAudioAsync") { () throws in
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .mixWithOthers])
      try session.setActive(true)
    }

    /// Measure a photo from disk, for example a family photo or a past photo of yourself.
    AsyncFunction("analyzeImageAsync") { (uri: String, view: String, baselineFaceWidth: Double?) throws -> [String: Any] in
      guard let url = URL(string: uri), let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
        throw Exception(name: "ImageUnreadable", description: "Could not read the image at \(uri)")
      }
      let engine = try HeadMapEngine(mode: .image)
      let report = try engine.analyse(uiImage: image, view: ScanView(rawValue: view) ?? .front, baselineFaceWidth: baselineFaceWidth)
      return report.toDictionary(frameWidth: image.size.width * image.scale, frameHeight: image.size.height * image.scale)
    }

    /// Shrinks a photo to `width` pixels wide (upright, JPEG) in the temp folder and returns its
    /// URI. Used by the scalp map. Synchronous on purpose: async file and image calls can stall
    /// on the iOS simulator.
    Function("shrinkImageSync") { (uri: String, width: Double) throws -> String in
      guard let url = URL(string: uri), let data = try? Data(contentsOf: url), let image = UIImage(data: data) else {
        throw Exception(name: "ImageUnreadable", description: "Could not read the image at \(uri)")
      }
      let w = min(CGFloat(width), image.size.width).rounded()
      let h = max(1, (image.size.height / image.size.width * w).rounded())
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let small = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format).image { _ in
        image.draw(in: CGRect(x: 0, y: 0, width: w, height: h))
      }
      guard let jpeg = small.jpegData(compressionQuality: 0.9) else {
        throw Exception(name: "ImageUnreadable", description: "Could not shrink the image at \(uri)")
      }
      let out = FileManager.default.temporaryDirectory.appendingPathComponent("shrink-\(UUID().uuidString).jpg")
      try jpeg.write(to: out)
      return out.absoluteString
    }

    View(HeadMapCameraView.self) {
      Events("onQuality", "onAligned", "onCapture", "onError")

      Prop("view") { (v: HeadMapCameraView, value: String) in
        v.scanView = ScanView(rawValue: value) ?? .front
      }
      Prop("baselineFaceWidth") { (v: HeadMapCameraView, value: Double?) in
        v.baselineFaceWidth = value
      }
      Prop("autoCapture") { (v: HeadMapCameraView, value: Bool?) in
        v.autoCapture = value ?? true
      }
      Prop("active") { (v: HeadMapCameraView, value: Bool?) in
        v.active = value ?? true
      }

      AsyncFunction("capture") { (v: HeadMapCameraView) in v.capture() }
      AsyncFunction("resetCapture") { (v: HeadMapCameraView) in v.resetCapture() }
      AsyncFunction("startBurst") { (v: HeadMapCameraView, durationMs: Int) in v.startBurst(durationMs: durationMs) }
    }
  }
}
