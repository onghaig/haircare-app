import { isMinor } from '@/profile/onboarding';
import type { Profile } from '@/profile/types';
import type { ScanRecord } from '@/scan/session';
import { daysUntilNextScan } from '@/scan/store';

/** Local calendar day, "2026-11-26". Days roll over at local midnight, not UTC. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export type TaskId = 'finasteride' | 'dutasteride' | 'minoxidil' | 'ketoconazole' | 'massage' | 'quickLog' | 'scan';
export type TaskKind = 'medication' | 'care' | 'massage' | 'log' | 'scan';

export interface Task {
  id: TaskId;
  kind: TaskKind;
  title: string;
  detail: string;
  /** Medication tasks are answered Yes or Skipped; the rest open something or tick off. */
  answer: 'yesSkip' | 'open' | 'tick';
}

/** Ketoconazole shampoo days: Monday and Thursday (2 to 3 times a week, spec). */
export const KETO_DAYS = [1, 4];

/**
 * Today's checklist, from the user's treatments, age and scan history. The app tracks what the
 * user says they take; it never tells anyone to start, stop or change a prescription medicine,
 * and under-18s never get prescription tasks.
 */
export function dailyTasks(profile: Profile, date: Date, scans: ScanRecord[]): Task[] {
  const t = new Set(profile.treatments);
  const adult = !isMinor(profile);
  const out: Task[] = [];
  if (adult && t.has('finasteride')) {
    out.push({ id: 'finasteride', kind: 'medication', title: 'Finasteride', detail: 'Did you take it today?', answer: 'yesSkip' });
  }
  if (adult && t.has('dutasteride')) {
    out.push({ id: 'dutasteride', kind: 'medication', title: 'Dutasteride', detail: 'Did you take it today?', answer: 'yesSkip' });
  }
  if (adult && t.has('minoxidil')) {
    out.push({ id: 'minoxidil', kind: 'medication', title: 'Minoxidil', detail: 'Did you apply it today?', answer: 'yesSkip' });
  }
  if (t.has('ketoconazole') && KETO_DAYS.includes(date.getDay())) {
    out.push({ id: 'ketoconazole', kind: 'care', title: 'Ketoconazole shampoo day', detail: 'Leave it on for 3 to 5 minutes', answer: 'tick' });
  }
  out.push({ id: 'massage', kind: 'massage', title: 'Scalp massage', detail: '4 minutes, guided', answer: 'open' });
  out.push({ id: 'quickLog', kind: 'log', title: 'Quick log', detail: 'Shedding, stress, sleep', answer: 'open' });
  if (daysUntilNextScan(scans, date) === 0) {
    out.push({ id: 'scan', kind: 'scan', title: 'Weekly scan', detail: 'Same time, same spot', answer: 'open' });
  }
  return out;
}
