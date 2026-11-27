import type { LogBook, QuickLog } from '@/plan/log';
import { addDays, dayKey, type TaskId } from '@/plan/tasks';
import { isMinor } from '@/profile/onboarding';
import type { Profile } from '@/profile/types';
import { classifyHairlineChange, usableForTrends, type ChangeVerdict, type HairlineMetric } from '@/scan/change';
import type { ScanRecord } from '@/scan/session';

/**
 * The monthly verdict. Hair changes slowly, so the first verdict waits eight weeks after the
 * baseline scan and then comes every four weeks. A change is only called when it beats what a
 * re-scan can tell apart (see scan/change.ts); everything else is "holding steady".
 */
export const FIRST_VERDICT_DAYS = 56;
export const VERDICT_EVERY_DAYS = 28;
const DAY = 86_400_000;

export type Verdict = 'better' | 'holding' | 'worse';

export const VERDICT_TITLE: Record<Verdict, string> = {
  better: 'Gaining ground',
  holding: 'Holding steady',
  worse: 'Losing ground',
};

export const METRICS: { key: HairlineMetric; label: string; field: 'centreMM' | 'leftTempleMM' | 'rightTempleMM' }[] = [
  { key: 'leftTemple', label: 'Left temple', field: 'leftTempleMM' },
  { key: 'centre', label: 'Centre', field: 'centreMM' },
  { key: 'rightTemple', label: 'Right temple', field: 'rightTempleMM' },
];

export interface MetricChange {
  metric: HairlineMetric;
  label: string;
  baselineMM: number;
  nowMM: number;
  /** Positive means the hairline moved up (loss). */
  deltaMM: number;
  verdict: ChangeVerdict;
}

/** Guided scans good enough for trends, oldest first, that have hairline numbers. The verdict uses these. */
export function trendScans(records: ScanRecord[]): ScanRecord[] {
  return timelineScans(records).filter((r) => r.source !== 'upload');
}

/** Like `trendScans`, plus library photos with hairline numbers, at the dates they were taken. For the chart only. */
export function timelineScans(records: ScanRecord[]): ScanRecord[] {
  return [...records]
    .filter((r) => !r.lowConfidence && usableForTrends(r.quality) && r.hairline)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

export function metricChanges(baseline: ScanRecord, now: ScanRecord): MetricChange[] {
  const out: MetricChange[] = [];
  for (const m of METRICS) {
    const b = baseline.hairline?.[m.field];
    const n = now.hairline?.[m.field];
    if (b == null || n == null) continue;
    out.push({ metric: m.key, label: m.label, baselineMM: b, nowMM: n, deltaMM: n - b, verdict: classifyHairlineChange(m.key, b, n) });
  }
  return out;
}

/** Two measurements past the noise in the same direction, and none against, before we call it. */
export function overallVerdict(changes: MetricChange[]): Verdict {
  const gained = changes.filter((c) => c.verdict === 'gained').length;
  const lost = changes.filter((c) => c.verdict === 'lost').length;
  if (lost >= 2) return 'worse';
  if (gained >= 2 && lost === 0) return 'better';
  return 'holding';
}

/** Report dates: baseline + 8 weeks, then every 4 weeks. Returns the latest one reached, if any, and the next. */
export function reportSchedule(baseline: ScanRecord, now: Date): { due: Date | null; next: Date; month: number } {
  const start = new Date(baseline.takenAt).getTime();
  const first = start + FIRST_VERDICT_DAYS * DAY;
  if (now.getTime() < first) return { due: null, next: new Date(first), month: 2 };
  const k = Math.floor((now.getTime() - first) / (VERDICT_EVERY_DAYS * DAY));
  const due = first + k * VERDICT_EVERY_DAYS * DAY;
  return { due: new Date(due), next: new Date(due + VERDICT_EVERY_DAYS * DAY), month: 2 + k };
}

/**
 * Share of days with anything on the plan done, used when there's no medication to track. Counted
 * over the days since the first logged day, so someone on day 5 isn't shown 5 of 30.
 */
export function planDays(book: LogBook, today: Date, days = 30): number {
  let active = 0;
  let span = 0;
  for (let i = 0; i < days; i++) {
    const d = book[dayKey(addDays(today, -i))];
    if (!d) continue;
    span = i + 1;
    if (Object.values(d.answers ?? {}).includes('done')) active++;
  }
  return span ? active / span : 0;
}

/** Medication days done out of days answered, or plan days when there's no medication. */
export function consistency(book: LogBook, today: Date, medIds: TaskId[], days = 30): { label: string; share: number } {
  if (medIds.length) {
    let answered = 0;
    let done = 0;
    for (let i = 0; i < days; i++) {
      const a = book[dayKey(addDays(today, -i))]?.answers ?? {};
      for (const m of medIds) {
        if (a[m]) answered++;
        if (a[m] === 'done') done++;
      }
    }
    return { label: 'Treatment taken', share: answered ? done / answered : 0 };
  }
  return { label: 'Days on plan', share: planDays(book, today, days) };
}

export interface PeriodSummary {
  days: number;
  massageDays: number;
  logs: number;
  avgSleep?: number;
  avgStress?: number;
  moreSheddingDays: number;
}

export function summarisePeriod(book: LogBook, from: Date, to: Date): PeriodSummary {
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
  let massageDays = 0;
  const quick: QuickLog[] = [];
  for (let i = 0; i < days; i++) {
    const d = book[dayKey(addDays(to, -i))];
    if (!d) continue;
    if (d.answers.massage === 'done') massageDays++;
    if (d.quick) quick.push(d.quick);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
  return {
    days,
    massageDays,
    logs: quick.length,
    avgSleep: mean(quick.map((q) => q.sleepHours)),
    avgStress: mean(quick.map((q) => q.stress)),
    moreSheddingDays: quick.filter((q) => q.shedding === 'more').length,
  };
}

/** Things in the log that might explain the result. Possible links, never causes or diagnoses. */
export function explanations(verdict: Verdict, s: PeriodSummary, treatmentShare: number | undefined, profile: Profile, sinceBaselineDays: number): string[] {
  const out: string[] = [];
  if (treatmentShare != null && treatmentShare < 0.8) {
    out.push(`You took your treatment on about ${Math.round(treatmentShare * 10) * 10}% of days. Treatments work best taken every day.`);
  }
  if (s.avgStress != null && s.avgStress >= 3.5) out.push('Stress was high on most days you logged. Stress can raise shedding for a few months.');
  if (s.avgSleep != null && s.avgSleep < 6) out.push('You slept under 6 hours on average. Short sleep can add to shedding.');
  if (s.logs >= 3 && s.moreSheddingDays / s.logs >= 1 / 3) out.push('You logged more shedding than usual on several days. Shedding often comes in phases.');
  if (profile.treatments.includes('minoxidil') && sinceBaselineDays < 120) {
    out.push('It is early. Minoxidil usually takes 4 to 6 months to show, and extra shedding at the start is common.');
  }
  if (out.length === 0) {
    out.push(verdict === 'worse' ? 'Nothing in your log stands out. Some change is down to genetics and timing.' : 'Nothing in your log stands out. Keep going as you are.');
  }
  return out;
}

export function versusForecast(verdict: Verdict): string {
  switch (verdict) {
    case 'holding':
      return 'Little change, as expected this early.';
    case 'better':
      return 'Better than your forecast expected.';
    case 'worse':
      return 'Faster than your forecast expected. Next month will tell us more.';
  }
}

export function adjustments(verdict: Verdict, s: PeriodSummary, treatmentShare: number | undefined, profile: Profile): string[] {
  const out: string[] = [];
  if (treatmentShare != null && treatmentShare < 0.8) out.push('Set your reminder for the time of day you are most likely to remember.');
  if (s.massageDays < s.days / 2) out.push('Try the 1 minute quick massage on busy days.');
  if (s.logs < s.days / 4) out.push('Log sleep and stress a few times a week so next month’s report can say more.');
  if (verdict === 'worse') {
    out.push(isMinor(profile) ? 'Talk to a parent and a doctor about what you are seeing.' : 'Consider talking to a dermatologist about your options.');
  }
  out.push('Keep scanning weekly: same time, same spot, dry hair.');
  return out;
}

export interface VerdictReport {
  month: number;
  date: Date;
  verdict: Verdict;
  changes: MetricChange[];
  baseline: ScanRecord;
  latest: ScanRecord;
  summary: PeriodSummary;
  treatmentShare?: number;
  explanations: string[];
  versusForecast: string;
  adjustments: string[];
}

/** The latest report that is due, or null before the first one (or without two good scans). */
export function latestReport(records: ScanRecord[], book: LogBook, profile: Profile, medIds: TaskId[], now: Date): VerdictReport | null {
  const scans = trendScans(records);
  const baseline = scans[0];
  if (!baseline) return null;
  const { due, month } = reportSchedule(baseline, now);
  if (!due) return null;
  const latest = scans.filter((r) => new Date(r.takenAt).getTime() <= now.getTime()).at(-1);
  if (!latest || latest.id === baseline.id) return null;
  const changes = metricChanges(baseline, latest);
  const verdict = overallVerdict(changes);
  const from = new Date(Math.max(new Date(baseline.takenAt).getTime(), due.getTime() - VERDICT_EVERY_DAYS * DAY));
  const summary = summarisePeriod(book, from, due);
  const treatmentShare = medIds.length ? consistency(book, due, medIds, summary.days).share : undefined;
  const sinceBaseline = Math.round((due.getTime() - new Date(baseline.takenAt).getTime()) / DAY);
  return {
    month,
    date: due,
    verdict,
    changes,
    baseline,
    latest,
    summary,
    treatmentShare,
    explanations: explanations(verdict, summary, treatmentShare, profile, sinceBaseline),
    versusForecast: versusForecast(verdict),
    adjustments: adjustments(verdict, summary, treatmentShare, profile),
  };
}

/** "3 mm up", "2 mm down", always rounded: the numbers are estimates. */
export function deltaLabel(deltaMM: number): string {
  const mm = Math.round(Math.abs(deltaMM));
  if (mm === 0) return 'no change';
  return `${mm} mm ${deltaMM > 0 ? 'higher' : 'lower'}`;
}
