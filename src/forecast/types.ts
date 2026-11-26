import priors from './data/priors.json';

export type Relation = keyof typeof priors.liability_correlation;
export type Ancestry = keyof typeof priors.ancestry_liability_shift;
export type Treatment = keyof typeof priors.treatment_rate_reduction;
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
  /** 0 to 1, from daily check-ins. */
  adherence?: number;
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
  withTreatment: StageRange | null;
  pNorwood3Plus: number;
  pNorwood5Plus: number;
}

export interface Forecast {
  ageNow: number;
  stageNow: StageRange;
  /** How many of the simulated people effectively match this user. Low means low confidence. */
  effectiveSamples: number;
  byYear: YearForecast[];
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
