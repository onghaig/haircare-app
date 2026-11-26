#!/usr/bin/env bash
# Fetches the two Apache-2.0 MediaPipe models into the pod's resource folder.
# Runs on `npm install` (postinstall), so local and EAS builds both get them. Skips files already present.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../ios/models" && pwd)"
B=https://storage.googleapis.com/mediapipe-models
fetch() {
  local url="$1" out="$DIR/$2"
  if [ -s "$out" ]; then return; fi
  echo "headmap: downloading $2"
  curl -sfL "$url" -o "$out.tmp" && mv "$out.tmp" "$out" || { rm -f "$out.tmp"; echo "headmap: could not download $2 (offline?). Run npm run models before building iOS." >&2; }
}
fetch "$B/face_landmarker/face_landmarker/float16/latest/face_landmarker.task" face_landmarker.task
fetch "$B/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite" selfie_multiclass_256x256.tflite
