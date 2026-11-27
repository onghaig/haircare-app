import priors from './data/priors.json';
import type { PlanItem } from './effects';

export type Relation = keyof typeof priors.liability_correlation;
export type Ancestry = keyof typeof priors.ancestry_liability_shift;
/** What the user already takes, as onboarding records it. Converted to plan items for the model. */
export type Treatment = 'none' | 'minoxidil' | 'finasteride' | 'dutasteride' | 'finasteride+minoxidil';
export type ObservationSource = keyof typeof priors.stage_measurement_sd;
export type RelativeStatus = 'full' | 'thinning' | 'bald';

/** A Norwood stage observed at some age: from an app scan, a self-report, or an old photo. */
export interface Observation {
  age: number;
  stage: number;
  source?: ObservationSource;
}

export interface RelativeReport {
  relation: Relation;
  status: RelativeStatus;
  /** The relative's age when that status applied. */
  age: number;
}

export interface UserInput {
  age: number;
  /** Defaults to 'white', as in the Python v0 model. */
  ancestry?: Ancestry;
  observations?: Observation[];
  relatives?: RelativeReport[];
  treatment?: Treatment;
  /** 0 to 1, from daily check-ins. Applies to `treatment`; ignored when `plan` is given. */
  adherence?: number;
  /** The user's real plan, each item with its own logged adherence. Replaces `treatment`. */
  plan?: PlanItem[];
}

export interface StageRange {
  p10: number;
  p50: number;
  p90: number;
}

export interface YearForecast {
  years: number;
  age: number;
  untreated: StageRange;
  /** The plan at the middle of the assumed effect range. Null when the plan has no effect. */
  withTreatment: StageRange | null;
  /** The plan as a band over the whole assumed effect range. Null when the plan has no effect. */
  plan: PathYear | null;
  pNorwood3Plus: number;
  pNorwood5Plus: number;
}

/** Chance of Norwood 3 or worse, at the weakest, middle and strongest assumed effect. */
export interface ChanceRange {
  worst: number;
  mid: number;
  best: number;
}

/**
 * One path (a set of actions) at one point in time. `band.p10` comes from the strongest assumed
 * effect and `band.p90` from the weakest, so the band covers both people and evidence spread.
 */
export interface PathYear {
  years: number;
  age: number;
  band: StageRange;
  pNorwood3Plus: ChanceRange;
}

export interface Forecast {
  ageNow: number;
  stageNow: StageRange;
  /** How many of the simulated people effectively match this user. Low means low confidence. */
  effectiveSamples: number;
  byYear: YearForecast[];
  /** Extra paths asked for in the options (for comparing actions), by key, aligned with byYear. */
  paths: Record<string, PathYear[]>;
  modelVersion: string;
}

export interface ModelParams {
  z_thr: number;
  A: number;
  B: number;
  sd_onset: number;
  mu_r: number;
  c: number;
  sd_rate: number;
}
