import type { Ancestry, Observation, Relation, RelativeReport, RelativeStatus, Treatment, UserInput } from '@/forecast';

import type { AncestryChoice, FamilyMember, HairStatus, Profile, TreatmentChoice } from './types';


/** Relatives the v0 model has a liability correlation for. Mothers and grandmothers are kept for later. */
const RELATION: Partial<Record<FamilyMember, Relation>> = {
  father: 'father',
  brother: 'brother',
  maternalGrandfather: 'maternal_grandfather',
  paternalGrandfather: 'paternal_grandfather',
  maternalUncle: 'maternal_uncle',
};

/**
 * When we don't know when a relative's status applied, assume a typical age for that generation.
 * "Full hair at 70" is strong protective evidence; "thinning at 50" is weak risk evidence.
 */
const TYPICAL_AGE: Partial<Record<FamilyMember, number>> = {
  father: 55,
  maternalUncle: 55,
  maternalGrandfather: 75,
  paternalGrandfather: 75,
};

const STATUS: Record<HairStatus, RelativeStatus | null> = {
  full: 'full',
  thinning: 'thinning',
  receding: 'thinning',
  bald: 'bald',
  unknown: null,
};

export function ancestryFor(choices: AncestryChoice[]): Ancestry | undefined {
  if (choices.length === 0) return undefined;
  if (choices.length > 1 || choices[0] === 'other') return 'mixed_or_other';
  return choices[0];
}

/** The strongest treatment the user already takes, in the model's terms. */
export function treatmentFor(choices: TreatmentChoice[]): Treatment {
  const has = (t: TreatmentChoice) => choices.includes(t);
  if (has('dutasteride')) return 'dutasteride';
  if (has('finasteride') && has('minoxidil')) return 'finasteride+minoxidil';
  if (has('finasteride')) return 'finasteride';
  if (has('minoxidil')) return 'minoxidil';
  return 'none';
}

export function observationsFor(profile: Profile): Observation[] {
  const stage = selfReportedStage(profile);
  return stage != null && profile.age != null ? [{ age: profile.age, stage, source: 'self_report' }] : [];
}

export function relativesFor(profile: Profile): RelativeReport[] {
  const out: RelativeReport[] = [];
  for (const [member, r] of Object.entries(profile.family) as [FamilyMember, Profile['family'][FamilyMember]][]) {
    const relation = RELATION[member];
    const status = r ? STATUS[r.status] : null;
    if (!relation || !r || !status) continue;
    const typical = member === 'brother' ? Math.max(profile.age ?? 25, 18) : (TYPICAL_AGE[member] ?? 55);
    const age = status !== 'full' && r.startAge ? r.startAge : typical;
    out.push({ relation, status, age });
  }
  return out;
}

/**
 * A rough Norwood stage from where the user says they notice loss. Self-reports are weak evidence
 * (the model treats them with a 0.8-stage error), and are replaced by scan grading once it exists.
 */
export function selfReportedStage(profile: Profile): number | null {
  if (profile.worriedOnly) return 1;
  const z = new Set(profile.zones);
  if (z.size === 0) return null;
  const front = z.has('temples') || z.has('hairline');
  const back = z.has('crown') || z.has('top');
  if (z.has('allOver') || (front && back)) return 3;
  if (back) return 3; // vertex thinning reads as Norwood 3V
  return 2;
}

/**
 * Everything the forecast engine needs from onboarding. Returns null until age is known.
 * A stage estimated from a scan replaces the self-report (it already blends in the answers),
 * and counts as weak evidence: it is not yet validated against graded photos.
 */
export function toForecastInput(profile: Profile, scanStage?: number | null): UserInput | null {
  if (profile.age == null) return null;
  if (scanStage != null) {
    return {
      age: profile.age,
      ancestry: ancestryFor(profile.ancestry),
      relatives: relativesFor(profile),
      treatment: treatmentFor(profile.treatments),
      observations: [{ age: profile.age, stage: scanStage, source: 'scan_estimate' }],
    };
  }
  return {
    age: profile.age,
    ancestry: ancestryFor(profile.ancestry),
    relatives: relativesFor(profile),
    treatment: treatmentFor(profile.treatments),
    observations: observationsFor(profile),
  };
}
