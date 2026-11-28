/**
 * The monthly verdict against both lines: where the real scans sit between the "do nothing"
 * forecast and "your plan". The forecast is in Norwood stages and the scans measure the
 * hairline centre in mm, so stages convert at MM_PER_STAGE, read off the stage grader's own
 * centre-height thresholds (75, 82, 90 mm for N3, N4, N5). An assumption, like the grader.
 */
import type { Forecast } from '@/forecast';
import { MIN_DETECTABLE_CHANGE_MM } from '@/scan/change';
import type { ScanRecord } from '@/scan/session';

export const MM_PER_STAGE = 7.5;
const DAY = 86_400_000;
const MONTH = 30.44 * DAY;

export type PathVerdict = 'ahead' | 'onPlan' | 'behind' | 'tooEarly';

export const PATH_TITLE: Record<PathVerdict, string> = {
  ahead: 'Ahead of your plan',
  onPlan: 'On your plan',
  behind: 'Behind your plan',
  tooEarly: 'Too early to tell',
};

/** The headline, worded for "your forecast" when there is no plan to be on. */
export function pathTitle(v: Pick<VersusPaths, 'verdict' | 'hasPlan'>): string {
  return v.hasPlan ? PATH_TITLE[v.verdict] : PATH_TITLE[v.verdict].replace('your plan', 'your forecast');
}

export interface PathPoint {
  months: number;
  /** Hairline centre change since baseline in mm. Positive = higher on the forehead (loss). */
  mm: number;
}

export interface VersusPaths {
  verdict: PathVerdict;
  /** Whether a plan exists; without one, "plan" means the do-nothing forecast. */
  hasPlan: boolean;
  scans: PathPoint[];
  /** Expected change at month m along each path. */
  untreatedAt(months: number): number;
  planAt(months: number): number;
  noiseMM: number;
  monthsSoFar: number;
  sentence: string;
}

/** Median stage change over the first year, spread evenly by month. */
function perMonth(f: Forecast, plan: boolean): number {
  const y1 = f.byYear.find((y) => y.years === 1);
  if (!y1) return 0;
  const end = plan && y1.plan ? y1.withTreatment!.p50 : y1.untreated.p50;
  return ((end - f.stageNow.p50) * MM_PER_STAGE) / 12;
}

export function versusPaths(f: Forecast, scans: ScanRecord[]): VersusPaths | null {
  const withCentre = scans.filter((s) => s.hairline?.centreMM != null);
  const base = withCentre[0];
  const latest = withCentre.at(-1);
  if (!base || !latest || latest.id === base.id) return null;
  const t0 = new Date(base.takenAt).getTime();
  const points = withCentre.map((s) => ({ months: (new Date(s.takenAt).getTime() - t0) / MONTH, mm: s.hairline!.centreMM! - base.hairline!.centreMM! }));
  const hasPlan = f.byYear.some((y) => y.plan);
  const u = perMonth(f, false);
  const p = hasPlan ? perMonth(f, true) : u;
  const untreatedAt = (m: number) => u * m;
  const planAt = (m: number) => p * m;
  const noise = MIN_DETECTABLE_CHANGE_MM.centre;
  const now = points.at(-1)!;
  const expPlan = planAt(now.months);
  const expNone = untreatedAt(now.months);

  let verdict: PathVerdict;
  if (Math.abs(now.mm) < noise && Math.abs(expNone - expPlan) < noise && Math.abs(expNone) < noise) verdict = 'tooEarly';
  else if (now.mm <= expPlan - noise) verdict = 'ahead';
  else if (now.mm >= expPlan + noise) verdict = 'behind';
  else verdict = 'onPlan';

  const what = hasPlan ? 'your plan' : 'your forecast';
  const sentence = {
    tooEarly: `No clear change yet. That usually takes 6 to 12 months.`,
    ahead: `Your hairline is doing better than ${what} predicted, by more than a re-scan can explain.`,
    onPlan: hasPlan
      ? `Your hairline is inside the range your plan predicted${now.mm < expNone - noise / 2 ? ', and ahead of no plan' : ''}.`
      : 'Your hairline is inside the range your forecast predicted.',
    behind: `Your hairline moved more than ${what} predicted. Next month will tell us more.`,
  }[verdict];

  return { verdict, hasPlan, scans: points, untreatedAt, planAt, noiseMM: noise, monthsSoFar: now.months, sentence };
}
