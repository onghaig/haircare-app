import AVFoundation
import ExpoModulesCore
import UIKit

/// Native camera view for the guided scan. Runs the camera and on-device analysis entirely in
/// Swift so the live checks stay at camera frame rate, and only small JSON reports cross to JS.
///
/// Front camera for the front, temple and top views (mirrored, so it feels like a mirror);
/// rear camera for the crown. Plays a soft tick when every check turns green and a firm tap on
/// capture. Auto-captures once alignment has held for about half a second.
final class HeadMapCameraView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {
  let onQuality = EventDispatcher()
  let onAligned = EventDispatcher()
  let onCapture = EventDispatcher()
  let onError = EventDispatcher()

  var scanView: ScanView = .front { didSet { if oldValue != scanView { reconfigure() } } }
  var baselineFaceWidth: Double?
  var autoCapture = true
  var active = true { didSet { active ? start() : stop() } }

  private let session = AVCaptureSession()
  private let previewLayer = AVCaptureVideoPreviewLayer()
  private let videoOutput = AVCaptureVideoDataOutput()
  private let photoOutput = AVCapturePhotoOutput()
  private let sessionQueue = DispatchQueue(label: "headmap.session")
  private let analysisQueue = DispatchQueue(label: "headmap.analysis", qos: .userInitiated)
  private var engine: HeadMapEngine?
  private var gate = CaptureGate()
  private var busy = false
  private var lastEmit = Date.distantPast
  private var lastReport: QualityReport?
  private var lastFrameSize = CGSize.zero
  private var capturing = false
  private let tick = UIImpactFeedbackGenerator(style: .soft)
  private let tap = UIImpactFeedbackGenerator(style: .rigid)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
    previewLayer.session = session
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    tick.prepare()
    tap.prepare()
    analysisQueue.async { [weak self] in
      do { self?.engine = try HeadMapEngine(mode: .video) } catch { self?.emitError(error) }
    }
    reconfigure()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  override func removeFromSuperview() {
    stop()
    super.removeFromSuperview()
  }

  /// Take the photo now (manual shutter, or helper mode).
  func capture() {
    sessionQueue.async { [weak self] in
      guard let self, !self.capturing, self.session.isRunning else { return }
      self.capturing = true
      let codec: AVVideoCodecType = self.photoOutput.availablePhotoCodecTypes.contains(.hevc) ? .hevc : .jpeg
      let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: codec])
      // Asking for more than the output's max throws an Objective-C exception (a crash Swift
      // can't catch), and the max depends on the device, camera and preset. Clamp to it.
      let level = PhotoQuality.clamped(.quality, maxRawValue: self.photoOutput.maxPhotoQualityPrioritization.rawValue)
      settings.photoQualityPrioritization = AVCapturePhotoOutput.QualityPrioritization(rawValue: level.rawValue) ?? .speed
      self.photoOutput.capturePhoto(with: settings, delegate: self)
    }
  }

  func resetCapture() {
    analysisQueue.async { [weak self] in self?.gate.reset() }
  }

  // MARK: - Session

  private func reconfigure() {
    let position: AVCaptureDevice.Position = scanView == .crown ? .back : .front
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.session.beginConfiguration()
      self.session.sessionPreset = .hd1280x720
      self.session.inputs.forEach { self.session.removeInput($0) }
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
            let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
        self.session.commitConfiguration()
        self.emitError(NSError(domain: "HeadMap", code: 1, userInfo: [NSLocalizedDescriptionKey: "Camera unavailable"]))
        return
      }
      self.session.addInput(input)
      if self.session.outputs.isEmpty {
        self.videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        self.videoOutput.alwaysDiscardsLateVideoFrames = true
        self.videoOutput.setSampleBufferDelegate(self, queue: self.analysisQueue)
        if self.session.canAddOutput(self.videoOutput) { self.session.addOutput(self.videoOutput) }
        if self.session.canAddOutput(self.photoOutput) { self.session.addOutput(self.photoOutput) }
      }
      // Raise the ceiling so sharp, low-noise stills are allowed (it defaults to .balanced).
      // Re-applied on every camera switch; capture() still clamps in case the device refuses.
      self.photoOutput.maxPhotoQualityPrioritization = .quality
      for output in [self.videoOutput, self.photoOutput] as [AVCaptureOutput] {
        guard let conn = output.connection(with: .video) else { continue }
        if #available(iOS 17.0, *) {
          if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 }
        } else if conn.isVideoOrientationSupported {
          conn.videoOrientation = .portrait
        }
        if conn.isVideoMirroringSupported {
          conn.automaticallyAdjustsVideoMirroring = false
          conn.isVideoMirrored = position == .front
        }
      }
      self.session.commitConfiguration()
      self.analysisQueue.async { self.gate.reset() }
      if self.active, !self.session.isRunning { self.session.startRunning() }
    }
  }

  private func start() {
    sessionQueue.async { [weak self] in
      guard let self, !self.session.isRunning else { return }
      self.session.startRunning()
    }
  }

  private func stop() {
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else { return }
      self.session.stopRunning()
    }
  }

  // MARK: - Live analysis

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard !busy, !capturing, let engine, let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    busy = true
    defer { busy = false }
    let ts = Int(CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000)
    let size = CGSize(width: CVPixelBufferGetWidth(pb), height: CVPixelBufferGetHeight(pb))
    lastFrameSize = size
    do {
      let report = try engine.analyse(pixelBuffer: pb, timestampMs: ts, view: scanView, baselineFaceWidth: baselineFaceWidth)
      lastReport = report
      for event in gate.update(allPassed: report.allPassed) {
        switch event {
        case .aligned:
          DispatchQueue.main.async { self.tick.impactOccurred(); self.tick.prepare() }
          onAligned(["view": scanView.rawValue])
        case .lost:
          break
        case .capture:
          if autoCapture { capture() }
        }
      }
      // ~8 reports a second is plenty for UI and keeps the JS thread free.
      if Date().timeIntervalSince(lastEmit) > 0.12 {
        lastEmit = Date()
        onQuality(report.toDictionary(frameWidth: size.width, frameHeight: size.height))
      }
    } catch {
      emitError(error)
    }
  }

  // MARK: - Photo

  func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    defer { sessionQueue.async { self.capturing = false } }
    if let error { emitError(error); return }
    guard let data = photo.fileDataRepresentation() else { return }
    DispatchQueue.main.async { self.tap.impactOccurred(); self.tap.prepare() }
    let ext = output.availablePhotoCodecTypes.contains(.hevc) ? "heic" : "jpg"
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("headmap-\(scanView.rawValue)-\(UUID().uuidString).\(ext)")
    do {
      try data.write(to: url, options: .completeFileProtection)
    } catch {
      emitError(error)
      return
    }
    let view = scanView
    let baseline = baselineFaceWidth
    analysisQueue.async { [weak self] in
      guard let self else { return }
      // Re-measure on the full-resolution still for the saved record.
      var payload: [String: Any] = ["uri": url.absoluteString, "view": view.rawValue]
      if let image = UIImage(data: data), let still = try? HeadMapEngine(mode: .image),
         let report = try? still.analyse(uiImage: image, view: view, baselineFaceWidth: baseline) {
        payload["report"] = report.toDictionary(frameWidth: image.size.width * image.scale, frameHeight: image.size.height * image.scale)
      } else if let live = self.lastReport {
        payload["report"] = live.toDictionary(frameWidth: self.lastFrameSize.width, frameHeight: self.lastFrameSize.height)
      }
      self.onCapture(payload)
    }
  }

  private func emitError(_ error: Error) {
    onError(["message": error.localizedDescription])
  }
}
