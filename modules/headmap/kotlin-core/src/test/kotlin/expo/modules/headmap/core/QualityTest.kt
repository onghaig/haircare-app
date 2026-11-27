package expo.modules.headmap.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Port of QualityTests.swift: pose, image stats, the scorer and the capture gate. */
class PoseTest {
  @Test fun identityIsZero() {
    val p = PoseAngles.fromRowMajor(Fixture.rotationMatrix())!!
    assertEquals(0.0, p.yaw, 1e-9); assertEquals(0.0, p.pitch, 1e-9); assertEquals(0.0, p.roll, 1e-9)
  }

  @Test fun singleAxisRotations() {
    assertEquals(30.0, PoseAngles.fromRowMajor(Fixture.rotationMatrix(yaw = 30.0))!!.yaw, 1e-6)
    assertEquals(-20.0, PoseAngles.fromRowMajor(Fixture.rotationMatrix(pitch = -20.0))!!.pitch, 1e-6)
    assertEquals(7.0, PoseAngles.fromRowMajor(Fixture.rotationMatrix(roll = 7.0))!!.roll, 1e-6)
  }

  @Test fun rejectsShortMatrices() = assertNull(PoseAngles.fromRowMajor(doubleArrayOf(1.0, 0.0, 0.0)))

  @Test fun maxDeviation() {
    assertEquals(6.0, PoseAngles(44.0, 3.0, -6.0).maxDeviation(ScanView.RIGHT_TEMPLE.targetPose), 1e-9)
  }
}

class ImageStatsTest {
  @Test fun flatImageHasZeroSharpness() {
    val g = GrayImage.of(20, 20, ByteArray(400) { 100 })!!
    assertEquals(0.0, g.laplacianVariance, 1e-9)
    assertEquals(100.0, g.mean, 1e-9)
  }

  @Test fun textureIsSharperThanABlur() {
    val sharp = Fixture.gray(64, 64, Point(0.0, 0.0), Point(64.0, 64.0))
    val flat = Fixture.gray(64, 64, Point(0.0, 0.0), Point(64.0, 64.0), textured = false)
    assertTrue(sharp.laplacianVariance > 40)
    assertTrue(flat.laplacianVariance < sharp.laplacianVariance)
  }

  @Test fun resizeKeepsAspectRatio() {
    val r = GrayImage.of(400, 200, ByteArray(80_000) { 9 })!!.resized(256)
    assertEquals(256, r.width); assertEquals(128, r.height); assertEquals(9.0, r.mean, 1e-9)
  }

  @Test fun cropClampsToTheImage() {
    val g = GrayImage.of(10, 10, ByteArray(100) { 1 })!!
    assertEquals(4, g.crop(-5, 5, 4, 50)?.width)
    assertEquals(5, g.crop(-5, 5, 4, 50)?.height)
    assertNull(g.crop(5, 5, 5, 9))
  }

  @Test fun backlightIsBrightBackgroundBehindADarkFace() {
    val g = Fixture.gray(100, 100, Point(30.0, 30.0), Point(70.0, 70.0), face = 60, background = 200)
    val s = ImageStats.compute(g, Point(30.0, 30.0), Point(70.0, 70.0))!!
    assertTrue(s.backlit)
    assertEquals(60.0, s.faceBrightness, 3.0)
    val even = Fixture.gray(100, 100, Point(30.0, 30.0), Point(70.0, 70.0))
    assertFalse(ImageStats.compute(even, Point(30.0, 30.0), Point(70.0, 70.0))!!.backlit)
  }
}

class QualityScorerTest {
  private val scorer = QualityScorer()
  private val w = 500
  private val h = 600
  // Eyes at y 230 put the face box centre on the guide centre (45% down the frame).
  private val centre = Point(250.0, 230.0)

  private fun frame(yaw: Double = 0.0, face: Int = 128, background: Int = 128, hairCentre: Double = 1.0, view: ScanView = ScanView.FRONT, baseline: Double? = null, ipd: Double = 100.0): QualityReport {
    val lm = Fixture.landmarks(centre, ipd)
    val hair = Fixture.hairMask(w, h, centre, ipd, hairCentre = hairCentre, hairTemple = hairCentre + 0.3)
    val (lo, hi) = lm.boundingBox
    val gray = Fixture.gray(w, h, lo, hi, face, background)
    val pose = PoseAngles.fromRowMajor(Fixture.rotationMatrix(yaw = yaw))
    return scorer.evaluate(view, lm, pose, hair, gray, baseline)
  }

  @Test fun aGoodFrontFramePassesEverything() {
    val r = frame()
    assertEquals(emptyList(), r.failed, "failed: ${r.failed}")
    assertEquals(100, r.score)
    assertTrue(r.allPassed)
    assertNotNull(r.hairline?.centreMM)
  }

  @Test fun noFaceScoresZero() {
    val r = scorer.evaluate(ScanView.FRONT, null, null, null, null)
    assertEquals(listOf(QualityCheck.FACE_FOUND), r.failed)
    assertEquals(0, r.score)
    assertEquals(QualityCheck.FACE_FOUND, r.topIssue)
  }

  @Test fun turnedHeadFailsPoseFirst() {
    val r = frame(yaw = 10.0)
    assertEquals(QualityCheck.POSE, r.topIssue)
    assertEquals(75, r.score)
  }

  @Test fun templeViewExpectsA45DegreeTurnAndNoHairline() {
    val r = frame(yaw = 44.0, view = ScanView.RIGHT_TEMPLE)
    assertTrue(frame(yaw = -44.0, view = ScanView.LEFT_TEMPLE).passed.contains(QualityCheck.POSE))
    assertFalse(r.failed.contains(QualityCheck.POSE))
    assertNull(r.hairline?.centreMM)
    assertFalse(r.failed.contains(QualityCheck.FOREHEAD_VISIBLE))
    assertFalse(r.failed.contains(QualityCheck.HAIRLINE_FOUND))
  }

  @Test fun templeViewsTraceOnlyTheirOwnSideOfTheHairline() {
    // Fixture landmarks are unmirrored: the subject's left eye (263) is on the image right.
    val left = frame(yaw = -44.0, view = ScanView.LEFT_TEMPLE).hairline!!
    assertTrue(left.curve.size > 10)
    assertTrue(left.curve.all { it.x > centre.x }, "left temple traces the subject's left")
    val right = frame(yaw = 44.0, view = ScanView.RIGHT_TEMPLE).hairline!!
    assertTrue(right.curve.all { it.x < centre.x })
    assertNull(left.centreMM)
    assertNull(left.leftTempleMM)
    assertFalse(frame(yaw = -44.0, view = ScanView.LEFT_TEMPLE).failed.contains(QualityCheck.FOREHEAD_VISIBLE))
  }

  @Test fun templesCaptureAsSoonAsTurnedTheRightWayWithTheHairlineInTheShot() {
    // Any clear turn the right way passes, not just 45 plus or minus 5.
    for (yaw in listOf(-18.0, -30.0, -60.0)) assertTrue(frame(yaw = yaw, view = ScanView.LEFT_TEMPLE).allPassed, "yaw $yaw")
    assertTrue(frame(yaw = 25.0, view = ScanView.RIGHT_TEMPLE).allPassed)
    // Facing the phone, or turned the other way, is not a temple photo.
    assertTrue(frame(yaw = -5.0, view = ScanView.LEFT_TEMPLE).failed.contains(QualityCheck.POSE))
    assertTrue(frame(yaw = 30.0, view = ScanView.LEFT_TEMPLE).failed.contains(QualityCheck.POSE))
    // No centring or distance gate on the temples.
    val off = frame(yaw = -30.0, view = ScanView.LEFT_TEMPLE, baseline = 10.0)
    assertFalse(off.failed.contains(QualityCheck.DISTANCE))
    assertFalse(off.passed.contains(QualityCheck.CENTRED))
    // A short hold: about 0.2 s on the temples, 0.5 s elsewhere.
    assertEquals(3, CaptureGate.holdFrames(ScanView.LEFT_TEMPLE))
    assertEquals(8, CaptureGate.holdFrames(ScanView.FRONT))
  }

  @Test fun darkFrameFailsExposure() = assertTrue(frame(face = 30, background = 30).failed.contains(QualityCheck.EXPOSURE))

  @Test fun backlitFrameFailsBacklight() = assertTrue(frame(face = 90, background = 230).failed.contains(QualityCheck.BACKLIGHT))

  @Test fun fringeFailsForehead() = assertTrue(frame(hairCentre = 0.25).failed.contains(QualityCheck.FOREHEAD_VISIBLE))

  @Test fun distanceAgainstTheBaselineScan() {
    val width = Fixture.landmarks(centre, 100.0).faceWidth
    assertEquals(DistanceHint.OK, frame(baseline = width).distance)
    assertEquals(DistanceHint.MOVE_CLOSER, frame(baseline = width * 1.3).distance)
    assertEquals(DistanceHint.MOVE_BACK, frame(baseline = width * 0.7).distance)
    assertTrue(frame(baseline = width * 1.3).failed.contains(QualityCheck.DISTANCE))
  }

  @Test fun distanceOnTheFirstScanUsesFrameShare() {
    assertEquals(DistanceHint.MOVE_CLOSER, scorer.distanceHint(100.0, 500.0, null))
    assertEquals(DistanceHint.OK, scorer.distanceHint(250.0, 500.0, null))
    assertEquals(DistanceHint.MOVE_BACK, scorer.distanceHint(400.0, 500.0, null))
  }

  @Test fun centringPointsTheUserBackToTheGuide() {
    assertEquals(CentringHint.OK, scorer.centringHint(Point(250.0, 270.0), 500.0, 600.0))
    assertEquals(CentringHint.MOVE_RIGHT, scorer.centringHint(Point(100.0, 270.0), 500.0, 600.0))
    assertEquals(CentringHint.MOVE_LEFT, scorer.centringHint(Point(400.0, 270.0), 500.0, 600.0))
    assertEquals(CentringHint.MOVE_DOWN, scorer.centringHint(Point(250.0, 100.0), 500.0, 600.0))
    assertEquals(CentringHint.MOVE_UP, scorer.centringHint(Point(250.0, 500.0), 500.0, 600.0))
  }

  @Test fun offCentreFaceFailsCentring() {
    val lm = Fixture.landmarks(Point(120.0, 330.0), 100.0)
    val r = scorer.evaluate(ScanView.FRONT, lm, PoseAngles(0.0, 0.0, 0.0), null, null)
    assertEquals(QualityCheck.CENTRED, r.topIssue)
    assertEquals(CentringHint.MOVE_RIGHT, r.centring)
  }

  @Test fun crownViewUsesImageChecksOnly() {
    val g = Fixture.gray(300, 400, Point(0.0, 0.0), Point(300.0, 400.0))
    val r = scorer.evaluateWithoutFace(ScanView.CROWN, g)
    assertTrue(r.allPassed, "failed: ${r.failed}")
    assertEquals(100, r.score)
    val dark = Fixture.gray(300, 400, Point(0.0, 0.0), Point(300.0, 400.0), face = 20, background = 20, textured = false)
    assertEquals(listOf(QualityCheck.EXPOSURE, QualityCheck.SHARPNESS), scorer.evaluateWithoutFace(ScanView.CROWN, dark).failed)
  }

  @Test fun topAndCrownNeedHairInFrame() {
    assertFalse(ScanView.TOP.usesFaceTracking)
    assertFalse(ScanView.CROWN.usesFaceTracking)
    assertTrue(ScanView.LEFT_TEMPLE.usesFaceTracking)
    val g = Fixture.gray(300, 400, Point(0.0, 0.0), Point(300.0, 400.0))
    val hair = HairMask.of(30, 40, FloatArray(1200) { 0.9f }, 300.0, 400.0)!!
    val r = scorer.evaluateWithoutFace(ScanView.TOP, g, hair)
    assertTrue(r.allPassed, "failed: ${r.failed}")
    assertEquals(100, r.score)
    val wall = HairMask.of(30, 40, FloatArray(1200) { 0.05f }, 300.0, 400.0)!!
    val w = scorer.evaluateWithoutFace(ScanView.CROWN, g, wall)
    assertEquals(QualityCheck.HAIR_IN_FRAME, w.topIssue)
    assertTrue(w.score <= 40)
  }

  @Test fun hairCoverageCountsTheCentre() {
    val v = FloatArray(100)
    for (y in 0 until 10) for (x in 0 until 5) v[y * 10 + x] = 1f
    val m = HairMask.of(10, 10, v, 10.0, 10.0)!!
    assertEquals(0.5, m.coverage(0.0..1.0, 0.0..1.0), 1e-9)
    assertEquals(1.0, m.coverage(0.0..0.5, 0.0..1.0), 1e-9)
  }

  /** Hair in a w x h mask covering columns x0 until x1 and rows y0 until y1. */
  private fun block(x0: Int, x1: Int, y0: Int, y1: Int, w: Int = 20, h: Int = 20): HairMask {
    val v = FloatArray(w * h)
    for (y in y0 until y1) for (x in x0 until x1) v[y * w + x] = 1f
    return HairMask.of(w, h, v, w.toDouble(), h.toDouble())!!
  }

  @Test fun hairGridAveragesEachCell() {
    assertEquals(listOf(1.0, 0.0, 1.0, 0.0), block(0, 10, 0, 20).grid(2, 2).values)
    assertEquals(listOf(0.5, 0.0), block(0, 5, 0, 20).grid(2, 1).values)
  }

  @Test fun centroidAndShare() {
    val (c, share) = block(0, 10, 0, 10).centroid()!!
    assertEquals(0.25, c.x, 1e-9)
    assertEquals(0.25, c.y, 1e-9)
    assertEquals(0.25, share, 1e-9)
    assertNull(block(0, 0, 0, 0).centroid())
  }

  @Test fun aimPointsThePhoneTowardTheHair() {
    assertEquals(AimHint.NO_HAIR, scorer.aim(block(0, 0, 0, 0)).hint)
    assertEquals(AimHint.MOVE_LEFT, scorer.aim(block(0, 8, 4, 16)).hint)
    assertEquals(AimHint.MOVE_RIGHT, scorer.aim(block(12, 20, 4, 16)).hint)
    assertEquals(AimHint.MOVE_UP, scorer.aim(block(4, 16, 0, 8)).hint)
    assertEquals(AimHint.MOVE_DOWN, scorer.aim(block(4, 16, 12, 20)).hint)
    assertEquals(AimHint.MOVE_CLOSER, scorer.aim(block(6, 14, 6, 14)).hint)
    assertEquals(AimHint.OK, scorer.aim(block(2, 18, 2, 18)).hint)
  }

  @Test fun crownReportsCarryAimAndGrid() {
    val g = Fixture.gray(20, 20, Point(0.0, 0.0), Point(20.0, 20.0))
    val r = scorer.evaluateWithoutFace(ScanView.CROWN, g, block(2, 18, 2, 18))
    assertEquals(AimHint.OK, r.aim?.hint)
    assertEquals(24 * 32, r.hairGrid!!.values.size)
    val m = r.toMap(20.0, 20.0)
    assertEquals("ok", (m["aim"] as Map<*, *>)["hint"])
    assertEquals(24, (m["hairGrid"] as Map<*, *>)["cols"])
  }

  @Test fun burstPrefersHairThenScoreThenSharpness() {
    val g = Fixture.gray(20, 20, Point(0.0, 0.0), Point(20.0, 20.0))
    val hair = scorer.evaluateWithoutFace(ScanView.CROWN, g, block(0, 20, 0, 20))
    val wall = scorer.evaluateWithoutFace(ScanView.CROWN, g, block(0, 0, 0, 0))
    assertTrue(hair.burstRank > wall.burstRank)
    val blurrier = hair.copy(stats = hair.stats!!.copy(sharpness = 1.0))
    assertTrue(hair.burstRank > blurrier.burstRank)
  }

  @Test fun faceReportsCarryMapAnchorsAndFrameSize() {
    val r = frame()
    assertEquals(LandmarkID.MAP_ANCHORS.toSet(), r.anchors!!.keys)
    val m = r.toMap(640.0, 480.0)
    assertEquals(listOf(640.0, 480.0), m["frameSize"])
    assertEquals(8, (m["anchors"] as Map<*, *>).size)
  }

  @Test fun weightsAddUpTo100() = assertEquals(100, QualityCheck.entries.sumOf { it.weight })

  @Test fun reportMapMatchesTheJsShape() {
    val d = frame().toMap(500.0, 600.0)
    assertEquals("front", d["view"])
    assertEquals(true, d["allPassed"])
    assertEquals("ok", d["distance"])
    @Suppress("UNCHECKED_CAST")
    val hl = d["hairline"] as Map<String, Any>
    assertTrue((hl["centreMM"] as Double) > 0)
    @Suppress("UNCHECKED_CAST")
    val curve = hl["curve"] as List<List<Double>>
    assertTrue(curve.all { it[0] in 0.0..1.0 && it[1] in 0.0..1.0 })
    assertEquals("pose", frame(yaw = 10.0).toMap(500.0, 600.0)["topIssue"])
  }
}

class CaptureGateTest {
  @Test fun alignedThenCaptureAfterAHold() {
    val g = CaptureGate(holdFrames = 3, graceFrames = 1)
    assertEquals(listOf(CaptureGate.Event.ALIGNED), g.update(true))
    assertEquals(emptyList(), g.update(true))
    assertEquals(listOf(CaptureGate.Event.CAPTURE), g.update(true))
    assertEquals(emptyList(), g.update(true), "captures only once")
  }

  @Test fun oneBadFrameIsForgiven() {
    val g = CaptureGate(holdFrames = 3, graceFrames = 1)
    g.update(true); g.update(true)
    assertEquals(emptyList(), g.update(false))
    assertEquals(listOf(CaptureGate.Event.CAPTURE), g.update(true))
  }

  @Test fun losingAlignmentResetsTheHold() {
    val g = CaptureGate(holdFrames = 3, graceFrames = 1)
    g.update(true); g.update(false)
    assertEquals(listOf(CaptureGate.Event.LOST), g.update(false))
    assertEquals(0, g.greenRun)
    assertEquals(listOf(CaptureGate.Event.ALIGNED), g.update(true))
  }

  @Test fun resetAllowsANewCapture() {
    val g = CaptureGate(holdFrames = 1)
    assertEquals(listOf(CaptureGate.Event.ALIGNED, CaptureGate.Event.CAPTURE), g.update(true))
    g.reset()
    assertFalse(g.captured)
    assertEquals(listOf(CaptureGate.Event.ALIGNED, CaptureGate.Event.CAPTURE), g.update(true))
  }
}
