#!/usr/bin/env node
// Fetches the two Apache-2.0 MediaPipe models into the pod's resource folder.
// Plain Node (no bash), so `npm install` works on Windows, macOS, Linux and EAS Build.
// Skips files already present.
//   node download-models.mjs          fail (exit 1) if a model cannot be downloaded
//   node download-models.mjs --soft   warn only; used by postinstall so offline installs still work
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const soft = process.argv.includes('--soft');
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'ios', 'models');
const base = 'https://storage.googleapis.com/mediapipe-models';

export const MODELS = [
  {
    file: 'face_landmarker.task',
    url: `${base}/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`,
  },
  {
    file: 'selfie_multiclass_256x256.tflite',
    url: `${base}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`,
  },
];

async function fetchModel({ file, url }) {
  const out = join(dir, file);
  if (existsSync(out) && statSync(out).size > 0) return true;
  console.log(`headmap: downloading ${file}`);
  const tmp = `${out}.tmp`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    renameSync(tmp, out);
    return true;
  } catch (err) {
    rmSync(tmp, { force: true });
    console.warn(
      `headmap: could not download ${file} (${err.message}). Run "npm run models" before building iOS.`,
    );
    return false;
  }
}

mkdirSync(dir, { recursive: true });
const results = [];
for (const m of MODELS) results.push(await fetchModel(m));
if (!soft && results.includes(false)) process.exit(1);
