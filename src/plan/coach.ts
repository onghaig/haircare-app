import { isMinor } from '@/profile/onboarding';
import type { Profile } from '@/profile/types';

import type { LogBook } from './log';
import { addDays, dayKey, type TaskId } from './tasks';

/**
 * The routine coach: how much of each supply is left, from the doses the user logged, and a
 * heads-up about the shedding phase timed from when a treatment started. It only tracks what
 * the user says they use; it never tells anyone to start, stop or change a medicine.
 */

const DAY = 86_400_000;

/** Things that run out: the daily treatments and the ketoconazole shampoo. */
export type SupplyId = 'finasteride' | 'dutasteride' | 'minoxidil' | 'oralMinoxidil' | 'ketoconazole';

export interface Supply {
  /** Doses (or washes) in the pack when it was opened. */
  packDoses: number;
  /** Local day the pack was opened, "2026-11-26". Doses logged on or after it count. */
  since: string;
}

export interface PackOption {
  doses: number;
  label: string;
}

/** Common pack sizes, in the unit the Today checklist logs. */
export const PACKS: Record<SupplyId, PackOption[]> = {
  finasteride: [
    { doses: 28, label: '28 tablets' },
    { doses: 30, label: '30 tablets' },
    { doses: 90, label: '90 tablets' },
  ],
  dutasteride: [
    { doses: 30, label: '30 capsules' },
    { doses: 90, label: '90 capsules' },
  ],
  oralMinoxidil: [
    { doses: 30, label: '30 tablets' },
    { doses: 90, label: '90 tablets' },
  ],
  minoxidil: [
    { doses: 30, label: '1 month' },
    { doses: 90, label: '3 months' },
    { doses: 180, label: '6 months' },
  ],
  ketoconazole: [
    { doses: 12, label: 'About 12 washes' },
    { doses: 24, label: 'About 24 washes' },
  ],
};

export const SUPPLY_NAME: Record<SupplyId, string> = {
  finasteride: 'Finasteride',
  dutasteride: 'Dutasteride',
  minoxidil: 'Minoxidil',
  oralMinoxidil: 'Oral minoxidil',
  ketoconazole: 'Ketoconazole shampoo',
};

/** Expected use per day: daily treatments once a day, the shampoo twice a week. */
export const USE_PER_DAY: Record<SupplyId, number> = {
  finasteride: 1,
  dutasteride: 1,
  minoxidil: 1,
  oralMinoxidil: 1,
  ketoconazole: 2 / 7,
};

/** Warn this many days before a supply is expected to run out. */
export const LOW_DAYS = 7;

const SUPPLY_IDS = Object.keys(PACKS) as SupplyId[];
export const isSupplyId = (t: TaskId): t is SupplyId => (SUPPLY_IDS as string[]).includes(t);

/**
 * The supplies on the user's plan, matching the Today checklist: prescription treatments only
 * for adults, the shampoo for anyone.
 */
export function activeSupplies(profile: Profile): SupplyId[] {
  const adult = !isMinor(profile);
  return SUPPLY_IDS.filter((id) => profile.treatments.includes(id) && (id === 'ketoconazole' || adult));
}

export interface SupplyStatus {
  id: SupplyId;
  name: string;
  left: number;
  /** Days until it runs out at the usual rate. */
  daysLeft: number;
  /** The day it is expected to run out. */
  runsOut: Date;
  state: 'ok' | 'low' | 'out';
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Doses logged done for a task from `since` to today, inclusive. */
export function usedSince(book: LogBook, task: TaskId, since: string, today: Date): number {
  let n = 0;
  const end = dayKey(today);
  for (let d = parseDay(since), i = 0; i < 800; d = addDays(d, 1), i++) {
    const k = dayKey(d);
    if (book[k]?.answers[task] === 'done') n++;
    if (k >= end) break;
  }
  return n;
}

export function supplyStatus(id: SupplyId, s: Supply, book: LogBook, today: Date): SupplyStatus {
  const left = Math.max(0, s.packDoses - usedSince(book, id, s.since, today));
  const daysLeft = Math.floor(left / USE_PER_DAY[id]);
  const runsOut = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), daysLeft);
  return { id, name: SUPPLY_NAME[id], left, daysLeft, runsOut, state: left === 0 ? 'out' : daysLeft <= LOW_DAYS ? 'low' : 'ok' };
}

/** The supplies the user tracks, for the treatments on today's plan. */
export function supplies(profile: Profile, active: SupplyId[], book: LogBook, today: Date): SupplyStatus[] {
  return active.filter((id) => profile.supplies?.[id]).map((id) => supplyStatus(id, profile.supplies![id]!, book, today));
}

export function supplyCopy(s: SupplyStatus): string {
  const unit = s.id === 'ketoconazole' ? (s.left === 1 ? 'wash' : 'washes') : s.left === 1 ? 'day' : 'days';
  if (s.state === 'out') return `${s.name}: your log says this pack is used up. Got a new one? Tap to update.`;
  return `${s.name}: about ${s.left} ${unit} left. Time to reorder.`;
}

// ---------------------------------------------------------------------------------------------
// The shedding heads-up

/** Treatments known for a shedding phase early on, and how strongly. */
const SHEDDERS: { id: SupplyId; strong: boolean }[] = [
  { id: 'minoxidil', strong: true },
  { id: 'oralMinoxidil', strong: true },
  { id: 'finasteride', strong: false },
  { id: 'dutasteride', strong: false },
];

/** The heads-up shows from day 21 to day 120 after starting. */
export const SHED_FROM_DAY = 21;
export const SHED_TO_DAY = 120;

/**
 * When the user started a treatment: what they told the coach, or else the first dose they
 * logged. Unknown when neither exists.
 */
export function treatmentStart(profile: Profile, book: LogBook, id: SupplyId): Date | null {
  const told = profile.treatmentStarts?.[id];
  if (told) return parseDay(told);
  const first = Object.keys(book)
    .filter((k) => book[k].answers[id] === 'done')
    .sort()[0];
  return first ? parseDay(first) : null;
}

export interface SheddingHeadsUp {
  id: SupplyId;
  key: string;
  month: number;
  title: string;
  body: string;
}

export function daysSince(start: Date, today: Date): number {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t0.getTime() - start.getTime()) / DAY);
}

/** The heads-up to show today, or null. One at a time: the strongest shedder wins. */
export function sheddingHeadsUp(profile: Profile, active: SupplyId[], book: LogBook, today: Date): SheddingHeadsUp | null {
  for (const { id, strong } of SHEDDERS) {
    if (!active.includes(id)) continue;
    const start = treatmentStart(profile, book, id);
    if (!start) continue;
    const days = daysSince(start, today);
    if (days < SHED_FROM_DAY || days > SHED_TO_DAY) continue;
    const key = `shedding:${id}`;
    if (profile.coach?.dismissed?.includes(key)) continue;
    const month = Math.floor(days / 30) + 1;
    const name = SUPPLY_NAME[id].toLowerCase();
    const moreLately = recentMoreShedding(book, today);
    return {
      id,
      key,
      month,
      title: `Month ${month}: extra shedding is normal`,
      body: [
        strong
          ? `Many people shed more in the first months on ${name}. Old hairs make way for new ones, and it usually settles by month 4.`
          : `Some people shed a little more in the first months on ${name}. It usually settles by month 4.`,
        moreLately ? 'You logged more shedding lately, which fits this phase.' : null,
        'Keep going as planned. If it carries on past month 4, or worries you, talk to your doctor.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  return null;
}

/** Two or more "more than usual" days in the last 14. */
function recentMoreShedding(book: LogBook, today: Date): boolean {
  let n = 0;
  for (let i = 0; i < 14; i++) if (book[dayKey(addDays(today, -i))]?.quick?.shedding === 'more') n++;
  return n >= 2;
}

/** Answers to "When did you start?", in days ago. */
export const START_OPTIONS: { value: string; label: string; daysAgo: number }[] = [
  { value: 'week', label: 'This week', daysAgo: 0 },
  { value: 'month', label: 'About a month ago', daysAgo: 30 },
  { value: 'twoThree', label: '2 to 3 months ago', daysAgo: 75 },
  { value: 'older', label: 'Over 4 months ago', daysAgo: 150 },
];

/** The heads-up as a dated reminder: day 21 at the morning time. Null when that is past. */
export function sheddingReminderDate(start: Date, hour: number, minute: number, now: Date): Date | null {
  const d = addDays(start, SHED_FROM_DAY);
  d.setHours(hour, minute, 0, 0);
  return d > now ? d : null;
}
