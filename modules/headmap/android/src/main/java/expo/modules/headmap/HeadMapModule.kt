package expo.modules.headmap

import android.Manifest
import android.net.Uri
import expo.modules.headmap.core.HairlineMeasurer
import expo.modules.headmap.core.ScanView
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** The Android twin of HeadMapModule.swift: same name, constants, functions, view, props and events. */
class HeadMapModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  override fun definition() = ModuleDefinition {
    Name("HeadMap")

    Constant("meanInterPupilMM") { HairlineMeasurer.MEAN_INTER_PUPIL_MM }

    /** Camera permission is asked only at the scan, with a one-line reason (spec). */
    AsyncFunction("requestCameraPermissionAsync") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve("denied")
        return@AsyncFunction
      }
      permissions.askForPermissions({ result ->
        val granted = result[Manifest.permission.CAMERA]?.status == PermissionsStatus.GRANTED
        promise.resolve(if (granted) "granted" else "denied")
      }, Manifest.permission.CAMERA)
    }

    /** iOS sets up a voice-prompt audio session here. Android's speech already ducks other audio. */
    AsyncFunction("prepareVoiceAudioAsync") { }

    /** Measure a photo from disk, for example a family photo or a past photo of yourself. */
    AsyncFunction("analyzeImageAsync") { uri: String, view: String, baselineFaceWidth: Double? ->
      val file = fileFor(uri) ?: throw CodedException("ImageUnreadable", "Could not read the image at $uri", null)
      val bitmap = HeadMapEngine.decodeUpright(file) ?: throw CodedException("ImageUnreadable", "Could not read the image at $uri", null)
      HeadMapEngine(context).use { engine ->
        engine.analyse(bitmap, ScanView.from(view), baselineFaceWidth).toMap(bitmap.width.toDouble(), bitmap.height.toDouble())
      }
    }

    View(HeadMapCameraView::class) {
      Events("onQuality", "onAligned", "onCapture", "onError")

      Prop("view") { v: HeadMapCameraView, value: String -> v.scanView = ScanView.from(value) }
      Prop("baselineFaceWidth") { v: HeadMapCameraView, value: Double? -> v.baselineFaceWidth = value }
      Prop("autoCapture") { v: HeadMapCameraView, value: Boolean? -> v.autoCapture = value ?: true }
      Prop("active") { v: HeadMapCameraView, value: Boolean? -> v.active = value ?: true }

      // CameraX takes pictures from the main thread.
      AsyncFunction("capture") { v: HeadMapCameraView -> v.post { v.capture() } }
      AsyncFunction("resetCapture") { v: HeadMapCameraView -> v.resetCapture() }
    }
  }

  /** file:// URIs and content:// URIs (copied to the cache first, so EXIF can be read). */
  private fun fileFor(uri: String): File? {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      null, "file" -> parsed.path?.let(::File)?.takeIf { it.exists() }
      "content" -> {
        val out = File(context.cacheDir, "headmap-import-${System.nanoTime()}.jpg")
        context.contentResolver.openInputStream(parsed)?.use { input -> out.outputStream().use { input.copyTo(it) } } ?: return null
        out
      }
      else -> null
    }
  }
}
