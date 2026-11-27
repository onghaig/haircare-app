// swift-tools-version:5.9
// Pure-Swift core of the HeadMap scan module: geometry, hairline measurement, quality checks
// and capture gating. No UIKit, AVFoundation or MediaPipe, so it builds and tests anywhere
// with `swift test` (macOS or Linux). The iOS pod compiles these same sources.
import PackageDescription

let package = Package(
  name: "HeadMapCore",
  platforms: [.iOS(.v16), .macOS(.v13)],
  products: [.library(name: "HeadMapCore", targets: ["HeadMapCore"])],
  targets: [
    .target(name: "HeadMapCore"),
    .testTarget(name: "HeadMapCoreTests", dependencies: ["HeadMapCore"], resources: [.copy("Fixtures")]),
  ]
)
