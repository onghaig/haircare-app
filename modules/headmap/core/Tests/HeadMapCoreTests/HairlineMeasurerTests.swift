import XCTest
@testable import HeadMapCore

final class HairlineMeasurerTests: XCTestCase {
  let measurer = HairlineMeasurer()
  let tol = 0.04  // IPD; about 2.5 mm, under the 3.4 mm minimum detectable change

  func measure(ipd: Double = 100, roll: Double = 0, hairCentre: Double = 1.0, hairTemple: Double = 1.3,
               maskScale: Int = 1, noHair: Bool = false) -> HairlineMeasure {
    let w = Int(ipd * 5), h = Int(ipd * 6)
    let c = Point(Double(w) / 2, Double(h) * 0.55)
    let lm = Fixture.landmarks(centre: c, ipd: ipd, rollDeg: roll)
    let hair = Fixture.hairMask(width: w, height: h, centre: c, ipd: ipd, rollDeg: roll,
                                hairCentre: hairCentre, hairTemple: hairTemple, maskScale: maskScale, noHair: noHair)
    return measurer.measure(landmarks: lm, hair: hair)
  }

  func testLevelFaceMeasuresCentreAndTemples() throws {
    let m = measure()
    XCTAssertEqual(try XCTUnwrap(m.centreIPD), 1.0, accuracy: tol)
    XCTAssertEqual(try XCTUnwrap(m.leftTempleIPD), 1.3, accuracy: tol)
    XCTAssertEqual(try XCTUnwrap(m.rightTempleIPD), 1.3, accuracy: tol)
    XCTAssertEqual(try XCTUnwrap(m.templeRecessionIPD), 0.3, accuracy: tol)
    XCTAssertTrue(m.foreheadVisible)
    XCTAssertTrue(m.hairlineFound)
    XCTAssertEqual(m.interPupilPx, 100, accuracy: 1e-9)
  }

  func testConvertsToMillimetresWithA63mmPupilDistance() throws {
    let m = measure()
    XCTAssertEqual(try XCTUnwrap(m.centreMM), try XCTUnwrap(m.centreIPD) * 63, accuracy: 1e-9)
    XCTAssertEqual(try XCTUnwrap(m.centreMM), 63, accuracy: tol * 63)
  }

  func testTiltedHeadGivesTheSameResult() throws {
    for roll in [-12.0, 8.0] {
      let m = measure(roll: roll)
      XCTAssertEqual(try XCTUnwrap(m.centreIPD), 1.0, accuracy: tol, "roll \(roll)")
      XCTAssertEqual(try XCTUnwrap(m.leftTempleIPD), 1.3, accuracy: tol, "roll \(roll)")
      XCTAssertEqual(try XCTUnwrap(m.rightTempleIPD), 1.3, accuracy: tol, "roll \(roll)")
    }
  }

  func testCameraDistanceCancelsOut() throws {
    let near = measure(ipd: 120)
    let far = measure(ipd: 60)
    XCTAssertEqual(try XCTUnwrap(near.centreIPD), try XCTUnwrap(far.centreIPD), accuracy: tol)
    XCTAssertEqual(try XCTUnwrap(near.leftTempleIPD), try XCTUnwrap(far.leftTempleIPD), accuracy: tol)
  }

  func testLowResolutionMaskStillWorks() throws {
    let m = measure(maskScale: 2)
    XCTAssertEqual(try XCTUnwrap(m.centreIPD), 1.0, accuracy: tol * 1.5)
  }

  func testDetectsRecedingTemples() throws {
    let m = measure(hairCentre: 1.0, hairTemple: 1.8)
    XCTAssertEqual(try XCTUnwrap(m.templeRecessionIPD), 0.8, accuracy: tol)
  }

  func testFringeOnTheForeheadFailsTheForeheadCheck() {
    let m = measure(hairCentre: 0.25, hairTemple: 0.25)
    XCTAssertFalse(m.foreheadVisible)
  }

  func testNoHairFound() {
    let m = measure(noHair: true)
    XCTAssertNil(m.centreIPD)
    XCTAssertNil(m.templeRecessionIPD)
    XCTAssertFalse(m.hairlineFound)
    XCTAssertTrue(m.curve.isEmpty)
  }

  func testCurveFollowsTheHairlineInImageCoordinates() throws {
    let ipd = 100.0
    let m = measure(ipd: ipd, roll: 10)
    XCTAssertGreaterThan(m.curve.count, 35)
    let c = Point(250, 330)
    let r = -10 * Double.pi / 180
    for p in m.curve {
      let ix = p.x - c.x, iy = p.y - c.y
      let lx = (cos(r) * ix - sin(r) * iy) / ipd
      let ly = (sin(r) * ix + cos(r) * iy) / ipd
      let expected = -0.35 - Fixture.hairHeight(lx, centre: 1.0, temple: 1.3)
      XCTAssertEqual(ly, expected, accuracy: 0.05)
    }
  }
}
