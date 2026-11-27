import { activeSupplies, sheddingHeadsUp, supplies, supplyCopy, supplyStatus, treatmentStart, usedSince } from '@/plan/coach';
import { lifestyleTrend } from '@/plan/lifestyle';
import { answer, logQuick, type LogBook, type QuickLog } from '@/plan/log';
import { DEFAULT_REMINDERS, reminderPlan } from '@/plan/reminders';
import { addDays, dayKey } from '@/plan/tasks';
import { emptyProfile, type Profile } from '@/profile/types';

import { hairReading } from '../../test-utils/hairFixtures';
import { record } from '../../test-utils/scanFixtures';

const today = new Date(2026, 11, 10, 9, 0); // 10 Dec 2026, local
const day = (n: number) => dayKey(addDays(today, n));
const adult = (p: Partial<Profile> = {}): Profile => ({ ...emptyProfile(), age: 30, sex: 'male', completedAt: 'x', ...p });

function doses(task: 'finasteride' | 'minoxidil' | 'ketoconazole', fromDay: number, toDay: number, book: LogBook = {}): LogBook {
  for (let i = fromDay; i <= toDay; i++) book = answer(book, day(i), task, 'done');
  return book;
}

describe('supplies', () => {
  it('counts the doses logged since the pack was opened', () => {
    const book = doses('finasteride', -40, 0);
    expect(usedSince(book, 'finasteride', day(-20), today)).toBe(21);
    const s = supplyStatus('finasteride', { packDoses: 28, since: day(-20) }, book, today);
    expect(s).toMatchObject({ left: 7, daysLeft: 7, state: 'low' });
    expect(dayKey(s.runsOut)).toBe(day(7));
    expect(supplyCopy(s)).toBe('Finasteride: about 7 days left. Time to reorder.');
  });

  it('is used up when the log says so, and fine with plenty left', () => {
    const book = doses('finasteride', -40, 0);
    expect(supplyStatus('finasteride', { packDoses: 30, since: day(-40) }, book, today).state).toBe('out');
    expect(supplyStatus('finasteride', { packDoses: 90, since: day(-10) }, book, today)).toMatchObject({ left: 79, state: 'ok' });
  });

  it('counts the shampoo in washes, twice a week', () => {
    const book = answer(answer({}, day(-3), 'ketoconazole', 'done'), day(0), 'ketoconazole', 'done');
    const s = supplyStatus('ketoconazole', { packDoses: 4, since: day(-7) }, book, today);
    expect(s).toMatchObject({ left: 2, daysLeft: 7, state: 'low' });
    expect(supplyCopy(s)).toMatch(/about 2 washes left/);
  });

  it('only tracks what is on the plan, and no prescriptions for under-18s', () => {
    expect(activeSupplies(adult({ treatments: ['finasteride', 'ketoconazole', 'microneedling'] }))).toEqual(['finasteride', 'ketoconazole']);
    expect(activeSupplies(adult({ age: 16, treatments: ['finasteride', 'minoxidil', 'ketoconazole'] }))).toEqual(['ketoconazole']);
    const p = adult({ treatments: ['finasteride'], supplies: { finasteride: { packDoses: 30, since: day(-1) }, minoxidil: { packDoses: 30, since: day(-1) } } });
    expect(supplies(p, activeSupplies(p), {}, today).map((s) => s.id)).toEqual(['finasteride']);
  });
});

describe('shedding heads-up', () => {
  it('starts from the first logged dose and shows from week 3 to month 4', () => {
    const p = adult({ treatments: ['minoxidil'] });
    expect(sheddingHeadsUp(p, ['minoxidil'], doses('minoxidil', -10, 0), today)).toBeNull();
    const h = sheddingHeadsUp(p, ['minoxidil'], doses('minoxidil', -40, 0), today)!;
    expect(h.title).toBe('Month 2: extra shedding is normal');
    expect(h.body).toMatch(/^Many people shed more in the first months on minoxidil/);
    expect(h.body).toMatch(/talk to your doctor/);
    expect(sheddingHeadsUp(p, ['minoxidil'], doses('minoxidil', -130, 0), today)).toBeNull();
  });

  it('uses the start date the user gave over the log, and stops once dismissed', () => {
    const p = adult({ treatments: ['minoxidil'], treatmentStarts: { minoxidil: day(-60) } });
    const book = doses('minoxidil', -5, 0);
    expect(dayKey(treatmentStart(p, book, 'minoxidil')!)).toBe(day(-60));
    expect(sheddingHeadsUp(p, ['minoxidil'], book, today)!.month).toBe(3);
    expect(sheddingHeadsUp({ ...p, coach: { dismissed: ['shedding:minoxidil'] } }, ['minoxidil'], book, today)).toBeNull();
  });

  it('says so when the user logged more shedding lately', () => {
    let book = doses('finasteride', -30, 0);
    const q: QuickLog = { shedding: 'more', stress: 2, sleepHours: 7 };
    book = logQuick(logQuick(book, day(-1), q), day(-3), q);
    const h = sheddingHeadsUp(adult({ treatments: ['finasteride'] }), ['finasteride'], book, today)!;
    expect(h.body).toMatch(/^Some people shed a little more/);
    expect(h.body).toMatch(/You logged more shedding lately/);
  });
});

describe('coach reminders', () => {
  const s = { ...DEFAULT_REMINDERS, enabled: true };

  it('warns a week before a supply runs out, and gives the heads-up on day 21, never naming a medicine', () => {
    const p = adult({ treatments: ['minoxidil'], supplies: { minoxidil: { packDoses: 30, since: day(0) } }, treatmentStarts: { minoxidil: day(0) } });
    const plan = reminderPlan(p, s, today, {});
    const supply = plan.find((r) => r.id === 'supply-minoxidil')!;
    const shed = plan.find((r) => r.id === 'shedding')!;
    expect(supply.trigger).toEqual({ type: 'date', date: new Date(2027, 0, 2, 8, 0) });
    expect(shed.trigger).toEqual({ type: 'date', date: new Date(2026, 11, 31, 8, 0) });
    expect(plan.map((r) => r.body).join(' ')).not.toMatch(/minoxidil/i);
  });

  it('adds nothing when the dates have passed', () => {
    const p = adult({ treatments: ['minoxidil'], supplies: { minoxidil: { packDoses: 30, since: day(-26) } }, treatmentStarts: { minoxidil: day(-40) } });
    expect(reminderPlan(p, s, today, doses('minoxidil', -26, 0)).map((r) => r.id)).toEqual(['morning', 'evening', 'scan']);
  });
});

describe('habits vs hair', () => {
  const q = (sleepHours: number, stress: number, extra: Partial<QuickLog> = {}): QuickLog => ({ shedding: 'normal', sleepHours, stress, ...extra });

  it('summarises each week and lines the hair score up with it', () => {
    let book: LogBook = {};
    book = logQuick(book, day(0), q(8, 2, { diet: 'well', workout: true }));
    book = logQuick(book, day(-1), q(6, 4, { diet: 'mixed', workout: false }));
    book = logQuick(book, day(-2), q(7, 3, { workout: true }));
    const scans = [
      record('a', addDays(today, -14).toISOString(), { hair: hairReading({ score: 60 }) }),
      record('b', addDays(today, -1).toISOString(), { hair: hairReading({ score: 64 }) }),
    ];
    const t = lifestyleTrend(book, scans, today);
    expect(t.measure).toBe('score');
    expect(t.weeks).toHaveLength(6);
    const w = t.weeks.at(-1)!;
    expect(w).toMatchObject({ logs: 3, sleep: 7, stress: 3, diet: 0.75, workouts: 2, hair: 64 });
    expect(t.weeks.at(-3)!.hair).toBe(60);
    expect(t.links).toEqual([]);
    expect(t.enough).toBe(false);
  });

  it('falls back to the hairline, and names a possible link only when it is clear', () => {
    let book: LogBook = {};
    const scans = [];
    // Eight weekly scans: good-sleep weeks hold the hairline, short-sleep weeks lose 2 mm.
    let centre = 68;
    for (let w = 0; w < 8; w++) {
      const good = w % 2 === 0;
      for (let d = 1; d <= 3; d++) book = logQuick(book, day(-7 * (8 - w) + d), q(good ? 8 : 5, 3));
      if (w > 0 && !good) centre += 2;
      scans.push(record(`s${w}`, addDays(today, -7 * (8 - w) + 4).toISOString(), { hairline: { centreMM: centre } }));
    }
    const t = lifestyleTrend(book, scans, today);
    expect(t.measure).toBe('hairline');
    expect(t.enough).toBe(true);
    expect(t.links).toEqual(['Your hairline held up better in the weeks you slept 7 hours or more.']);
  });
});
