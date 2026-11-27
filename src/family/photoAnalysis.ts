import { analyzeImageAsync, isHeadMapAvailable, type QualityReport } from '@modules/headmap';

import type { HairStatus } from '@/profile/types';
import { hairlineStage } from '@/scan/stageEstimate';

/** What one relative's photo shows: an estimated stage as a range, and the traced hairline. */
export interface PhotoAnalysis {
  stage: number;
  low: number;
  high: number;
  /** Hairline trace, normalised 0..1 to the (square) photo, for the overlay. */
  curve: [number, number][];
  signal: string;
}

const clamp = (x: number) => Math.min(7, Math.max(1, x));

/**
 * A stage from an old, uncontrolled photo. Angle, light and styling vary, so the range is always
 * a full stage either side and it never claims more than low confidence.
 */
export function photoStage(report: QualityReport): PhotoAnalysis | null {
  const hl = report.hairline;
  if (!hl || !hl.foreheadVisible) return null;
  const s = hairlineStage(hl.templeRecessionIPD, hl.centreMM);
  if (!s) return null;
  return { stage: s.stage, low: clamp(s.stage - 1), high: clamp(s.stage + 1), curve: hl.curve ?? [], signal: s.signal };
}

/** The hair status a photo suggests, used only when the person hasn't picked one. */
export function statusForStage(stage: number): HairStatus {
  if (stage < 2) return 'full';
  if (stage < 4) return 'receding';
  return 'bald';
}

/** Runs the scan engine on a relative's photo. Null when it isn't available or finds no hairline. */
export async function analyseRelativePhoto(uri: string): Promise<PhotoAnalysis | null> {
  if (!isHeadMapAvailable) return null;
  try {
    return photoStage(await analyzeImageAsync(uri, 'front'));
  } catch {
    return null;
  }
}
