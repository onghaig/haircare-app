import type { PanoramaMode } from '@modules/headmap';

/**
 * The whole-head panorama's 25 head regions, the same split as the native module
 * (Panorama.swift / Panorama.kt): 12 slices round the head at the hairline and sides, 12 higher
 * up, and the top. Azimuth 0 is the front of the head and grows towards your left; elevation 0 is
 * the hairline band and 90 the very top.
 */
export const SLICES = 12;
export const SLICE_DEG = 360 / SLICES;
export const UPPER_FROM_DEG = 35;
export const TOP_FROM_DEG = 70;
export const CELL_COUNT = SLICES * 2 + 1;
export const TOP_CELL = SLICES * 2;

const wrap = (a: number) => ((a % 360) + 360) % 360;

export function cellAt(azimuth: number, elevation: number): number {
  if (elevation >= TOP_FROM_DEG) return TOP_CELL;
  const slice = Math.min(SLICES - 1, Math.floor(wrap(azimuth) / SLICE_DEG));
  return (elevation >= UPPER_FROM_DEG ? SLICES : 0) + slice;
}

export function cellCentre(cell: number): { azimuth: number; elevation: number } {
  if (cell >= TOP_CELL) return { azimuth: 0, elevation: 82 };
  return { azimuth: ((cell % SLICES) + 0.5) * SLICE_DEG, elevation: cell >= SLICES ? 52 : 17 };
}

/** Signed azimuth, -180..180 (negative: your right). */
export function signedAzimuth(a: number): number {
  const w = wrap(a);
  return w > 180 ? w - 360 : w;
}

/**
 * The regions the face sweep can reach: the front half of the head (to about 90 degrees each
 * way), low and high. The back half and the top are for the back camera.
 */
export const FACE_CELLS: readonly number[] = Array.from({ length: CELL_COUNT }, (_, c) => c).filter((c) => {
  if (c === TOP_CELL) return false;
  return Math.abs(signedAzimuth(cellCentre(c).azimuth)) < 90;
});
export const BACK_CELLS: readonly number[] = Array.from({ length: CELL_COUNT }, (_, c) => c).filter((c) => !FACE_CELLS.includes(c));

export interface Coverage {
  filled: number;
  total: number;
  share: number;
  complete: boolean;
  missing: number[];
}

export function coverage(filled: readonly number[], cells: readonly number[] = allCells()): Coverage {
  const have = new Set(filled);
  const missing = cells.filter((c) => !have.has(c));
  const n = cells.length - missing.length;
  return { filled: n, total: cells.length, share: cells.length ? n / cells.length : 1, complete: missing.length === 0, missing };
}

function allCells() {
  return Array.from({ length: CELL_COUNT }, (_, c) => c);
}

/**
 * What to say next, from what is still missing in this part. Short spoken lines, one thing at a
 * time. Face sweep: directions are for your head (turn toward a shoulder, tilt down). Back of the
 * head: directions are for the phone, round the head from behind. Null when nothing is missing.
 */
export function nextMove(mode: Exclude<PanoramaMode, 'off'>, filled: readonly number[], now?: { azimuth?: number; elevation?: number }): string | null {
  const have = new Set(filled);
  const cells = mode === 'face' ? FACE_CELLS : BACK_CELLS;
  const missing = cells.filter((c) => !have.has(c));
  if (missing.length === 0) return null;
  if (mode === 'face') {
    const low = missing.filter((c) => c < SLICES);
    if (low.length) {
      // Left side (positive azimuth) shows when you turn toward your right shoulder.
      const left = low.filter((c) => signedAzimuth(cellCentre(c).azimuth) > 0).length;
      const right = low.length - left;
      if (left >= right) return 'Slowly turn your head toward your right shoulder';
      return 'Slowly turn your head toward your left shoulder';
    }
    return 'Now slowly tilt your head down, and turn a little each way';
  }
  if (missing.includes(TOP_CELL) && missing.length === 1) return 'Last bit: hold the phone straight above the head, pointing down';
  const here = now?.azimuth;
  const lows = missing.filter((c) => c < SLICES);
  const pool = lows.length ? lows : missing.filter((c) => c !== TOP_CELL);
  if (pool.length === 0) return 'Hold the phone straight above the head, pointing down';
  // The nearest missing slice from where the phone is now.
  const target = pool
    .map((c) => ({ c, d: here == null ? 0 : signedAzimuth(cellCentre(c).azimuth - here) }))
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
  const higher = !lows.length;
  if (higher) return 'Now a little higher: tilt the phone down toward the top of the head';
  if (here == null || Math.abs(target.d) < SLICE_DEG / 2) return 'Hold it there, steady';
  return target.d > 0 ? 'Keep moving the phone round to the left side of the head' : 'Keep moving the phone round to the right side of the head';
}

/**
 * Top-down layout of the regions for the coverage picture: the top in the middle, the upper band
 * as a ring round it and the hairline band as the outer ring. Front at the top of the picture and
 * your left on the left, like the scalp map. Returns an SVG path per region in a box of `size`.
 */
export function coveragePaths(size: number): { cell: number; d: string }[] {
  const c = size / 2;
  const r0 = size * 0.17;
  const r1 = size * 0.33;
  const r2 = size * 0.49;
  const pt = (r: number, az: number) => {
    const a = (az * Math.PI) / 180;
    // Azimuth 0 (front) up; positive (your left) to the left.
    return [c - r * Math.sin(a), c - r * Math.cos(a)] as const;
  };
  const sector = (ri: number, ro: number, a0: number, a1: number) => {
    const [x0, y0] = pt(ro, a0);
    const [x1, y1] = pt(ro, a1);
    const [x2, y2] = pt(ri, a1);
    const [x3, y3] = pt(ri, a0);
    const f = (n: number) => n.toFixed(1);
    // Increasing azimuth runs anticlockwise on screen: sweep flag 0 on the outer arc.
    return `M${f(x0)} ${f(y0)} A${f(ro)} ${f(ro)} 0 0 0 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${f(ri)} ${f(ri)} 0 0 1 ${f(x3)} ${f(y3)} Z`;
  };
  const out: { cell: number; d: string }[] = [];
  for (let i = 0; i < SLICES; i++) {
    const a0 = i * SLICE_DEG + 1;
    const a1 = (i + 1) * SLICE_DEG - 1;
    out.push({ cell: i, d: sector(r1 + 2, r2, a0, a1) });
    out.push({ cell: SLICES + i, d: sector(r0 + 2, r1, a0, a1) });
  }
  const f = (n: number) => n.toFixed(1);
  out.push({ cell: TOP_CELL, d: `M${f(c - r0)} ${f(c)} A${f(r0)} ${f(r0)} 0 1 0 ${f(c + r0)} ${f(c)} A${f(r0)} ${f(r0)} 0 1 0 ${f(c - r0)} ${f(c)} Z` });
  return out;
}

/** No new region for this long: offer the way on (the next part, or finishing with gaps). */
export const PANO_STALL_MS = 12000;

/** Spoken when each part of the panorama starts. */
export function panoramaIntro(part: Exclude<PanoramaMode, 'off'>): string {
  if (part === 'face') {
    return 'Now the whole head. Keep your hair pulled back. Hold the phone still at eye level, and slowly turn your head from one shoulder to the other.';
  }
  return 'Front done. Now the back of your head, with the back camera. It is easiest if someone helps: they hold the phone about a forearm away and walk it slowly round the back of your head, from ear to ear, then over the top. On your own, hold it up behind your head and move it slowly.';
}
