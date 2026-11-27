import type { Forecast } from '@/forecast';
import type { ScanRecord } from '@/scan/session';
import { weakViews } from '@/scan/session';
import type { StageEstimate } from '@/scan/stageEstimate';

import { confidenceLabel } from './reveal';

export type Confidence = 'low' | 'moderate' | 'high';
const RANK: Record<Confidence, number> = { low: 0, moderate: 1, high: 2 };
const min = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b);

/** How much the scan backs the numbers: no scan, a scan too weak to count, or a good one. */
export type ScanBasis = 'none' | 'weak' | 'good';

export function scanBasis(scan: ScanRecord | undefined): ScanBasis {
  if (!scan) return 'none';
  return scan.lowConfidence ? 'weak' : 'good';
}

/**
 * The confidence shown next to today's stage and the forecast. The model's own confidence only
 * says how many simulated people matched your answers; it can never be higher than what the scan
 * supports. Without a good scan it is low, and with one it is capped at the scan estimate's
 * confidence (itself never above moderate until the grader is validated).
 */
export function shownConfidence(f: Forecast, scan: ScanRecord | undefined, estimate: StageEstimate | null): Confidence {
  const model = confidenceLabel(f);
  if (scanBasis(scan) !== 'good') return 'low';
  return min(model, estimate?.confidence ?? 'low');
}

/** Where today's stage comes from, said in place. */
export function stageSource(scan: ScanRecord | undefined): string {
  return scanBasis(scan) === 'good' ? 'From your scan and your answers' : 'Estimate from your answers';
}

/** One line on what would raise confidence, or null when the scan already backs it. */
export function confidenceHint(scan: ScanRecord | undefined): { text: string; retake: string[] } | null {
  const basis = scanBasis(scan);
  if (basis === 'good') return null;
  if (basis === 'none') return { text: 'Your first scan will confirm or correct this.', retake: [] };
  const weak = weakViews(scan!);
  const n = weak.length;
  return {
    text: `Your scan couldn’t measure ${n === 1 ? '1 view' : `${n} views`}, so it isn’t counted yet.`,
    retake: weak,
  };
}

/** Rough time to retake views: about 20 seconds each. */
export function retakeSeconds(views: number): number {
  return Math.max(20, views * 20);
}

/** One sentence on why the confidence is what it is, said next to it. */
export function confidenceWhy(c: Confidence, basis: ScanBasis): string {
  if (basis === 'none') return 'From your answers until your first scan.';
  if (basis === 'weak') return 'Last scan couldn’t be measured, so answers only.';
  if (c === 'high') return 'Your scan and answers agree.';
  return 'More scans raise it.';
}
