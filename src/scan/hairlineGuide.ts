import type { ScanView } from '@modules/headmap';

/**
 * Where the green hairline highlight goes in each view. Templates are point lists in the guide's
 * 200 x 240 box (the same box as the head outline); the detected hairline from the native module
 * replaces the template as soon as it is found.
 */
export type Pt = readonly [number, number];

/** Samples a cubic Bezier into points, so every guide line is a polyline with a known length. */
export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/** Front hairline across the top of the forehead, temple to temple. */
const FRONT: Pt[] = [...bezier([46, 76], [54, 52], [76, 40], [100, 40]), ...bezier([100, 40], [124, 40], [146, 52], [154, 76]).slice(1)];

/**
 * Temple corners. On a real phone the line showed on the opposite side to the temple being
 * photographed, so the sides are swapped: the left temple view highlights the screen-right corner
 * and the right temple view the screen-left one. This is the same side the native temple trace
 * keeps (MediaPipe's "left eye" side of the frame), so the line no longer jumps across once the
 * real temple hairline is found and replaces these.
 */
const RIGHT_TEMPLE: Pt[] = bezier([42, 100], [44, 80], [52, 62], [72, 48]);
const LEFT_TEMPLE: Pt[] = RIGHT_TEMPLE.map(([x, y]) => [200 - x, y] as Pt);

/** Top view: the head seen from above, hairline at the bottom, crown near the top. */
export const TOP_VIEW = {
  centre: [100, 120] as Pt,
  rx: 70,
  ry: 96,
  /** Crown target, so the crown is in frame in the top view as well as its own view. */
  crown: [100, 62] as Pt,
  crownR: 22,
  /** The parting line from hairline to crown. */
  parting: [
    [100, 196],
    [100, 84],
  ] as Pt[],
};
const TOP_HAIRLINE: Pt[] = bezier([46, 176], [62, 206], [138, 206], [154, 176]);

/** Crown view: a whorl spiralling out from the centre of the frame. */
function whorl(turns = 1.6, r0 = 4, r1 = 46, steps = 48): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const a = t * turns * 2 * Math.PI - Math.PI / 2;
    const r = r0 + (r1 - r0) * t;
    return [100 + Math.cos(a) * r, 120 + Math.sin(a) * r] as Pt;
  });
}

export const TEMPLATES: Record<ScanView, Pt[]> = {
  front: FRONT,
  leftTemple: LEFT_TEMPLE,
  rightTemple: RIGHT_TEMPLE,
  top: TOP_HAIRLINE,
  crown: whorl(),
};

export interface Frame {
  x: number;
  y: number;
  scale: number;
}

/** Template points to screen points. */
export function toScreen(points: readonly Pt[], f: Frame): Pt[] {
  return points.map(([x, y]) => [f.x + x * f.scale, f.y + y * f.scale] as Pt);
}

/** Native curve (0..1 of the frame) to screen points. Drops non-finite points. */
export function curveToScreen(curve: readonly (readonly [number, number])[], width: number, height: number): Pt[] {
  return curve.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]) => [x * width, y * height] as Pt);
}

export function polylineLength(points: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

export function toPath(points: readonly Pt[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

/** A usable detected hairline needs a few points spanning some width. */
export function isUsableCurve(points: readonly Pt[], minLength = 40): boolean {
  return points.length >= 3 && polylineLength(points) >= minLength;
}
