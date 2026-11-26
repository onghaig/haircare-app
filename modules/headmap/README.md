# HeadMap: native scan module

The guided head scan, written in Swift so the camera and live checks run at frame rate on device.
Nothing leaves the phone during a scan.

## What it does

- **Camera** (`ios/HeadMapCameraView.swift`): AVFoundation session, front camera mirrored for
  the front, temple and top views, rear camera for the crown. Live analysis on every frame it can
  keep up with; ~8 small JSON reports a second go to JS. Soft haptic tick when every check turns
  green, firm tap on capture, auto-capture after a steady half-second hold.
- **Models** (`ios/HeadMapEngine.swift`): MediaPipe Face Landmarker (478 points + head pose) and
  Selfie Multiclass (hair mask), both Apache-2.0, both on device.
- **Core** (`core/`, a SwiftPM package compiled into the pod): hairline measurement, quality
  checks and scoring, capture gating. Pure Swift with no UIKit or MediaPipe, so `swift test` runs
  on any Mac or Linux machine.

## Measurement

Port of `photo-model-v0/vision/headmap.py`: level the image on the eye line, then scan up from
the brow line at the centre and above each temple until hair dominates. Heights are divided by
the pupil distance (camera distance cancels out) and shown in mm with a 63 mm average.
`ReferenceParityTests` checks the Swift port against the Python reference on real MediaPipe
output from three sample photos.

## Quality checks (0 to 100 score)

| Check | Weight | Notes |
| --- | --- | --- |
| Face found, centred, distance | gate only | Distance compares face width with the baseline scan (±10%) |
| Pose | 25 | Within ±5° of the view's target (temples ±45° yaw, top -60° pitch) |
| Sharpness | 20 | Laplacian variance on a 256 px face crop |
| Exposure | 15 | Mean face brightness 60 to 210 |
| Backlight | 10 | Background more than 60 levels brighter than the face |
| Forehead visible | 20 | Front view; fringe detection |
| Hairline found | 10 | Front view |

Thresholds are starting points from the Python prototype; calibrate on real devices in beta.

## Running

```bash
npm run models        # downloads the two .task/.tflite files (also runs on npm install)
npm run test:swift    # Swift core tests (needs a Swift toolchain)
npx expo run:ios      # development build (Mac only)
```

No Mac: run the **iOS sideload build** workflow to get an unsigned `.ipa` (see the root README).

The JS API (`index.ts`) falls back cleanly in Jest, Expo Go and web, where the native module is absent.
