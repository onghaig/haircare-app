import { liftFraction } from '@/forecast';

/**
 * Schematic lines for a made-up person over 4 years, from the same rules the model uses:
 * slowing scales the slope, growing lifts while used and fades within months of stopping.
 */
const MONTHS = 48;
const SLOPE = 0.06; // stages a month, for the picture only
const SLOW = 0.8;
const LIFT = 1.2; // exaggerated so the shape reads on a small chart
const STOP_AT = 24;

export const ILLUSTRATION = { MONTHS, SLOPE, LIFT, STOP_AT };

export function illustrativeLine(kind: 'none' | 'slows' | 'grows' | 'both' | 'grows-stopped', m: number): number {
  const slope = kind === 'slows' || kind === 'both' ? SLOPE * (1 - SLOW) : SLOPE;
  const lift = kind === 'grows' || kind === 'both' ? LIFT * liftFraction('minoxidil', m) : kind === 'grows-stopped' ? LIFT * liftFraction('minoxidil', m, STOP_AT) : 0;
  return slope * m - lift; // higher = more loss
}

