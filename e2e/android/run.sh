#!/usr/bin/env bash
# Runs the Maestro flows on the Android emulator and records the screen. Called by
# .github/workflows/android-apk.yml inside the emulator runner. `adb screenrecord` stops at
# 3 minutes, so it records back-to-back parts that are joined afterwards.
set -u
mkdir -p e2e-results/parts
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell pm grant com.onghaig.haircare android.permission.CAMERA || true

(
  i=0
  while [ ! -f e2e-results/.stop ]; do
    i=$((i + 1))
    adb shell screenrecord --time-limit 175 --bit-rate 4000000 "/sdcard/part$(printf %02d $i).mp4" || sleep 1
  done
) &
REC=$!
sleep 2

maestro test e2e/app.yaml --format junit --output e2e-results/report.xml --test-output-dir e2e-results
status=$?

touch e2e-results/.stop
sleep 2
adb shell pkill -INT screenrecord || true
wait $REC
sleep 2
for f in $(adb shell ls /sdcard/ | tr -d '\r' | grep '^part.*\.mp4$' | sort); do
  adb pull "/sdcard/$f" "e2e-results/parts/$f" >/dev/null
done
ls e2e-results/parts/*.mp4 >/dev/null 2>&1 && {
  for f in e2e-results/parts/*.mp4; do echo "file '$(basename "$f")'"; done > e2e-results/parts/list.txt
  ffmpeg -loglevel error -f concat -safe 0 -i e2e-results/parts/list.txt -vf "scale=540:-2" -c:v libx264 -preset veryfast -crf 28 e2e-results/demo.mp4 || true
}
ls -lh e2e-results/demo.mp4 || true
exit $status
