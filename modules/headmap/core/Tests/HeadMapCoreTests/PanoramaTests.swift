import XCTest
@testable import HeadMapCore

final class PanoramaTests: XCTestCase {
  func testTwentyFiveRegionsCoverTheWholeHead() {
    var seen = Set<Int>()
    for az in stride(from: 0, to: 360, by: 5) {
      for el in stride(from: 0, through: 90, by: 5) { seen.insert(PanoramaCells.cell(azimuth: Double(az), elevation: Double(el))) }
    }
    XCTAssertEqual(seen, Set(0..<PanoramaCells.count))
    for c in 0..<PanoramaCells.count {
      let ctr = PanoramaCells.centre(of: c)
      XCTAssertEqual(PanoramaCells.cell(azimuth: ctr.azimuth, elevation: ctr.elevation), c)
    }
  }

  func testFaceSweepCoversTheFrontHalfAndTiltingDownGoesHigher() {
    let front = PanoramaCells.faceAngles(yaw: 0, pitch: 0)
    XCTAssertEqual(PanoramaCells.cell(azimuth: front.azimuth, elevation: front.elevation), 0)
    let turned = PanoramaCells.faceAngles(yaw: -65, pitch: 0)
    XCTAssertEqual(PanoramaCells.cell(azimuth: turned.azimuth, elevation: turned.elevation), 2)
    let other = PanoramaCells.faceAngles(yaw: 65, pitch: 0)
    XCTAssertEqual(PanoramaCells.cell(azimuth: other.azimuth, elevation: other.elevation), 9)
    let down = PanoramaCells.faceAngles(yaw: 0, pitch: -30)
    XCTAssertEqual(PanoramaCells.cell(azimuth: down.azimuth, elevation: down.elevation), PanoramaCells.slices)
  }

  func testBackPartStartsAtTheBackAndFollowsThePhoneRound() {
    let start = PanoramaCells.backAngles(heading: 40, startHeading: 40, pitchDown: 10)
    XCTAssertEqual(start.azimuth, 180)
    XCTAssertEqual(PanoramaCells.cell(azimuth: start.azimuth, elevation: start.elevation), 6)
    XCTAssertEqual(PanoramaCells.cell(azimuth: PanoramaCells.backAngles(heading: 75, startHeading: 40, pitchDown: 10).azimuth, elevation: 10), 7)
    let top = PanoramaCells.backAngles(heading: 0, startHeading: 0, pitchDown: 80)
    XCTAssertEqual(PanoramaCells.cell(azimuth: top.azimuth, elevation: top.elevation), PanoramaCells.top)
  }

  func testCollectorKeepsTheBestFramePerRegion() {
    var c = PanoramaCollector<String>()
    XCTAssertTrue(c.offer(cell: 3, rank: 80, frame: "a", azimuth: 100, elevation: 10, mode: .face))
    XCTAssertFalse(c.wants(cell: 3, rank: 84))
    XCTAssertFalse(c.offer(cell: 3, rank: 90, frame: "b", azimuth: 100, elevation: 10, mode: .face))
    XCTAssertEqual(c.entries[3]?.frame, "b")
    XCTAssertEqual(c.filled, [3])
    XCTAssertFalse(c.isComplete)
    for i in 0..<PanoramaCells.count { c.offer(cell: i, rank: 50, frame: "x", azimuth: 0, elevation: 0, mode: .back) }
    XCTAssertTrue(c.isComplete)
  }
}
