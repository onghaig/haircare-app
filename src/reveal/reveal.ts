import type { Forecast, StageRange, YearForecast } from '@/forecast';
import { isMinor } from '@/profile/onboarding';
import type { Profile, Zone } from '@/profile/types';
import type { ScanRecord } from '@/scan/session';

/** Years offered in the future-look selector. */
export const PREVIEW_YEARS = [1, 3, 5, 10] as const;
export type PreviewYear = (typeof PREVIEW_YEARS)[number];

/** The share of the analysis that is free. The meter climbs to this and locks. */
export const FREE_SHARE = 73;

/** Pacing of the analysing screen: real work runs underneath, never shorter than this. */
export const ANALYSING_MS = 9000;

/** MediaPipe's face mesh has 478 landmarks per face view. */
export const LANDMARKS_PER_VIEW = 478;
export const TREE_SIZE = 8;

/** "N2", "N3.5": stages to the nearest half, the precision the model can honestly support. */
export function stageLabel(stage: number): string {
  const half = Math.round(stage * 2) / 2;
  return `N${Number.isInteger(half) ? half.toFixed(0) : half.toFixed(1)}`;
}

/** A range, never one certain future. Collapses to one stage when the range is narrow. */
export function rangeLabel(r: StageRange): string {
  const lo = stageLabel(r.p10);
  const hi = stageLabel(r.p90);
  return lo === hi ? lo : `${lo} to ${hi}`;
}

export function confidenceLabel(f: Forecast): 'high' | 'moderate' | 'low' {
  if (f.effectiveSamples >= 2000) return 'high';
  if (f.effectiveSamples >= 500) return 'moderate';
  return 'low';
}

/** Low projected risk: the tease says so and sells tracking, not fear (spec, ethics of the tease). */
export function isLowRisk(f: Forecast): boolean {
  const ten = f.byYear.find((y) => y.years === 10) ?? f.byYear.at(-1);
  return !!ten && ten.pNorwood3Plus < 0.25;
}

export function yearOf(f: Forecast, years: number): YearForecast | undefined {
  return f.byYear.find((y) => y.years === years);
}

/**
 * Drawn-head parameters for a Norwood stage. Uses the median, so the picture behind the blur is
 * never worse than the model predicts.
 */
export function faceForStage(stage: number): { recede: number; top: number } {
  const pts: [number, number, number][] = [
    [1, 0, 0],
    [2, 0.4, 0],
    [3, 0.8, 0.2],
    [4, 0.9, 0.5],
    [5, 0.95, 0.75],
    [6, 1, 0.92],
    [7, 1, 1],
  ];
  const s = Math.min(7, Math.max(1, stage));
  const i = Math.min(pts.length - 2, Math.floor(s) - 1);
  const [a, b] = [pts[i], pts[i + 1]];
  const t = (s - a[0]) / (b[0] - a[0]);
  return { recede: a[1] + (b[1] - a[1]) * t, top: a[2] + (b[2] - a[2]) * t };
}

const ZONE_NAME: Record<Exclude<Zone, 'allOver'>, string> = {
  temples: 'Temples',
  hairline: 'Hairline',
  top: 'Top',
  crown: 'Crown',
};

/** Weakest and strongest zones, from what the user reported. Always shown as their answer, never as measured. */
export function zoneSummary(profile: Profile): { weakest: string | null; strongest: string | null; sentence: string } {
  if (profile.worriedOnly || profile.zones.length === 0) {
    return { weakest: null, strongest: 'All zones', sentence: 'No zone stands out yet. Your first scan is your baseline.' };
  }
  if (profile.zones.includes('allOver')) {
    return { weakest: 'All over', strongest: null, sentence: 'Thinning looks spread out.' };
  }
  const order: Exclude<Zone, 'allOver'>[] = ['temples', 'hairline', 'crown', 'top'];
  const weak = order.find((z) => profile.zones.includes(z))!;
  const strong = [...order].reverse().find((z) => !profile.zones.includes(z)) ?? null;
  // What the person told us, said as theirs: the scan measures it, the answer doesn't.
  const sentence = strong
    ? `You notice it most at your ${ZONE_NAME[weak].toLowerCase()}.`
    : 'You notice it in several places.';
  return { weakest: ZONE_NAME[weak], strongest: strong ? ZONE_NAME[strong] : null, sentence };
}

/** Real counters for the analysing screen. */
export function analysisCounters(profile: Profile, scan: ScanRecord | undefined) {
  const views = scan ? Object.keys(scan.views).length : 0;
  const faceViews = scan ? Object.keys(scan.views).filter((v) => v !== 'crown' && v !== 'top').length : 0;
  const relatives = Object.values(profile.family).filter((r) => r && r.status !== 'unknown').length;
  return {
    views,
    points: faceViews * LANDMARKS_PER_VIEW,
    /** Points on the hairline line the front view actually traced. */
    hairlinePoints: scan?.hairline?.curve?.length ?? 0,
    relatives,
    projectTo: Math.max(50, (profile.age ?? 30) + 10),
  };
}

/** Teens see the risk card and the timeline only: no blurred future-face (spec, ethics of the tease). */
export function showsFuturePreview(profile: Profile): boolean {
  return !isMinor(profile);
}
