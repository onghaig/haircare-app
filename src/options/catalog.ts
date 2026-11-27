/**
 * Everything a user could do about pattern hair loss, as the Predict tab and Compare screen show
 * it: what kind of action it is, how strong the evidence is, and whether it needs a prescription.
 *
 * Copy rules: prescriptions are options to discuss with a clinician, never recommended, ranked
 * or badged, and never shown to under-18s. Every evidence level and summary here is an
 * UNVERIFIED working draft: check against the trial papers and get a clinician's review of the
 * Rx text before launch.
 */
import type { OptionId, PlanItem } from '@/forecast';
import { isMinor } from '@/profile/onboarding';
import type { Profile, TreatmentChoice } from '@/profile/types';

/**
 * Prescription options are shown to adults by default (design decision 1).
 * Needs a regulatory review before launch; flip this to hide them behind a setting.
 */
export const SHOW_RX_TO_ADULTS = true;

/** 3 strong, 2 some, 1 limited, 0 not shown to help pattern loss (not counted in the forecast). */
export type Evidence = 0 | 1 | 2 | 3;

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  3: 'Strong',
  2: 'Some',
  1: 'Limited',
  0: 'Not for pattern loss',
};

export const EVIDENCE_MEANING: Record<Evidence, string> = {
  3: 'Several large randomised trials in men with pattern loss',
  2: 'Fewer or shorter trials',
  1: 'Small studies only',
  0: 'May help shedding or general health. Not counted in the forecast',
};

/** What an option does to the forecast. "none" options are listed but not counted. */
export type OptionRole = 'slows' | 'grows' | 'both' | 'none';

export const ROLE_LABEL: Record<OptionRole, string> = {
  slows: 'Slows loss',
  grows: 'Grows hair',
  both: 'Slows loss and grows hair',
  none: 'Not counted',
};

export const ROLE_MEANING: Record<Exclude<OptionRole, 'none'>, string> = {
  slows: 'Changes your slope',
  grows: 'Lifts you while used',
  both: 'Slope and lift',
};

export type CatalogId = 'finasteride' | 'dutasteride' | 'minoxidil' | 'oral_minoxidil' | 'massage' | 'fin_minox' | 'ketoconazole' | 'habits';

export interface OptionInfo {
  id: CatalogId;
  name: string;
  role: OptionRole;
  evidence: Evidence;
  rx: boolean;
  /** What the forecast runs when this option is tried on its own. Empty for "not counted". */
  items: OptionId[];
  /** The onboarding answers that mean "I already do this". */
  takes: TreatmentChoice[];
  /** Short line for lists. */
  short: string;
  /** Plain words for the detail sheet. */
  about: string;
  evidenceText: string;
  timeline: string;
  tradeoffs: string;
  notFor?: string;
}

export const OPTIONS: OptionInfo[] = [
  {
    id: 'finasteride',
    name: 'Oral finasteride',
    role: 'slows',
    evidence: 3,
    rx: true,
    items: ['finasteride'],
    takes: ['finasteride'],
    short: 'Changes your slope. Some men also regrow a little.',
    about: 'A daily prescription tablet that lowers DHT, the hormone behind pattern loss. Only a clinician can decide if it suits you.',
    evidenceText: 'Several large trials over 1 to 5 years in men',
    timeline: 'Shedding settles by 6 months, results by 12',
    tradeoffs: 'Sexual side effects in a small share of men. Loss resumes if stopped.',
    notFor: 'Under 18s, or anyone who could get pregnant',
  },
  {
    id: 'dutasteride',
    name: 'Dutasteride',
    role: 'slows',
    evidence: 2,
    rx: true,
    items: ['dutasteride'],
    takes: ['dutasteride'],
    short: 'Changes your slope. A stronger DHT blocker, used off-label for hair in many places.',
    about: 'A daily prescription capsule that lowers DHT more than finasteride. Only a clinician can decide if it suits you.',
    evidenceText: 'Fewer trials than finasteride, mostly 6 to 12 months',
    timeline: 'Results by 6 to 12 months',
    tradeoffs: 'Side effects like finasteride, and it stays in the body for months. Loss resumes if stopped.',
    notFor: 'Under 18s, or anyone who could get pregnant',
  },
  {
    id: 'minoxidil',
    name: 'Topical minoxidil',
    role: 'grows',
    evidence: 3,
    rx: false,
    items: ['minoxidil'],
    takes: ['minoxidil'],
    short: 'Adds density on top and crown while you use it.',
    about: 'A foam or liquid you apply to the scalp once or twice a day. It grows hair while you use it. It doesn’t slow loss.',
    evidenceText: 'Several large trials in men, mostly on the top and crown',
    timeline: 'Extra shedding for the first weeks is common. Regrowth shows by 6 to 12 months',
    tradeoffs: 'Scalp itch or flaking for some. The gain fades within a few months of stopping.',
  },
  {
    id: 'oral_minoxidil',
    name: 'Oral minoxidil',
    role: 'grows',
    evidence: 2,
    rx: true,
    items: ['oral_minoxidil'],
    takes: ['oralMinoxidil'],
    short: 'Adds density while you take it. A low-dose tablet, prescribed off-label.',
    about: 'A low-dose daily tablet of the same medicine. Only a clinician can decide if it suits you.',
    evidenceText: 'Smaller and shorter studies than topical minoxidil',
    timeline: 'Regrowth shows by 6 to 12 months',
    tradeoffs: 'Can cause unwanted hair elsewhere, ankle swelling or a faster heartbeat. The gain fades if stopped.',
    notFor: 'Under 18s, or people with some heart conditions',
  },
  {
    id: 'massage',
    name: 'Scalp massage',
    role: 'grows',
    evidence: 1,
    rx: false,
    items: ['massage'],
    takes: [],
    short: 'A small lift. Low risk.',
    about: 'A few minutes of firm daily massage. A small study saw thicker hair after 6 months.',
    evidenceText: 'Small studies only',
    timeline: 'Months of daily massage before any change shows',
    tradeoffs: 'None known, beyond the time it takes.',
  },
  {
    id: 'fin_minox',
    name: 'Finasteride + minoxidil',
    role: 'both',
    evidence: 2,
    rx: true,
    items: ['finasteride', 'minoxidil'],
    takes: [],
    short: 'Slope and lift together.',
    about: 'Finasteride to slow the loss underneath, and minoxidil to add density on top. Only a clinician can decide if it suits you.',
    evidenceText: 'Fewer trials of the pair than of each one alone',
    timeline: 'Results by 6 to 12 months',
    tradeoffs: 'The trade-offs of both. Stopping either loses its part of the effect.',
    notFor: 'Under 18s, or anyone who could get pregnant',
  },
  {
    id: 'ketoconazole',
    name: 'Ketoconazole shampoo',
    role: 'none',
    evidence: 1,
    rx: false,
    items: [],
    takes: ['ketoconazole'],
    short: 'Helps a flaky or itchy scalp. Not counted in your forecast.',
    about: 'An anti-dandruff shampoo used 2 to 3 times a week. Small studies hint it may help hair.',
    evidenceText: 'Small studies only',
    timeline: 'Scalp feels better within weeks',
    tradeoffs: 'Can dry the hair.',
  },
  {
    id: 'habits',
    name: 'Sleep, stress, food',
    role: 'none',
    evidence: 0,
    rx: false,
    items: [],
    takes: [],
    short: 'Helps with shedding. Not shown to change pattern loss.',
    about: 'Poor sleep, high stress and low iron can raise shedding for a few months. They don’t change your forecast.',
    evidenceText: 'Not shown to change pattern loss',
    timeline: 'Shedding usually settles 3 to 6 months after the cause does',
    tradeoffs: 'None.',
  },
];

export function optionById(id: CatalogId): OptionInfo {
  return OPTIONS.find((o) => o.id === id)!;
}

/** Whether prescription options appear at all for this person. Never under 18. */
export function showsRx(profile: Profile): boolean {
  return SHOW_RX_TO_ADULTS && !isMinor(profile);
}

/** Options this person sees, in display order. */
export function visibleOptions(profile: Profile): OptionInfo[] {
  const rx = showsRx(profile);
  return OPTIONS.filter((o) => rx || !o.rx).filter((o) => !isMinor(profile) || o.role === 'none' || o.id === 'massage');
}

/** Counted options grouped as the Compare screen shows them. */
export function groupedOptions(profile: Profile): { role: Exclude<OptionRole, 'none'>; options: OptionInfo[] }[] {
  const vis = visibleOptions(profile);
  return (['slows', 'grows', 'both'] as const).map((role) => ({ role, options: vis.filter((o) => o.role === role) })).filter((g) => g.options.length);
}

/** The plan this option would be, taken most days. */
export function optionPlan(o: OptionInfo, adherence = 0.9): PlanItem[] {
  return o.items.map((option) => ({ option, adherence }));
}

/** Whether an option is in the user's plan: they do every part of it. */
export function inPlan(o: OptionInfo, plan: readonly PlanItem[]): boolean {
  return o.items.length > 0 && o.items.every((i) => plan.some((p) => p.option === i && p.adherence > 0));
}
