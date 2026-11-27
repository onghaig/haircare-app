import type { FamilyMember, Profile, TreatmentChoice, Zone } from './types';

/** Onboarding order: fun and fast first, family in the middle, health last (spec, Onboarding). */
export const STEPS = [
  'basics',
  'ancestry',
  'where',
  'when',
  'family',
  'treatments',
  'health',
  'lifestyle',
  'goal',
] as const;
export type Step = (typeof STEPS)[number];

export const MIN_AGE = 13;
export const MAX_AGE = 90;
export const ADULT_AGE = 18;

/** Whether the step has what it needs to continue. Only age is required; the rest can be skipped. */
export function canContinue(step: Step, p: Profile): boolean {
  if (step === 'basics') return p.age != null && p.age >= MIN_AGE && p.age <= MAX_AGE && p.sex != null;
  return true;
}

export function isMinor(p: Profile): boolean {
  return p.age != null && p.age < ADULT_AGE;
}

/** No prescription content for under-18s (project rule), so prescription drugs are not offered. */
export const PRESCRIPTION: TreatmentChoice[] = ['finasteride', 'dutasteride', 'oralMinoxidil'];

export function treatmentOptions(p: Profile): TreatmentChoice[] {
  const all: TreatmentChoice[] = ['finasteride', 'dutasteride', 'minoxidil', 'oralMinoxidil', 'ketoconazole', 'microneedling', 'none'];
  return isMinor(p) ? all.filter((t) => !PRESCRIPTION.includes(t)) : all;
}

/** Tap a zone: toggles it and clears "not noticing it yet". */
export function toggleZone(p: Profile, zone: Zone): Profile {
  const zones = p.zones.includes(zone) ? p.zones.filter((z) => z !== zone) : [...p.zones, zone];
  return { ...p, zones, worriedOnly: false };
}

/** "Not noticing it yet, but worried" is exclusive with zones. */
export function toggleWorried(p: Profile): Profile {
  return p.worriedOnly ? { ...p, worriedOnly: false } : { ...p, worriedOnly: true, zones: [] };
}

/** Exclusive "none" in multi-selects: picking none clears the rest, picking anything clears none. */
export function toggleMulti<T extends string>(list: T[], value: T, noneValue?: T): T[] {
  if (list.includes(value)) return list.filter((v) => v !== value);
  if (noneValue && value === noneValue) return [value];
  return [...list.filter((v) => v !== noneValue), value];
}

/** The two relatives the spec highlights as most predictive. */
export const MOST_PREDICTIVE: FamilyMember[] = ['father', 'maternalGrandfather'];

/** Plain-words pattern for the live risk card. */
export function patternLine(p: Profile): string {
  if (p.worriedOnly) return 'No changes yet. We will set your baseline';
  const z = new Set(p.zones);
  if (z.size === 0) return 'Pattern: tap where you notice it';
  if (z.has('allOver')) return 'Pattern: diffuse thinning';
  const front = z.has('temples') || z.has('hairline');
  const back = z.has('crown') || z.has('top');
  if (front && back) return 'Pattern: front and crown';
  if (z.has('temples')) return 'Pattern: temples first';
  if (front) return 'Pattern: hairline first';
  return 'Pattern: crown first';
}

/** Relatives with any loss, and how many relatives the user has answered for. */
export function familySummary(p: Profile): { answered: number; withLoss: number } {
  const rs = Object.values(p.family).filter((r) => r && r.status !== 'unknown');
  return { answered: rs.length, withLoss: rs.filter((r) => r!.status !== 'full').length };
}

/** Risk card state as the user answers: share of steps done and what is left. */
export function riskCard(p: Profile, stepIndex: number): { percent: number; line: string; remaining: number } {
  const remaining = STEPS.length - stepIndex;
  const fam = familySummary(p);
  let line = patternLine(p);
  if (fam.answered > 0) line += `. ${fam.withLoss} of ${fam.answered} relatives with loss`;
  return { percent: Math.round((stepIndex / STEPS.length) * 100), line, remaining };
}
