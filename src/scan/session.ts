import type { CaptureResult, HairGrid, PanoramaFrame, QualityCheck, QualityReport, ScanView } from '@modules/headmap';

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

/** After a photo, the finished green line and "Got it" stay up this long before the next view. */
export const SHOW_CAPTURED_MS = 900;
/** Tips appear only after the same check has failed this many times (spec: twice). */
export const TIP_AFTER_FAILS = 2;

export interface HairState {
  dry: boolean;
  noProduct: boolean;
  sameLength: boolean;
}

export interface ScanSessionState {
  /** `panorama`: after the five photos, the whole-head panorama (full scans only). */
  phase: 'checklist' | 'capturing' | 'panorama' | 'done';
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
  /** Retaking only some views of an earlier scan: just these are captured, in scan order. */
  only: ScanView[] | null;
  /** When the camera first reported on the current view (for the manual shutter's delay). */
  viewSince: number | null;
  /** Every check has been green at least once this session (ends the practice round). */
  everPassed: boolean;
  /** Whether this session ends with the whole-head panorama (not for retaking some views). */
  withPanorama: boolean;
  /** The panorama's frames, once it is done (empty if it was skipped). */
  panorama: PanoramaFrame[] | null;
}

export type ScanAction =
  | { type: 'start'; hairState: HairState; now: number }
  | { type: 'quality'; report: QualityReport; now: number }
  | { type: 'captured'; result: CaptureResult }
  | { type: 'retake'; view: ScanView }
  | {
      type: 'resume';
      hairState: HairState;
      /** Photos already taken (a scan left part-way, kept as a draft). */
      captures?: Partial<Record<ScanView, CaptureResult>>;
      /** Capture only these views (retaking weak views of a saved scan). */
      only?: ScanView[] | null;
      now: number;
    }
  | { type: 'dismissTip' }
  /** The panorama finished (or was skipped, with no frames). */
  | { type: 'panoramaDone'; frames: PanoramaFrame[] };

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
  only: null,
  viewSince: null,
  everPassed: false,
  withPanorama: false,
  panorama: null,
};

/** After the last photo: the panorama if this session has one, else done. */
function afterPhotos(s: Pick<ScanSessionState, 'withPanorama' | 'panorama'>): ScanSessionState['phase'] {
  return s.withPanorama && !s.panorama ? 'panorama' : 'done';
}

/** The views this session still has to take, in scan order. */
export function viewsToTake(s: Pick<ScanSessionState, 'only' | 'captures'>): ScanView[] {
  return (s.only ?? SCAN_ORDER).filter((v) => !s.captures[v]);
}

function nextIndex(s: Pick<ScanSessionState, 'only' | 'captures'>): number {
  const next = viewsToTake(s)[0];
  return next ? SCAN_ORDER.indexOf(next) : SCAN_ORDER.length;
}

export function currentView(s: ScanSessionState): ScanView {
  return SCAN_ORDER[Math.min(s.index, SCAN_ORDER.length - 1)];
}

export function scanReducer(s: ScanSessionState, a: ScanAction): ScanSessionState {
  switch (a.type) {
    case 'start':
      return { ...initialScanState, phase: 'capturing', hairState: a.hairState, startedAt: a.now, withPanorama: true };

    case 'resume': {
      const base = { only: a.only?.length ? a.only : null, captures: a.captures ?? {} };
      const index = nextIndex(base);
      // A whole scan picked up later still ends with the panorama; retaking some views doesn't.
      const withPanorama = !base.only;
      return {
        ...initialScanState,
        ...base,
        hairState: a.hairState,
        startedAt: a.now,
        index,
        withPanorama,
        phase: index >= SCAN_ORDER.length ? afterPhotos({ withPanorama, panorama: null }) : 'capturing',
      };
    }

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
      return {
        ...s,
        live: a.report,
        stuck,
        fails,
        tip,
        viewSince: s.viewSince ?? a.now,
        everPassed: s.everPassed || a.report.allPassed,
      };
    }

    case 'captured': {
      if (s.phase !== 'capturing' || a.result.view !== currentView(s)) return s;
      const captures = { ...s.captures, [a.result.view]: a.result };
      // Next view is the first one in order not yet captured (handles retakes).
      const index = nextIndex({ only: s.only, captures });
      return {
        ...s,
        captures,
        index,
        phase: index >= SCAN_ORDER.length ? afterPhotos(s) : 'capturing',
        live: null,
        stuck: null,
        tip: null,
        viewSince: null,
      };
    }

    case 'retake': {
      const captures = { ...s.captures };
      delete captures[a.view];
      return {
        ...s,
        captures,
        index: SCAN_ORDER.indexOf(a.view),
        phase: 'capturing',
        live: null,
        stuck: null,
        tip: null,
        viewSince: null,
      };
    }

    case 'dismissTip':
      return { ...s, tip: null };

    case 'panoramaDone':
      if (s.phase !== 'panorama') return s;
      return { ...s, phase: 'done', panorama: a.frames };
  }
}

export interface ScanViewRecord {
  uri: string;
  score: number;
  /** The check that was still failing when the photo was taken, if any. Says why a view scored low. */
  issue?: QualityCheck;
  /** Taken with the manual shutter while checks were still red. */
  manual?: boolean;
  /** Coarse hair map of the photo, for the scalp map. Scans from before it existed have none. */
  hairGrid?: HairGrid;
  /** Face landmarks (normalised) and the frame size, to place this photo on the head model. */
  anchors?: Record<string, [number, number]>;
  frameSize?: [number, number];
}

export interface ScanRecord {
  id: string;
  takenAt: string;
  hairState: HairState;
  views: Partial<Record<ScanView, ScanViewRecord>>;
  /** Mean of the view scores, 0 to 100. */
  quality: number;
  /** Under 60: kept, but left out of trend lines (spec). */
  lowConfidence: boolean;
  hairline: {
    centreMM?: number;
    leftTempleMM?: number;
    rightTempleMM?: number;
    /** Mean temple height minus centre height, in pupil distances. Positive means receded temples. */
    templeRecessionIPD?: number;
    curve?: [number, number][];
  } | null;
  /** From the front view, for the next scan's distance check. */
  faceWidthPx?: number;
  /** The whole-head panorama: the best frame of each head region (scans from before it have none). */
  panorama?: PanoramaFrameRecord[];
}

export interface PanoramaFrameRecord {
  uri: string;
  /** Head region, 0..24 (see headCoverage.ts). */
  cell: number;
  azimuth: number;
  elevation: number;
  mode: 'face' | 'back';
  score: number;
  hairGrid?: HairGrid;
  anchors?: Record<string, [number, number]>;
  frameSize?: [number, number];
}

export function buildScanRecord(
  s: ScanSessionState,
  id: string,
  takenAt: Date,
  /** Retaking some views of this scan: the views not retaken, and its measurements, carry over. */
  base?: ScanRecord,
): ScanRecord {
  if (s.phase !== 'done' || !s.hairState) throw new Error('Scan is not finished');
  const views: ScanRecord['views'] = {};
  const scores: number[] = [];
  for (const v of SCAN_ORDER) {
    const c = s.captures[v];
    if (!c) {
      const kept = base?.views[v];
      if (kept) {
        views[v] = kept;
        scores.push(kept.score);
      }
      continue;
    }
    const score = c.report?.score ?? 0;
    const r = c.report;
    const issue = r && !r.allPassed ? r.topIssue : undefined;
    views[v] = {
      uri: c.uri,
      score,
      ...(issue ? { issue } : {}),
      ...(c.manual ? { manual: true } : {}),
      ...(r?.hairGrid ? { hairGrid: r.hairGrid } : {}),
      ...(r?.anchors ? { anchors: r.anchors } : {}),
      ...(r?.frameSize ? { frameSize: r.frameSize } : {}),
    };
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
    hairline: hl
      ? {
          centreMM: hl.centreMM,
          leftTempleMM: hl.leftTempleMM,
          rightTempleMM: hl.rightTempleMM,
          templeRecessionIPD: hl.templeRecessionIPD,
          curve: hl.curve,
        }
      : s.captures.front
        ? null
        : (base?.hairline ?? null),
    faceWidthPx: front?.faceWidthPx ?? (s.captures.front ? undefined : base?.faceWidthPx),
    ...(s.panorama?.length
      ? {
          panorama: s.panorama.map((f) => ({
            uri: f.uri,
            cell: f.cell,
            azimuth: f.azimuth,
            elevation: f.elevation,
            mode: f.mode,
            score: f.report?.score ?? 0,
            ...(f.report?.hairGrid ? { hairGrid: f.report.hairGrid } : {}),
            ...(f.report?.anchors ? { anchors: f.report.anchors } : {}),
            ...(f.report?.frameSize ? { frameSize: f.report.frameSize } : {}),
          })),
        }
      : base?.panorama
        ? { panorama: base.panorama }
        : {}),
  };
}

/** Views that need a retake: missing, or scored under the trend threshold. In scan order. */
export function weakViews(scan: ScanRecord): ScanView[] {
  return SCAN_ORDER.filter((v) => {
    const r = scan.views[v];
    return !r || r.score < MIN_TREND_QUALITY;
  });
}

/** Why a view scored low, and what to do, in plain words. */
export function weakReason(scan: ScanRecord, view: ScanView): string {
  const r = scan.views[view];
  if (!r) return 'This view wasn’t taken.';
  switch (r.issue) {
    case 'exposure':
      return view === 'front' ? 'Too dark to find your hairline. Face a window.' : 'The light was off. Face a window or turn on a light.';
    case 'backlight':
      return 'Too much light behind you. Turn to face the light.';
    case 'sharpness':
      return view === 'crown' ? 'A little blurry. Hold the phone still when the countdown ends.' : 'A little blurry. Hold still for a second.';
    case 'foreheadVisible':
    case 'hairlineFound':
      return 'Your hairline was hidden. Push your hair back off your forehead.';
    case 'pose':
      return 'Your head was at a different angle from the outline.';
    case 'distance':
      return 'The phone was nearer or further than your first scan.';
    case 'centred':
    case 'faceFound':
      return 'Your head wasn’t inside the outline.';
    case 'hairInFrame':
      return 'Not enough hair in the photo. Fill the circle with your head.';
    default:
      return r.manual ? 'Taken before every check was green.' : 'Not clear enough to measure.';
  }
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
  hairInFrame: 'Hold the phone a little further away so all of your hair is in view.',
  hairlineFound: 'Tilt the phone back slightly so the top of your head is in view.',
};
