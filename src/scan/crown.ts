import type { AimHint, CaptureResult, QualityReport } from '@modules/headmap';

/**
 * The crown photo, redesigned. You can't see the screen with the phone behind your head, so a
 * single auto-captured frame was hit and miss. Two ways to take it:
 *
 * - On my own: a spoken countdown while you get the phone behind your head, then spoken
 *   aiming hints from where the hair sits in the frame, then a short burst that keeps the
 *   best frame (hair in frame, then quality, then sharpness). You check it before it is kept.
 * - Someone's helping me: they see the live preview and the guide, the photo takes itself
 *   once the checks pass (or they tap the shutter), and you both check it before it is kept.
 *
 * A pure state machine, so the timing is tested without a camera.
 */
export type CrownMode = 'solo' | 'helper';

export type CrownStep = 'choose' | 'countdown' | 'aiming' | 'burst' | 'helper' | 'review';

export interface CrownState {
  mode: CrownMode | null;
  step: CrownStep;
  /** Seconds left on the solo countdown. */
  left: number;
  /** When aiming started, and since when the aim has been on target. */
  aimStartedAt: number | null;
  okSince: number | null;
  hint: AimHint | null;
  result: CaptureResult | null;
}

/** Seconds to get the phone behind your head. */
export const COUNTDOWN_S = 4;
/** On target this long before the burst starts. */
export const AIM_HOLD_MS = 600;
/** Burst anyway after this long, so a hard-to-aim crown never blocks the scan. */
export const AIM_TIMEOUT_MS = 8000;
/** How long the burst watches the frames. */
export const BURST_MS = 1500;

export const initialCrownState: CrownState = {
  mode: null,
  step: 'choose',
  left: COUNTDOWN_S,
  aimStartedAt: null,
  okSince: null,
  hint: null,
  result: null,
};

export type CrownAction =
  | { type: 'choose'; mode: CrownMode }
  | { type: 'tick'; now: number }
  | { type: 'quality'; report: QualityReport; now: number }
  | { type: 'shootNow' }
  | { type: 'captured'; result: CaptureResult }
  | { type: 'retake' }
  | { type: 'switchMode' };

function start(mode: CrownMode): CrownState {
  return { ...initialCrownState, mode, step: mode === 'solo' ? 'countdown' : 'helper' };
}

export function crownReducer(s: CrownState, a: CrownAction): CrownState {
  switch (a.type) {
    case 'choose':
      return start(a.mode);

    case 'tick':
      if (s.step === 'countdown') {
        return s.left <= 1 ? { ...s, step: 'aiming', left: 0, aimStartedAt: a.now, okSince: null } : { ...s, left: s.left - 1 };
      }
      if (s.step === 'aiming' && s.aimStartedAt != null && a.now - s.aimStartedAt >= AIM_TIMEOUT_MS) {
        return { ...s, step: 'burst' };
      }
      return s;

    case 'quality': {
      if (s.step !== 'aiming') return s;
      const hint = a.report.aim?.hint ?? null;
      const okSince = hint === 'ok' ? (s.okSince ?? a.now) : null;
      if (okSince != null && a.now - okSince >= AIM_HOLD_MS) return { ...s, hint, okSince, step: 'burst' };
      const timedOut = s.aimStartedAt != null && a.now - s.aimStartedAt >= AIM_TIMEOUT_MS;
      return { ...s, hint, okSince, step: timedOut ? 'burst' : 'aiming' };
    }

    case 'shootNow':
      // Skip the rest of the countdown or the aiming (solo), handled by the shutter in helper mode.
      return s.step === 'countdown' || s.step === 'aiming' ? { ...s, step: 'burst' } : s;

    case 'captured':
      if (s.step !== 'burst' && s.step !== 'helper') return s;
      if (a.result.view !== 'crown') return s;
      return { ...s, step: 'review', result: a.result };

    case 'retake':
      return s.mode ? start(s.mode) : initialCrownState;

    case 'switchMode':
      return initialCrownState;
  }
}

/** What to say while aiming. Directions are for the phone, from where you stand. */
export const AIM_VOICE: Record<AimHint, string> = {
  ok: 'Hold it there',
  noHair: 'I can’t see hair yet. Point the camera at the back of your head',
  moveCloser: 'Bring the phone a little closer',
  moveLeft: 'Move the phone to your left',
  moveRight: 'Move the phone to your right',
  moveUp: 'Move the phone up',
  moveDown: 'Move the phone down',
};

/** Spoken once when a step starts. */
export function stepVoice(s: CrownState): string | null {
  switch (s.step) {
    case 'countdown':
      return 'Hold the phone behind your head, camera facing your crown. Starting in';
    case 'aiming':
      return 'Keep still. I’ll guide you';
    case 'burst':
      return 'Hold still';
    case 'helper':
      return 'Hand the phone to your helper. They hold it above and behind your head';
    case 'review':
      return 'Got it. Bring the phone round to check the photo';
    default:
      return null;
  }
}

/** Plain words on the review screen about the kept frame. Never a verdict on your hair. */
export function reviewNote(r: CaptureResult): { title: string; detail: string; good: boolean } {
  const failed = r.report?.failed ?? [];
  if (failed.includes('hairInFrame')) {
    return { title: 'Not much hair in this one', detail: 'The camera may have missed your crown. Try again, a little higher.', good: false };
  }
  if (failed.includes('sharpness')) {
    return { title: 'A bit blurry', detail: 'Keep the phone still during the burst, or ask someone to help.', good: false };
  }
  if (failed.includes('exposure')) {
    return { title: 'Lighting is off', detail: 'Stand under a ceiling light, facing away from windows.', good: false };
  }
  return { title: 'Looks usable', detail: 'Your crown is in frame and sharp enough to compare next time.', good: true };
}
