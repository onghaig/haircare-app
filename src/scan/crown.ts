import type { CaptureResult, HairGrid } from '@modules/headmap';

/**
 * The crown photo, simplified. Aiming the phone behind your head by voice was finicky, so the
 * crown is now one photo from high above: tap Start, lift the phone up over your head with the
 * back camera pointing down, and a short spoken countdown takes it (a quick burst keeps the
 * sharpest frame). Someone helping can tap "Take photo now" instead. Hair density and loss on the
 * crown are then estimated from that one photo (see `crownEstimate`).
 *
 * A pure state machine, so the timing is tested without a camera.
 */
export type CrownStep = 'ready' | 'countdown' | 'burst' | 'review';

export interface CrownState {
  step: CrownStep;
  /** Seconds left on the countdown. */
  left: number;
  result: CaptureResult | null;
}

/** Seconds to lift the phone up above your head. */
export const COUNTDOWN_S = 4;
/** How long the burst watches the frames for the sharpest one. */
export const BURST_MS = 1000;

export const initialCrownState: CrownState = { step: 'ready', left: COUNTDOWN_S, result: null };

export type CrownAction =
  | { type: 'start' }
  | { type: 'tick' }
  | { type: 'shootNow' }
  | { type: 'captured'; result: CaptureResult }
  | { type: 'retake' }
  | { type: 'reset' };

export function crownReducer(s: CrownState, a: CrownAction): CrownState {
  switch (a.type) {
    case 'start':
      return s.step === 'ready' ? { ...initialCrownState, step: 'countdown' } : s;
    case 'tick':
      if (s.step !== 'countdown') return s;
      return s.left <= 1 ? { ...s, step: 'burst', left: 0 } : { ...s, left: s.left - 1 };
    case 'shootNow':
      return s.step === 'ready' || s.step === 'countdown' ? { ...s, step: 'burst', left: 0 } : s;
    case 'captured':
      if (s.step !== 'burst' || a.result.view !== 'crown') return s;
      return { ...s, step: 'review', result: a.result };
    case 'retake':
      return { ...initialCrownState, step: 'countdown' };
    case 'reset':
      return initialCrownState;
  }
}

/** Spoken once when a step starts. Written to be said, not read. */
export function stepVoice(s: CrownState): string | null {
  switch (s.step) {
    case 'ready':
      return 'Last one, your crown. Tap start, then hold the phone up high above your head, with the back camera pointing down.';
    case 'countdown':
      return 'Lift it up high. Taking the photo in';
    case 'burst':
      return 'Hold still.';
    case 'review':
      return 'Got it. Bring the phone down and have a look.';
    default:
      return null;
  }
}

export type CrownLevel = 'full' | 'slight' | 'moderate' | 'noticeable' | 'extensive';

export interface CrownEstimate {
  /** Share of the crown the camera saw as hair, 0 to 1. */
  coverage: number;
  /** The same as a range in whole 5 percent steps, so it never reads as more precise than it is. */
  low: number;
  high: number;
  level: CrownLevel;
  /** 0 (none) to 4: the scale the stage estimate uses for top and crown thinning. */
  loss: number;
}

/** Plus or minus this much coverage is within what light, angle and hair length change. */
export const CROWN_MARGIN = 0.08;
/** Under this share of the frame as hair, the photo missed the head. */
const MIN_HAIR_SHARE = 0.05;

/** Coverage to loss steps, the same cut-offs as the top and crown zones of the stage estimate. */
export function lossLevel(coverage: number): number {
  return coverage >= 0.6 ? 0 : coverage >= 0.45 ? 1 : coverage >= 0.3 ? 2 : coverage >= 0.15 ? 3 : 4;
}

const LEVELS: CrownLevel[] = ['full', 'slight', 'moderate', 'noticeable', 'extensive'];

/**
 * Hair density on the crown from the one overhead photo. From high above, the head is a round
 * patch with floor or shoulders around it, so a plain average over the frame would count the
 * background as thinning. Instead the head is taken as the outline (convex hull) of the hair the
 * camera saw, and coverage is measured inside it, so scalp showing through a thinning crown, which
 * hair still surrounds, counts as less hair. Null when the photo shows almost no hair.
 */
export function crownEstimate(grid: HairGrid | undefined | null): CrownEstimate | null {
  if (!grid || grid.cols <= 0 || grid.rows <= 0 || grid.values.length < grid.cols * grid.rows) return null;
  const { cols, rows, values } = grid;
  const at = (c: number, r: number) => clamp01(values[r * cols + c]);
  let sum = 0;
  const hair: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = at(c, r);
      sum += v;
      if (v >= 0.5) hair.push([c + 0.5, r + 0.5]);
    }
  }
  if (sum / (cols * rows) < MIN_HAIR_SHARE || hair.length < 3) return null;
  const hull = convexHull(hair);
  let inside = 0;
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!inHull(hull, c + 0.5, r + 0.5)) continue;
      inside += at(c, r);
      n++;
    }
  }
  if (n === 0) return null;
  const coverage = inside / n;
  const loss = lossLevel(coverage);
  return {
    coverage,
    low: round5(Math.max(0, coverage - CROWN_MARGIN)),
    high: round5(Math.min(1, coverage + CROWN_MARGIN)),
    level: LEVELS[loss],
    loss,
  };
}

/** Andrew's monotone chain; counter-clockwise, no repeated end point. */
function convexHull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function inHull(h: [number, number][], x: number, y: number): boolean {
  if (h.length < 3) return false;
  for (let i = 0; i < h.length; i++) {
    const [ax, ay] = h[i];
    const [bx, by] = h[(i + 1) % h.length];
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -1e-9) return false;
  }
  return true;
}

/** One plain line about the crown estimate. Never a diagnosis: what the camera saw. */
export function crownEstimateText(e: CrownEstimate): { title: string; detail: string } {
  const range = `About ${e.low}–${e.high}% of your crown looks covered in this photo.`;
  switch (e.level) {
    case 'full':
      return { title: 'Your crown looks well covered', detail: range };
    case 'slight':
      return { title: 'A little scalp showing on your crown', detail: range };
    case 'moderate':
      return { title: 'Some thinning seen on your crown', detail: range };
    case 'noticeable':
      return { title: 'Noticeable thinning seen on your crown', detail: range };
    case 'extensive':
      return { title: 'Much of your crown shows scalp', detail: range };
  }
}

/** Plain words on the review screen about the kept frame. Never a verdict on your hair. */
export function reviewNote(r: CaptureResult): { title: string; detail: string; good: boolean } {
  const failed = r.report?.failed ?? [];
  if (failed.includes('hairInFrame')) {
    return { title: 'Not much hair in this one', detail: 'The camera may have missed your crown. Hold the phone straight above your head and try again.', good: false };
  }
  if (failed.includes('sharpness')) {
    return { title: 'A bit blurry', detail: 'Keep the phone still for a second after the countdown, or ask someone to take it.', good: false };
  }
  if (failed.includes('exposure')) {
    return { title: 'Lighting is off', detail: 'Stand under a ceiling light, facing away from windows.', good: false };
  }
  return { title: 'Looks usable', detail: 'Your crown is in frame and sharp enough to compare next time.', good: true };
}

function clamp01(v: number) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function round5(x: number) {
  return Math.round(x * 20) * 5;
}
