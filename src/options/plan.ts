/**
 * "Your plan" as the forecast sees it: what the user actually does, from their daily log, not
 * the ideal. The gap between the real routine and every day becomes the nudge on Predict and
 * Today.
 */
import { ASSUMED_ADHERENCE, midEffect, roleOf, type OptionId, type PlanItem, type Role } from '@/forecast';
import type { LogBook } from '@/plan/log';
import { addDays, dayKey, type TaskId } from '@/plan/tasks';
import { isMinor } from '@/profile/onboarding';
import type { Profile, TreatmentChoice } from '@/profile/types';

/** Days of log the plan is built from. */
export const PLAN_WINDOW_DAYS = 28;

interface Tracked {
  option: OptionId;
  task: TaskId;
  name: string;
  /** Medications are answered yes or skip; massage is done or not. */
  kind: 'medication' | 'massage';
}

const MEDS: { choice: TreatmentChoice; option: OptionId; task: TaskId; name: string }[] = [
  { choice: 'finasteride', option: 'finasteride', task: 'finasteride', name: 'Finasteride' },
  { choice: 'dutasteride', option: 'dutasteride', task: 'dutasteride', name: 'Dutasteride' },
  { choice: 'minoxidil', option: 'minoxidil', task: 'minoxidil', name: 'Minoxidil' },
  { choice: 'oralMinoxidil', option: 'oral_minoxidil', task: 'oralMinoxidil', name: 'Oral minoxidil' },
];

/** Things in the daily plan that the forecast counts. Medications only for adults, as on Today. */
export function trackedItems(profile: Profile): Tracked[] {
  const out: Tracked[] = [];
  if (!isMinor(profile)) {
    for (const m of MEDS) if (profile.treatments.includes(m.choice)) out.push({ option: m.option, task: m.task, name: m.name, kind: 'medication' });
  }
  out.push({ option: 'massage', task: 'massage', name: 'Scalp massage', kind: 'massage' });
  return out;
}

export interface PlanEntry extends PlanItem {
  task: TaskId;
  name: string;
  role: Role;
  /** "logged" when the share comes from the log; "assumed" before there is any. */
  source: 'logged' | 'assumed';
}

/** First day with anything logged, or null for an empty log. */
function firstLogged(book: LogBook): string | null {
  let first: string | null = null;
  for (const [day, d] of Object.entries(book)) if (Object.keys(d.answers).length && (first == null || day < first)) first = day;
  return first;
}

/**
 * Share of days a task was done, over the last `days` days. Medications count days answered
 * (a blank day is unknown, not a miss). Massage counts every day since the log started, since
 * not opening it is not doing it. Undefined when there is nothing to go on.
 */
export function shareDone(book: LogBook, today: Date, t: Pick<Tracked, 'task' | 'kind'>, days = PLAN_WINDOW_DAYS): number | undefined {
  const first = firstLogged(book);
  if (!first) return undefined;
  let counted = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const key = dayKey(addDays(today, -i));
    if (key < first) break;
    const a = book[key]?.answers[t.task];
    if (t.kind === 'medication' && !a) continue;
    counted++;
    if (a === 'done') done++;
  }
  return counted ? done / counted : undefined;
}

const round20 = (v: number) => Math.round(v * 20) / 20;

/**
 * The plan the forecast runs: each tracked item at its logged share of days, to the nearest 5%
 * so the forecast doesn't re-run for every tap. A medication with no log yet assumes "most days";
 * massage only counts once it has been done.
 */
export function userPlan(profile: Profile, book: LogBook, today: Date): PlanEntry[] {
  const out: PlanEntry[] = [];
  for (const t of trackedItems(profile)) {
    const s = shareDone(book, today, t);
    const base = { option: t.option, task: t.task, name: t.name, role: roleOf(t.option) };
    if (s == null) {
      if (t.kind === 'medication') out.push({ ...base, adherence: ASSUMED_ADHERENCE, source: 'assumed' });
      continue;
    }
    const a = round20(s);
    if (a > 0 || t.kind === 'medication') out.push({ ...base, adherence: a, source: 'logged' });
  }
  return out;
}

/** The model's view of a plan: option and share only. */
export function planItems(plan: readonly PlanEntry[]): PlanItem[] {
  return plan.map(({ option, adherence }) => ({ option, adherence }));
}

/** Done or not on each of the last 7 days, oldest first, ending today. */
export function weekStrip(book: LogBook, today: Date, task: TaskId): boolean[] {
  return Array.from({ length: 7 }, (_, i) => book[dayKey(addDays(today, i - 6))]?.answers[task] === 'done');
}

export interface Nudge {
  entry: PlanEntry;
  /** Days done in the last 7, today included. */
  done: number;
  text: string;
}

/**
 * The one item where the real routine costs the most: missed days this week times how much the
 * option does. Slowing and growing are in different units, so lifts count 1.5x a rate share
 * (a rough ordering, not a model result). Null when nothing was missed or nothing is logged.
 */
export function biggestNudge(plan: readonly PlanEntry[], book: LogBook, today: Date): Nudge | null {
  let best: { entry: PlanEntry; done: number; score: number } | null = null;
  for (const entry of plan) {
    if (entry.source !== 'logged') continue;
    const done = weekStrip(book, today, entry.task).filter(Boolean).length;
    const missed = 7 - done;
    if (missed === 0) continue;
    const score = missed * midEffect(entry.option) * (entry.role === 'grows' ? 1.5 : 1);
    if (!best || score > best.score) best = { entry, done, score };
  }
  if (!best) return null;
  const { entry, done } = best;
  const what = entry.name === 'Scalp massage' ? 'the scalp massage' : entry.name.toLowerCase();
  const text =
    entry.role === 'grows'
      ? `You do ${what} ${done} of 7 days. It only works while you keep it up.`
      : `You took ${what} ${done} of the last 7 days. It slows loss best taken every day.`;
  return { entry, done, text };
}

/** Plain-words summary of a plan by what it does, for "Your plan, by what it does". */
export function planByRole(plan: readonly PlanEntry[]): Record<Role, PlanEntry[]> {
  return {
    slows: plan.filter((p) => p.role === 'slows' && p.adherence > 0),
    grows: plan.filter((p) => p.role === 'grows' && p.adherence > 0),
  };
}
