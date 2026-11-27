import Foundation
import XCTest
@testable import HeadMapCore

/// Real MediaPipe landmarks and hair masks from the photo-model-v0 sample photos, with the
/// hairline values the Python reference algorithm (vision/headmap.py) gives for the same inputs.
/// Guards the Swift port against drifting from the validated Python measurement.
final class ReferenceParityTests: XCTestCase {
  struct Fixture: Decodable {
    struct Expected: Decodable {
      let centreIPD: Double?
      let leftTempleIPD: Double?
      let rightTempleIPD: Double?
      let foreheadVisible: Bool
    }
    let imageWidth: Double
    let imageHeight: Double
    let maskWidth: Int
    let maskHeight: Int
    let landmarks: [[Double]]
    let expected: Expected
  }

  func load(_ name: String) throws -> (FaceLandmarks, HairMask, Fixture.Expected) {
    let dir = try XCTUnwrap(Bundle.module.url(forResource: "Fixtures", withExtension: nil))
    let fx = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: dir.appendingPathComponent("\(name).json")))
    let bytes = try Data(contentsOf: dir.appendingPathComponent("\(name).mask.u8"))
    let lm = try XCTUnwrap(FaceLandmarks(points: fx.landmarks.map { Point($0[0], $0[1]) }))
    let values = bytes.map { Float($0) / 255 }
    let mask = try XCTUnwrap(HairMask(width: fx.maskWidth, height: fx.maskHeight, values: values,
                                      imageWidth: fx.imageWidth, imageHeight: fx.imageHeight))
    return (lm, mask, fx.expected)
  }

  func check(_ name: String) throws {
    let (lm, mask, exp) = try load(name)
    let m = HairlineMeasurer().measure(landmarks: lm, hair: mask)
    let tol = 0.005
    func same(_ a: Double?, _ b: Double?, _ label: String) {
      if let a, let b { XCTAssertEqual(a, b, accuracy: tol, "\(name) \(label)") } else { XCTAssertEqual(a == nil, b == nil, "\(name) \(label)") }
    }
    same(m.centreIPD, exp.centreIPD, "centre")
    same(m.leftTempleIPD, exp.leftTempleIPD, "left temple")
    same(m.rightTempleIPD, exp.rightTempleIPD, "right temple")
    XCTAssertEqual(m.foreheadVisible, exp.foreheadVisible, "\(name) forehead")
  }

  func testPortrait() throws { try check("portrait") }
  func testStylizerDemoFace() throws { try check("face_stylizer_raw_face_demo") }
  /// Side-swept fringe: the left temple reads low and the forehead check must fail.
  func testSideSweptFringe() throws { try check("business-person") }
}
