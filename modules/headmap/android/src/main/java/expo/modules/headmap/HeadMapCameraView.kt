package expo.modules.headmap

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.RectF
import android.os.Build
import android.os.SystemClock
import android.util.Size
import android.view.HapticFeedbackConstants
import android.widget.ImageView
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.headmap.core.CaptureGate
import expo.modules.headmap.core.QualityReport
import expo.modules.headmap.core.ScanView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import kotlin.math.max

/**
 * Native camera view for the guided scan, the Android twin of HeadMapCameraView.swift. Runs the
 * camera (CameraX) and on-device analysis in Kotlin so the live checks keep up with the camera,
 * and only small JSON reports cross to JS.
 *
 * Front camera for the front, temple and top views (mirrored, so it feels like a mirror); rear
 * camera for the crown. A soft tick when every check turns green and a firm tap on capture.
 * Auto-captures once alignment has held for about half a second.
 */
@SuppressLint("ViewConstructor")
class HeadMapCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  val onQuality by EventDispatcher<Map<String, Any?>>()
  val onAligned by EventDispatcher<Map<String, Any?>>()
  val onCapture by EventDispatcher<Map<String, Any?>>()
  val onError by EventDispatcher<Map<String, Any?>>()

  var scanView: ScanView = ScanView.FRONT
    set(value) {
      if (field == value) return
      field = value
      analysis.execute { gate.reset() }
      if (demo == null) bindCamera()
    }
  @Volatile var baselineFaceWidth: Double? = null
  @Volatile var autoCapture = true
  var active = true
    set(value) {
      if (field == value) return
      field = value
      if (value) bindCamera() else unbindCamera()
    }

  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
    // TextureView: composites correctly inside React Native's view hierarchy.
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }
  private val analysis: ExecutorService = Executors.newSingleThreadExecutor()
  private var engine: HeadMapEngine? = null
  private val gate = CaptureGate()
  private var provider: ProcessCameraProvider? = null
  private var imageCapture: ImageCapture? = null
  private var boundFront = true
  @Volatile private var capturing = false
  private var lastEmit = 0L
  private var lastAnalysis = 0L
  private var lastReport: QualityReport? = null
  private var lastFrameSize = Size(0, 0)
  private var pendingError: String? = null
  /** Emulator builds with the demo face only: a still face fed through the real analysis. */
  private var demo: DemoFeed? = null

  init {
    setBackgroundColor(Color.BLACK)
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    analysis.execute {
      try {
        engine = HeadMapEngine(context)
      } catch (e: Throwable) {
        emitError(e)
      }
    }
    if (DemoFeed.shouldUse(context)) startDemoFeed() else post { bindCamera() }
  }

  // React Native lays out only the views it knows about; size the camera children ourselves.
  private val layoutChildren = Runnable {
    measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    layout(left, top, right, bottom)
  }

  override fun requestLayout() {
    super.requestLayout()
    post(layoutChildren)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    for (i in 0 until childCount) getChildAt(i).layout(0, 0, r - l, b - t)
    if (changed) demo?.let { layoutDemo(it) }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    pendingError?.let {
      pendingError = null
      onError(mapOf("message" to it))
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    unbindCamera()
    demo?.stop()
  }

  // MARK: - Camera

  private fun lifecycleOwner(): LifecycleOwner? = appContext.currentActivity as? LifecycleOwner

  private fun bindCamera() {
    if (!active || demo != null) return
    val owner = lifecycleOwner() ?: return emitError(IllegalStateException("Camera unavailable"))
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val p = future.get()
        provider = p
        val front = scanView != ScanView.CROWN
        val selector = if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        if (!p.hasCamera(selector)) {
          emitError(IllegalStateException("Camera unavailable"))
          return@addListener
        }
        val resolution = ResolutionSelector.Builder()
          .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
          .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
          .build()
        val preview = Preview.Builder().setResolutionSelector(resolution).build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val analyser = ImageAnalysis.Builder()
          .setResolutionSelector(resolution)
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()
        analyser.setAnalyzer(analysis) { proxy ->
          try {
            val now = SystemClock.elapsedRealtime()
            // About 7 analysed frames a second keeps the checks live without heating the phone.
            if (active && !capturing && now - lastAnalysis >= 140) {
              lastAnalysis = now
              val frame = HeadMapEngine.upright(proxy.toBitmap(), proxy.imageInfo.rotationDegrees, mirror = front)
              analyseFrame(frame, autoCaptureAllowed = true)
            }
          } catch (e: Throwable) {
            emitError(e)
          } finally {
            proxy.close()
          }
        }
        val capture = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build()
        p.unbindAll()
        p.bindToLifecycle(owner, selector, preview, analyser, capture)
        imageCapture = capture
        boundFront = front
        analysis.execute { gate.reset() }
      } catch (e: Throwable) {
        emitError(e)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun unbindCamera() {
    provider?.unbindAll()
    imageCapture = null
  }

  /** Runs on the analysis thread. */
  private fun analyseFrame(frame: Bitmap, autoCaptureAllowed: Boolean) {
    val engine = engine ?: return
    val view = scanView
    val report = engine.analyse(frame, view, baselineFaceWidth)
    lastReport = report
    lastFrameSize = Size(frame.width, frame.height)
    for (event in gate.update(report.allPassed)) {
      when (event) {
        CaptureGate.Event.ALIGNED -> post {
          performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
          onAligned(mapOf("view" to view.raw))
        }
        CaptureGate.Event.LOST -> Unit
        CaptureGate.Event.CAPTURE -> if (autoCaptureAllowed && autoCapture) post { capture() }
      }
    }
    // About 8 reports a second is plenty for the UI and keeps the JS thread free.
    val now = SystemClock.elapsedRealtime()
    if (now - lastEmit > 120) {
      lastEmit = now
      val map = report.toMap(frame.width.toDouble(), frame.height.toDouble())
      post { onQuality(map) }
    }
  }

  // MARK: - Photo

  /** Take the photo now (manual shutter, the crown timer, or auto-capture). */
  fun capture() {
    demo?.let { return captureDemo(it) }
    val ic = imageCapture ?: return
    if (capturing) return
    capturing = true
    val view = scanView
    val mirror = boundFront
    val raw = File(context.cacheDir, "headmap-raw-${UUID.randomUUID()}.jpg")
    val metadata = ImageCapture.Metadata().apply { isReversedHorizontal = false }
    val options = ImageCapture.OutputFileOptions.Builder(raw).setMetadata(metadata).build()
    ic.takePicture(options, analysis, object : ImageCapture.OnImageSavedCallback {
      override fun onImageSaved(output: ImageCapture.OutputFileResults) {
        try {
          val upright = HeadMapEngine.decodeUpright(raw) ?: throw IllegalStateException("Could not read the photo")
          raw.delete()
          // Saved photos match the mirrored preview, like iOS.
          val still = if (mirror) HeadMapEngine.upright(upright, 0, mirror = true) else upright
          deliver(still, view)
        } catch (e: Throwable) {
          emitError(e)
        } finally {
          capturing = false
        }
      }

      override fun onError(exception: ImageCaptureException) {
        capturing = false
        emitError(exception)
      }
    })
  }

  fun resetCapture() {
    analysis.execute { gate.reset() }
  }

  /** Runs on the analysis thread: save, re-measure on the full photo, and send it to JS. */
  private fun deliver(still: Bitmap, view: ScanView) {
    val file = File(context.cacheDir, "headmap-${view.raw}-${UUID.randomUUID()}.jpg")
    FileOutputStream(file).use { still.compress(Bitmap.CompressFormat.JPEG, 92, it) }
    post { performHapticFeedback(HapticFeedbackConstants.CONFIRM) }
    val payload = mutableMapOf<String, Any?>("uri" to "file://${file.absolutePath}", "view" to view.raw)
    val report = try {
      engine?.analyse(still, view, baselineFaceWidth)?.toMap(still.width.toDouble(), still.height.toDouble())
    } catch (e: Throwable) {
      null
    } ?: lastReport?.toMap(lastFrameSize.width.toDouble(), lastFrameSize.height.toDouble())
    if (report != null) payload["report"] = report
    analysisReset()
    post { onCapture(payload) }
  }

  private fun analysisReset() = gate.reset()

  // MARK: - Emulator demo feed
  //
  // When the app was built with the demo face (e2e/assets/demo_face.jpg, an illustration copied
  // in by CI only) and runs on an emulator, show it and run it through the same MediaPipe
  // analysis, quality checks, capture gate and capture events as a real camera, so the whole
  // scan can be walked through and recorded. Phones never take this path.

  private class DemoFeed(val source: Bitmap, val imageView: ImageView) {
    @Volatile var frame: Bitmap? = null
    var timer: ScheduledExecutorService? = null

    fun stop() {
      timer?.shutdownNow()
      timer = null
    }

    companion object {
      fun isEmulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") ||
          Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish") || Build.PRODUCT.contains("sdk")

      fun shouldUse(context: Context) = isEmulator() && HeadMapEngine.hasAsset(context, HeadMapEngine.DEMO_FACE)

      /** The photo fitted into a canvas with the view's aspect ratio, as in DemoFeed.compose (Swift). */
      fun compose(image: Bitmap, viewWidth: Int, viewHeight: Int): Bitmap {
        val cw = 720
        val ch = (720.0 * viewHeight / max(viewWidth, 1)).toInt().coerceAtLeast(1)
        val scale = max(cw.toDouble() / image.width, ch * 0.62 / image.height)
        val w = image.width * scale
        val h = image.height * scale
        val out = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawColor(Color.BLACK)
        val x = (cw - w) / 2
        val y = ch * 0.45 - h * 0.48
        canvas.drawBitmap(image, null, RectF(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat()), null)
        return out
      }
    }
  }

  private fun startDemoFeed() {
    val bytes = HeadMapEngine.loadAsset(context, HeadMapEngine.DEMO_FACE)
    val arr = ByteArray(bytes.remaining()).also { bytes.get(it) }
    val source = android.graphics.BitmapFactory.decodeByteArray(arr, 0, arr.size) ?: return
    val iv = ImageView(context).apply { scaleType = ImageView.ScaleType.FIT_XY; setBackgroundColor(Color.BLACK) }
    removeView(previewView)
    addView(iv, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    val feed = DemoFeed(source, iv)
    demo = feed
    val timer = Executors.newSingleThreadScheduledExecutor()
    // One demo frame in the queue at a time. When analysis is slower than the timer (the emulator
    // runs it through ARM translation) the queue would otherwise grow without end, and a photo
    // request would wait behind it.
    val queued = java.util.concurrent.atomic.AtomicBoolean(false)
    timer.scheduleWithFixedDelay({
      if (queued.compareAndSet(false, true)) {
        analysis.execute {
          try { analyseDemoFrame(feed) } finally { queued.set(false) }
        }
      }
    }, 300, 150, TimeUnit.MILLISECONDS)
    feed.timer = timer
  }

  private fun layoutDemo(feed: DemoFeed) {
    if (width <= 0 || height <= 0) return
    val composed = DemoFeed.compose(feed.source, width, height)
    feed.imageView.setImageBitmap(composed)
    feed.frame = composed
  }

  private fun analyseDemoFrame(feed: DemoFeed) {
    if (!active || capturing) return
    val frame = feed.frame ?: return
    try {
      // No auto-capture in the demo: a still photo would pass and skip views on its own, which
      // makes recordings and E2E runs unpredictable. Shots are taken by hand, as on iOS.
      analyseFrame(frame, autoCaptureAllowed = false)
    } catch (e: Throwable) {
      emitError(e)
    }
  }

  private fun captureDemo(feed: DemoFeed) {
    // The view asked for now, not when the queued task runs: on a slow device the scan may have
    // moved on by then, and the photo would be taken (and accepted) for the next view.
    val view = scanView
    analysis.execute {
      val frame = feed.frame ?: return@execute
      if (capturing || view != scanView) return@execute
      capturing = true
      try {
        deliver(frame, view)
      } catch (e: Throwable) {
        emitError(e)
      } finally {
        capturing = false
      }
    }
  }

  private fun emitError(e: Throwable) {
    android.util.Log.e("HeadMap", "Camera problem", e)
    // Show the root cause: an initializer error's own message is empty.
    var root = e
    while (root.cause != null && root.cause !== root) root = root.cause!!
    val message = root.message ?: e.message ?: root.javaClass.simpleName
    post {
      if (!isAttachedToWindow) pendingError = message else onError(mapOf("message" to message))
    }
  }
}
