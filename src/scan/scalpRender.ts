import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import { shrinkImageSync } from '@modules/headmap';

import { MIN_TREND_QUALITY } from './change';
import { encodeBmp, renderHeadPanorama, renderScalp, type MapSource, type Rgb } from './headModel';
import { scanSources, sourceUri } from './scalpMap';
import type { ScanRecord } from './session';

/** Map image size in pixels (square). Photos are shrunk to about this width before mapping. */
export const MAP_PX = 360;
const PHOTO_PX = 400;
/** Bump when the head model or rendering changes, so old cached maps are redrawn. */
export const RENDER_VERSION = 2;
/** The whole-head panorama image: twice as wide as tall (all the way round, top to hairline). */
export const PANO_W = 720;
export const PANO_H = 300;

async function shrink(uri: string): Promise<string> {
  // Native and synchronous where available: the async image and file calls can stall on the
  // iOS simulator. The image manipulator is the fallback.
  const native = shrinkImageSync(uri, PHOTO_PX);
  if (native) return native;
  const ref = await ImageManipulator.manipulate(uri).resize({ width: PHOTO_PX }).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return saved.uri;
}

async function loadRgb(uri: string): Promise<Rgb> {
  const small = new File(await shrink(uri));
  const bytes = small.bytesSync();
  try {
    small.delete();
  } catch {
    // A leftover temp file is harmless.
  }
  const img = decode(bytes, { useTArray: true, formatAsRGBA: false });
  return { width: img.width, height: img.height, data: img.data };
}

async function loadPhotos(scan: ScanRecord, sources: MapSource[]): Promise<Partial<Record<string, Rgb>>> {
  const photos: Partial<Record<string, Rgb>> = {};
  for (const s of sources) {
    const uri = sourceUri(scan, s);
    if (!uri) continue;
    try {
      photos[s.key] = await loadRgb(uri);
    } catch {
      // A photo that can't be read is left out; the others still map.
    }
  }
  return photos;
}

/**
 * Draws a scan's scalp map: every clear photo that can be placed on the head (the five views and
 * the panorama's frames) is shrunk, decoded and projected onto the model scalp, then saved as an
 * image in the cache (one per scan, reused next time). Resolves to the image's URI, or null when
 * no photo can be placed.
 */
export async function renderScalpImage(scan: ScanRecord): Promise<string | null> {
  const dir = new Directory(Paths.cache, 'scalp-maps');
  const out = new File(dir, `${scan.id}-v${RENDER_VERSION}.bmp`);
  if (out.exists) return out.uri;
  const sources = scanSources(scan, MIN_TREND_QUALITY);
  if (sources.length === 0) return null;
  const photos = await loadPhotos(scan, sources);
  if (Object.keys(photos).length === 0) return null;
  const map = renderScalp(sources, photos, MAP_PX);
  if (!dir.exists) dir.create({ intermediates: true });
  out.writeSync(encodeBmp(map));
  return out.uri;
}

/**
 * The whole head unrolled, like a phone panorama (see `renderHeadPanorama`), cached like the
 * map. Resolves to the image and the share of the head the photos covered, or null.
 */
export async function renderHeadPanoramaImage(scan: ScanRecord): Promise<{ uri: string; seen: number } | null> {
  const sources = scanSources(scan, MIN_TREND_QUALITY);
  if (sources.length === 0) return null;
  const dir = new Directory(Paths.cache, 'scalp-maps');
  const out = new File(dir, `${scan.id}-head-v${RENDER_VERSION}.bmp`);
  const meta = new File(dir, `${scan.id}-head-v${RENDER_VERSION}.json`);
  if (out.exists && meta.exists) {
    try {
      return { uri: out.uri, seen: (JSON.parse(meta.textSync()) as { seen: number }).seen };
    } catch {
      // Redraw below.
    }
  }
  const photos = await loadPhotos(scan, sources);
  if (Object.keys(photos).length === 0) return null;
  const img = renderHeadPanorama(sources, photos, PANO_W, PANO_H);
  if (!dir.exists) dir.create({ intermediates: true });
  out.writeSync(encodeBmp(img));
  meta.writeSync(JSON.stringify({ seen: img.seen }));
  return { uri: out.uri, seen: img.seen };
}
