import { MIN_TREND_QUALITY } from './change';
import { hairMap, MAP_ZONE_LABEL, mapSources, type HairMap, type MapZone } from './headModel';
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
export function scanHairMap(scan: ScanRecord, size = 48): HairMap {
  return hairMap(mapSources(scan.views, MIN_TREND_QUALITY), size);
}

/** Whether any photo of this scan can be placed on the head (older scans saved no landmarks). */
export function canMap(scan: ScanRecord): boolean {
  return mapSources(scan.views).length > 0;
}

/** Plus or minus this much is within what light, angle and hair length change on their own. */
export const COMPARE_MARGIN = 0.12;

export type ZoneComparison =
  | { kind: 'first' }
  | { kind: 'unavailable'; reason: 'noMap' | 'lowQuality' }
  | { kind: 'same'; margin: number }
  | { kind: 'less' | 'more'; low: number; high: number };

function round5(x: number) {
  return Math.round(x * 20) * 5;
}

/**
 * A zone's coverage in this scan against the same zone in your first scan, as a range in whole
 * 5 percent steps. A range that crosses zero reads as "about the same".
 */
export function compareZone(
  zone: MapZone,
  scan: ScanRecord,
  baseline: ScanRecord | undefined,
  maps: { now?: HairMap; then?: HairMap } = {},
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
  if (high < 0) return { kind: 'less', low: round5(-high), high: round5(-low) };
  return { kind: 'more', low: round5(low), high: round5(high) };
}

function hasAnyMap(scan: ScanRecord) {
  return mapSources(scan.views).length > 0;
}

/** One line per zone. Never a diagnosis: coverage as the camera saw it, against your own scan. */
export function comparisonText(c: ZoneComparison): string {
  switch (c.kind) {
    case 'first':
      return 'Your first map. Later scans are compared with it.';
    case 'unavailable':
      return c.reason === 'lowQuality' ? 'Photos too unclear to compare here.' : 'No photo reaches this zone.';
    case 'same':
      return `About the same as your first scan (within ±${c.margin}%).`;
    case 'less':
      return `Roughly ${c.low}–${c.high}% less hair coverage seen than your first scan.`;
    case 'more':
      return `Roughly ${c.low}–${c.high}% more hair coverage seen than your first scan.`;
  }
}
