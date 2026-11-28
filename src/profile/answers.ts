/**
 * The onboarding questions as data: the choices, each step's title, which profile fields a step
 * owns, and a one-line summary of the current answer. Onboarding and the "Your answers" screens
 * in settings both read from here, so a question only ever lives in one place.
 */
import type { Option } from '@/components/onboarding/Controls';

import { familySummary, isMinor, PRESCRIPTION, type Step } from './onboarding';
import type {
  AncestryChoice,
  Condition,
  Goal,
  Noticed,
  Profile,
  Sex,
  Shedding,
  Sleep,
  StressEvent,
  TreatmentChoice,
  Zone,
} from './types';

export const SEX: Option<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
export const ANCESTRY: Option<AncestryChoice>[] = [
  { value: 'white', label: 'White or European' },
  { value: 'east_asian', label: 'East Asian' },
  { value: 'south_asian', label: 'South Asian' },
  { value: 'black', label: 'Black or African' },
  { value: 'hispanic', label: 'Hispanic or Latino' },
  { value: 'middle_eastern', label: 'Middle Eastern' },
  { value: 'other', label: 'Other or mixed' },
];
export const ZONES: Option<Zone>[] = [
  { value: 'hairline', label: 'Hairline' },
  { value: 'temples', label: 'Temples' },
  { value: 'top', label: 'Top' },
  { value: 'crown', label: 'Crown' },
  { value: 'allOver', label: 'All over' },
];
export const NOTICED: Option<Noticed>[] = [
  { value: 'under6m', label: 'Under 6 months' },
  { value: '6to12m', label: '6 to 12 months' },
  { value: '1to3y', label: '1 to 3 years' },
  { value: '3yPlus', label: '3+ years' },
  { value: 'notSure', label: 'Not sure' },
];
export const SHEDDING: Option<Shedding>[] = [
  { value: 'under50', label: 'Under 50', hint: 'A few on the pillow' },
  { value: '50to100', label: '50 to 100', hint: 'Some in the shower drain' },
  { value: '100to200', label: '100 to 200', hint: 'A clump in the drain' },
  { value: '200plus', label: '200+', hint: 'Handfuls when washing' },
];
export const TREATMENT_LABEL: Record<TreatmentChoice, string> = {
  finasteride: 'Finasteride',
  dutasteride: 'Dutasteride',
  minoxidil: 'Minoxidil',
  oralMinoxidil: 'Oral minoxidil',
  ketoconazole: 'Ketoconazole shampoo',
  microneedling: 'Microneedling',
  none: 'None yet',
};
export const CONDITIONS: Option<Condition>[] = [
  { value: 'thyroid', label: 'Thyroid issues' },
  { value: 'anemia', label: 'Anaemia or low iron' },
  { value: 'pcos', label: 'PCOS' },
  { value: 'alopeciaAreata', label: 'Alopecia areata (patches)' },
  { value: 'scalp', label: 'Dandruff or psoriasis' },
  { value: 'recentIllness', label: 'Recent illness or surgery' },
];
export const STRESS: Option<StressEvent>[] = [
  { value: 'jobLoss', label: 'Job loss' },
  { value: 'breakup', label: 'Breakup' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'moving', label: 'Moving home' },
  { value: 'illness', label: 'Illness' },
  { value: 'exams', label: 'Exams' },
];
export const SLEEP: Option<Sleep>[] = [
  { value: 'poor', label: 'Under 6 hours' },
  { value: 'ok', label: '6 to 7 hours' },
  { value: 'good', label: '7+ hours' },
];
export const SMOKER: Option<'yes' | 'no'>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];
export const GOALS: Option<Goal>[] = [
  { value: 'keep', label: 'Keep what I have' },
  { value: 'regrow', label: 'Regrow' },
  { value: 'know', label: 'Just know where it is heading' },
  { value: 'shave', label: 'Prepare to shave it' },
];

export const STEP_TITLE: Record<Step, string> = {
  basics: 'A bit about you',
  ancestry: 'Your background',
  where: 'Where are you noticing it?',
  when: 'How it has been going',
  family: 'Who in your family lost their hair?',
  treatments: 'Anything you already use?',
  health: 'Health',
  lifestyle: 'The past year',
  goal: 'What do you want most?',
};

/** Short names for the list of answers in settings. */
export const STEP_LABEL: Record<Step, string> = {
  basics: 'Age and sex',
  ancestry: 'Background',
  where: 'Where you notice it',
  when: 'How it has been going',
  family: 'Family',
  treatments: 'What you use',
  health: 'Health',
  lifestyle: 'Stress, sleep and smoking',
  goal: 'Your goal',
};

/** The profile fields each step asks about. Saving a step writes only these. */
export const STEP_FIELDS: Record<Step, readonly (keyof Profile)[]> = {
  basics: ['age', 'sex'],
  ancestry: ['ancestry'],
  where: ['zones', 'worriedOnly'],
  when: ['noticed', 'shedding'],
  family: ['family'],
  treatments: ['treatments'],
  health: ['conditions'],
  lifestyle: ['stressEvents', 'sleep', 'smoker'],
  goal: ['goal'],
};

export function isStep(s: unknown): s is Step {
  return typeof s === 'string' && s in STEP_FIELDS;
}

/** Copies one step's answers from an edited draft onto the latest saved profile. */
export function applyStep(saved: Profile, draft: Profile, step: Step): Profile {
  const out: Profile = { ...saved };
  for (const f of STEP_FIELDS[step]) (out as unknown as Record<string, unknown>)[f] = draft[f];
  return out;
}

/** Whether the draft has a different answer for the step than the saved profile. */
export function stepChanged(saved: Profile, draft: Profile, step: Step): boolean {
  return STEP_FIELDS[step].some((f) => JSON.stringify(saved[f]) !== JSON.stringify(draft[f]));
}

/** The treatments that count for this person: prescription ones drop out for under-18s. */
export function currentTreatments(p: Profile): TreatmentChoice[] {
  return p.treatments.filter((t) => t !== 'none' && !(isMinor(p) && PRESCRIPTION.includes(t)));
}

const labels = <T extends string>(opts: Option<T>[], vs: readonly T[]) =>
  opts.filter((o) => vs.includes(o.value)).map((o) => o.label);
const label = <T extends string>(opts: Option<T>[], v: T | undefined) => opts.find((o) => o.value === v)?.label;
const list = (xs: (string | undefined)[], empty: string) => {
  const ys = xs.filter((x): x is string => !!x);
  return ys.length ? ys.join(', ') : empty;
};

/** One line saying what the person answered, for the list in settings. */
export function summary(step: Step, p: Profile): string {
  switch (step) {
    case 'basics':
      return list([p.age != null ? `${p.age}` : undefined, label(SEX, p.sex)], 'Not answered');
    case 'ancestry':
      return list(labels(ANCESTRY, p.ancestry), 'Not answered');
    case 'where':
      return p.worriedOnly ? 'Not noticing it yet' : list(labels(ZONES, p.zones), 'Not answered');
    case 'when': {
      const shed = label(SHEDDING, p.shedding);
      return list([label(NOTICED, p.noticed), shed ? `${shed} a day` : undefined], 'Not answered');
    }
    case 'family': {
      const f = familySummary(p);
      if (f.answered === 0) return 'Not answered';
      return `${f.withLoss} of ${f.answered} relatives with hair loss`;
    }
    case 'treatments': {
      const ts = currentTreatments(p);
      return ts.length ? ts.map((t) => TREATMENT_LABEL[t]).join(', ') : 'Nothing yet';
    }
    case 'health':
      return list(labels(CONDITIONS, p.conditions), 'None');
    case 'lifestyle':
      return list(
        [
          p.stressEvents.length ? `${p.stressEvents.length} stressful ${p.stressEvents.length === 1 ? 'event' : 'events'}` : undefined,
          p.sleep ? `Sleep ${label(SLEEP, p.sleep)!.toLowerCase()}` : undefined,
          p.smoker == null ? undefined : p.smoker ? 'Smoker' : 'Non-smoker',
        ],
        'Not answered',
      );
    case 'goal':
      return label(GOALS, p.goal) ?? 'Not answered';
  }
}
