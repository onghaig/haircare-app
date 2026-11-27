import type { Subscription } from '@/paywall/purchases';
import type { Supply, SupplyId } from '@/plan/coach';
import type { ReminderSettings } from '@/plan/reminders';

/** The hair profile built during onboarding. Every answer is optional except age. */

export type Sex = 'male' | 'female';

export type AncestryChoice =
  | 'white'
  | 'east_asian'
  | 'south_asian'
  | 'black'
  | 'hispanic'
  | 'middle_eastern'
  | 'other';

/** Tappable zones on the head diagram. */
export type Zone = 'hairline' | 'temples' | 'top' | 'crown' | 'allOver';

export type Noticed = 'under6m' | '6to12m' | '1to3y' | '3yPlus' | 'notSure';

export type Shedding = 'under50' | '50to100' | '100to200' | '200plus';

export type FamilyMember =
  | 'paternalGrandfather'
  | 'paternalGrandmother'
  | 'maternalGrandfather'
  | 'maternalGrandmother'
  | 'father'
  | 'mother'
  | 'brother'
  | 'maternalUncle';

export type HairStatus = 'full' | 'thinning' | 'receding' | 'bald' | 'unknown';

export interface Relative {
  status: HairStatus;
  /** Approximate age when their loss started. */
  startAge?: number;
  /** Local file URI of a photo the user added. */
  photoUri?: string;
  /** What the scan engine read from that photo. Absent when it found no hairline. */
  photoAnalysis?: {
    stage: number;
    low: number;
    high: number;
    curve: [number, number][];
  };
}

export type TreatmentChoice =
  | 'finasteride'
  | 'dutasteride'
  | 'minoxidil'
  | 'oralMinoxidil'
  | 'ketoconazole'
  | 'microneedling'
  | 'none';

export type Condition = 'thyroid' | 'anemia' | 'pcos' | 'alopeciaAreata' | 'scalp' | 'recentIllness';

export type StressEvent = 'jobLoss' | 'breakup' | 'bereavement' | 'moving' | 'illness' | 'exams';

export type Sleep = 'poor' | 'ok' | 'good';

export type Goal = 'keep' | 'regrow' | 'know' | 'shave';

export interface Profile {
  age?: number;
  sex?: Sex;
  ancestry: AncestryChoice[];
  zones: Zone[];
  /** "Not noticing it yet, but worried." Exclusive with zones. */
  worriedOnly: boolean;
  noticed?: Noticed;
  shedding?: Shedding;
  family: Partial<Record<FamilyMember, Relative>>;
  treatments: TreatmentChoice[];
  conditions: Condition[];
  stressEvents: StressEvent[];
  sleep?: Sleep;
  smoker?: boolean;
  goal?: Goal;
  /** ISO time onboarding was finished. Unset means onboarding still to do. */
  completedAt?: string;
  /** ISO time the first forecast reveal was shown. */
  revealSeenAt?: string;
  /** Set once the user subscribes (or starts a trial). */
  subscription?: Subscription;
  reminders?: ReminderSettings;
  /**
   * The AI "future you" preview sends one front photo to the preview service. Set when the user
   * agrees (consentAt) or says no (declinedAt). Never offered to under-18s.
   */
  aiPreview?: { consentAt?: string; declinedAt?: string };
  /** The pack each supply was last restocked with, for the stock-out alert. */
  supplies?: Partial<Record<SupplyId, Supply>>;
  /** When the user says they started a treatment, "2026-11-26". Else the first logged dose counts. */
  treatmentStarts?: Partial<Record<SupplyId, string>>;
  /** Routine coach cards the user has dismissed, such as "shedding:minoxidil". */
  coach?: { dismissed?: string[] };
}

export const emptyProfile = (): Profile => ({
  ancestry: [],
  zones: [],
  worriedOnly: false,
  family: {},
  treatments: [],
  conditions: [],
  stressEvents: [],
});
