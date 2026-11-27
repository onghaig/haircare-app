/**
 * Hair-loss forecast model v0, ported from forecast-model-v0/model.py.
 *
 *   liability   z  ~ Normal(ancestry_shift, 1)            genetic + environmental risk
 *   susceptible    z > z_thr                              others never progress past Norwood 1-2
 *   onset age   a0 = A - B (z - z_thr) + sd_onset e1      age progression past Norwood 1 begins
 *   rate        r  = exp(mu_r + c z + sd_rate e2)         Norwood stages per year
 *   stage(age)  = clip(1 + r max(0, age - a0), 1, 7)
 *
 * A forecast importance-weights simulated people by how well they match the user's scans,
 * old photos and relatives, then runs them forward along one or more paths (sets of actions):
 * slows-loss options scale the rate, grows-hair options lift the stage while used (see effects.ts).
 * An estimate for a wellness product, not a medical prediction.
 */
import priors from './data/priors.json';
import trained from './data/trained-params.json';
import { combine, hasEffect, liftAt, type EffectCase, type PlanItem } from './effects';
import { Rng } from './rng';
import type { Forecast, ModelParams, PathYear, RelativeStatus, StageRange, Treatment, UserInput, YearForecast } from './types';

const STATUS: Record<RelativeStatus, number> = { full: 0, thinning: 1, bald: 2 };
/** Chance a reported relative status is off by a category. */
const MISCLASS = 0.1;
const NEVER = 999;
/** Assumed share of days when someone says they take something but hasn't logged yet. */
export const ASSUMED_ADHERENCE = 0.9;
const CASES: EffectCase[] = ['best', 'mid', 'worst'];

/** The user's existing treatment, as plan items. */
export function planFromTreatment(t: Treatment | undefined, adherence = ASSUMED_ADHERENCE): PlanItem[] {
  switch (t ?? 'none') {
    case 'minoxidil':
      return [{ option: 'minoxidil', adherence }];
    case 'finasteride':
      return [{ option: 'finasteride', adherence }];
    case 'dutasteride':
      return [{ option: 'dutasteride', adherence }];
    case 'finasteride+minoxidil':
      return [
        { option: 'finasteride', adherence },
        { option: 'minoxidil', adherence },
      ];
    default:
      return [];
  }
}

export const DEFAULT_YEARS = [1, 3, 5, 10, 15] as const;

export function stageAt(age: number, onset: number, rate: number): number {
  return clip(1 + rate * Math.max(0, age - onset), 1, 7);
}

/** 0 full (< 2.5), 1 thinning (2.5 to 4.5), 2 bald (>= 4.5). */
export function statusOf(stage: number): number {
  return stage >= 4.5 ? 2 : stage >= 2.5 ? 1 : 0;
}

export interface ForecastOptions {
  years?: readonly number[];
  samples?: number;
  seed?: number;
  useFamily?: boolean;
  useHistory?: boolean;
  /** Other plans to run on the same simulated people, for comparing actions. */
  paths?: Record<string, PlanItem[]>;
}

export class ForecastModel {
  constructor(
    readonly params: ModelParams = trained.params,
    readonly version: string = trained.version,
  ) {}

  forecast(u: UserInput, opts: ForecastOptions = {}): Forecast {
    const { years = DEFAULT_YEARS, samples = 200_000, seed = 7, useFamily = true, useHistory = true, paths = {} } = opts;
    if (!(u.age > 0 && u.age < 120)) throw new RangeError(`age must be between 0 and 120, got ${u.age}`);
    const rng = new Rng(seed);
    const n = samples;
    const shifts = priors.ancestry_liability_shift as Record<string, number>;
    // Same as Python v0: ancestry defaults to 'white' (shift 0); an unrecognised value gets -0.2.
    const shift = shifts[u.ancestry ?? 'white'] ?? -0.2;

    const p = this.params;
    const z = rng.normals(n, shift);
    const e1 = rng.normals(n);
    const e2 = rng.normals(n);
    const onset = new Float64Array(n);
    const rate = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const zi = z[i];
      onset[i] = zi > p.z_thr ? p.A - p.B * (zi - p.z_thr) + p.sd_onset * e1[i] : NEVER;
      rate[i] = Math.exp(p.mu_r + p.c * zi + p.sd_rate * e2[i]);
    }
    const logw = new Float64Array(n);

    const obs = (u.observations ?? []).filter((o) => useHistory || Math.abs(o.age - u.age) < 0.5);
    const sds = priors.stage_measurement_sd as Record<string, number>;
    for (const o of obs) {
      const sd = sds[o.source ?? 'app_scan'] ?? 0.8;
      for (let i = 0; i < n; i++) {
        const d = (stageAt(o.age, onset[i], rate[i]) - o.stage) / sd;
        logw[i] += -0.5 * d * d;
      }
    }

    if (useFamily) {
      const rhos = priors.liability_correlation as Record<string, number>;
      for (const rel of u.relatives ?? []) {
        const rho = rhos[rel.relation];
        if (rho === undefined) throw new Error(`Unknown relation ${rel.relation}`);
        const k = Math.sqrt(1 - rho * rho);
        const want = STATUS[rel.status];
        const hit = Math.log(1 - MISCLASS);
        const miss = Math.log(MISCLASS / 2);
        const ez = rng.normals(n);
        const r1 = rng.normals(n);
        const r2 = rng.normals(n);
        for (let i = 0; i < n; i++) {
          const zr = rho * z[i] + k * ez[i];
          const ra0 = zr > p.z_thr ? p.A - p.B * (zr - p.z_thr) + p.sd_onset * r1[i] : NEVER;
          const rr = Math.exp(p.mu_r + p.c * zr + p.sd_rate * r2[i]);
          logw[i] += statusOf(stageAt(rel.age, ra0, rr)) === want ? hit : miss;
        }
      }
    }

    // normalise weights
    let max = -Infinity;
    for (let i = 0; i < n; i++) if (logw[i] > max) max = logw[i];
    const w = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += w[i] = Math.exp(logw[i] - max);
    let sq = 0;
    for (let i = 0; i < n; i++) {
      w[i] /= sum;
      sq += w[i] * w[i];
    }

    const plan = u.plan ?? planFromTreatment(u.treatment, u.adherence ?? ASSUMED_ADHERENCE);

    const nowLatent = new Float64Array(n);
    const cur = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      nowLatent[i] = 1 + rate[i] * Math.max(0, u.age - onset[i]);
      cur[i] = clip(nowLatent[i], 1, 7);
    }

    const stageNow = weightedQuantiles(cur, w);
    const reachStage = reachStageFor(stageNow.p50);
    const reachAt = reachStage - 0.5;
    const buf = new Float64Array(n);
    /** Stages along a plan at year y, for one effect case, into buf. Returns the chance of reaching the headline stage. */
    const project = (p: readonly PlanItem[], c: EffectCase, y: number): number => {
      const t = u.age + y;
      const slow = combine(p, c).slow;
      const lift = liftAt(p, c, y * 12);
      let p3 = 0;
      for (let i = 0; i < n; i++) {
        const prog = Math.max(0, t - Math.max(onset[i], u.age));
        const s = clip(nowLatent[i] + rate[i] * (1 - slow) * prog - lift, 1, 7);
        buf[i] = s;
        if (s >= reachAt) p3 += w[i];
      }
      return p3;
    };
    const pathYear = (p: readonly PlanItem[], y: number): { path: PathYear; mid: StageRange } => {
      const out: Partial<Record<EffectCase, { q: StageRange; p3: number }>> = {};
      for (const c of CASES) {
        const p3 = project(p, c, y);
        out[c] = { q: weightedQuantiles(buf, w), p3 };
      }
      const { best, mid, worst } = out as Record<EffectCase, { q: StageRange; p3: number }>;
      return {
        mid: mid.q,
        path: {
          years: y,
          age: u.age + y,
          band: { p10: best.q.p10, p50: mid.q.p50, p90: worst.q.p90 },
          pReach: { best: best.p3, mid: mid.p3, worst: worst.p3 },
        },
      };
    };

    const effective = hasEffect(plan);
    const byYear: YearForecast[] = years.map((y) => {
      const t = u.age + y;
      let p3 = 0;
      let p5 = 0;
      const pReach = project([], 'mid', y);
      for (let i = 0; i < n; i++) {
        if (buf[i] >= 2.5) p3 += w[i];
        if (buf[i] >= 4.5) p5 += w[i];
      }
      const untreated = weightedQuantiles(buf, w);
      const planned = effective ? pathYear(plan, y) : null;
      return {
        years: y,
        age: t,
        untreated,
        withTreatment: planned?.mid ?? null,
        plan: planned?.path ?? null,
        pNorwood3Plus: p3,
        pNorwood5Plus: p5,
        pReach,
      };
    });

    const extra: Record<string, PathYear[]> = {};
    for (const [key, p] of Object.entries(paths)) extra[key] = years.map((y) => pathYear(p, y).path);

    return {
      ageNow: u.age,
      stageNow,
      effectiveSamples: Math.round(1 / sq),
      byYear,
      paths: extra,
      reachStage,
      modelVersion: this.version,
    };
  }
}

/** Norwood 3, or the next whole stage above today's median when that is already 3 or more. Max 7. */
export function reachStageFor(stageNowP50: number): number {
  return Math.min(7, Math.max(3, Math.floor(stageNowP50 + 0.5) + 1));
}

const QUANTILE_BINS = 16_384;

/**
 * p10 / p50 / p90 of x under weights w, with the same rule as numpy searchsorted on the
 * cumulative weights: the first sample (in sorted order) where the cumulative weight reaches q.
 * Uses a fine histogram instead of a full sort (O(n), about 10x faster on 200k samples);
 * each bin remembers its smallest sample, so the answer is a real sample value, accurate to
 * well under the 0.01 the result is rounded to.
 */
export function weightedQuantiles(x: Float64Array, w: Float64Array): StageRange {
  const n = x.length;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < lo) lo = x[i];
    if (x[i] > hi) hi = x[i];
  }
  if (!(hi > lo)) return { p10: round2(lo), p50: round2(lo), p90: round2(lo) };
  const scale = (QUANTILE_BINS - 1) / (hi - lo);
  const mass = new Float64Array(QUANTILE_BINS);
  const minIn = new Float64Array(QUANTILE_BINS).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const b = Math.floor((x[i] - lo) * scale);
    mass[b] += w[i];
    if (x[i] < minIn[b]) minIn[b] = x[i];
  }
  const qs = [0.1, 0.5, 0.9];
  const out: number[] = [];
  let cw = 0;
  let q = 0;
  let last = lo;
  for (let b = 0; b < QUANTILE_BINS && q < qs.length; b++) {
    if (minIn[b] === Infinity) continue;
    last = minIn[b];
    cw += mass[b];
    while (q < qs.length && cw >= qs[q] - 1e-12) {
      out.push(round2(minIn[b]));
      q++;
    }
  }
  while (out.length < qs.length) out.push(round2(last));
  return { p10: out[0], p50: out[1], p90: out[2] };
}

function clip(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
