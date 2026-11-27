import type { HairGrid, ScanView } from '@modules/headmap';

import { MIN_TREND_QUALITY } from './change';
import type { ScanRecord } from './session';

/**
 * The scalp map: one scan's five photos laid onto a flat, top-down map of the head, with the
 * hair each photo saw drawn over it, and each zone's hair coverage compared with your own
 * first scan.
 *
 * It is a layout of real photos, not a 3D reconstruction, and the coverage is what the
 * on-device hair segmenter saw in each photo. That depends on light, angle and hair length,
 * so changes are shown as rough ranges against your own earlier scan, never as an absolute or
 * medical density.
 *
 * Map coordinates: a 200 x 200 square, the head seen from above, forehead at the top and the
 * crown towards the bottom. Your left is on the left, as when you look down at your own head.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone {
  view: ScanView;
  label: string;
  /** SVG path of the zone on the map, used to clip its photo. */
  path: string;
  /** Bounding box of the path: the photo is fitted into it. */
  box: Box;
  /** Which part of the photo to keep: the top (hairline photos) or the middle (top and crown). */
  align: 'top' | 'middle';
  /** The part of the photo (fractions, 0 to 1) whose hair coverage counts for this zone. */
  roi: Box;
  /** Where the zone label sits. */
  labelAt: [number, number];
}

export const MAP_SIZE = 200;
/** Camera photos are portrait 9:16 (width over height). */
export const PHOTO_ASPECT = 9 / 16;

export const ZONES: readonly Zone[] = [
  {
    view: 'front',
    label: 'Front',
    path: 'M 30 62 C 40 22 160 22 170 62 L 140 70 C 120 58 80 58 60 70 Z',
    box: { x: 30, y: 26, w: 140, h: 44 },
    align: 'top',
    roi: { x: 0.2, y: 0.05, w: 0.6, h: 0.35 },
    labelAt: [100, 22],
  },
  {
    view: 'leftTemple',
    label: 'Left side',
    path: 'M 30 62 L 60 70 C 52 90 52 112 58 130 L 26 140 C 14 112 16 84 30 62 Z',
    box: { x: 16, y: 62, w: 44, h: 78 },
    align: 'top',
    roi: { x: 0.15, y: 0.05, w: 0.7, h: 0.4 },
    labelAt: [10, 100],
  },
  {
    view: 'rightTemple',
    label: 'Right side',
    path: 'M 170 62 L 140 70 C 148 90 148 112 142 130 L 174 140 C 186 112 184 84 170 62 Z',
    box: { x: 140, y: 62, w: 44, h: 78 },
    align: 'top',
    roi: { x: 0.15, y: 0.05, w: 0.7, h: 0.4 },
    labelAt: [190, 100],
  },
  {
    view: 'top',
    label: 'Top',
    path: 'M 60 70 C 80 58 120 58 140 70 C 148 90 148 112 142 130 C 120 122 80 122 58 130 C 52 112 52 90 60 70 Z',
    box: { x: 52, y: 60, w: 96, h: 70 },
    align: 'middle',
    roi: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    labelAt: [100, 98],
  },
  {
    view: 'crown',
    label: 'Crown',
    path: 'M 26 140 L 58 130 C 80 122 120 122 142 130 L 174 140 C 160 182 40 182 26 140 Z',
    box: { x: 26, y: 124, w: 148, h: 50 },
    align: 'middle',
    roi: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
    labelAt: [100, 186],
  },
];

/** Where a photo sits so it covers the zone's box (like "cover"), keeping the top or the middle. */
export function photoPlacement(zone: Zone, aspect = PHOTO_ASPECT): Box {
  const { box } = zone;
  const scale = Math.max(box.w / aspect, box.h);
  const w = aspect * scale;
  const h = scale;
  const x = box.x + (box.w - w) / 2;
  const y = zone.align === 'top' ? box.y : box.y + (box.h - h) / 2;
  return { x, y, w, h };
}

export interface MapCell extends Box {
  value: number;
}

/** The hair grid of a photo, as rectangles on the map in the same place as the photo. */
export function gridCells(zone: Zone, grid: HairGrid, aspect = PHOTO_ASPECT): MapCell[] {
  const p = photoPlacement(zone, aspect);
  const cw = p.w / grid.cols;
  const ch = p.h / grid.rows;
  const out: MapCell[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const value = grid.values[r * grid.cols + c] ?? 0;
      const cell = { x: p.x + c * cw, y: p.y + r * ch, w: cw, h: ch, value };
      // Only cells that touch the zone's box can show through the clip.
      if (cell.x + cw < zone.box.x || cell.x > zone.box.x + zone.box.w) continue;
      if (cell.y + ch < zone.box.y || cell.y > zone.box.y + zone.box.h) continue;
      out.push(cell);
    }
  }
  return out;
}

/** Mean hair coverage (0 to 1) inside the zone's part of the photo. */
export function zoneCoverage(zone: Zone, grid: HairGrid): number | null {
  const c0 = Math.floor(zone.roi.x * grid.cols);
  const c1 = Math.max(c0 + 1, Math.ceil((zone.roi.x + zone.roi.w) * grid.cols));
  const r0 = Math.floor(zone.roi.y * grid.rows);
  const r1 = Math.max(r0 + 1, Math.ceil((zone.roi.y + zone.roi.h) * grid.rows));
  let sum = 0;
  let n = 0;
  for (let r = r0; r < Math.min(r1, grid.rows); r++) {
    for (let c = c0; c < Math.min(c1, grid.cols); c++) {
      const v = grid.values[r * grid.cols + c];
      if (typeof v === 'number') {
        sum += v;
        n++;
      }
    }
  }
  return n ? sum / n : null;
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
 * This scan's coverage in a zone against the same zone in your first scan, as a range in whole
 * 5 percent steps. A range that crosses zero reads as "about the same".
 */
export function compareZone(zone: Zone, scan: ScanRecord, baseline: ScanRecord | undefined): ZoneComparison {
  const now = scan.views[zone.view];
  if (!now?.hairGrid) return { kind: 'unavailable', reason: 'noMap' };
  if (now.score < MIN_TREND_QUALITY) return { kind: 'unavailable', reason: 'lowQuality' };
  if (!baseline || baseline.id === scan.id) return { kind: 'first' };
  const then = baseline.views[zone.view];
  if (!then?.hairGrid) return { kind: 'unavailable', reason: 'noMap' };
  if (then.score < MIN_TREND_QUALITY) return { kind: 'unavailable', reason: 'lowQuality' };
  const a = zoneCoverage(zone, now.hairGrid);
  const b = zoneCoverage(zone, then.hairGrid);
  if (a == null || b == null || b < 0.02) return { kind: 'unavailable', reason: 'noMap' };
  const change = a / b - 1;
  const low = change - COMPARE_MARGIN;
  const high = change + COMPARE_MARGIN;
  if (low <= 0 && high >= 0) return { kind: 'same', margin: round5(COMPARE_MARGIN) };
  if (high < 0) return { kind: 'less', low: round5(-high), high: round5(-low) };
  return { kind: 'more', low: round5(low), high: round5(high) };
}

/** One line per zone. Never a diagnosis: coverage as the camera saw it, against your own scan. */
export function comparisonText(c: ZoneComparison): string {
  switch (c.kind) {
    case 'first':
      return 'Your first map. Later scans are compared with it.';
    case 'unavailable':
      return c.reason === 'lowQuality' ? 'Photo too unclear to compare.' : 'No hair map for this photo.';
    case 'same':
      return `About the same as your first scan (within ±${c.margin}%).`;
    case 'less':
      return `Roughly ${c.low}–${c.high}% less hair coverage seen than your first scan.`;
    case 'more':
      return `Roughly ${c.low}–${c.high}% more hair coverage seen than your first scan.`;
  }
}

export function mapZones(scan: ScanRecord): Zone[] {
  return ZONES.filter((z) => !!scan.views[z.view]?.uri);
}
