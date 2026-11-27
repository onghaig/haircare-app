import {
  buildScanRecord,
  currentView,
  initialScanState,
  SCAN_ORDER,
  scanReducer,
  STUCK_MS,
  TIPS,
  type ScanAction,
  type ScanSessionState,
} from '@/scan/session';

import { capture, report } from '../../test-utils/scanFixtures';

const hair = { dry: true, noProduct: true, sameLength: true };
const run = (actions: ScanAction[], s: ScanSessionState = initialScanState) => actions.reduce(scanReducer, s);
const started = () => run([{ type: 'start', hairState: hair, now: 0 }]);

describe('scan session', () => {
  it('starts on the hair checklist, then the front view', () => {
    expect(initialScanState.phase).toBe('checklist');
    const s = started();
    expect(s.phase).toBe('capturing');
    expect(currentView(s)).toBe('front');
    expect(s.hairState).toEqual(hair);
  });

  it('walks the five views in order and finishes', () => {
    let s = started();
    for (const v of SCAN_ORDER) {
      expect(currentView(s)).toBe(v);
      s = scanReducer(s, { type: 'captured', result: capture(v) });
    }
    // Then the whole-head panorama, then done.
    expect(s.phase).toBe('panorama');
    expect(Object.keys(s.captures)).toHaveLength(5);
    s = scanReducer(s, { type: 'panoramaDone', frames: [] });
    expect(s.phase).toBe('done');
  });

  it('keeps the panorama frames in the saved scan', () => {
    let s = started();
    for (const v of SCAN_ORDER) s = scanReducer(s, { type: 'captured', result: capture(v) });
    s = scanReducer(s, {
      type: 'panoramaDone',
      frames: [{ uri: 'file:///p0.jpg', cell: 0, azimuth: 15, elevation: 17, mode: 'face', report: report('front') }],
    });
    const r = buildScanRecord(s, 'p', new Date());
    expect(r.panorama).toHaveLength(1);
    expect(r.panorama?.[0]).toMatchObject({ uri: 'file:///p0.jpg', cell: 0, mode: 'face' });
  });

  it('retaking some views skips the panorama and keeps the old one', () => {
    let s = scanReducer(initialScanState, { type: 'resume', hairState: hair, only: ['front'], now: 0 });
    expect(s.withPanorama).toBe(false);
    s = scanReducer(s, { type: 'captured', result: capture('front') });
    expect(s.phase).toBe('done');
  });

  it('ignores reports and captures for a view that is not current', () => {
    const s = started();
    expect(scanReducer(s, { type: 'quality', report: report('top'), now: 1 })).toBe(s);
    expect(scanReducer(s, { type: 'captured', result: capture('crown') })).toBe(s);
  });

  it('retakes one view and then resumes where it left off', () => {
    let s = run([{ type: 'captured', result: capture('front') }, { type: 'captured', result: capture('leftTemple') }], started());
    s = scanReducer(s, { type: 'retake', view: 'front' });
    expect(currentView(s)).toBe('front');
    s = scanReducer(s, { type: 'captured', result: capture('front') });
    expect(currentView(s)).toBe('rightTemple');
  });

  it('shows a tip only after the same check fails twice', () => {
    let s = started();
    const stuck = (now: number) => scanReducer(s, { type: 'quality', report: report('front', ['foreheadVisible']), now });
    s = stuck(0);
    s = stuck(STUCK_MS); // first failure
    expect(s.fails.foreheadVisible).toBe(1);
    expect(s.tip).toBeNull();
    s = stuck(2 * STUCK_MS); // second failure
    expect(s.tip).toBe('foreheadVisible');
    expect(TIPS.foreheadVisible).toMatch(/headband/);
    s = scanReducer(s, { type: 'dismissTip' });
    expect(s.tip).toBeNull();
  });

  it('does not count brief flickers as failures', () => {
    let s = started();
    s = scanReducer(s, { type: 'quality', report: report('front', ['pose']), now: 0 });
    s = scanReducer(s, { type: 'quality', report: report('front'), now: 1000 });
    s = scanReducer(s, { type: 'quality', report: report('front', ['pose']), now: 2000 });
    s = scanReducer(s, { type: 'quality', report: report('front', ['pose']), now: 2000 + STUCK_MS - 1 });
    expect(s.fails.pose).toBeUndefined();
  });

  it('clears the live report and tip when the view changes', () => {
    let s = started();
    s = scanReducer(s, { type: 'quality', report: report('front', ['pose']), now: 0 });
    s = scanReducer(s, { type: 'captured', result: capture('front') });
    expect(s.live).toBeNull();
    expect(s.stuck).toBeNull();
  });
});

describe('buildScanRecord', () => {
  function finished(scores: number[]) {
    let s = started();
    SCAN_ORDER.forEach((v, i) => {
      s = scanReducer(s, {
        type: 'captured',
        result: capture(v, scores[i], v === 'front'
          ? { faceWidthPx: 410, hairline: { centreMM: 68.2, leftTempleMM: 71, rightTempleMM: 73.4, foreheadVisible: true, interPupilPx: 120, curve: [[0.3, 0.2]] } }
          : {}),
      });
    });
    return scanReducer(s, { type: 'panoramaDone', frames: [] });
  }

  it('averages the view scores and takes the hairline from the front view', () => {
    const r = buildScanRecord(finished([100, 90, 90, 80, 90]), 'abc', new Date('2026-11-26T12:00:00Z'));
    expect(r.quality).toBe(90);
    expect(r.lowConfidence).toBe(false);
    expect(r.hairline?.centreMM).toBe(68.2);
    expect(r.faceWidthPx).toBe(410);
    expect(r.takenAt).toBe('2026-11-26T12:00:00.000Z');
    expect(Object.keys(r.views)).toEqual([...SCAN_ORDER]);
  });

  it('marks scans under 60 as low confidence but keeps them', () => {
    const r = buildScanRecord(finished([50, 50, 60, 60, 50]), 'x', new Date());
    expect(r.quality).toBe(54);
    expect(r.lowConfidence).toBe(true);
  });

  it('refuses to build an unfinished scan', () => {
    expect(() => buildScanRecord(started(), 'x', new Date())).toThrow();
  });
});
