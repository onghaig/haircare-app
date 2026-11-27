package expo.modules.headmap

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Log
import androidx.exifinterface.media.ExifInterface
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferExtractor
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenterResult
import expo.modules.headmap.core.FaceLandmarks
import expo.modules.headmap.core.GrayImage
import expo.modules.headmap.core.HairMask
import expo.modules.headmap.core.Point
import expo.modules.headmap.core.PoseAngles
import expo.modules.headmap.core.QualityReport
import expo.modules.headmap.core.QualityScorer
import expo.modules.headmap.core.ScanView
import java.io.File
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Runs the two on-device MediaPipe models on a frame and hands the results to the pure-Kotlin core
 * for measurement and quality scoring. The Android twin of HeadMapEngine.swift. Nothing leaves
 * the device. Frames arrive upright and, for the front camera, mirrored, exactly like iOS.
 */
class HeadMapEngine(context: Context) : AutoCloseable {
  class ModelMissing(name: String) : Exception("Model $name is missing from the app. Run `npm run models` before building.")

  private val landmarker: FaceLandmarker
  /**
   * The hair segmenter needs OpenGL ES 3.1 for its last step. Where that is missing (some older
   * phones, software-rendered emulators) it is switched off and the scan carries on without the
   * hair mask, instead of failing every frame.
   */
  private var segmenter: ImageSegmenter?
  private val scorer = QualityScorer()

  init {
    val face = loadAsset(context, FACE_MODEL)
    val seg = loadAsset(context, HAIR_MODEL)
    landmarker = FaceLandmarker.createFromOptions(
      context,
      FaceLandmarker.FaceLandmarkerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(face).build())
        .setRunningMode(RunningMode.IMAGE)
        .setNumFaces(1)
        .setOutputFacialTransformationMatrixes(true)
        .build(),
    )
    segmenter = try { ImageSegmenter.createFromOptions(
      context,
      ImageSegmenter.ImageSegmenterOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(seg).build())
        .setRunningMode(RunningMode.IMAGE)
        .setOutputConfidenceMasks(true)
        .setOutputCategoryMask(false)
        .build(),
    ) } catch (e: Throwable) {
      Log.w("HeadMap", "Hair segmenter unavailable; scanning without the hair mask", e)
      null
    }
  }

  private fun segment(image: com.google.mediapipe.framework.image.MPImage): ImageSegmenterResult? {
    val s = segmenter ?: return null
    return try {
      s.segment(image)
    } catch (e: Throwable) {
      Log.w("HeadMap", "Hair segmenter failed; scanning without the hair mask from now on", e)
      runCatching { s.close() }
      segmenter = null
      null
    }
  }

  override fun close() {
    landmarker.close()
    segmenter?.close()
  }

  /** One upright frame or photo (ARGB_8888). */
  @Synchronized
  fun analyse(bitmap: Bitmap, view: ScanView, baselineFaceWidth: Double?): QualityReport {
    val gray = grayImage(bitmap)
    val image = BitmapImageBuilder(bitmap).build()
    if (!view.usesFaceTracking) {
      return scorer.evaluateWithoutFace(view, gray, hairMask(segment(image), gray))
    }
    val faces = landmarker.detect(image)
    val seg = if (view.tracesHairline) segment(image) else null
    return evaluate(faces, seg, gray, view, baselineFaceWidth)
  }

  private fun evaluate(faces: FaceLandmarkerResult, seg: ImageSegmenterResult?, gray: GrayImage, view: ScanView, baselineFaceWidth: Double?): QualityReport {
    val w = gray.width.toDouble()
    val h = gray.height.toDouble()
    val first = faces.faceLandmarks().firstOrNull()
    val lm = first?.let { pts -> FaceLandmarks.of(pts.map { Point(it.x() * w, it.y() * h) }) }
      ?: return scorer.evaluate(view, null, null, null, gray)
    // MediaPipe's matrix data is packed column-major; the pose maths takes row-major.
    val pose = faces.facialTransformationMatrixes().orElse(null)?.firstOrNull()?.let { m ->
      PoseAngles.fromRowMajor(DoubleArray(16) { i -> m[(i % 4) * 4 + i / 4].toDouble() })
    }
    return scorer.evaluate(view, lm, pose, hairMask(seg, gray), gray, baselineFaceWidth)
  }

  /** The hair confidence mask (class 1) from the segmenter, sized to the gray image. */
  private fun hairMask(seg: ImageSegmenterResult?, gray: GrayImage): HairMask? {
    val masks = seg?.confidenceMasks()?.orElse(null) ?: return null
    if (masks.size < 2) return null
    val mask = masks[1] // class 1 = hair
    val buf = ByteBufferExtractor.extract(mask).order(ByteOrder.nativeOrder()).asFloatBuffer()
    val values = FloatArray(mask.width * mask.height)
    buf.rewind()
    buf.get(values)
    return HairMask.of(mask.width, mask.height, values, gray.width.toDouble(), gray.height.toDouble())
  }

  companion object {
    const val FACE_MODEL = "face_landmarker.task"
    const val HAIR_MODEL = "selfie_multiclass_256x256.tflite"
    const val DEMO_FACE = "demo_face.jpg"

    /** Models are read into memory, so it doesn't matter whether the APK compressed them. */
    fun loadAsset(context: Context, name: String): ByteBuffer {
      val bytes = try {
        context.assets.open(name).use(InputStream::readBytes)
      } catch (e: Exception) {
        throw ModelMissing(name)
      }
      return ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder()).apply { put(bytes); rewind() }
    }

    fun hasAsset(context: Context, name: String): Boolean =
      try { context.assets.open(name).close(); true } catch (e: Exception) { false }

    /** Luma with the same integer weights as the Swift BGRA conversion. */
    fun grayImage(bitmap: Bitmap): GrayImage {
      val w = bitmap.width
      val h = bitmap.height
      val px = IntArray(w * h)
      bitmap.getPixels(px, 0, w, 0, 0, w, h)
      val out = ByteArray(w * h)
      for (i in px.indices) {
        val c = px[i]
        val r = (c shr 16) and 0xFF
        val g = (c shr 8) and 0xFF
        val b = c and 0xFF
        out[i] = ((29 * b + 150 * g + 77 * r) shr 8).toByte()
      }
      return GrayImage.of(w, h, out)!!
    }

    /** Decode a photo file upright, applying its EXIF rotation and flips. */
    fun decodeUpright(file: File): Bitmap? {
      val raw = BitmapFactory.decodeFile(file.absolutePath) ?: return null
      val orientation = try {
        ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } catch (e: Exception) {
        ExifInterface.ORIENTATION_NORMAL
      }
      val m = Matrix()
      when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> m.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> m.postScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { m.postRotate(90f); m.postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_TRANSVERSE -> { m.postRotate(270f); m.postScale(-1f, 1f) }
        else -> return raw.copy(Bitmap.Config.ARGB_8888, false)
      }
      return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true).copy(Bitmap.Config.ARGB_8888, false)
    }

    /** Rotate to upright and, for the front camera, mirror, so frames match what the user sees. */
    fun upright(src: Bitmap, rotationDegrees: Int, mirror: Boolean): Bitmap {
      if (rotationDegrees == 0 && !mirror) return src
      val m = Matrix()
      m.postRotate(rotationDegrees.toFloat())
      if (mirror) m.postScale(-1f, 1f)
      return Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }
  }
}
