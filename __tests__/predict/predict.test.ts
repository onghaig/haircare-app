import { ForecastModel } from '@/forecast';
import { basedOn, chanceLabel, headline, isYearFree, scenarioInput, scenariosFor, shareMessage, yearLabel } from '@/predict/predict';
import { toForecastInput } from '@/profile/forecastInput';
import { emptyProfile } from '@/profile/types';

const adult = { ...emptyProfile(), age: 28, sex: 'male' as const, zones: ['temples' as const], family: { father: { status: 'bald' as const } } };

it('keeps only year 1 free', () => {
  expect(isYearFree(1)).toBe(true);
  expect(isYearFree(5)).toBe(false);
  expect(yearLabel(1)).toBe('1 year');
  expect(yearLabel(10)).toBe('10 years');
});

it('gives chances as rough fractions', () => {
  expect(chanceLabel(0.01)).toBe('Less than 1 in 20');
  expect(chanceLabel(0.37)).toBe('About 4 in 10');
  expect(chanceLabel(0.07)).toBe('About 1 in 10');
  expect(chanceLabel(0.99)).toBe('More than 19 in 20');
});

it('offers no treatment what-ifs to under-18s', () => {
  expect(scenariosFor(adult).map((s) => s.treatment)).toEqual(['none', 'minoxidil', 'finasteride', 'finasteride+minoxidil']);
  expect(scenariosFor({ ...adult, age: 16 })).toEqual([]);
});

it('says what the forecast is based on', () => {
  expect(basedOn(adult)).toEqual(['Your age (28)', '1 relative', 'Where you notice it']);
});

it('runs a what-if with the treatment taken most days, and treatment slows it', () => {
  const base = toForecastInput(adult)!;
  expect(scenarioInput(base, 'finasteride')).toMatchObject({ treatment: 'finasteride', adherence: 0.9 });
  expect(scenarioInput(base, 'none').adherence).toBeUndefined();
  const m = new ForecastModel();
  const off = m.forecast(scenarioInput(base, 'none'), { years: [10], samples: 20000 });
  const on = m.forecast(scenarioInput(base, 'finasteride'), { years: [10], samples: 20000 });
  expect(on.byYear[0].withTreatment!.p50).toBeLessThan(off.byYear[0].untreated.p50);
  expect(headline(on.byYear[0])).toMatch(/^Likely at 38: N/);
});

it('shares a range and an age, never a treatment name', () => {
  const f = new ForecastModel().forecast({ ...toForecastInput(adult)!, treatment: 'finasteride' }, { years: [1, 5], samples: 5000 });
  const msg = shareMessage(f, 5);
  expect(msg).toMatch(/^My hairline forecast for age 33: N/);
  expect(msg).toMatch(/not a diagnosis/);
  expect(msg).not.toMatch(/finasteride/i);
});
