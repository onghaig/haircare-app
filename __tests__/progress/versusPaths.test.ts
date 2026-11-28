import type { Forecast, StageRange } from '@/forecast';
import { MM_PER_STAGE, pathTitle, versusPaths } from '@/progress/versusPaths';

import { record } from '../../test-utils/scanFixtures';

const r = (p50: number): StageRange => ({ p10: p50 - 0.3, p50, p90: p50 + 0.3 });
/** Do nothing: +untreated stages in year 1; plan: +planned stages (or no plan). */
function forecast(untreated: number, planned?: number): Forecast {
  return {
    ageNow: 24,
    stageNow: r(2),
    effectiveSamples: 3000,
    modelVersion: 'test',
    paths: {},
    reachStage: 3,
    byYear: [
      {
        years: 1,
        age: 25,
        untreated: r(2 + untreated),
        withTreatment: planned == null ? null : r(2 + planned),
        plan: planned == null ? null : { years: 1, age: 25, band: r(2 + planned), pReach: { best: 0.1, mid: 0.2, worst: 0.3 } },
        pNorwood3Plus: 0.3,
        pReach: 0.3,
        pNorwood5Plus: 0.05,
      },
    ],
  };
}
const day = (n: number) => new Date(2026, 0, 1 + n).toISOString();
const scan = (id: string, d: number, centreMM: number) => record(id, day(d), { hairline: { centreMM, leftTempleMM: 70, rightTempleMM: 70 } });

describe('scans against both lines', () => {
  it('too early to tell when the change and the split are both inside scan noise', () => {
    const v = versusPaths(forecast(0.3, 0.1), [scan('a', 0, 68), scan('b', 60, 69)])!;
    expect(v.verdict).toBe('tooEarly');
    expect(pathTitle(v)).toBe('Too early to tell');
  });

  it('on your plan when the latest scan is inside the plan band', () => {
    // a year in: do nothing expects +0.8 stage (6 mm), plan expects -0.2 (-1.5 mm)
    const v = versusPaths(forecast(0.8, -0.2), [scan('a', 0, 68), scan('b', 365, 67.5)])!;
    expect(v.planAt(12)).toBeCloseTo(-0.2 * MM_PER_STAGE);
    expect(v.untreatedAt(12)).toBeCloseTo(0.8 * MM_PER_STAGE);
    expect(v.verdict).toBe('onPlan');
    expect(v.sentence).toMatch(/ahead of no plan/);
  });

  it('ahead or behind only past scan noise', () => {
    expect(versusPaths(forecast(0.8, 0.4), [scan('a', 0, 68), scan('b', 365, 64)])!.verdict).toBe('ahead');
    expect(versusPaths(forecast(0.8, 0.0), [scan('a', 0, 68), scan('b', 365, 74)])!.verdict).toBe('behind');
  });

  it('without a plan, it compares with your forecast', () => {
    const v = versusPaths(forecast(0.8), [scan('a', 0, 68), scan('b', 365, 74)])!;
    expect(v.hasPlan).toBe(false);
    expect(pathTitle(v)).toBe('On your forecast');
  });

  it('needs two scans with hairline numbers', () => {
    expect(versusPaths(forecast(0.8), [scan('a', 0, 68)])).toBeNull();
  });
});
