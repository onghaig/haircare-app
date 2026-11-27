package expo.modules.headmap.core

import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Real MediaPipe landmarks and hair masks from the photo-model-v0 sample photos, with the hairline
 * values the Python reference gives. The same fixtures as the Swift ReferenceParityTests, so the
 * Kotlin port, the Swift port and the Python reference all agree.
 */
class ReferenceParityTest {
  private fun bytes(path: String): ByteArray =
    javaClass.classLoader.getResourceAsStream(path)?.readBytes() ?: error("missing fixture $path")

  private fun check(name: String) {
    val fx = JSONObject(String(bytes("Fixtures/$name.json")))
    val pts = fx.getJSONArray("landmarks").let { a -> (0 until a.length()).map { a.getJSONArray(it).let { p -> Point(p.getDouble(0), p.getDouble(1)) } } }
    val lm = FaceLandmarks.of(pts)!!
    val raw = bytes("Fixtures/$name.mask.u8")
    val mask = HairMask.of(
      fx.getInt("maskWidth"), fx.getInt("maskHeight"),
      FloatArray(raw.size) { (raw[it].toInt() and 0xFF) / 255f },
      fx.getDouble("imageWidth"), fx.getDouble("imageHeight"),
    )!!
    val exp = fx.getJSONObject("expected")
    val m = HairlineMeasurer().measure(lm, mask)
    fun same(a: Double?, key: String) {
      val b = if (exp.isNull(key)) null else exp.getDouble(key)
      if (a != null && b != null) assertEquals(b, a, 0.005, "$name $key") else assertEquals(b == null, a == null, "$name $key")
    }
    same(m.centreIPD, "centreIPD")
    same(m.leftTempleIPD, "leftTempleIPD")
    same(m.rightTempleIPD, "rightTempleIPD")
    assertEquals(exp.getBoolean("foreheadVisible"), m.foreheadVisible, "$name forehead")
  }

  @Test fun portrait() = check("portrait")
  @Test fun stylizerDemoFace() = check("face_stylizer_raw_face_demo")
  /** Side-swept fringe: the left temple reads low and the forehead check must fail. */
  @Test fun sideSweptFringe() = check("business-person")
}
