import Foundation

/// One quality check the user must pass before a view is saved. Ordered by what to fix first.
public enum QualityCheck: String, CaseIterable, Sendable {
  case faceFound, centred, pose, distance, backlight, exposure, foreheadVisible, sharpness, hairlineFound

  /// Weight in the 0 to 100 scan quality score (same weights as the Python reference;
  /// distance and face-found gate capture but do not score).
  public var weight: Int {
    switch self {
    case .pose: return 25
    case .sharpness: return 20
    case .exposure: return 15
    case .backlight: return 10
    case .foreheadVisible: return 20
    case .hairlineFound: return 10
    case .faceFound, .centred, .distance: return 0
    }
  }
}

public enum DistanceHint: String, Sendable { case ok, moveCloser, moveBack }

/// Which way to move on screen so the head sits inside the guide outline.
public enum CentringHint: String, Sendable { case ok, moveLeft, moveRight, moveUp, moveDown }

public struct QualityReport: Equatable, Sendable {
  public var view: ScanView
  public var pose: PoseAngles?
  public var poseError: Double?
  public var distance: DistanceHint
  public var centring: CentringHint
  /// Face width in pixels; saved with the baseline scan for later distance checks.
  public var faceWidth: Double?
  public var stats: ImageStats?
  public var hairline: HairlineMeasure?
  public var passed: [QualityCheck]
  public var failed: [QualityCheck]
  /// 0 to 100. Scans under 60 are kept but left out of trend lines.
  public var score: Int
  public var allPassed: Bool { failed.isEmpty }
  /// The single most important thing to fix right now.
  public var topIssue: QualityCheck? { failed.first }
}

public struct QualityThresholds: Sendable {
  public var poseToleranceDeg = 5.0
  public var minSharpness = 40.0
  /// Mean face brightness (0 to 255) must sit strictly between these.
  public var minBrightness = 60.0
  public var maxBrightness = 210.0
  /// Allowed face width relative to the baseline scan (plus or minus).
  public var distanceTolerance = 0.10
  /// Face width as a share of the frame width when there is no baseline yet.
  public var firstScanFaceShare = 0.38...0.62
  /// Where the face centre should sit, as a share of the frame (the guide outline's centre).
  public var guideCentre = Point(0.5, 0.45)
  /// Allowed offset of the face centre from the guide centre, as a share of the frame.
  public var centringTolerance = 0.08
  public init() {}
}

public struct QualityScorer: Sendable {
  public var thresholds: QualityThresholds
  public var measurer = HairlineMeasurer()

  public init(thresholds: QualityThresholds = QualityThresholds()) { self.thresholds = thresholds }

  public func distanceHint(faceWidth: Double, frameWidth: Double, baselineFaceWidth: Double?) -> DistanceHint {
    if let base = baselineFaceWidth, base > 0 {
      let ratio = faceWidth / base
      if ratio < 1 - thresholds.distanceTolerance { return .moveCloser }
      if ratio > 1 + thresholds.distanceTolerance { return .moveBack }
      return .ok
    }
    let share = faceWidth / frameWidth
    if share < thresholds.firstScanFaceShare.lowerBound { return .moveCloser }
    if share > thresholds.firstScanFaceShare.upperBound { return .moveBack }
    return .ok
  }

  /// Screen coordinates (mirrored preview already applied). Face too far left means move right.
  public func centringHint(faceCentre: Point, frameWidth: Double, frameHeight: Double) -> CentringHint {
    let dx = faceCentre.x / frameWidth - thresholds.guideCentre.x
    let dy = faceCentre.y / frameHeight - thresholds.guideCentre.y
    let t = thresholds.centringTolerance
    if abs(dx) <= t && abs(dy) <= t { return .ok }
    if abs(dx) >= abs(dy) { return dx < 0 ? .moveRight : .moveLeft }
    return dy < 0 ? .moveDown : .moveUp
  }

  /// The crown view has no face to track (rear camera, voice guidance), so only image checks
  /// apply, measured on the centre of the frame.
  public func evaluateWithoutFace(view: ScanView, gray: GrayImage) -> QualityReport {
    let w = Double(gray.width), h = Double(gray.height)
    let stats = ImageStats.compute(gray: gray, faceMin: Point(w * 0.25, h * 0.25), faceMax: Point(w * 0.75, h * 0.75))
    let ok: [QualityCheck: Bool] = [
      .sharpness: (stats?.sharpness ?? 0) > thresholds.minSharpness,
      .exposure: stats.map { $0.faceBrightness > thresholds.minBrightness && $0.faceBrightness < thresholds.maxBrightness } ?? false,
    ]
    var score = 0
    for c in QualityCheck.allCases where ok[c] ?? true { score += c.weight }
    let order = QualityCheck.allCases
    return QualityReport(
      view: view, pose: nil, poseError: nil, distance: .ok, centring: .ok, faceWidth: nil, stats: stats, hairline: nil,
      passed: order.filter { ok[$0] == true }, failed: order.filter { ok[$0] == false }, score: score)
  }

  /// Scores one frame. Pass `landmarks: nil` when no face was found.
  public func evaluate(
    view: ScanView, landmarks: FaceLandmarks?, pose: PoseAngles?, hair: HairMask?, gray: GrayImage?,
    baselineFaceWidth: Double? = nil
  ) -> QualityReport {
    guard let lm = landmarks else {
      return QualityReport(view: view, pose: nil, poseError: nil, distance: .ok, centring: .ok, faceWidth: nil, stats: nil, hairline: nil,
                           passed: [], failed: [.faceFound], score: 0)
    }
    let (lo, hi) = lm.boundingBox
    let stats = gray.flatMap { ImageStats.compute(gray: $0, faceMin: lo, faceMax: hi) }
    let hairline = (view.measuresHairline ? hair : nil).map { measurer.measure(landmarks: lm, hair: $0) }
    let poseError = pose?.maxDeviation(from: view.targetPose)
    let frameWidth = hair?.imageWidth ?? gray.map { Double($0.width) } ?? lm.faceWidth * 2
    let frameHeight = hair?.imageHeight ?? gray.map { Double($0.height) } ?? frameWidth * 16 / 9
    let distance = distanceHint(faceWidth: lm.faceWidth, frameWidth: frameWidth, baselineFaceWidth: baselineFaceWidth)
    let centring = centringHint(faceCentre: (lo + hi) * 0.5, frameWidth: frameWidth, frameHeight: frameHeight)

    var ok: [QualityCheck: Bool] = [
      .faceFound: true,
      .centred: centring == .ok,
      .pose: (poseError ?? .infinity) <= thresholds.poseToleranceDeg,
      .distance: distance == .ok,
      .sharpness: (stats?.sharpness ?? 0) > thresholds.minSharpness,
      .exposure: stats.map { $0.faceBrightness > thresholds.minBrightness && $0.faceBrightness < thresholds.maxBrightness } ?? false,
      .backlight: !(stats?.backlit ?? false),
    ]
    if view.needsForehead { ok[.foreheadVisible] = hairline?.foreheadVisible ?? false }
    if view.measuresHairline { ok[.hairlineFound] = hairline?.hairlineFound ?? false }

    // Checks that do not apply to this view count as passed for the score.
    var score = 0
    for c in QualityCheck.allCases where ok[c] ?? true { score += c.weight }
    let order = QualityCheck.allCases
    return QualityReport(
      view: view, pose: pose, poseError: poseError, distance: distance, centring: centring, faceWidth: lm.faceWidth, stats: stats, hairline: hairline,
      passed: order.filter { ok[$0] == true }, failed: order.filter { ok[$0] == false }, score: score)
  }
}
