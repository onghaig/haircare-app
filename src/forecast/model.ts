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
 * old photos and relatives, then runs them forward. Treatment scales the rate.
 * An estimate for a wellness product, not a medical prediction.
 */
import priors from './data/priors.json';
import trained from './data/trained-params.json';
import { Rng } from './rng';
import type { Forecast, ModelParams, RelativeStatus, StageRange, UserInput, YearForecast } from './types';

const STATUS: Record<RelativeStatus, number> = { full: 0, thinning: 1, bald: 2 };
/** Chance a reported relative status is off by a category. */
const MISCLASS = 0.1;
const NEVER = 999;

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
}

export class ForecastModel {
  constructor(
    readonly params: ModelParams = trained.params,
    readonly version: string = trained.version,
  ) {}

  forecast(u: UserInput, opts: ForecastOptions = {}): Forecast {
    const { years = DEFAULT_YEARS, samples = 200_000, seed = 7, useFamily = true, useHistory = true } = opts;
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

    const effects = priors.treatment_rate_reduction as Record<string, number>;
    const eff = (effects[u.treatment ?? 'none'] ?? 0) * clip(u.adherence ?? 0.9, 0, 1);

    const nowLatent = new Float64Array(n);
    const cur = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      nowLatent[i] = 1 + rate[i] * Math.max(0, u.age - onset[i]);
      cur[i] = clip(nowLatent[i], 1, 7);
    }

    const untreated = new Float64Array(n);
    const treated = new Float64Array(n);
    const byYear: YearForecast[] = years.map((y) => {
      const t = u.age + y;
      let p3 = 0;
      let p5 = 0;
      for (let i = 0; i < n; i++) {
        const prog = Math.max(0, t - Math.max(onset[i], u.age));
        untreated[i] = clip(nowLatent[i] + rate[i] * prog, 1, 7);
        treated[i] = clip(nowLatent[i] + rate[i] * (1 - eff) * prog, 1, 7);
        if (untreated[i] >= 2.5) p3 += w[i];
        if (untreated[i] >= 4.5) p5 += w[i];
      }
      return {
        years: y,
        age: t,
        untreated: weightedQuantiles(untreated, w),
        withTreatment: eff > 0 ? weightedQuantiles(treated, w) : null,
        pNorwood3Plus: p3,
        pNorwood5Plus: p5,
      };
    });

    return {
      ageNow: u.age,
      stageNow: weightedQuantiles(cur, w),
      effectiveSamples: Math.round(1 / sq),
      byYear,
      modelVersion: this.version,
    };
  }
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
