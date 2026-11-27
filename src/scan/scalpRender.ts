import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';

import type { ScanView } from '@modules/headmap';

import { MIN_TREND_QUALITY } from './change';
import { encodeBmp, mapSources, renderScalp, type Rgb } from './headModel';
import type { ScanRecord } from './session';

/** Map image size in pixels (square). Photos are shrunk to about this width before mapping. */
export const MAP_PX = 360;
const PHOTO_PX = 400;
/** Bump when the head model or rendering changes, so old cached maps are redrawn. */
export const RENDER_VERSION = 1;

async function loadRgb(uri: string): Promise<Rgb> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: PHOTO_PX }).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  // Sync read: the async File calls can hang on the iOS simulator (see store.ts).
  const bytes = new File(saved.uri).bytesSync();
  const img = decode(bytes, { useTArray: true, formatAsRGBA: false });
  return { width: img.width, height: img.height, data: img.data };
}

/**
 * Draws a scan's scalp map: every clear photo that can be placed on the head is shrunk,
 * decoded and projected onto the model scalp, then saved as an image in the cache (one per
 * scan, reused next time). Resolves to the image's URI, or null when no photo can be placed.
 */
export async function renderScalpImage(scan: ScanRecord): Promise<string | null> {
  const dir = new Directory(Paths.cache, 'scalp-maps');
  const out = new File(dir, `${scan.id}-v${RENDER_VERSION}.bmp`);
  if (out.exists) return out.uri;
  const sources = mapSources(scan.views, MIN_TREND_QUALITY);
  if (sources.length === 0) return null;
  const photos: Partial<Record<ScanView, Rgb>> = {};
  for (const s of sources) {
    const uri = scan.views[s.view]?.uri;
    if (!uri) continue;
    try {
      photos[s.view] = await loadRgb(uri);
    } catch {
      // A photo that can't be read is left out; the others still map.
    }
  }
  if (Object.keys(photos).length === 0) return null;
  const map = renderScalp(sources, photos, MAP_PX);
  if (!dir.exists) dir.create({ intermediates: true });
  out.writeSync(encodeBmp(map));
  return out.uri;
}
