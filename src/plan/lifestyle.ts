import { trendScans } from '@/progress/verdict';
import { MIN_DETECTABLE_CHANGE_MM } from '@/scan/change';
import type { ScanRecord } from '@/scan/session';

import type { Diet, LogBook, QuickLog } from './log';
import { addDays, dayKey } from './tasks';

/**
 * Sleep, stress, food and workouts from the quick log, week by week, next to the hair trend.
 * Links are only ever "possible": a handful of weeks can't show cause, and hair answers months
 * later than the habits that might move it.
 */

export const LIFESTYLE_WEEKS = 6;

const DIET_SCORE: Record<Diet, number> = { well: 1, mixed: 0.5, poorly: 0 };

/** What the hair row shows: the hair score where scans have one, else the hairline centre. */
export type HairMeasure = 'score' | 'hairline';

export interface LifestyleWeek {
  /** First day of the week (local). */
  start: Date;
  logs: number;
  /** Mean hours. */
  sleep?: number;
  /** Mean, 1 (calm) to 5 (very stressed). */
  stress?: number;
  /** 0 (ate poorly every day logged) to 1 (well every day). */
  diet?: number;
  /** Days with a workout, out of the days that answered the question. */
  workouts?: number;
  /** The hair measure at the last scan of the week, higher is better. */
  hair?: number;
}

export interface LifestyleTrend {
  measure: HairMeasure;
  weeks: LifestyleWeek[];
  /** Possible links, in plain words. Empty until there's enough to compare. */
  links: string[];
  /** Whether there were enough scans and logs to look for links at all. */
  enough: boolean;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

export function hairMeasure(scans: ScanRecord[]): HairMeasure {
  return scans.filter((s) => s.hair?.score).length >= 2 ? 'score' : 'hairline';
}

/** Higher is better for both: a higher score, or a hairline lower on the forehead than at baseline. */
export function hairValue(scan: ScanRecord, base: ScanRecord, measure: HairMeasure): number | undefined {
  if (measure === 'score') return scan.hair?.score?.value;
  const b = base.hairline?.centreMM;
  const v = scan.hairline?.centreMM;
  return b != null && v != null ? -(v - b) : undefined;
}

function logsBetween(book: LogBook, from: Date, days: number): QuickLog[] {
  const out: QuickLog[] = [];
  for (let i = 0; i < days; i++) {
    const q = book[dayKey(addDays(from, i))]?.quick;
    if (q) out.push(q);
  }
  return out;
}

function summarise(logs: QuickLog[]) {
  const diet = logs.filter((q) => q.diet).map((q) => DIET_SCORE[q.diet!]);
  const work = logs.filter((q) => q.workout != null);
  return {
    sleep: mean(logs.map((q) => q.sleepHours)),
    stress: mean(logs.map((q) => q.stress)),
    diet: mean(diet),
    workouts: work.length ? work.filter((q) => q.workout).length : undefined,
    workoutShare: work.length ? work.filter((q) => q.workout).length / work.length : undefined,
  };
}

interface Habit {
  key: string;
  /** Which side of the split a stretch of days falls on, or null when in between. */
  side(s: ReturnType<typeof summarise>): 'good' | 'poor' | null;
  phrase: string;
}

const HABITS: Habit[] = [
  { key: 'sleep', side: (s) => (s.sleep == null ? null : s.sleep >= 7 ? 'good' : s.sleep < 6.5 ? 'poor' : null), phrase: 'slept 7 hours or more' },
  { key: 'stress', side: (s) => (s.stress == null ? null : s.stress <= 2.5 ? 'good' : s.stress >= 3.5 ? 'poor' : null), phrase: 'felt less stressed' },
  { key: 'diet', side: (s) => (s.diet == null ? null : s.diet >= 0.7 ? 'good' : s.diet <= 0.4 ? 'poor' : null), phrase: 'ate well most days' },
  {
    key: 'workouts',
    side: (s) => (s.workoutShare == null ? null : s.workoutShare >= 2 / 7 ? 'good' : s.workoutShare < 1 / 7 ? 'poor' : null),
    phrase: 'worked out twice a week or more',
  },
];

/** The smallest gap between the two sides worth mentioning. Below it, it's noise. */
export function linkThreshold(measure: HairMeasure): number {
  return measure === 'score' ? 5 : MIN_DETECTABLE_CHANGE_MM.centre / 2;
}

export function lifestyleTrend(book: LogBook, records: ScanRecord[], today: Date, weeks = LIFESTYLE_WEEKS): LifestyleTrend {
  const scans = trendScans(records);
  const base = scans[0];
  const measure = hairMeasure(scans);

  const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: LifestyleWeek[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(day0, -7 * w - 6);
    const end = addDays(start, 7);
    const logs = logsBetween(book, start, 7);
    const s = summarise(logs);
    const last = scans.filter((r) => new Date(r.takenAt) >= start && new Date(r.takenAt) < end).at(-1);
    out.push({
      start,
      logs: logs.length,
      sleep: s.sleep,
      stress: s.stress,
      diet: s.diet,
      workouts: s.workouts,
      hair: last && base ? hairValue(last, base, measure) : undefined,
    });
  }

  // Each stretch between two scans: how the hair moved, and what the log said meanwhile.
  const stretches: { change: number; s: ReturnType<typeof summarise> }[] = [];
  for (let i = 1; i < scans.length; i++) {
    const a = hairValue(scans[i - 1], base!, measure);
    const b = hairValue(scans[i], base!, measure);
    if (a == null || b == null) continue;
    const from = addDays(new Date(scans[i - 1].takenAt), 1);
    const days = Math.max(1, Math.round((new Date(scans[i].takenAt).getTime() - new Date(scans[i - 1].takenAt).getTime()) / 86_400_000));
    const logs = logsBetween(book, from, days);
    if (logs.length < 2) continue;
    stretches.push({ change: b - a, s: summarise(logs) });
  }

  const links: string[] = [];
  const thing = measure === 'score' ? 'Your hair score' : 'Your hairline';
  for (const h of HABITS) {
    const good = stretches.filter((x) => h.side(x.s) === 'good').map((x) => x.change);
    const poor = stretches.filter((x) => h.side(x.s) === 'poor').map((x) => x.change);
    if (good.length < 2 || poor.length < 2) continue;
    if (mean(good)! - mean(poor)! >= linkThreshold(measure)) links.push(`${thing} held up better in the weeks you ${h.phrase}.`);
  }
  return { measure, weeks: out, links: links.slice(0, 2), enough: stretches.length >= 4 };
}

/** Whether any week has something to show. */
export function hasLifestyleData(t: LifestyleTrend): boolean {
  return t.weeks.some((w) => w.logs > 0);
}
