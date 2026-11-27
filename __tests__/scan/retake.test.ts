import { DRAFT_TTL_MS, draftCount, draftRemaining, isDraftFresh, MemoryDraftStore, type ScanDraft } from '@/scan/draft';
import { cameraErrorMessage, turnToward } from '@/scan/guidance';
import { buildScanRecord, initialScanState, scanReducer, viewsToTake, weakReason, weakViews } from '@/scan/session';

import { capture, record } from '../../test-utils/scanFixtures';

const hair = { dry: true, noProduct: true, sameLength: true };

describe('weak views', () => {
  it('lists missing and low-scoring views in scan order, with a reason for each', () => {
    const scan = record('a', '2026-11-01T09:00:00Z', {
      views: {
        front: { uri: 'f', score: 40, issue: 'exposure' },
        leftTemple: { uri: 'l', score: 90 },
        rightTemple: { uri: 'r', score: 90 },
        top: { uri: 't', score: 30, manual: true },
      },
    });
    expect(weakViews(scan)).toEqual(['front', 'top', 'crown']);
    expect(weakReason(scan, 'front')).toBe('Too dark to find your hairline. Face a window.');
    expect(weakReason(scan, 'top')).toBe('Taken before every check was green.');
    expect(weakReason(scan, 'crown')).toBe('This view wasn’t taken.');
  });
});

describe('retaking some views', () => {
  it('captures only the chosen views, then keeps the rest of the old scan', () => {
    const old = record('old', '2026-11-01T09:00:00Z', {
      views: {
        front: { uri: 'f', score: 95 },
        leftTemple: { uri: 'l', score: 95 },
        rightTemple: { uri: 'r', score: 95 },
        top: { uri: 't', score: 20 },
        crown: { uri: 'c', score: 95 },
      },
      hairline: { centreMM: 70 },
    });
    let s = scanReducer(initialScanState, { type: 'resume', hairState: hair, only: ['top'], now: 0 });
    expect(viewsToTake(s)).toEqual(['top']);
    s = scanReducer(s, { type: 'captured', result: capture('top', 90) });
    expect(s.phase).toBe('done');
    const merged = buildScanRecord(s, 'new', new Date('2026-11-02T09:00:00Z'), old);
    expect(Object.keys(merged.views)).toHaveLength(5);
    expect(merged.views.top?.score).toBe(90);
    expect(merged.views.front?.uri).toBe('f');
    expect(merged.hairline).toEqual({ centreMM: 70 });
    expect(merged.quality).toBe(94);
    expect(merged.lowConfidence).toBe(false);
  });

  it('resumes a scan left part-way at the next view', () => {
    const s = scanReducer(initialScanState, { type: 'resume', hairState: hair, captures: { front: capture('front') }, now: 0 });
    expect(s.phase).toBe('capturing');
    expect(viewsToTake(s)[0]).toBe('leftTemple');
  });
});

describe('drafts', () => {
  const d: ScanDraft = { startedAt: '2026-11-01T09:00:00Z', hairState: hair, captures: { front: capture('front') } };

  it('keep for a day, and say what is left', async () => {
    expect(isDraftFresh(d, new Date('2026-11-01T20:00:00Z'))).toBe(true);
    expect(isDraftFresh(d, new Date(new Date(d.startedAt).getTime() + DRAFT_TTL_MS + 1))).toBe(false);
    expect(isDraftFresh({ ...d, captures: {} }, new Date('2026-11-01T10:00:00Z'))).toBe(false);
    expect(draftCount(d)).toBe(1);
    expect(draftRemaining(d)).toEqual(['leftTemple', 'rightTemple', 'top', 'crown']);
    const store = new MemoryDraftStore();
    await store.save(d);
    expect(await store.load()).toEqual(d);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('guidance', () => {
  it('turns toward the shoulder that brings the temple into view', () => {
    expect(turnToward('leftTemple', 0)).toBe('right');
    expect(turnToward('rightTemple', 0)).toBe('left');
    expect(turnToward('leftTemple', -44)).toBeNull();
    expect(turnToward('front', 10)).toBeNull();
  });

  it('turns camera errors into plain words', () => {
    expect(cameraErrorMessage('Camera permission denied').title).toBe('Camera access is off');
    expect(cameraErrorMessage('Camera in use by another app').title).toBe('The camera is busy');
    expect(cameraErrorMessage('AVFoundationErrorDomain -11800').title).toBe('The scan couldn’t start');
  });
});
