import effectsJson from '@/forecast/data/treatment-effects.json';
import { combine, EFFECTS_VERIFIED, ForecastModel, liftAt, liftFraction, planFromTreatment, reachStageFor, roleOf, type UserInput } from '@/forecast';

const person: UserInput = {
  age: 24,
  observations: [{ age: 24, stage: 2.5 }, { age: 20, stage: 1.5, source: 'old_photo' }],
  relatives: [{ relation: 'father', status: 'thinning', age: 52 }],
};
const model = new ForecastModel();
const run = (u: UserInput, paths = {}) => model.forecast(u, { samples: 12_000, paths });

describe('two kinds of action', () => {
  it('finasteride-type options slow loss; minoxidil and massage grow hair', () => {
    expect(roleOf('finasteride')).toBe('slows');
    expect(roleOf('dutasteride')).toBe('slows');
    expect(roleOf('minoxidil')).toBe('grows');
    expect(roleOf('oral_minoxidil')).toBe('grows');
    expect(roleOf('massage')).toBe('grows');
  });

  it('minoxidil no longer slows the rate', () => {
    expect(combine([{ option: 'minoxidil', adherence: 1 }]).slow).toBe(0);
    expect(combine([{ option: 'minoxidil', adherence: 1 }]).lift).toBeGreaterThan(0);
    expect(combine([{ option: 'finasteride', adherence: 1 }]).lift).toBe(0);
  });

  it('slowers do not stack, lifts in one group do not stack, different groups add', () => {
    const fin = combine([{ option: 'finasteride', adherence: 1 }]);
    const dut = combine([{ option: 'dutasteride', adherence: 1 }]);
    expect(combine([{ option: 'finasteride', adherence: 1 }, { option: 'dutasteride', adherence: 1 }]).slow).toBe(Math.max(fin.slow, dut.slow));
    const topical = combine([{ option: 'minoxidil', adherence: 1 }]).lift;
    const oral = combine([{ option: 'oral_minoxidil', adherence: 1 }]).lift;
    const massage = combine([{ option: 'massage', adherence: 1 }]).lift;
    expect(combine([{ option: 'minoxidil', adherence: 1 }, { option: 'oral_minoxidil', adherence: 1 }]).lift).toBe(Math.max(topical, oral));
    expect(combine([{ option: 'minoxidil', adherence: 1 }, { option: 'massage', adherence: 1 }]).lift).toBeCloseTo(topical + massage);
  });

  it('adherence scales the effect, and zero adherence is no effect', () => {
    expect(combine([{ option: 'minoxidil', adherence: 0.5 }]).lift).toBeCloseTo(combine([{ option: 'minoxidil', adherence: 1 }]).lift / 2);
    expect(combine([{ option: 'finasteride', adherence: 0 }])).toEqual({ slow: 0, lift: 0 });
  });

  it('best, mid and worst cases are ordered', () => {
    for (const plan of [planFromTreatment('finasteride', 1), planFromTreatment('minoxidil', 1)]) {
      const [w, m, b] = (['worst', 'mid', 'best'] as const).map((c) => combine(plan, c));
      expect(w.slow + w.lift).toBeLessThanOrEqual(m.slow + m.lift);
      expect(m.slow + m.lift).toBeLessThanOrEqual(b.slow + b.lift);
    }
  });
});

describe('the minoxidil lift over time', () => {
  it('ramps up to full over the first months', () => {
    expect(liftFraction('minoxidil', 0)).toBe(0);
    expect(liftFraction('minoxidil', 3)).toBeCloseTo(0.5);
    expect(liftFraction('minoxidil', 6)).toBe(1);
    expect(liftFraction('minoxidil', 60)).toBe(1);
  });

  it('fades to nothing within months of stopping', () => {
    expect(liftFraction('minoxidil', 12, 12)).toBe(1);
    expect(liftFraction('minoxidil', 14, 12)).toBeCloseTo(0.5);
    expect(liftFraction('minoxidil', 16, 12)).toBe(0);
    expect(liftFraction('minoxidil', 40, 12)).toBe(0);
  });

  it('is full at every forecast year when kept up', () => {
    const plan = planFromTreatment('minoxidil', 1);
    expect(liftAt(plan, 'mid', 12)).toBeCloseTo(combine(plan).lift);
  });
});

describe('paths in the forecast', () => {
  const none = run(person);
  const minox = run({ ...person, plan: planFromTreatment('minoxidil', 0.9) });
  const fin = run({ ...person, plan: planFromTreatment('finasteride', 0.9) });

  it('a plan never changes the untreated line', () => {
    expect(minox.byYear.map((y) => y.untreated)).toEqual(none.byYear.map((y) => y.untreated));
    expect(fin.byYear.map((y) => y.untreated)).toEqual(none.byYear.map((y) => y.untreated));
    expect(none.byYear.every((y) => y.plan === null && y.withTreatment === null)).toBe(true);
  });

  it('growing hair keeps the slope: the gap to doing nothing stays about the same', () => {
    const gap = (y: number) => minox.byYear.find((b) => b.years === y)!.untreated.p50 - minox.byYear.find((b) => b.years === y)!.withTreatment!.p50;
    expect(gap(3)).toBeGreaterThan(0.15);
    expect(Math.abs(gap(15) - gap(3))).toBeLessThan(0.12);
  });

  it('slowing loss flattens the slope: the gap grows every year', () => {
    const gaps = fin.byYear.map((y) => y.untreated.p50 - y.withTreatment!.p50);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1] - 1e-9);
    expect(gaps.at(-1)!).toBeGreaterThan(2 * gaps[0]);
  });

  it('slowing loss moves the 10-year odds more than growing hair (with the current assumptions)', () => {
    const at10 = (f: typeof none) => f.byYear.find((y) => y.years === 10)!;
    expect(at10(fin).plan!.pReach.mid).toBeLessThan(at10(minox).plan!.pReach.mid);
    expect(at10(minox).plan!.pReach.mid).toBeLessThan(at10(none).pReach);
  });

  it('a plan band spans the assumed effect range and is ordered', () => {
    for (const y of [...minox.byYear, ...fin.byYear]) {
      const { band, pReach: c } = y.plan!;
      expect(band.p10).toBeLessThanOrEqual(y.withTreatment!.p10);
      expect(band.p90).toBeGreaterThanOrEqual(y.withTreatment!.p90);
      expect(band.p10).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p90);
      expect(c.best).toBeLessThanOrEqual(c.mid + 1e-12);
      expect(c.mid).toBeLessThanOrEqual(c.worst + 1e-12);
    }
  });

  it('extra paths run on the same simulated people as the main plan', () => {
    const f = run(person, { fin: planFromTreatment('finasteride', 0.9) });
    expect(f.paths.fin.map((p) => p.band)).toEqual(fin.byYear.map((y) => y.plan!.band));
    expect(f.paths.fin).toHaveLength(f.byYear.length);
  });

  it('the old treatment field still works and matches the same plan', () => {
    const legacy = run({ ...person, treatment: 'finasteride', adherence: 0.9 });
    expect(legacy.byYear).toEqual(fin.byYear);
  });
});

it('the treatment effects are flagged as unverified until checked against trials', () => {
  expect(EFFECTS_VERIFIED).toBe(false);
  expect(effectsJson._note).toMatch(/UNVERIFIED/);
});

describe('the headline stage', () => {
  it('is Norwood 3, or the next stage up for someone already at or past 3', () => {
    expect([1, 1.4, 1.6, 2.4, 2.5, 3, 3.6, 6.8].map(reachStageFor)).toEqual([3, 3, 3, 3, 4, 4, 5, 7]);
  });

  it('keeps options comparable for someone already at Norwood 3', () => {
    const f = model.forecast(
      { age: 30, observations: [{ age: 30, stage: 3 }], relatives: [{ relation: 'father', status: 'bald', age: 50 }] },
      { samples: 12_000, paths: { fin: planFromTreatment('finasteride', 0.9) } },
    );
    expect(f.reachStage).toBe(4);
    const ten = f.byYear.find((y) => y.years === 10)!;
    expect(ten.pReach).toBeLessThan(0.95);
    expect(f.paths.fin.find((p) => p.years === 10)!.pReach.mid).toBeLessThan(ten.pReach - 0.05);
  });
});
