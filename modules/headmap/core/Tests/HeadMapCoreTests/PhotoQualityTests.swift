import XCTest
@testable import HeadMapCore

final class PhotoQualityTests: XCTestCase {
  func testKeepsWantedWhenMaxAllowsIt() {
    XCTAssertEqual(PhotoQuality.clamped(.quality, maxRawValue: 3), .quality)
    XCTAssertEqual(PhotoQuality.clamped(.balanced, maxRawValue: 3), .balanced)
  }

  func testLowersToMax() {
    // The crash seen on device: .quality requested while the output's max was .balanced.
    XCTAssertEqual(PhotoQuality.clamped(.quality, maxRawValue: 2), .balanced)
    XCTAssertEqual(PhotoQuality.clamped(.quality, maxRawValue: 1), .speed)
  }

  func testUnknownMaxFallsBackToSpeed() {
    XCTAssertEqual(PhotoQuality.clamped(.quality, maxRawValue: 0), .speed)
    XCTAssertEqual(PhotoQuality.clamped(.quality, maxRawValue: 9), .speed)
  }

  func testRawValuesMatchAVFoundation() {
    // AVCapturePhotoOutput.QualityPrioritization: speed 1, balanced 2, quality 3.
    XCTAssertEqual(PhotoQuality.speed.rawValue, 1)
    XCTAssertEqual(PhotoQuality.balanced.rawValue, 2)
    XCTAssertEqual(PhotoQuality.quality.rawValue, 3)
  }
}
