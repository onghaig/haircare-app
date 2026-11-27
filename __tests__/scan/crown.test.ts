import { COUNTDOWN_S, crownEstimate, crownEstimateText, crownReducer, initialCrownState, stepVoice, type CrownState } from '@/scan/crown';

import { capture } from '../../test-utils/scanFixtures';

/** A head seen from above: hair out to `head` cells from the centre, scalp showing inside `bald`. */
function overhead(bald: number, head = 5.5, cols = 12, rows = 16) {
  const values = Array.from({ length: cols * rows }, (_, i) => {
    const d = Math.hypot((i % cols) + 0.5 - cols / 2, Math.floor(i / cols) + 0.5 - rows / 2);
    return d > head ? 0 : d < bald ? 0.05 : 1;
  });
  return { cols, rows, values };
}

describe('crown: one photo from high above', () => {
  it('counts down from Start straight into the photo, with no aiming step', () => {
    let s: CrownState = initialCrownState;
    expect(s.step).toBe('ready');
    s = crownReducer(s, { type: 'start' });
    expect(s).toMatchObject({ step: 'countdown', left: COUNTDOWN_S });
    for (let i = 0; i < COUNTDOWN_S; i++) s = crownReducer(s, { type: 'tick' });
    expect(s.step).toBe('burst');
    s = crownReducer(s, { type: 'captured', result: capture('front') });
    expect(s.step).toBe('burst');
    s = crownReducer(s, { type: 'captured', result: capture('crown') });
    expect(s.step).toBe('review');
    expect(crownReducer(s, { type: 'retake' })).toMatchObject({ step: 'countdown', result: null });
    expect(crownReducer(s, { type: 'reset' })).toEqual(initialCrownState);
  });

  it('lets a helper take it at once', () => {
    expect(crownReducer(initialCrownState, { type: 'shootNow' }).step).toBe('burst');
    expect(crownReducer({ ...initialCrownState, step: 'countdown' }, { type: 'shootNow' }).step).toBe('burst');
  });

  it('says what to do in plain spoken sentences', () => {
    expect(stepVoice(initialCrownState)).toMatch(/high above your head/);
    expect(stepVoice({ ...initialCrownState, step: 'review' })).toMatch(/have a look/);
  });
});

describe('crown density from the one photo', () => {
  it('reads a full crown as well covered, ignoring the floor around the head', () => {
    const e = crownEstimate(overhead(0))!;
    expect(e.level).toBe('full');
    expect(e.loss).toBe(0);
    expect(e.high).toBe(100);
  });

  it('sees scalp showing in the middle of the crown, more as the thin patch grows', () => {
    const some = crownEstimate(overhead(4))!;
    const lots = crownEstimate(overhead(5))!;
    expect(some.loss).toBeGreaterThan(0);
    expect(lots.loss).toBeGreaterThan(some.loss);
    expect(lots.coverage).toBeLessThan(some.coverage);
  });

  it('always gives a range in 5 percent steps, and words that are not a diagnosis', () => {
    const e = crownEstimate(overhead(3.5))!;
    expect(e.low % 5).toBe(0);
    expect(e.high % 5).toBe(0);
    expect(e.high).toBeGreaterThan(e.low);
    const t = crownEstimateText(e);
    expect(t.detail).toMatch(/^About \d+–\d+% of your crown looks covered/);
    expect(`${t.title} ${t.detail}`).not.toMatch(/alopecia|disease|diagnos/i);
  });

  it('gives no estimate without hair in the photo or without a hair map', () => {
    expect(crownEstimate(undefined)).toBeNull();
    expect(crownEstimate({ cols: 12, rows: 16, values: Array(192).fill(0) })).toBeNull();
    expect(crownEstimate({ cols: 12, rows: 16, values: [] })).toBeNull();
  });
});
