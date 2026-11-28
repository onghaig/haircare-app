import type { ScanRecord } from '@/scan/session';
import { faceForStage } from '@/reveal/reveal';

/** The user's own latest front photo, with the hairline the scan traced on it. */
export interface OwnPhoto {
  scanId: string;
  uri: string;
  /** Normalised 0..1 to the frame. Absent when the scan found no hairline. */
  curve?: [number, number][];
  /** Frame width and height, to line the trace up with the photo. */
  aspect: [number, number];
}

export function ownPhoto(records: ScanRecord[]): OwnPhoto | null {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    const front = r.views.front;
    if (!front?.uri) continue;
    const curve = !r.lowConfidence && r.hairline?.curve && r.hairline.curve.length >= 2 ? r.hairline.curve : undefined;
    return { scanId: r.id, uri: front.uri, curve, aspect: front.frameSize ?? [3, 4] };
  }
  return null;
}

/** How far, as a share of the photo's height, a fully receded centre and temples move up. */
const CENTRE_TRAVEL = 0.12;
const TEMPLE_TRAVEL = 0.07;

/**
 * Today's traced hairline moved to where another stage would put it: temples go back first,
 * then the middle. Moving to an earlier stage (a transplant) brings it forward again.
 */
export function projectCurve(curve: [number, number][], fromStage: number, toStage: number): [number, number][] {
  const a = faceForStage(fromStage);
  const b = faceForStage(toStage);
  const dTemple = b.recede - a.recede;
  const dCentre = b.top - a.top;
  const xs = curve.map((p) => p[0]);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const mid = (lo + hi) / 2;
  const half = Math.max((hi - lo) / 2, 1e-6);
  return curve.map(([x, y]) => {
    const w = Math.min(1, Math.abs(x - mid) / half);
    const dy = dCentre * CENTRE_TRAVEL * (1 - w) + dTemple * TEMPLE_TRAVEL * w;
    return [x, Math.max(0, Math.min(1, y - dy))];
  });
}
