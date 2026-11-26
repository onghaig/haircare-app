import type { ScanView } from '@modules/headmap';

import type { ScanRecord } from './session';

/**
 * The hair panorama: the scan's photos placed around the head by the angle each was taken from,
 * so dragging turns you around your own head. Between two photos the nearer one fades in; it is
 * a blend of real photos, not a 3D model. The top view sits above the ring.
 */
export const RING: { view: ScanView; angle: number; label: string }[] = [
  { view: 'front', angle: 0, label: 'Front' },
  { view: 'leftTemple', angle: 60, label: 'Left side' },
  { view: 'crown', angle: 180, label: 'Back' },
  { view: 'rightTemple', angle: 300, label: 'Right side' },
];

export const TOP = { view: 'top' as ScanView, label: 'Top' };

/** Degrees turned per point dragged. A full drag across the screen is about half a turn. */
export const DEG_PER_POINT = 0.5;

export function wrap(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Shortest signed distance from a to b in degrees (-180, 180]. */
export function arc(a: number, b: number): number {
  const d = wrap(b - a);
  return d > 180 ? d - 360 : d;
}

export interface Layer {
  view: ScanView;
  opacity: number;
}

/**
 * Which photos show at an angle, and how strongly: the two ring photos either side of the angle,
 * cross-faded by how close each one is. Missing views are skipped, so a scan without a crown
 * photo blends the temples across the back.
 */
export function layersAt(angle: number, available: readonly ScanView[]): Layer[] {
  const ring = RING.filter((r) => available.includes(r.view));
  if (ring.length === 0) return [];
  if (ring.length === 1) return [{ view: ring[0].view, opacity: 1 }];
  const a = wrap(angle);
  // The ring photo at or just before the angle, going round, and the one after it.
  const sorted = [...ring].sort((x, y) => x.angle - y.angle);
  let i = sorted.findIndex((r, k) => {
    const next = sorted[(k + 1) % sorted.length];
    const span = wrap(next.angle - r.angle) || 360;
    return wrap(a - r.angle) < span;
  });
  if (i < 0) i = 0;
  const from = sorted[i];
  const to = sorted[(i + 1) % sorted.length];
  const span = wrap(to.angle - from.angle) || 360;
  const t = wrap(a - from.angle) / span;
  // Ease so each photo holds clear around its own angle and the blend happens between.
  const e = t < 0.25 ? 0 : t > 0.75 ? 1 : (t - 0.25) / 0.5;
  const out: Layer[] = [{ view: from.view, opacity: 1 - e }];
  if (to.view !== from.view && e > 0) out.push({ view: to.view, opacity: e });
  return out.filter((l) => l.opacity > 0);
}

/** The ring photo nearest an angle, for the label and the accessibility value. */
export function nearestView(angle: number, available: readonly ScanView[]): (typeof RING)[number] | undefined {
  const ring = RING.filter((r) => available.includes(r.view));
  return ring.reduce<(typeof RING)[number] | undefined>(
    (best, r) => (!best || Math.abs(arc(angle, r.angle)) < Math.abs(arc(angle, best.angle)) ? r : best),
    undefined,
  );
}

export function availableViews(scan: ScanRecord): ScanView[] {
  return (Object.keys(scan.views) as ScanView[]).filter((v) => !!scan.views[v]?.uri);
}

/** The next ring photo's angle going round (dir 1) or back (dir -1), for buttons and VoiceOver. */
export function stepAngle(angle: number, dir: 1 | -1, available: readonly ScanView[]): number {
  const ring = RING.filter((r) => available.includes(r.view)).sort((a, b) => a.angle - b.angle);
  if (ring.length === 0) return wrap(angle);
  const here = nearestView(angle, available);
  const i = Math.max(0, ring.findIndex((r) => r.view === here?.view));
  return ring[(i + dir + ring.length) % ring.length].angle;
}
