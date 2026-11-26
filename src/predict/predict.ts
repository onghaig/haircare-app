import type { Forecast, Treatment, UserInput, YearForecast } from '@/forecast';
import { isMinor } from '@/profile/onboarding';
import type { Profile } from '@/profile/types';
import { rangeLabel } from '@/reveal/reveal';

export const PREDICT_YEARS = [1, 3, 5, 10, 15] as const;
export type PredictYear = (typeof PREDICT_YEARS)[number];

/** Samples for a what-if run: fewer than the main forecast so switching feels instant. */
export const WHAT_IF_SAMPLES = 40_000;

/** Year 1 is free for everyone; later years are part of Premium (spec, same as the reveal). */
export function isYearFree(years: number): boolean {
  return years === 1;
}

export function yearLabel(years: number): string {
  return years === 1 ? '1 year' : `${years} years`;
}

/** Chances as rough fractions, never as a precise percentage. */
export function chanceLabel(p: number): string {
  if (p < 0.05) return 'Less than 1 in 20';
  if (p > 0.95) return 'More than 19 in 20';
  const tenths = Math.max(1, Math.min(9, Math.round(p * 10)));
  return `About ${tenths} in 10`;
}

export interface Scenario {
  treatment: Treatment;
  label: string;
}

const ADULT_SCENARIOS: Scenario[] = [
  { treatment: 'none', label: 'No treatment' },
  { treatment: 'minoxidil', label: 'Minoxidil' },
  { treatment: 'finasteride', label: 'Finasteride' },
  { treatment: 'finasteride+minoxidil', label: 'Both' },
];

/** What-if treatments. None for under-18s: no prescription content (spec). */
export function scenariosFor(profile: Profile): Scenario[] {
  return isMinor(profile) ? [] : ADULT_SCENARIOS;
}

/** The same person with a different treatment, taken most days. */
export function scenarioInput(base: UserInput, treatment: Treatment): UserInput {
  return { ...base, treatment, adherence: treatment === 'none' ? undefined : (base.adherence ?? 0.9) };
}

/** The range most likely at that point, treated when the forecast includes a treatment. */
export function likelyRange(y: YearForecast) {
  return y.withTreatment ?? y.untreated;
}

export function headline(y: YearForecast): string {
  return `Likely at ${y.age}: ${rangeLabel(likelyRange(y))}`;
}

/** What the forecast is built from, so it never looks like magic. */
export function basedOn(profile: Profile): string[] {
  const out: string[] = [];
  if (profile.age != null) out.push(`Your age (${profile.age})`);
  const relatives = Object.values(profile.family ?? {}).filter((r) => r && r.status).length;
  if (relatives) out.push(`${relatives} relative${relatives === 1 ? '' : 's'}`);
  if (profile.zones.length || profile.worriedOnly) out.push('Where you notice it');
  if (profile.treatments.length) out.push('Your treatment');
  return out;
}

/**
 * Text that goes with the share card. Only the range and the age: no photos, no medication
 * names, and it says plainly that it is not a diagnosis.
 */
export function shareMessage(f: Forecast, years: number): string {
  const y = f.byYear.find((b) => b.years === years) ?? f.byYear[0];
  return `My hairline forecast for age ${y.age}: ${rangeLabel(likelyRange(y))} on the Norwood scale. An estimate, not a diagnosis.`;
}
