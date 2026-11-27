import { MIN_TREND_QUALITY } from './change';
import { hairMap, MAP_ZONE_LABEL, mapSources, panoramaSources, type HairMap, type MapSource, type MapZone } from './headModel';
import type { ScanRecord } from './session';

/**
 * The scalp map: one scan's five photos mapped onto a model head and unrolled into a single
 * top-down map (see headModel.ts), with the hair the camera saw, and each zone's hair coverage
 * compared with your own first scan.
 *
 * The coverage is what the on-device hair segmenter saw. It depends on light, angle and hair
 * length, so changes are shown as rough ranges against your own earlier scan, never as an
 * absolute or medical density.
 */
export const MAP_ZONES: readonly MapZone[] = ['front', 'leftTemple', 'rightTemple', 'top', 'crown'];
export { MAP_ZONE_LABEL };

/** The hair map of a scan from its clear photos (the same photos the comparison trusts). */
/** Every photo of a scan that can be placed on the head: the five views and the panorama's frames. */
export function scanSources(scan: ScanRecord, minScore = 0): MapSource[] {
  return [...mapSources(scan.views, minScore), ...panoramaSources(scan.panorama, minScore)];
}

/** The photo behind a source: a view's photo, or a panorama frame's. */
export function sourceUri(scan: ScanRecord, src: MapSource): string | undefined {
  if (src.key.startsWith('pano-')) {
    const cell = Number(src.key.slice(5));
    return scan.panorama?.find((f) => f.cell === cell)?.uri;
  }
  return scan.views[src.view]?.uri;
}

/**
 * Hair density by zone, from the five views only: those are taken the same way every scan, so
 * zones compare fairly with scans from before the panorama. The panorama adds to the pictures.
 */
export function scanHairMap(scan: ScanRecord, size = 48): HairMap {
  return hairMap(mapSources(scan.views, MIN_TREND_QUALITY), size);
}

/** Whether any photo of this scan can be placed on the head (older scans saved no landmarks). */
export function canMap(scan: ScanRecord): boolean {
  return scanSources(scan).length > 0;
}

/** Plus or minus this much is within what light, angle and hair length change on their own. */
export const COMPARE_MARGIN = 0.12;

export type ZoneComparison =
  | { kind: 'first' }
  | { kind: 'unavailable'; reason: 'noMap' | 'lowQuality' }
  | { kind: 'same'; margin: number }
  | { kind: 'more'; low: number; high: number }
  /** `confirmed` once the scan before this one showed less too: one scan alone can be light or angle. */
  | { kind: 'less'; low: number; high: number; confirmed: boolean };

function round5(x: number) {
  return Math.round(x * 20) * 5;
}

/**
 * A zone's coverage in this scan against the same zone in your first scan, as a range in whole
 * 5 percent steps. A range that crosses zero reads as "about the same". Less coverage is only
 * stated as a loss when `previous` (the good scan before this one) showed less as well.
 */
export function compareZone(
  zone: MapZone,
  scan: ScanRecord,
  baseline: ScanRecord | undefined,
  maps: { now?: HairMap; then?: HairMap; previous?: ScanRecord } = {},
): ZoneComparison {
  const now = (maps.now ?? scanHairMap(scan)).zones[zone];
  if (now == null) return { kind: 'unavailable', reason: hasAnyMap(scan) ? 'lowQuality' : 'noMap' };
  if (!baseline || baseline.id === scan.id) return { kind: 'first' };
  const then = (maps.then ?? scanHairMap(baseline)).zones[zone];
  if (then == null || then < 0.02) return { kind: 'unavailable', reason: 'noMap' };
  const change = now / then - 1;
  const low = change - COMPARE_MARGIN;
  const high = change + COMPARE_MARGIN;
  if (low <= 0 && high >= 0) return { kind: 'same', margin: round5(COMPARE_MARGIN) };
  if (high < 0) {
    const prev = maps.previous;
    const usable = prev && prev.id !== scan.id && prev.id !== baseline.id && !prev.lowConfidence;
    const confirmed = !!usable && compareZone(zone, prev, baseline, { then: maps.then }).kind === 'less';
    return { kind: 'less', low: round5(-high), high: round5(-low), confirmed };
  }
  return { kind: 'more', low: round5(low), high: round5(high) };
}

/** The last good scan taken before this one, to confirm a change; null if there is none. */
export function previousGoodScan(records: readonly ScanRecord[], scan: ScanRecord): ScanRecord | undefined {
  return records
    .filter((r) => r.id !== scan.id && !r.lowConfidence && r.source !== 'upload' && r.takenAt < scan.takenAt)
    .sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1))[0];
}

function hasAnyMap(scan: ScanRecord) {
  return mapSources(scan.views).length > 0;
}

const ZONE_WHERE: Record<MapZone, string> = {
  front: 'at the front',
  leftTemple: 'on your left side',
  rightTemple: 'on your right side',
  top: 'on top',
  crown: 'on your crown',
};

/** One line per zone. Never a diagnosis: coverage as the camera saw it, against your own scan. */
export function comparisonText(c: ZoneComparison, zone?: MapZone): string {
  switch (c.kind) {
    case 'first':
      return 'Your first map. Later scans are compared with it.';
    case 'unavailable':
      return c.reason === 'lowQuality' ? 'Photos too unclear to compare here.' : 'No photo reaches this zone.';
    case 'same':
      return `About the same as your first scan (within ±${c.margin}%).`;
    case 'less':
      if (!c.confirmed) {
        const where = zone ? ` ${ZONE_WHERE[zone]}` : '';
        return `Possible change${where}. Your next scan will confirm it.`;
      }
      return `Roughly ${c.low}–${c.high}% less hair coverage seen than your first scan.`;
    case 'more':
      return `Roughly ${c.low}–${c.high}% more hair coverage seen than your first scan.`;
  }
}
