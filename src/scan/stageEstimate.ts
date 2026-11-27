import { selfReportedStage } from '@/profile/forecastInput';
import type { Profile } from '@/profile/types';

import { MIN_TREND_QUALITY } from './change';
import { crownEstimate, lossLevel } from './crown';
import { scanHairMap } from './scalpMap';
import type { ScanRecord } from './session';

/**
 * An estimated current Norwood stage from one scan.
 *
 * There is no trained photo grader yet (no licensed, graded photo set), so the first grader
 * maps what the scan measures (temple recession and hairline height on the front photo, hair
 * coverage on the top photo and on the one overhead crown photo) onto the Norwood scale by hand, and blends in what you
 * told us in onboarding. The thresholds are not validated against graded photos, so it always
 * shows a range, and the confidence never goes above moderate.
 *
 * Graders are swappable: a trained model can implement `StageGrader` and replace this one with
 * `setStageGrader` without touching the screens.
 */
export interface StageEstimate {
  /** Middle of the range, to the nearest half stage. */
  stage: number;
  low: number;
  high: number;
  confidence: 'low' | 'moderate' | 'high';
  /** Which grader made it, for the record and for later comparison. */
  grader: string;
  /** Plain-language reasons, in the order they mattered. */
  signals: string[];
}

export interface StageGraderInput {
  scan: ScanRecord;
  profile: Profile;
}

export interface StageGrader {
  id: string;
  estimate(input: StageGraderInput): StageEstimate | null;
}

const half = (x: number) => Math.round(x * 2) / 2;
const clamp = (x: number) => Math.min(7, Math.max(1, x));

/**
 * Stage from the hairline alone: temple recession (in pupil distances) and hairline height above
 * the brow line. Shared by the scan's front view and relatives' photos.
 */
export function hairlineStage(recessionIPD: number | undefined, centreMM: number | undefined): { stage: number; signal: string } | null {
  const r = recessionIPD;
  const c = centreMM;
  if (r == null && c == null) return null;
  let stage = 1;
  if (r != null) stage = r < 0.15 ? 1 : r < 0.3 ? 2 : r < 0.45 ? 3 : 4;
  if (c != null) stage = Math.max(stage, c > 90 ? 5 : c > 82 ? 4 : c > 75 ? 3 : 1);
  const signal =
    stage <= 1
      ? 'Your hairline and temples look close to straight across.'
      : stage === 2
        ? 'Your temples sit a little higher than the middle of your hairline.'
        : 'Your temples and hairline sit noticeably higher than a straight-across hairline.';
  return { stage, signal };
}

/** Front: temple recession (in pupil distances) and hairline height above the brow line. */
export function frontStage(scan: ScanRecord): { stage: number; signal: string } | null {
  const front = scan.views.front;
  const hl = scan.hairline;
  if (!front || front.score < MIN_TREND_QUALITY || !hl) return null;
  return hairlineStage(hl.templeRecessionIPD, hl.centreMM);
}

/** Top and crown: how much of each zone of the scalp map the camera saw as hair. */
export function backStage(scan: ScanRecord): { stage: number; signal: string } | null {
  const { zones } = scanHairMap(scan, 32);
  // The crown comes from its one overhead photo when it is clear enough; the head map otherwise.
  const crownView = scan.views.crown;
  const direct = crownView && crownView.score >= MIN_TREND_QUALITY ? crownEstimate(crownView.hairGrid) : null;
  const crown = direct?.coverage ?? zones.crown;
  const top = zones.top;
  if (crown == null && top == null) return null;
  const level = lossLevel;
  const k = crown != null ? level(crown) : 0;
  const t = top != null ? level(top) : 0;
  // Thinning on the crown or the top alone reads as 3 (vertex) up to 6; both thin goes to 7.
  const stage = Math.min(7, Math.max(k === 0 ? 1 : 2 + k, t === 0 ? 1 : 2 + t, t >= 3 && k >= 3 ? 7 : 1));
  const signal =
    stage <= 1
      ? 'Your crown and top look well covered in these photos.'
      : k >= t
        ? 'The camera saw less hair at your crown than a fully covered crown.'
        : 'The camera saw less hair on top than a fully covered top.';
  return { stage, signal };
}

export const measuredGrader: StageGrader = {
  id: 'measured-v1',
  estimate({ scan, profile }) {
    const front = frontStage(scan);
    const back = backStage(scan);
    if (!front && !back) return null;
    const measured = Math.max(front?.stage ?? 1, back?.stage ?? 1);
    const told = selfReportedStage(profile);
    // Mostly the scan; your answers nudge it, as weak evidence.
    const mid = clamp(half(told != null ? measured * 0.75 + told * 0.25 : measured));
    const signals = [front, back]
      .filter((s): s is { stage: number; signal: string } => !!s)
      .sort((a, b) => b.stage - a.stage)
      .map((s) => s.signal);
    if (told != null) signals.push('It also uses where you said you notice changes.');
    const both = !!front && !!back;
    const confidence = both && scan.quality >= 80 ? 'moderate' : 'low';
    const spread = confidence === 'moderate' ? 0.5 : 1;
    return {
      stage: mid,
      low: clamp(mid - spread),
      high: clamp(mid + spread),
      confidence,
      grader: measuredGrader.id,
      signals,
    };
  },
};

let active: StageGrader = measuredGrader;

/** The grader the screens use. */
export function stageGrader(): StageGrader {
  return active;
}

/** Swap in another grader (a trained model later, or a fake in tests). */
export function setStageGrader(g: StageGrader) {
  active = g;
}

export function estimateStage(scan: ScanRecord | undefined, profile: Profile): StageEstimate | null {
  return scan ? active.estimate({ scan, profile }) : null;
}

export const ESTIMATE_NOTE =
  'An estimate from your scan measurements and your answers, not a diagnosis. It has not yet been checked against graded photos.';
