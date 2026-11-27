import type { Zone } from '@/profile/types';

export interface MassageStep {
  title: string;
  area: string;
  movement: string;
  seconds: number;
  /** Where the fingers go, highlighted on the head. */
  zones: (Zone | 'sides' | 'neck')[];
  view: 'front' | 'back';
}

/** The guided 4-minute routine (spec: scalp massage guide). A low-risk habit, not a treatment. */
export const ROUTINE: MassageStep[] = [
  { title: 'Warm-up', area: 'Whole scalp', movement: 'Light fingertip circles, front to back', seconds: 30, zones: ['allOver'], view: 'front' },
  { title: 'Hairline', area: 'Front hairline and temples', movement: 'Small slow circles with firm pressure, fingers flat', seconds: 45, zones: ['hairline', 'temples'], view: 'front' },
  { title: 'Sides', area: 'Above the ears', movement: 'Press and glide upward toward the top', seconds: 45, zones: ['sides'], view: 'front' },
  { title: 'Top', area: 'Mid-scalp', movement: 'Gentle pinch-and-lift of the skin, moving along the part', seconds: 45, zones: ['top'], view: 'back' },
  { title: 'Crown', area: 'Back of the head', movement: 'Circular kneading around the crown swirl', seconds: 45, zones: ['crown'], view: 'back' },
  { title: 'Neck and base', area: 'Base of the skull', movement: 'Thumbs press along the base of the skull', seconds: 30, zones: ['neck'], view: 'back' },
];

export type Variation = 'full' | 'quick' | 'minoxidil';

/** Quick: about 2 minutes. With minoxidil: spreads the product, so no pinch-and-lift. */
export function routineFor(v: Variation): MassageStep[] {
  if (v === 'quick') return ROUTINE.map((s) => ({ ...s, seconds: Math.round(s.seconds / 2) }));
  if (v === 'minoxidil') {
    return ROUTINE.map((s) =>
      s.title === 'Top' ? { ...s, movement: 'Slow fingertip circles along the part to spread the product' } : s,
    );
  }
  return ROUTINE;
}

export const totalSeconds = (steps: MassageStep[]) => steps.reduce((n, s) => n + s.seconds, 0);

/** Which step is running after `elapsed` seconds, and how long is left in it. Null when finished. */
export function stepAt(steps: MassageStep[], elapsed: number): { index: number; left: number } | null {
  let t = 0;
  for (let i = 0; i < steps.length; i++) {
    t += steps[i].seconds;
    if (elapsed < t) return { index: i, left: t - elapsed };
  }
  return null;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
