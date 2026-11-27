import XCTest
@testable import HeadMapCore

final class PoseTests: XCTestCase {
  func testIdentityIsZero() throws {
    let p = try XCTUnwrap(PoseAngles.from(rowMajor: Fixture.rotationMatrix()))
    XCTAssertEqual(p.yaw, 0, accuracy: 1e-9)
    XCTAssertEqual(p.pitch, 0, accuracy: 1e-9)
    XCTAssertEqual(p.roll, 0, accuracy: 1e-9)
  }

  func testSingleAxisRotations() throws {
    XCTAssertEqual(try XCTUnwrap(PoseAngles.from(rowMajor: Fixture.rotationMatrix(yaw: 30))).yaw, 30, accuracy: 1e-6)
    XCTAssertEqual(try XCTUnwrap(PoseAngles.from(rowMajor: Fixture.rotationMatrix(pitch: -20))).pitch, -20, accuracy: 1e-6)
    XCTAssertEqual(try XCTUnwrap(PoseAngles.from(rowMajor: Fixture.rotationMatrix(roll: 7))).roll, 7, accuracy: 1e-6)
  }

  func testRejectsShortMatrices() {
    XCTAssertNil(PoseAngles.from(rowMajor: [1, 0, 0]))
  }

  func testMaxDeviation() {
    let p = PoseAngles(yaw: 44, pitch: 3, roll: -6)
    XCTAssertEqual(p.maxDeviation(from: ScanView.rightTemple.targetPose), 6, accuracy: 1e-9)
  }
}

final class ImageStatsTests: XCTestCase {
  func testFlatImageHasZeroSharpness() {
    let g = GrayImage(width: 20, height: 20, pixels: [UInt8](repeating: 100, count: 400))!
    XCTAssertEqual(g.laplacianVariance, 0, accuracy: 1e-9)
    XCTAssertEqual(g.mean, 100, accuracy: 1e-9)
  }

  func testTextureIsSharperThanABlur() {
    let sharp = Fixture.gray(width: 64, height: 64, faceMin: Point(0, 0), faceMax: Point(64, 64))
    let flat = Fixture.gray(width: 64, height: 64, faceMin: Point(0, 0), faceMax: Point(64, 64), textured: false)
    XCTAssertGreaterThan(sharp.laplacianVariance, 40)
    XCTAssertLessThan(flat.laplacianVariance, sharp.laplacianVariance)
  }

  func testResizeKeepsAspectRatio() {
    let g = GrayImage(width: 400, height: 200, pixels: [UInt8](repeating: 9, count: 80_000))!
    let r = g.resized(longSide: 256)
    XCTAssertEqual(r.width, 256)
    XCTAssertEqual(r.height, 128)
    XCTAssertEqual(r.mean, 9, accuracy: 1e-9)
  }

  func testCropClampsToTheImage() {
    let g = GrayImage(width: 10, height: 10, pixels: [UInt8](repeating: 1, count: 100))!
    XCTAssertEqual(g.crop(x0: -5, y0: 5, x1: 4, y1: 50)?.width, 4)
    XCTAssertEqual(g.crop(x0: -5, y0: 5, x1: 4, y1: 50)?.height, 5)
    XCTAssertNil(g.crop(x0: 5, y0: 5, x1: 5, y1: 9))
  }

  func testBacklightIsBrightBackgroundBehindADarkFace() throws {
    let g = Fixture.gray(width: 100, height: 100, faceMin: Point(30, 30), faceMax: Point(70, 70), face: 60, background: 200)
    let s = try XCTUnwrap(ImageStats.compute(gray: g, faceMin: Point(30, 30), faceMax: Point(70, 70)))
    XCTAssertTrue(s.backlit)
    XCTAssertEqual(s.faceBrightness, 60, accuracy: 3)
    let even = Fixture.gray(width: 100, height: 100, faceMin: Point(30, 30), faceMax: Point(70, 70))
    XCTAssertFalse(try XCTUnwrap(ImageStats.compute(gray: even, faceMin: Point(30, 30), faceMax: Point(70, 70))).backlit)
  }
}

final class QualityScorerTests: XCTestCase {
  let scorer = QualityScorer()
  let w = 500, h = 600
  // Eyes at y 230 put the face box centre on the guide centre (45% down the frame).
  var centre: Point { Point(250, 230) }

  func frame(yaw: Double = 0, face: Int = 128, background: Int = 128, hairCentre: Double = 1.0,
             view: ScanView = .front, baseline: Double? = nil, ipd: Double = 100) -> QualityReport {
    let lm = Fixture.landmarks(centre: centre, ipd: ipd)
    let hair = Fixture.hairMask(width: w, height: h, centre: centre, ipd: ipd, hairCentre: hairCentre, hairTemple: hairCentre + 0.3)
    let (lo, hi) = lm.boundingBox
    let gray = Fixture.gray(width: w, height: h, faceMin: lo, faceMax: hi, face: face, background: background)
    let pose = PoseAngles.from(rowMajor: Fixture.rotationMatrix(yaw: yaw))
    return scorer.evaluate(view: view, landmarks: lm, pose: pose, hair: hair, gray: gray, baselineFaceWidth: baseline)
  }

  func testAGoodFrontFramePassesEverything() {
    let r = frame()
    XCTAssertEqual(r.failed, [], "failed: \(r.failed)")
    XCTAssertEqual(r.score, 100)
    XCTAssertTrue(r.allPassed)
    XCTAssertNotNil(r.hairline?.centreMM)
  }

  func testNoFaceScoresZero() {
    let r = scorer.evaluate(view: .front, landmarks: nil, pose: nil, hair: nil, gray: nil)
    XCTAssertEqual(r.failed, [.faceFound])
    XCTAssertEqual(r.score, 0)
    XCTAssertEqual(r.topIssue, .faceFound)
  }

  func testTurnedHeadFailsPoseFirst() {
    let r = frame(yaw: 10)
    XCTAssertEqual(r.topIssue, .pose)
    XCTAssertEqual(r.score, 75)
  }

  func testTempleViewExpectsA45DegreeTurnAndNoHairline() {
    let r = frame(yaw: 44, view: .rightTemple)
    XCTAssertTrue(frame(yaw: -44, view: .leftTemple).passed.contains(.pose))
    XCTAssertFalse(r.failed.contains(.pose))
    XCTAssertNil(r.hairline)
    XCTAssertFalse(r.failed.contains(.foreheadVisible))
    XCTAssertFalse(r.failed.contains(.hairlineFound))
  }

  func testDarkFrameFailsExposure() {
    XCTAssertTrue(frame(face: 30, background: 30).failed.contains(.exposure))
  }

  func testBacklitFrameFailsBacklight() {
    XCTAssertTrue(frame(face: 90, background: 230).failed.contains(.backlight))
  }

  func testFringeFailsForehead() {
    XCTAssertTrue(frame(hairCentre: 0.25).failed.contains(.foreheadVisible))
  }

  func testDistanceAgainstTheBaselineScan() {
    let width = Fixture.landmarks(centre: centre, ipd: 100).faceWidth
    XCTAssertEqual(frame(baseline: width).distance, .ok)
    XCTAssertEqual(frame(baseline: width * 1.3).distance, .moveCloser)
    XCTAssertEqual(frame(baseline: width * 0.7).distance, .moveBack)
    XCTAssertTrue(frame(baseline: width * 1.3).failed.contains(.distance))
  }

  func testDistanceOnTheFirstScanUsesFrameShare() {
    XCTAssertEqual(scorer.distanceHint(faceWidth: 100, frameWidth: 500, baselineFaceWidth: nil), .moveCloser)
    XCTAssertEqual(scorer.distanceHint(faceWidth: 250, frameWidth: 500, baselineFaceWidth: nil), .ok)
    XCTAssertEqual(scorer.distanceHint(faceWidth: 400, frameWidth: 500, baselineFaceWidth: nil), .moveBack)
  }

  func testCentringPointsTheUserBackToTheGuide() {
    let s = scorer
    XCTAssertEqual(s.centringHint(faceCentre: Point(250, 270), frameWidth: 500, frameHeight: 600), .ok)
    XCTAssertEqual(s.centringHint(faceCentre: Point(100, 270), frameWidth: 500, frameHeight: 600), .moveRight)
    XCTAssertEqual(s.centringHint(faceCentre: Point(400, 270), frameWidth: 500, frameHeight: 600), .moveLeft)
    XCTAssertEqual(s.centringHint(faceCentre: Point(250, 100), frameWidth: 500, frameHeight: 600), .moveDown)
    XCTAssertEqual(s.centringHint(faceCentre: Point(250, 500), frameWidth: 500, frameHeight: 600), .moveUp)
  }

  func testOffCentreFaceFailsCentring() {
    let lm = Fixture.landmarks(centre: Point(120, 330), ipd: 100)
    let r = scorer.evaluate(view: .front, landmarks: lm, pose: PoseAngles(yaw: 0, pitch: 0, roll: 0), hair: nil, gray: nil)
    XCTAssertEqual(r.topIssue, .centred)
    XCTAssertEqual(r.centring, .moveRight)
  }

  func testCrownViewUsesImageChecksOnly() {
    let g = Fixture.gray(width: 300, height: 400, faceMin: Point(0, 0), faceMax: Point(300, 400))
    let r = scorer.evaluateWithoutFace(view: .crown, gray: g)
    XCTAssertTrue(r.allPassed, "failed: \(r.failed)")
    XCTAssertEqual(r.score, 100)
    let dark = Fixture.gray(width: 300, height: 400, faceMin: Point(0, 0), faceMax: Point(300, 400), face: 20, background: 20, textured: false)
    let d = scorer.evaluateWithoutFace(view: .crown, gray: dark)
    XCTAssertEqual(d.failed, [.exposure, .sharpness])
  }

  func testTopAndCrownNeedHairInFrame() {
    XCTAssertFalse(ScanView.top.usesFaceTracking)
    XCTAssertFalse(ScanView.crown.usesFaceTracking)
    XCTAssertTrue(ScanView.leftTemple.usesFaceTracking)
    let g = Fixture.gray(width: 300, height: 400, faceMin: Point(0, 0), faceMax: Point(300, 400))
    let hair = HairMask(width: 30, height: 40, values: [Float](repeating: 0.9, count: 1200), imageWidth: 300, imageHeight: 400)!
    let r = scorer.evaluateWithoutFace(view: .top, gray: g, hair: hair)
    XCTAssertTrue(r.allPassed, "failed: \(r.failed)")
    XCTAssertEqual(r.score, 100)
    let wall = HairMask(width: 30, height: 40, values: [Float](repeating: 0.05, count: 1200), imageWidth: 300, imageHeight: 400)!
    let w = scorer.evaluateWithoutFace(view: .crown, gray: g, hair: wall)
    XCTAssertEqual(w.topIssue, .hairInFrame)
    XCTAssertLessThanOrEqual(w.score, 40)
  }

  func testHairCoverageCountsTheCentre() {
    // Hair only in the left half of the frame: half the centre region.
    var v = [Float](repeating: 0, count: 100)
    for y in 0..<10 { for x in 0..<5 { v[y * 10 + x] = 1 } }
    let m = HairMask(width: 10, height: 10, values: v, imageWidth: 10, imageHeight: 10)!
    XCTAssertEqual(m.coverage(x: 0...1, y: 0...1), 0.5, accuracy: 1e-9)
    XCTAssertEqual(m.coverage(x: 0.0...0.5, y: 0...1), 1, accuracy: 1e-9)
  }

  func testWeightsAddUpTo100() {
    XCTAssertEqual(QualityCheck.allCases.reduce(0) { $0 + $1.weight }, 100)
  }
}

final class CaptureGateTests: XCTestCase {
  func testAlignedThenCaptureAfterAHold() {
    var g = CaptureGate(holdFrames: 3, graceFrames: 1)
    XCTAssertEqual(g.update(allPassed: true), [.aligned])
    XCTAssertEqual(g.update(allPassed: true), [])
    XCTAssertEqual(g.update(allPassed: true), [.capture])
    XCTAssertEqual(g.update(allPassed: true), [], "captures only once")
  }

  func testOneBadFrameIsForgiven() {
    var g = CaptureGate(holdFrames: 3, graceFrames: 1)
    _ = g.update(allPassed: true)
    _ = g.update(allPassed: true)
    XCTAssertEqual(g.update(allPassed: false), [])
    XCTAssertEqual(g.update(allPassed: true), [.capture])
  }

  func testLosingAlignmentResetsTheHold() {
    var g = CaptureGate(holdFrames: 3, graceFrames: 1)
    _ = g.update(allPassed: true)
    _ = g.update(allPassed: false)
    XCTAssertEqual(g.update(allPassed: false), [.lost])
    XCTAssertEqual(g.greenRun, 0)
    XCTAssertEqual(g.update(allPassed: true), [.aligned])
  }

  func testResetAllowsANewCapture() {
    var g = CaptureGate(holdFrames: 1)
    XCTAssertEqual(g.update(allPassed: true), [.aligned, .capture])
    g.reset()
    XCTAssertFalse(g.captured)
    XCTAssertEqual(g.update(allPassed: true), [.aligned, .capture])
  }
}
