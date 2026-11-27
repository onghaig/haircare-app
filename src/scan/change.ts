/**
 * Honest change detection. A change smaller than what a re-scan can tell apart is shown as
 * "no real change" (holding steady), never as a small gain or loss.
 *
 * Thresholds come from photo-model-v0 repeatability tests: minimum detectable change at 95%
 * of 3.4 mm (centre) and 4.1 to 5.7 mm (temples) in simulation, a lower bound. Starting values
 * are 3.5 mm centre and 5 mm temples; replace with real same-day repeat scans in beta.
 */
export type HairlineMetric = 'centre' | 'leftTemple' | 'rightTemple';

export const MIN_DETECTABLE_CHANGE_MM: Record<HairlineMetric, number> = {
  centre: 3.5,
  leftTemple: 5,
  rightTemple: 5,
};

/** Scans under this quality score are kept but left out of trends (spec). */
export const MIN_TREND_QUALITY = 60;

export type ChangeVerdict = 'holding' | 'gained' | 'lost';

/**
 * Hairline distance is brow-to-hairline, so a larger number means the hairline moved up (loss).
 */
export function classifyHairlineChange(metric: HairlineMetric, baselineMM: number, nowMM: number): ChangeVerdict {
  const delta = nowMM - baselineMM;
  if (Math.abs(delta) < MIN_DETECTABLE_CHANGE_MM[metric]) return 'holding';
  return delta > 0 ? 'lost' : 'gained';
}

export function usableForTrends(score: number): boolean {
  return score >= MIN_TREND_QUALITY;
}
