/**
 * Two kinds of action, modelled differently (forecast-by-action design):
 *
 *   slows loss   finasteride-type options scale the rate of progression: the slope flattens.
 *   grows hair   minoxidil and massage lift you by a fraction of a stage while you use them,
 *                reaching full effect after a few months and fading within months of stopping.
 *                They don't change the slope.
 *
 * Every effect size lives in data/treatment-effects.json and is an UNVERIFIED assumption.
 */
import effects from './data/treatment-effects.json';

export type SlowOption = Exclude<keyof typeof effects.slows, '_doc'>;
export type GrowOption = Exclude<keyof typeof effects.grows, '_doc'>;
export type OptionId = SlowOption | GrowOption;
export type Role = 'slows' | 'grows';

/** Which end of the assumed effect range to use. "best" is the largest effect. */
export type EffectCase = 'worst' | 'mid' | 'best';

/** One thing in a plan, with the share of days it is actually done (0 to 1). */
export interface PlanItem {
  option: OptionId;
  adherence: number;
}

/** False until every number in treatment-effects.json is checked against trials. */
export const EFFECTS_VERIFIED: boolean = effects.verified;
export const CHANCE_MARGIN: number = effects.chance_margin.value;

const SLOWS = effects.slows as unknown as Record<SlowOption, { low: number; mid: number; high: number }>;
const GROWS = effects.grows as unknown as Record<GrowOption, { group: string; low: number; mid: number; high: number; onset_months: number; fade_months: number }>;

export function roleOf(o: OptionId): Role {
  return o in SLOWS ? 'slows' : 'grows';
}

function pick(r: { low: number; mid: number; high: number }, c: EffectCase): number {
  return c === 'best' ? r.high : c === 'worst' ? r.low : r.mid;
}

const clip01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Share of a grows-hair option's full lift, `months` after starting. Ramps up linearly to full
 * at onset; if stopped at `stoppedAt` months, decays linearly to nothing over the fade period.
 */
export function liftFraction(o: GrowOption, months: number, stoppedAt?: number): number {
  const g = GROWS[o];
  const ramp = (m: number) => clip01(m / g.onset_months);
  if (stoppedAt == null || months <= stoppedAt) return ramp(months);
  return ramp(stoppedAt) * clip01(1 - (months - stoppedAt) / g.fade_months);
}

export interface CombinedEffect {
  /** Fraction the rate is reduced by, 0 to 1. */
  slow: number;
  /** Stages of lift at full ramp-up. */
  lift: number;
}

/**
 * A plan's total effect. Slowers don't stack (the strongest counts); lifts within one group
 * don't stack either (topical and oral minoxidil), and different groups add.
 */
export function combine(plan: readonly PlanItem[], c: EffectCase = 'mid'): CombinedEffect {
  let slow = 0;
  const groups = new Map<string, number>();
  for (const { option, adherence } of plan) {
    const a = clip01(adherence);
    if (a === 0) continue;
    if (roleOf(option) === 'slows') {
      slow = Math.max(slow, pick(SLOWS[option as SlowOption], c) * a);
    } else {
      const g = GROWS[option as GrowOption];
      groups.set(g.group, Math.max(groups.get(g.group) ?? 0, pick(g, c) * a));
    }
  }
  let lift = 0;
  for (const v of groups.values()) lift += v;
  return { slow, lift };
}

/** Lift reached `months` into the plan, assuming the grows-hair options are kept up. */
export function liftAt(plan: readonly PlanItem[], c: EffectCase, months: number): number {
  let total = 0;
  const groups = new Map<string, number>();
  for (const { option, adherence } of plan) {
    if (roleOf(option) !== 'grows') continue;
    const g = GROWS[option as GrowOption];
    const v = pick(g, c) * clip01(adherence) * liftFraction(option as GrowOption, months);
    groups.set(g.group, Math.max(groups.get(g.group) ?? 0, v));
  }
  for (const v of groups.values()) total += v;
  return total;
}

export function hasEffect(plan: readonly PlanItem[]): boolean {
  const e = combine(plan, 'mid');
  return e.slow > 0 || e.lift > 0;
}

/** Mid-case size of one option at full adherence, in its own units (rate share or stages). */
export function midEffect(o: OptionId): number {
  return roleOf(o) === 'slows' ? SLOWS[o as SlowOption].mid : GROWS[o as GrowOption].mid;
}
