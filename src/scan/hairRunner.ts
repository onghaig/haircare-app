import type { ScanView } from '@modules/headmap';

import { MIN_TREND_QUALITY } from './change';
import { HAIR_ANALYSIS_VERSION, hairAnalyser, type HairAnalysis, type ViewPhoto } from './hairAnalysis';
import { loadRgb } from './scalpRender';
import type { ScanRecord } from './session';

/** Photos are shrunk to this width before reading hair quality (strand detail needs more than the map). */
const QUALITY_PX = 640;

const VIEWS: readonly ScanView[] = ['front', 'top', 'crown'];

/** Whether a scan still needs its hair read (never read, or read by an older version). */
export function needsHairAnalysis(scan: ScanRecord): boolean {
  if (scan.hair && scan.hair.version === HAIR_ANALYSIS_VERSION) return false;
  return VIEWS.some((v) => {
    const r = scan.views[v];
    return !!r?.hairGrid && r.score >= MIN_TREND_QUALITY;
  });
}

// A short real pause, not 0 ms: the screen needs a frame or two to draw and take taps.
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 16));

/**
 * Reads hair quality and density from a scan's clear front, top and crown photos, on the phone.
 * Each photo is decoded on its own turn of the JS thread so taps stay responsive. Null when no
 * photo can be read.
 */
export async function analyseScanHair(scan: ScanRecord): Promise<HairAnalysis | null> {
  const photos: ViewPhoto[] = [];
  for (const view of VIEWS) {
    const r = scan.views[view];
    if (!r?.hairGrid || r.score < MIN_TREND_QUALITY) continue;
    try {
      await yieldToUi();
      photos.push({ view, rgb: await loadRgb(r.uri, QUALITY_PX), grid: r.hairGrid, score: r.score, anchors: r.anchors });
    } catch {
      // A photo that can't be read is left out; the others still count.
    }
  }
  if (!photos.length) return null;
  await yieldToUi();
  const a = hairAnalyser();
  return a.analyseAsync ? a.analyseAsync(photos, scan.hairState ?? null, yieldToUi) : a.analyse(photos, scan.hairState ?? null);
}
