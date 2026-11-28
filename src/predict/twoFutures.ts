import type { Forecast, YearForecast } from '@/forecast';

/** The service makes images up to 15 years out. */
export const MAX_FUTURE_YEARS = 15;

/**
 * Round ages to compare at: the next three multiples of 5 within 15 years, so a 25-year-old
 * gets 30, 35 and 40.
 */
export function milestoneAges(ageNow: number, maxYears = MAX_FUTURE_YEARS): number[] {
  const first = Math.floor(ageNow / 5) * 5 + 5;
  return [first, first + 5, first + 10].filter((a) => a - ageNow >= 1 && a - ageNow <= maxYears);
}

type Path = 'untreated' | 'plan';

const p50 = (y: YearForecast, path: Path): number | null => (path === 'plan' ? (y.withTreatment?.p50 ?? null) : y.untreated.p50);

/** The median stage on one path at any year, straight-line between the forecast's years. */
export function stageAt(f: Forecast, years: number, path: Path): number | null {
  const ys = f.byYear;
  if (!ys.length) return null;
  if (years <= ys[0].years) return p50(ys[0], path);
  for (let i = 1; i < ys.length; i++) {
    if (years <= ys[i].years) {
      const [a, b] = [ys[i - 1], ys[i]];
      const [sa, sb] = [p50(a, path), p50(b, path)];
      if (sa == null || sb == null) return null;
      return sa + ((sb - sa) * (years - a.years)) / (b.years - a.years);
    }
  }
  return p50(ys[ys.length - 1], path);
}

export interface TwoFutures {
  age: number;
  years: number;
  untreated: number;
  plan: number;
}

/** Both paths at one age, or null when the plan has nothing that changes the path. */
export function twoFuturesAt(f: Forecast, age: number): TwoFutures | null {
  const years = age - f.ageNow;
  const untreated = stageAt(f, years, 'untreated');
  const plan = stageAt(f, years, 'plan');
  if (untreated == null || plan == null) return null;
  return { age, years, untreated, plan };
}
