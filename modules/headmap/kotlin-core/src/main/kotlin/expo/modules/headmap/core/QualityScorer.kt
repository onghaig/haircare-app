package expo.modules.headmap.core

import kotlin.math.abs

/** One quality check the user must pass before a view is saved. Ordered by what to fix first. Port of QualityScorer.swift. */
enum class QualityCheck(val raw: String, val weight: Int) {
  FACE_FOUND("faceFound", 0),
  HAIR_IN_FRAME("hairInFrame", 0),
  CENTRED("centred", 0),
  POSE("pose", 25),
  DISTANCE("distance", 0),
  BACKLIGHT("backlight", 10),
  EXPOSURE("exposure", 15),
  FOREHEAD_VISIBLE("foreheadVisible", 20),
  SHARPNESS("sharpness", 20),
  HAIRLINE_FOUND("hairlineFound", 10),
}

enum class DistanceHint(val raw: String) { OK("ok"), MOVE_CLOSER("moveCloser"), MOVE_BACK("moveBack") }

/** Which way to move on screen so the head sits inside the guide outline. */
enum class CentringHint(val raw: String) { OK("ok"), MOVE_LEFT("moveLeft"), MOVE_RIGHT("moveRight"), MOVE_UP("moveUp"), MOVE_DOWN("moveDown") }

/**
 * Top and crown views, where you can't see the screen: which way to move the phone so the hair
 * fills the middle of the frame. Directions are in the camera image (see AimHint in Swift).
 */
enum class AimHint(val raw: String) {
  OK("ok"), NO_HAIR("noHair"), MOVE_CLOSER("moveCloser"), MOVE_LEFT("moveLeft"), MOVE_RIGHT("moveRight"), MOVE_UP("moveUp"), MOVE_DOWN("moveDown")
}

data class Aim(val hint: AimHint, val centre: Point?, val hairShare: Double)

data class QualityReport(
  val view: ScanView,
  val pose: PoseAngles?,
  val poseError: Double?,
  val distance: DistanceHint,
  val centring: CentringHint,
  /** Face width in pixels; saved with the baseline scan for later distance checks. */
  val faceWidth: Double?,
  val stats: ImageStats?,
  val hairline: HairlineMeasure?,
  val passed: List<QualityCheck>,
  val failed: List<QualityCheck>,
  /** 0 to 100. Scans under 60 are kept but left out of trend lines. */
  val score: Int,
  /** Coarse hair map of the frame, for the scalp map. Null without a hair mask. */
  val hairGrid: HairGrid? = null,
  /** Top and crown views only: where to move the phone. */
  val aim: Aim? = null,
  /** Face views: a few landmark positions (pixels) by MediaPipe index, for the scalp map. */
  val anchors: Map<Int, Point>? = null,
) {
  val allPassed: Boolean get() = failed.isEmpty()
  /** The single most important thing to fix right now. */
  val topIssue: QualityCheck? get() = failed.firstOrNull()

  /** Ranks frames in a crown burst: hair in frame first, then the score, then capped sharpness. */
  val burstRank: Double
    get() = (if (failed.contains(QualityCheck.HAIR_IN_FRAME)) 0.0 else 1000.0) + score + minOf(stats?.sharpness ?: 0.0, 400.0) / 40

  /** The same JSON shape the Swift module sends to JS (HeadMap.types.ts QualityReport). */
  fun toMap(frameWidth: Double, frameHeight: Double): Map<String, Any> {
    val d = mutableMapOf<String, Any>(
      "view" to view.raw,
      "score" to score,
      "allPassed" to allPassed,
      "passed" to passed.map { it.raw },
      "failed" to failed.map { it.raw },
      "distance" to distance.raw,
      "centring" to centring.raw,
    )
    topIssue?.let { d["topIssue"] = it.raw }
    faceWidth?.let { d["faceWidthPx"] = it }
    pose?.let { d["pose"] = mapOf("yaw" to it.yaw, "pitch" to it.pitch, "roll" to it.roll) }
    poseError?.let { d["poseError"] = it }
    stats?.let { d["stats"] = mapOf("sharpness" to it.sharpness, "faceBrightness" to it.faceBrightness, "backlit" to it.backlit) }
    hairline?.let { hl ->
      val m = mutableMapOf<String, Any>("foreheadVisible" to hl.foreheadVisible, "interPupilPx" to hl.interPupilPx)
      hl.centreMM?.let { m["centreMM"] = it }
      hl.leftTempleMM?.let { m["leftTempleMM"] = it }
      hl.rightTempleMM?.let { m["rightTempleMM"] = it }
      hl.templeRecessionIPD?.let { m["templeRecessionIPD"] = it }
      // Normalised 0..1 so JS can draw it over any preview size.
      m["curve"] = hl.curve.map { listOf(it.x / frameWidth, it.y / frameHeight) }
      d["hairline"] = m
    }
    hairGrid?.let { g ->
      // Two decimals is plenty for a heatmap and keeps the saved scan small.
      d["hairGrid"] = mapOf("cols" to g.cols, "rows" to g.rows, "values" to g.values.map { Math.round(it * 100) / 100.0 })
    }
    d["frameSize"] = listOf(frameWidth, frameHeight)
    anchors?.let { a -> d["anchors"] = a.entries.associate { (k, p) -> k.toString() to listOf(p.x / frameWidth, p.y / frameHeight) } }
    aim?.let { a ->
      val m = mutableMapOf<String, Any>("hint" to a.hint.raw, "hairShare" to a.hairShare)
      a.centre?.let { m["centre"] = listOf(it.x, it.y) }
      d["aim"] = m
    }
    return d
  }
}

data class QualityThresholds(
  val poseToleranceDeg: Double = 8.0,
  val minSharpness: Double = 40.0,
  /** Mean face brightness (0 to 255) must sit strictly between these. */
  val minBrightness: Double = 60.0,
  val maxBrightness: Double = 210.0,
  /** Allowed face width relative to the baseline scan (plus or minus). */
  val distanceTolerance: Double = 0.10,
  /** Face width as a share of the frame width when there is no baseline yet. */
  val firstScanFaceShare: ClosedFloatingPointRange<Double> = 0.38..0.62,
  /** Where the face centre should sit, as a share of the frame (the guide outline's centre). */
  val guideCentre: Point = Point(0.5, 0.45),
  /** Allowed offset of the face centre from the guide centre, as a share of the frame. */
  val centringTolerance: Double = 0.08,
  /** Top and crown views: share of the centre of the frame that must be hair. */
  val minHairCoverage: Double = 0.35,
  /** Aim: how far the hair centre may sit from the frame centre, as a share of the frame. */
  val aimTolerance: Double = 0.12,
  /** Aim: under this share of the frame as hair, there is no hair in view. */
  val minAimShare: Double = 0.05,
  /** Aim: under this share, the phone is too far from the head. */
  val closeAimShare: Double = 0.3,
  /** Temple views: turned the right way by at least this much yaw (degrees), not to exactly 45. */
  val templeMinTurnDeg: Double = 15.0,
  val templeMaxTurnDeg: Double = 75.0,
  val templeMaxTiltDeg: Double = 25.0,
  /** Temple views: points of that side's traced hairline needed to count it as clearly in the shot. */
  val templeMinTracePoints: Int = 6,
)

class QualityScorer(val thresholds: QualityThresholds = QualityThresholds()) {
  val measurer = HairlineMeasurer()

  fun distanceHint(faceWidth: Double, frameWidth: Double, baselineFaceWidth: Double?): DistanceHint {
    if (baselineFaceWidth != null && baselineFaceWidth > 0) {
      val ratio = faceWidth / baselineFaceWidth
      if (ratio < 1 - thresholds.distanceTolerance) return DistanceHint.MOVE_CLOSER
      if (ratio > 1 + thresholds.distanceTolerance) return DistanceHint.MOVE_BACK
      return DistanceHint.OK
    }
    val share = faceWidth / frameWidth
    if (share < thresholds.firstScanFaceShare.start) return DistanceHint.MOVE_CLOSER
    if (share > thresholds.firstScanFaceShare.endInclusive) return DistanceHint.MOVE_BACK
    return DistanceHint.OK
  }

  /** Screen coordinates (mirrored preview already applied). Face too far left means move right. */
  fun centringHint(faceCentre: Point, frameWidth: Double, frameHeight: Double): CentringHint {
    val dx = faceCentre.x / frameWidth - thresholds.guideCentre.x
    val dy = faceCentre.y / frameHeight - thresholds.guideCentre.y
    val t = thresholds.centringTolerance
    if (abs(dx) <= t && abs(dy) <= t) return CentringHint.OK
    if (abs(dx) >= abs(dy)) return if (dx < 0) CentringHint.MOVE_RIGHT else CentringHint.MOVE_LEFT
    return if (dy < 0) CentringHint.MOVE_DOWN else CentringHint.MOVE_UP
  }

  fun aim(hair: HairMask): Aim {
    val found = hair.centroid()
    if (found == null || found.second < thresholds.minAimShare) return Aim(AimHint.NO_HAIR, null, found?.second ?: 0.0)
    val (c, share) = found
    val dx = c.x - 0.5
    val dy = c.y - 0.5
    val t = thresholds.aimTolerance
    val hint = when {
      abs(dx) > t || abs(dy) > t ->
        if (abs(dx) >= abs(dy)) (if (dx < 0) AimHint.MOVE_LEFT else AimHint.MOVE_RIGHT) else (if (dy < 0) AimHint.MOVE_UP else AimHint.MOVE_DOWN)
      share < thresholds.closeAimShare -> AimHint.MOVE_CLOSER
      else -> AimHint.OK
    }
    return Aim(hint, c, share)
  }

  private fun report(view: ScanView, ok: Map<QualityCheck, Boolean>, scoreCap: Int? = null, build: (List<QualityCheck>, List<QualityCheck>, Int) -> QualityReport): QualityReport {
    var score = 0
    for (c in QualityCheck.entries) if (ok[c] ?: true) score += c.weight
    if (scoreCap != null) score = minOf(score, scoreCap)
    val order = QualityCheck.entries
    return build(order.filter { ok[it] == true }, order.filter { ok[it] == false }, score)
  }

  /**
   * The top and crown views have no face to track (head tilted down, or the rear camera behind the
   * head), so image checks apply, measured on the centre of the frame, plus a check that the frame
   * is mostly hair when a hair mask is available.
   */
  fun evaluateWithoutFace(view: ScanView, gray: GrayImage, hair: HairMask? = null): QualityReport {
    val w = gray.width.toDouble()
    val h = gray.height.toDouble()
    val stats = ImageStats.compute(gray, Point(w * 0.25, h * 0.25), Point(w * 0.75, h * 0.75))
    val ok = mutableMapOf(
      QualityCheck.SHARPNESS to ((stats?.sharpness ?: 0.0) > thresholds.minSharpness),
      QualityCheck.EXPOSURE to (stats?.let { it.faceBrightness > thresholds.minBrightness && it.faceBrightness < thresholds.maxBrightness } ?: false),
    )
    if (view.checksHairCoverage && hair != null) ok[QualityCheck.HAIR_IN_FRAME] = hair.coverage() >= thresholds.minHairCoverage
    // A sharp photo of something other than hair is not a usable top or crown photo.
    val cap = if (ok[QualityCheck.HAIR_IN_FRAME] == false) 40 else null
    return report(view, ok, cap) { passed, failed, score ->
      QualityReport(
        view, null, null, DistanceHint.OK, CentringHint.OK, null, stats, null, passed, failed, score,
        hairGrid = hair?.grid(), aim = if (view.checksHairCoverage) hair?.let { aim(it) } else null,
      )
    }
  }

  /** Temple views: turned toward the view's side by enough, without an exact angle. */
  fun templeTurnOk(p: PoseAngles, view: ScanView): Boolean {
    val turn = abs(p.yaw)
    return p.yaw * view.targetPose.yaw > 0 && turn >= thresholds.templeMinTurnDeg && turn <= thresholds.templeMaxTurnDeg &&
      abs(p.pitch) <= thresholds.templeMaxTiltDeg && abs(p.roll) <= thresholds.templeMaxTiltDeg
  }

  /** Scores one frame. Pass `landmarks = null` when no face was found. */
  fun evaluate(
    view: ScanView,
    landmarks: FaceLandmarks?,
    pose: PoseAngles?,
    hair: HairMask?,
    gray: GrayImage?,
    baselineFaceWidth: Double? = null,
  ): QualityReport {
    val lm = landmarks
      ?: return QualityReport(view, null, null, DistanceHint.OK, CentringHint.OK, null, null, null, emptyList(), listOf(QualityCheck.FACE_FOUND), 0)
    val (lo, hi) = lm.boundingBox
    val stats = gray?.let { ImageStats.compute(it, lo, hi) }
    val hairline = if (view.tracesHairline && hair != null) {
      val m = measurer.measure(lm, hair)
      if (view.measuresHairline) m else HairlineMeasurer.templeTrace(m, lm, view)
    } else null
    val poseError = pose?.maxDeviation(view.targetPose)
    val frameWidth = hair?.imageWidth ?: gray?.width?.toDouble() ?: (lm.faceWidth * 2)
    val frameHeight = hair?.imageHeight ?: gray?.height?.toDouble() ?: (frameWidth * 16 / 9)
    val distance = distanceHint(lm.faceWidth, frameWidth, baselineFaceWidth)
    val centring = centringHint((lo + hi) * 0.5, frameWidth, frameHeight)

    val ok = mutableMapOf(
      QualityCheck.FACE_FOUND to true,
      QualityCheck.SHARPNESS to ((stats?.sharpness ?: 0.0) > thresholds.minSharpness),
      QualityCheck.EXPOSURE to (stats?.let { it.faceBrightness > thresholds.minBrightness && it.faceBrightness < thresholds.maxBrightness } ?: false),
      QualityCheck.BACKLIGHT to !(stats?.backlit ?: false),
    )
    if (view.isTemple) {
      // Temples take the photo as soon as that side's hairline is clearly in the shot: turned the
      // right way (not to an exact angle), and no centring or distance gate.
      ok[QualityCheck.POSE] = pose?.let { templeTurnOk(it, view) } ?: false
      ok[QualityCheck.HAIRLINE_FOUND] = (hairline?.curve?.size ?: 0) >= thresholds.templeMinTracePoints
    } else {
      ok[QualityCheck.CENTRED] = centring == CentringHint.OK
      ok[QualityCheck.POSE] = (poseError ?: Double.POSITIVE_INFINITY) <= thresholds.poseToleranceDeg
      ok[QualityCheck.DISTANCE] = distance == DistanceHint.OK
    }
    if (view.needsForehead) ok[QualityCheck.FOREHEAD_VISIBLE] = hairline?.foreheadVisible ?: false
    if (view.measuresHairline) ok[QualityCheck.HAIRLINE_FOUND] = hairline?.hairlineFound ?: false

    return report(view, ok) { passed, failed, score ->
      QualityReport(view, pose, poseError, distance, centring, lm.faceWidth, stats, hairline, passed, failed, score, hairGrid = hair?.grid(),
        anchors = LandmarkID.MAP_ANCHORS.associateWith { lm[it] })
    }
  }
}
