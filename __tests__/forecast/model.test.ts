import { ForecastModel, stageAt, statusOf, weightedQuantiles, type Forecast, type UserInput } from '@/forecast';

import python from './python-v0-examples.json';

/** The four personas from forecast-model-v0/forecast.py, which produced python-v0-examples.json. */
const PERSONAS: Record<string, UserInput> = {
  'Curious 17-year-old, no loss, bald father and grandfather': {
    age: 17,
    observations: [{ age: 17, stage: 1 }],
    relatives: [
      { relation: 'father', status: 'bald', age: 45 },
      { relation: 'maternal_grandfather', status: 'bald', age: 70 },
    ],
  },
  'Curious 17-year-old, no loss, full-haired family': {
    age: 17,
    observations: [{ age: 17, stage: 1 }],
    relatives: [
      { relation: 'father', status: 'full', age: 45 },
      { relation: 'maternal_grandfather', status: 'full', age: 70 },
    ],
  },
  'Early noticer, 24, Norwood 2.5 now, Norwood 1.5 in a photo at 20': {
    age: 24,
    observations: [{ age: 24, stage: 2.5 }, { age: 20, stage: 1.5, source: 'old_photo' }],
    relatives: [{ relation: 'father', status: 'thinning', age: 52 }],
  },
  'Same early noticer, on finasteride with 90% adherence': {
    age: 24,
    observations: [{ age: 24, stage: 2.5 }, { age: 20, stage: 1.5, source: 'old_photo' }],
    relatives: [{ relation: 'father', status: 'thinning', age: 52 }],
    treatment: 'finasteride',
    adherence: 0.9,
  },
};

const model = new ForecastModel();
const results: Record<string, Forecast> = {};
beforeAll(() => {
  for (const [name, u] of Object.entries(PERSONAS)) results[name] = model.forecast(u);
});

// Monte Carlo with different random streams: stages agree to within ~0.1, probabilities to ~0.02.
const STAGE_TOL = 0.1;
const PROB_TOL = 0.025;

describe('parity with the Python v0 model', () => {
  type Py = (typeof python)[keyof typeof python];
  it.each(Object.keys(PERSONAS))('%s', (name) => {
    const py = (python as Record<string, Py>)[name];
    const ts = results[name];
    for (const q of ['p10', 'p50', 'p90'] as const) {
      expect(Math.abs(ts.stageNow[q] - py.stage_now[q])).toBeLessThanOrEqual(STAGE_TOL);
    }
    py.by_year.forEach((pyY, i) => {
      const y = ts.byYear[i];
      expect(y.years).toBe(pyY.years);
      for (const q of ['p10', 'p50', 'p90'] as const) {
        expect(Math.abs(y.untreated[q] - pyY.untreated[q])).toBeLessThanOrEqual(STAGE_TOL);
        if (pyY.with_treatment) expect(Math.abs(y.withTreatment![q] - pyY.with_treatment[q])).toBeLessThanOrEqual(STAGE_TOL);
      }
      expect(y.withTreatment === null).toBe(pyY.with_treatment === null);
      expect(Math.abs(y.pNorwood3Plus - pyY.p_norwood_3_plus)).toBeLessThanOrEqual(PROB_TOL);
      expect(Math.abs(y.pNorwood5Plus - pyY.p_norwood_5_plus)).toBeLessThanOrEqual(PROB_TOL);
    });
    // effective sample size within 15%
    expect(Math.abs(ts.effectiveSamples - py.effective_samples) / py.effective_samples).toBeLessThan(0.15);
  });
});

describe('model behaviour', () => {
  const bald = () => results['Curious 17-year-old, no loss, bald father and grandfather'];
  const full = () => results['Curious 17-year-old, no loss, full-haired family'];
  const noticer = () => results['Early noticer, 24, Norwood 2.5 now, Norwood 1.5 in a photo at 20'];
  const treated = () => results['Same early noticer, on finasteride with 90% adherence'];

  it('a bald family raises long-term risk', () => {
    expect(bald().byYear.at(-1)!.pNorwood3Plus).toBeGreaterThan(2 * full().byYear.at(-1)!.pNorwood3Plus);
  });

  it('risk and median stage never fall as the years go on', () => {
    for (const f of Object.values(results)) {
      for (let i = 1; i < f.byYear.length; i++) {
        expect(f.byYear[i].pNorwood3Plus).toBeGreaterThanOrEqual(f.byYear[i - 1].pNorwood3Plus);
        expect(f.byYear[i].untreated.p50).toBeGreaterThanOrEqual(f.byYear[i - 1].untreated.p50);
      }
    }
  });

  it('ranges are ordered and inside Norwood 1 to 7', () => {
    for (const f of Object.values(results)) {
      for (const r of [f.stageNow, ...f.byYear.map((y) => y.untreated)]) {
        expect(r.p10).toBeLessThanOrEqual(r.p50);
        expect(r.p50).toBeLessThanOrEqual(r.p90);
        expect(r.p10).toBeGreaterThanOrEqual(1);
        expect(r.p90).toBeLessThanOrEqual(7);
      }
    }
  });

  it('treatment slows progression but does not change the untreated line', () => {
    treated().byYear.forEach((y, i) => {
      expect(y.withTreatment!.p50).toBeLessThan(y.untreated.p50 + 1e-9);
      expect(y.untreated).toEqual(noticer().byYear[i].untreated);
    });
    expect(noticer().byYear.every((y) => y.withTreatment === null)).toBe(true);
  });

  it('zero adherence means no treatment effect', () => {
    const u = { ...PERSONAS['Same early noticer, on finasteride with 90% adherence'], adherence: 0 };
    const f = model.forecast(u, { samples: 20_000 });
    expect(f.byYear.every((y) => y.withTreatment === null)).toBe(true);
  });

  it('is reproducible for the same seed', () => {
    const u = PERSONAS['Early noticer, 24, Norwood 2.5 now, Norwood 1.5 in a photo at 20'];
    expect(model.forecast(u, { samples: 20_000, seed: 3 })).toEqual(model.forecast(u, { samples: 20_000, seed: 3 }));
  });

  it('without family history, relatives are ignored', () => {
    const a = model.forecast(PERSONAS['Curious 17-year-old, no loss, bald father and grandfather'], { samples: 20_000, useFamily: false });
    const b = model.forecast({ age: 17, observations: [{ age: 17, stage: 1 }] }, { samples: 20_000 });
    expect(a.byYear.map((y) => y.untreated)).toEqual(b.byYear.map((y) => y.untreated));
  });

  it('ancestry shifts the base rate (east Asian lower than white, by default white)', () => {
    const base = { age: 25, observations: [{ age: 25, stage: 1.5 }] };
    const opts = { samples: 30_000 };
    const white = model.forecast({ ...base, ancestry: 'white' }, opts).byYear.at(-1)!.pNorwood3Plus;
    const eastAsian = model.forecast({ ...base, ancestry: 'east_asian' }, opts).byYear.at(-1)!.pNorwood3Plus;
    expect(eastAsian).toBeLessThan(white);
    expect(model.forecast(base, opts)).toEqual(model.forecast({ ...base, ancestry: 'white' }, opts));
  });

  it('rejects impossible ages and unknown relations', () => {
    expect(() => model.forecast({ age: -1 })).toThrow(RangeError);
    expect(() => model.forecast({ age: 200 })).toThrow(RangeError);
    // @ts-expect-error unknown relation at runtime
    expect(() => model.forecast({ age: 20, relatives: [{ relation: 'cousin', status: 'bald', age: 40 }] }, { samples: 1000 })).toThrow();
  });

  // Budget: the analysing screen runs 8 to 12 s, so the forecast must fit well inside it.
  // Jest's sandbox (plus coverage instrumentation in CI) runs this loop about 10x slower than a
  // real JS engine: plain Node takes about 0.15 s. 6 s here keeps the check meaningful without
  // measuring the test runner.
  it('runs a full 200k-sample forecast fast enough for the reveal screen', () => {
    const t0 = Date.now();
    model.forecast(PERSONAS['Curious 17-year-old, no loss, bald father and grandfather']);
    expect(Date.now() - t0).toBeLessThan(6000);
  });

  it('cost grows linearly with the sample count (no hidden sort or quadratic step)', () => {
    const u = PERSONAS['Curious 17-year-old, no loss, bald father and grandfather'];
    model.forecast(u, { samples: 20_000 }); // warm up
    const t0 = Date.now();
    model.forecast(u, { samples: 25_000 });
    const small = Math.max(Date.now() - t0, 1);
    const t1 = Date.now();
    model.forecast(u, { samples: 200_000 });
    const big = Date.now() - t1;
    expect(big / small).toBeLessThan(8 * 2.5);
  });
});

describe('helpers', () => {
  it('stageAt clips to Norwood 1 to 7 and starts at onset', () => {
    expect(stageAt(20, 25, 0.5)).toBe(1);
    expect(stageAt(27, 25, 0.5)).toBe(2);
    expect(stageAt(80, 25, 0.5)).toBe(7);
  });

  it('statusOf maps stages to full, thinning and bald', () => {
    expect([1, 2.49, 2.5, 4.49, 4.5, 7].map(statusOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('weightedQuantiles follows the cumulative-weight rule', () => {
    const x = Float64Array.from([1, 2, 3, 4, 5]);
    expect(weightedQuantiles(x, Float64Array.from([0.2, 0.2, 0.2, 0.2, 0.2]))).toEqual({ p10: 1, p50: 3, p90: 5 });
    expect(weightedQuantiles(x, Float64Array.from([0, 0, 1, 0, 0]))).toEqual({ p10: 3, p50: 3, p90: 3 });
  });
});
