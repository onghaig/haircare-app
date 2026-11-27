import Foundation

/// One quality check the user must pass before a view is saved. Ordered by what to fix first.
public enum QualityCheck: String, CaseIterable, Sendable {
  case faceFound, hairInFrame, centred, pose, distance, backlight, exposure, foreheadVisible, sharpness, hairlineFound

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
    case .faceFound, .hairInFrame, .centred, .distance: return 0
    }
  }
}

public enum DistanceHint: String, Sendable { case ok, moveCloser, moveBack }

/// Which way to move on screen so the head sits inside the guide outline.
public enum CentringHint: String, Sendable { case ok, moveLeft, moveRight, moveUp, moveDown }

/// Top and crown views, where you can't see the screen: which way to move the phone so the hair
/// fills the middle of the frame. Directions are in the camera image, so for the crown (rear
/// camera, not mirrored, phone upright behind your head) "moveLeft" means move it to your left.
public enum AimHint: String, Sendable { case ok, noHair, moveCloser, moveLeft, moveRight, moveUp, moveDown }

public struct Aim: Equatable, Sendable {
  public var hint: AimHint
  /// Centre of the hair in the frame, 0 to 1 each way.
  public var centre: Point?
  /// Share of the whole frame that is hair, 0 to 1.
  public var hairShare: Double
}

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
  /// Coarse hair map of the frame, for the scalp map. Nil without a hair mask.
  public var hairGrid: HairGrid? = nil
  /// Top and crown views only: where to move the phone.
  public var aim: Aim? = nil
  /// Face views: a few landmark positions (pixels) by MediaPipe index, so the scalp map can fit
  /// this photo's camera to a head model.
  public var anchors: [Int: Point]? = nil
  public var passed: [QualityCheck]
  public var failed: [QualityCheck]
  /// 0 to 100. Scans under 60 are kept but left out of trend lines.
  public var score: Int
  public var allPassed: Bool { failed.isEmpty }
  /// The single most important thing to fix right now.
  public var topIssue: QualityCheck? { failed.first }

  /// Ranks frames in a crown burst: a frame with hair in it beats any without, then the score,
  /// then sharpness (capped so a noisy frame can't win on edges alone).
  public var burstRank: Double {
    let hair = failed.contains(.hairInFrame) ? 0.0 : 1000.0
    return hair + Double(score) + min(stats?.sharpness ?? 0, 400) / 40
  }
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
  /// Top and crown views: share of the centre of the frame that must be hair.
  public var minHairCoverage = 0.35
  /// Aim: how far the hair centre may sit from the frame centre, as a share of the frame.
  public var aimTolerance = 0.12
  /// Aim: under this share of the frame as hair, there is no hair in view.
  public var minAimShare = 0.05
  /// Aim: under this share, the phone is too far from the head.
  public var closeAimShare = 0.3
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

  public func aim(hair: HairMask) -> Aim {
    let found = hair.centroid()
    guard let found, found.share >= thresholds.minAimShare else {
      return Aim(hint: .noHair, centre: nil, hairShare: found?.share ?? 0)
    }
    let c = found.centre, share = found.share
    let dx = c.x - 0.5, dy = c.y - 0.5, t = thresholds.aimTolerance
    let hint: AimHint
    if abs(dx) > t || abs(dy) > t {
      hint = abs(dx) >= abs(dy) ? (dx < 0 ? .moveLeft : .moveRight) : (dy < 0 ? .moveUp : .moveDown)
    } else if share < thresholds.closeAimShare {
      hint = .moveCloser
    } else {
      hint = .ok
    }
    return Aim(hint: hint, centre: c, hairShare: share)
  }

  /// The top and crown views have no face to track (head tilted down, or the rear camera behind
  /// the head), so image checks apply, measured on the centre of the frame, plus a check that
  /// the frame is mostly hair when a hair mask is available.
  public func evaluateWithoutFace(view: ScanView, gray: GrayImage, hair: HairMask? = nil) -> QualityReport {
    let w = Double(gray.width), h = Double(gray.height)
    let stats = ImageStats.compute(gray: gray, faceMin: Point(w * 0.25, h * 0.25), faceMax: Point(w * 0.75, h * 0.75))
    var ok: [QualityCheck: Bool] = [
      .sharpness: (stats?.sharpness ?? 0) > thresholds.minSharpness,
      .exposure: stats.map { $0.faceBrightness > thresholds.minBrightness && $0.faceBrightness < thresholds.maxBrightness } ?? false,
    ]
    if view.checksHairCoverage, let hair { ok[.hairInFrame] = hair.coverage() >= thresholds.minHairCoverage }
    var score = 0
    for c in QualityCheck.allCases where ok[c] ?? true { score += c.weight }
    // A sharp photo of something other than hair is not a usable top or crown photo.
    if ok[.hairInFrame] == false { score = min(score, 40) }
    let order = QualityCheck.allCases
    var report = QualityReport(
      view: view, pose: nil, poseError: nil, distance: .ok, centring: .ok, faceWidth: nil, stats: stats, hairline: nil,
      passed: order.filter { ok[$0] == true }, failed: order.filter { ok[$0] == false }, score: score)
    report.hairGrid = hair?.grid()
    if view.checksHairCoverage { report.aim = hair.map { aim(hair: $0) } }
    return report
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
    let hairline = (view.tracesHairline ? hair : nil).map { h -> HairlineMeasure in
      let m = measurer.measure(landmarks: lm, hair: h)
      return view.measuresHairline ? m : HairlineMeasurer.templeTrace(m, landmarks: lm, view: view)
    }
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
    var report = QualityReport(
      view: view, pose: pose, poseError: poseError, distance: distance, centring: centring, faceWidth: lm.faceWidth, stats: stats, hairline: hairline,
      passed: order.filter { ok[$0] == true }, failed: order.filter { ok[$0] == false }, score: score)
    report.hairGrid = hair?.grid()
    report.anchors = Dictionary(uniqueKeysWithValues: LandmarkID.mapAnchors.map { ($0, lm[$0]) })
    return report
  }
}
