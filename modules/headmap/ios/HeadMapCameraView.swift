import AVFoundation
import CoreImage
import CoreMotion
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
  let onPanorama = EventDispatcher()
  let onPanoramaDone = EventDispatcher()

  var scanView: ScanView = .front { didSet { if oldValue != scanView { reconfigure() } } }
  var baselineFaceWidth: Double?
  var autoCapture = true
  var active = true { didSet { active ? start() : stop() } }
  /// Whole-head panorama: off, the face sweep (front camera) or the back of the head (back camera).
  var panoramaMode: PanoramaMode = .off {
    didSet {
      guard oldValue != panoramaMode else { return }
      panoramaModeChanged()
    }
  }

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
  #if targetEnvironment(simulator)
  /// Simulator only: a sample face fed through the real analysis, since there is no camera.
  private var demo: DemoFeed?
  #endif
  private let tick = UIImpactFeedbackGenerator(style: .soft)
  private let tap = UIImpactFeedbackGenerator(style: .rigid)
  /// Crown burst: until `until`, every analysed frame is ranked and the best one is kept.
  /// Only touched on the analysis queue.
  private var burst: (id: Int, until: Date, best: UIImage?, report: QualityReport?, size: CGSize)?
  private var burstCount = 0
  private let ciContext = CIContext()
  /// Panorama: best JPEG per head region, with its report. Analysis queue only.
  private var panorama = PanoramaCollector<(data: Data, report: QualityReport, size: CGSize)>()
  private var panoramaStartHeading: Double?
  private var lastPanoramaEmit = Date.distantPast
  private let motion = CMMotionManager()

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
    #if targetEnvironment(simulator)
    layoutDemo()
    #endif
  }

  override func removeFromSuperview() {
    stop()
    super.removeFromSuperview()
  }

  /// Take the photo now (manual shutter, or helper mode).
  func capture() {
    #if targetEnvironment(simulator)
    if demo != nil { captureDemo(); return }
    #endif
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

  /// Crown, on your own: watch the frames for `durationMs` and save the best one (hair in frame,
  /// then score, then sharpness), instead of trusting one shutter press you can't see.
  func startBurst(durationMs: Int) {
    analysisQueue.async { [weak self] in
      guard let self else { return }
      self.burstCount += 1
      let id = self.burstCount
      self.burst = (id, Date().addingTimeInterval(Double(max(200, durationMs)) / 1000), nil, nil, .zero)
      let deadline = DispatchTime.now() + .milliseconds(max(200, durationMs) + 400)
      // Safety net: if no frames arrive (camera stalled), finish this burst anyway.
      self.analysisQueue.asyncAfter(deadline: deadline) { [weak self] in
        guard let self, self.burst?.id == id else { return }
        self.finishBurst(force: true)
      }
    }
  }

  /// Analysis queue only. Keeps this frame if it beats the best so far.
  private func offerBurstFrame(_ report: QualityReport, size: CGSize, image: () -> UIImage?) {
    guard var b = burst else { return }
    if b.report == nil || report.burstRank > b.report!.burstRank, let img = image() {
      b.best = img
      b.report = report
      b.size = size
    }
    burst = b
    if Date() >= b.until { finishBurst(force: false) }
  }

  private func finishBurst(force: Bool) {
    guard let b = burst, force || Date() >= b.until else { return }
    burst = nil
    gate.reset()
    guard let best = b.best, let data = best.jpegData(compressionQuality: 0.9) else {
      // No frame made it in: fall back to a normal photo.
      DispatchQueue.main.async { self.capture() }
      return
    }
    let view = scanView
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("headmap-burst-\(view.rawValue)-\(UUID().uuidString).jpg")
    do {
      try data.write(to: url, options: .completeFileProtection)
    } catch {
      emitError(error)
      return
    }
    DispatchQueue.main.async { self.tap.impactOccurred(); self.tap.prepare() }
    var payload: [String: Any] = ["uri": url.absoluteString, "view": view.rawValue, "burst": true]
    if let r = b.report { payload["report"] = r.toDictionary(frameWidth: b.size.width, frameHeight: b.size.height) }
    onCapture(payload)
  }

  func resetCapture() {
    analysisQueue.async { [weak self] in self?.gate.reset() }
  }

  // MARK: - Whole-head panorama

  private func panoramaModeChanged() {
    let mode = panoramaMode
    if mode == .back {
      // Device motion needs no permission. Pull mode: the analysis queue reads the latest sample.
      if motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive {
        motion.deviceMotionUpdateInterval = 1.0 / 30
        motion.startDeviceMotionUpdates(using: .xArbitraryZVertical)
      }
    } else if motion.isDeviceMotionActive {
      motion.stopDeviceMotionUpdates()
    }
    analysisQueue.async { [weak self] in self?.panoramaStartHeading = nil }
    reconfigure()
  }

  /// Where the back camera points: heading round the vertical, and how far down it points.
  /// Nil without motion data (the simulator): then the frame counts for the back of the head.
  private func backCameraDirection() -> (heading: Double, pitchDown: Double)? {
    guard let m = motion.deviceMotion?.attitude.rotationMatrix else { return nil }
    // The back camera looks along the device's -Z axis. In the reference frame (Z up):
    let fx = -m.m31, fy = -m.m32, fz = -m.m33
    let deg = 180.0 / Double.pi
    return (atan2(fy, fx) * deg, asin(max(-1, min(1, -fz))) * deg)
  }

  /// Analysis queue only. Files the frame under its head region if it beats what is there.
  private func offerPanoramaFrame(_ report: QualityReport, mode: PanoramaMode, size: CGSize, image: () -> UIImage?) {
    var angles: (azimuth: Double, elevation: Double)?
    if mode == .face, let p = report.pose {
      angles = PanoramaCells.faceAngles(yaw: p.yaw, pitch: p.pitch)
    } else if mode == .back {
      if let d = backCameraDirection() {
        if panoramaStartHeading == nil { panoramaStartHeading = d.heading }
        angles = PanoramaCells.backAngles(heading: d.heading, startHeading: panoramaStartHeading ?? d.heading, pitchDown: d.pitchDown)
      } else {
        angles = PanoramaCells.backAngles(heading: 0, startHeading: 0, pitchDown: 10)
      }
    }
    let ok = PanoramaCells.accepts(report, mode: mode)
    var cell: Int?
    var isNew = false
    if let a = angles {
      let c = PanoramaCells.cell(azimuth: a.azimuth, elevation: a.elevation)
      cell = c
      let rank = PanoramaCells.rank(report)
      if ok, panorama.wants(cell: c, rank: rank), let img = image(), let data = img.jpegData(compressionQuality: 0.82) {
        isNew = panorama.offer(cell: c, rank: rank, frame: (data, report, size), azimuth: a.azimuth, elevation: a.elevation, mode: mode)
      }
    }
    if isNew { DispatchQueue.main.async { self.tick.impactOccurred(); self.tick.prepare() } }
    // About 8 updates a second, and at once when a region fills.
    guard isNew || Date().timeIntervalSince(lastPanoramaEmit) > 0.12 else { return }
    lastPanoramaEmit = Date()
    var payload: [String: Any] = ["mode": mode.rawValue, "filled": panorama.filled, "ok": ok]
    if let cell { payload["cell"] = cell }
    if let a = angles { payload["azimuth"] = a.azimuth; payload["elevation"] = a.elevation }
    if let p = report.pose { payload["yaw"] = p.yaw; payload["pitch"] = p.pitch }
    onPanorama(payload)
  }

  /// Saves the best frame of every region and sends them to JS in one event.
  func finishPanorama() {
    analysisQueue.async { [weak self] in
      guard let self else { return }
      var frames: [[String: Any]] = []
      for (cell, e) in self.panorama.entries.sorted(by: { $0.key < $1.key }) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("headmap-pano-\(cell)-\(UUID().uuidString).jpg")
        do {
          try e.frame.data.write(to: url, options: .completeFileProtection)
        } catch {
          self.emitError(error)
          return
        }
        frames.append([
          "uri": url.absoluteString, "cell": cell, "azimuth": e.azimuth, "elevation": e.elevation, "mode": e.mode.rawValue,
          "report": e.frame.report.toDictionary(frameWidth: e.frame.size.width, frameHeight: e.frame.size.height),
        ])
      }
      DispatchQueue.main.async { self.tap.impactOccurred(); self.tap.prepare() }
      self.onPanoramaDone(["frames": frames])
    }
  }

  func resetPanorama() {
    analysisQueue.async { [weak self] in
      self?.panorama.reset()
      self?.panoramaStartHeading = nil
    }
  }

  // MARK: - Session

  private func reconfigure() {
    let position: AVCaptureDevice.Position = (scanView == .crown || panoramaMode == .back) ? .back : .front
    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.session.beginConfiguration()
      self.session.sessionPreset = .hd1280x720
      self.session.inputs.forEach { self.session.removeInput($0) }
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
            let input = try? AVCaptureDeviceInput(device: device), self.session.canAddInput(input) else {
        self.session.commitConfiguration()
        #if targetEnvironment(simulator)
        if self.startDemoFeed() { return }
        #endif
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
      if panoramaMode != .off {
        let mode = panoramaMode
        let report = try engine.analyse(pixelBuffer: pb, timestampMs: ts, view: mode == .face ? .front : .crown, baselineFaceWidth: nil)
        offerPanoramaFrame(report, mode: mode, size: size) {
          let ci = CIImage(cvPixelBuffer: pb)
          return ciContext.createCGImage(ci, from: ci.extent).map { UIImage(cgImage: $0) }
        }
        return
      }
      let report = try engine.analyse(pixelBuffer: pb, timestampMs: ts, view: scanView, baselineFaceWidth: baselineFaceWidth)
      lastReport = report
      if burst != nil {
        offerBurstFrame(report, size: size) {
          let ci = CIImage(cvPixelBuffer: pb)
          return ciContext.createCGImage(ci, from: ci.extent).map { UIImage(cgImage: $0) }
        }
        return
      }
      gate.holdFrames = CaptureGate.holdFrames(for: scanView)
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

  /// An error raised before the view is on screen (for example "Camera unavailable" during
  /// init) would be dropped, because JS has not attached its listener yet. Hold it until then.
  private var pendingError: Error?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil, let error = pendingError {
      pendingError = nil
      onError(["message": error.localizedDescription])
    }
  }

  private func emitError(_ error: Error) {
    DispatchQueue.main.async {
      guard self.window != nil else {
        self.pendingError = error
        return
      }
      self.onError(["message": error.localizedDescription])
    }
  }
}

#if targetEnvironment(simulator)
// MARK: - Simulator demo feed
//
// The iOS simulator has no camera. When the app was built with the demo face
// (e2e/assets/demo_face.jpg, an illustration copied in by CI only), the simulator shows it and runs it
// through the same MediaPipe analysis, quality checks, capture gate and capture events as a
// real camera, so the whole scan can be walked through and recorded. Device builds never
// compile this code.

final class DemoFeed {
  let source: UIImage
  let imageView = UIImageView()
  var frame: UIImage?
  var timer: DispatchSourceTimer?
  var engine: HeadMapEngine?

  init(source: UIImage) {
    self.source = source
    imageView.contentMode = .scaleToFill
    imageView.backgroundColor = .black
  }

  /// The photo fitted into a canvas with the view's aspect ratio, so normalised coordinates
  /// from the analysis line up with the screen exactly.
  static func compose(_ image: UIImage, canvas: CGSize) -> UIImage {
    let size = CGSize(width: 720, height: 720 * canvas.height / max(canvas.width, 1))
    let scale = max(size.width / image.size.width, size.height * 0.62 / image.size.height)
    let w = image.size.width * scale
    let h = image.size.height * scale
    let rect = CGRect(x: (size.width - w) / 2, y: size.height * 0.45 - h * 0.48, width: w, height: h)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
      UIColor.black.setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      image.draw(in: rect)
    }
  }

  static func loadSource() -> UIImage? {
    guard let path = try? HeadMapEngine.modelPath("demo_face", "jpg") else { return nil }
    return UIImage(contentsOfFile: path)
  }
}

extension HeadMapCameraView {
  /// Returns false when the build has no demo face, so the normal "Camera unavailable" error shows.
  fileprivate func startDemoFeed() -> Bool {
    if demo != nil { return true }
    guard let source = DemoFeed.loadSource() else { return false }
    let feed = DemoFeed(source: source)
    feed.engine = try? HeadMapEngine(mode: .image)
    demo = feed
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.insertSubview(feed.imageView, at: 0)
      self.layoutDemo()
    }
    let timer = DispatchSource.makeTimerSource(queue: analysisQueue)
    timer.schedule(deadline: .now() + 0.3, repeating: 0.15)
    timer.setEventHandler { [weak self] in self?.analyseDemoFrame() }
    timer.resume()
    feed.timer = timer
    return true
  }

  fileprivate func layoutDemo() {
    guard let demo, bounds.width > 0 else { return }
    demo.imageView.frame = bounds
    let composed = DemoFeed.compose(demo.source, canvas: bounds.size)
    demo.imageView.image = composed
    analysisQueue.async { demo.frame = composed }
  }

  private func analyseDemoFrame() {
    guard active, !capturing, let demo, let frame = demo.frame, let engine = demo.engine else { return }
    do {
      if panoramaMode != .off {
        let mode = panoramaMode
        let report = try engine.analyse(uiImage: frame, view: mode == .face ? .front : .crown, baselineFaceWidth: nil)
        offerPanoramaFrame(report, mode: mode, size: frame.size) { frame }
        return
      }
      let report = try engine.analyse(uiImage: frame, view: scanView, baselineFaceWidth: baselineFaceWidth)
      lastReport = report
      lastFrameSize = frame.size
      if burst != nil {
        offerBurstFrame(report, size: frame.size) { frame }
        return
      }
      gate.holdFrames = CaptureGate.holdFrames(for: scanView)
      for event in gate.update(allPassed: report.allPassed) {
        switch event {
        case .aligned: onAligned(["view": scanView.rawValue])
        case .lost: break
        // No auto-capture in the demo: a still photo would pass and skip views on its own,
        // which makes recordings and E2E runs unpredictable. Shots are taken by hand.
        case .capture: break
        }
      }
      onQuality(report.toDictionary(frameWidth: frame.size.width, frameHeight: frame.size.height))
    } catch {
      emitError(error)
    }
  }

  fileprivate func captureDemo() {
    analysisQueue.async { [weak self] in
      guard let self, !self.capturing, let demo = self.demo, let frame = demo.frame,
            let data = frame.jpegData(compressionQuality: 0.85) else { return }
      self.capturing = true
      defer { self.capturing = false }
      let view = self.scanView
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("headmap-demo-\(view.rawValue)-\(UUID().uuidString).jpg")
      do {
        try data.write(to: url)
      } catch {
        self.emitError(error)
        return
      }
      DispatchQueue.main.async { self.tap.impactOccurred() }
      var payload: [String: Any] = ["uri": url.absoluteString, "view": view.rawValue]
      if let report = try? demo.engine?.analyse(uiImage: frame, view: view, baselineFaceWidth: self.baselineFaceWidth) {
        payload["report"] = report.toDictionary(frameWidth: frame.size.width, frameHeight: frame.size.height)
      }
      self.gate.reset()
      self.onCapture(payload)
    }
  }
}
#endif
