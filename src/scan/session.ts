import type { CaptureResult, QualityCheck, QualityReport, ScanView } from '@modules/headmap';

import { MIN_TREND_QUALITY } from './change';

/**
 * The guided scan as a pure state machine: hair-state checklist, then five views in order,
 * each saved only when the native module captures it. Kept free of React so every rule is
 * unit-tested.
 */
export const SCAN_ORDER: readonly ScanView[] = ['front', 'leftTemple', 'rightTemple', 'top', 'crown'];

export const VIEW_LABEL: Record<ScanView, string> = {
  front: 'Front: hairline',
  leftTemple: 'Left temple',
  rightTemple: 'Right temple',
  top: 'Top of head',
  crown: 'Crown',
};

/** How long one issue must block capture before it counts as a failed attempt. */
export const STUCK_MS = 4000;
/** Tips appear only after the same check has failed this many times (spec: twice). */
export const TIP_AFTER_FAILS = 2;

export interface HairState {
  dry: boolean;
  noProduct: boolean;
  sameLength: boolean;
}

export interface ScanSessionState {
  phase: 'checklist' | 'capturing' | 'done';
  index: number;
  hairState: HairState | null;
  captures: Partial<Record<ScanView, CaptureResult>>;
  /** Live report for the current view. */
  live: QualityReport | null;
  stuck: { check: QualityCheck; since: number } | null;
  fails: Partial<Record<QualityCheck, number>>;
  /** A check whose tip should show now (failed at least twice). */
  tip: QualityCheck | null;
  startedAt: number | null;
}

export type ScanAction =
  | { type: 'start'; hairState: HairState; now: number }
  | { type: 'quality'; report: QualityReport; now: number }
  | { type: 'captured'; result: CaptureResult }
  | { type: 'retake'; view: ScanView }
  | { type: 'dismissTip' };

export const initialScanState: ScanSessionState = {
  phase: 'checklist',
  index: 0,
  hairState: null,
  captures: {},
  live: null,
  stuck: null,
  fails: {},
  tip: null,
  startedAt: null,
};

export function currentView(s: ScanSessionState): ScanView {
  return SCAN_ORDER[Math.min(s.index, SCAN_ORDER.length - 1)];
}

export function scanReducer(s: ScanSessionState, a: ScanAction): ScanSessionState {
  switch (a.type) {
    case 'start':
      return { ...initialScanState, phase: 'capturing', hairState: a.hairState, startedAt: a.now };

    case 'quality': {
      if (s.phase !== 'capturing' || a.report.view !== currentView(s)) return s;
      const issue = a.report.allPassed ? undefined : a.report.topIssue;
      let { stuck, fails, tip } = s;
      if (!issue) {
        stuck = null;
      } else if (!stuck || stuck.check !== issue) {
        stuck = { check: issue, since: a.now };
      } else if (a.now - stuck.since >= STUCK_MS) {
        const n = (fails[issue] ?? 0) + 1;
        fails = { ...fails, [issue]: n };
        stuck = { check: issue, since: a.now };
        if (n >= TIP_AFTER_FAILS) tip = issue;
      }
      return { ...s, live: a.report, stuck, fails, tip };
    }

    case 'captured': {
      if (s.phase !== 'capturing' || a.result.view !== currentView(s)) return s;
      const captures = { ...s.captures, [a.result.view]: a.result };
      // Next view is the first one in order not yet captured (handles retakes).
      const next = SCAN_ORDER.findIndex((v) => !captures[v]);
      return {
        ...s,
        captures,
        index: next === -1 ? SCAN_ORDER.length : next,
        phase: next === -1 ? 'done' : 'capturing',
        live: null,
        stuck: null,
        tip: null,
      };
    }

    case 'retake': {
      const captures = { ...s.captures };
      delete captures[a.view];
      return { ...s, captures, index: SCAN_ORDER.indexOf(a.view), phase: 'capturing', live: null, stuck: null, tip: null };
    }

    case 'dismissTip':
      return { ...s, tip: null };
  }
}

export interface ScanRecord {
  id: string;
  takenAt: string;
  hairState: HairState;
  views: Partial<Record<ScanView, { uri: string; score: number }>>;
  /** Mean of the view scores, 0 to 100. */
  quality: number;
  /** Under 60: kept, but left out of trend lines (spec). */
  lowConfidence: boolean;
  hairline: { centreMM?: number; leftTempleMM?: number; rightTempleMM?: number; curve?: [number, number][] } | null;
  /** From the front view, for the next scan's distance check. */
  faceWidthPx?: number;
}

export function buildScanRecord(s: ScanSessionState, id: string, takenAt: Date): ScanRecord {
  if (s.phase !== 'done' || !s.hairState) throw new Error('Scan is not finished');
  const views: ScanRecord['views'] = {};
  const scores: number[] = [];
  for (const v of SCAN_ORDER) {
    const c = s.captures[v];
    if (!c) continue;
    const score = c.report?.score ?? 0;
    views[v] = { uri: c.uri, score };
    scores.push(score);
  }
  const quality = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const front = s.captures.front?.report;
  const hl = front?.hairline;
  return {
    id,
    takenAt: takenAt.toISOString(),
    hairState: s.hairState,
    views,
    quality,
    lowConfidence: quality < MIN_TREND_QUALITY,
    hairline: hl ? { centreMM: hl.centreMM, leftTempleMM: hl.leftTempleMM, rightTempleMM: hl.rightTempleMM, curve: hl.curve } : null,
    faceWidthPx: front?.faceWidthPx,
  };
}

/** Tip copy, shown only after a check has failed twice. */
export const TIPS: Partial<Record<QualityCheck, string>> = {
  pose: 'Keep the phone at eye level and move your head, not the phone.',
  distance: 'Hold the phone at arm’s length, the same as last time.',
  backlight: 'Turn around so the window or lamp is in front of you, not behind.',
  exposure: 'Bathroom lights from above work well. Avoid a dark room.',
  foreheadVisible: 'Use a headband or push your hair straight back with your hand.',
  sharpness: 'Rest your elbow on something to keep the phone steady.',
  centred: 'Line up the outline with the edge of your face.',
  faceFound: 'Make sure your whole face is on screen and well lit.',
  hairlineFound: 'Tilt the phone back slightly so the top of your head is in view.',
};
