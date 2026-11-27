import { adherence, answer, logQuick, missedYesterday, progress, streak, type LogBook } from '@/plan/log';
import { mmss, ROUTINE, routineFor, stepAt, totalSeconds } from '@/plan/massage';
import { reminderPlan, DEFAULT_REMINDERS } from '@/plan/reminders';
import { addDays, dailyTasks, dayKey } from '@/plan/tasks';
import { emptyProfile, type Profile } from '@/profile/types';

import { record } from '../../test-utils/scanFixtures';

const p = (extra: Partial<Profile> = {}): Profile => ({ ...emptyProfile(), age: 30, ...extra });
const THU = new Date(2026, 10, 26, 9, 0); // Thursday 26 Nov 2026, local time
const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id);

describe('daily tasks', () => {
  it('tracks the treatments the user takes, plus massage, log and the weekly scan', () => {
    const t = dailyTasks(p({ treatments: ['finasteride', 'minoxidil'] }), THU, []);
    expect(ids(t)).toEqual(['finasteride', 'minoxidil', 'massage', 'quickLog', 'scan']);
    expect(t[0]).toMatchObject({ kind: 'medication', answer: 'yesSkip' });
  });

  it('never gives under-18s prescription tasks', () => {
    expect(ids(dailyTasks(p({ age: 16, treatments: ['finasteride', 'minoxidil'] }), THU, []))).toEqual(['massage', 'quickLog', 'scan']);
  });

  it('tracks oral minoxidil as a medication, adults only', () => {
    expect(ids(dailyTasks(p({ treatments: ['oralMinoxidil'] }), THU, []))).toContain('oralMinoxidil');
    expect(ids(dailyTasks(p({ age: 16, treatments: ['oralMinoxidil'] }), THU, []))).not.toContain('oralMinoxidil');
  });

  it('puts ketoconazole on Mondays and Thursdays only', () => {
    expect(ids(dailyTasks(p({ treatments: ['ketoconazole'] }), THU, []))).toContain('ketoconazole');
    expect(ids(dailyTasks(p({ treatments: ['ketoconazole'] }), addDays(THU, 1), []))).not.toContain('ketoconazole');
  });

  it('shows the weekly scan only when it is due', () => {
    const lastWeek = record('a', addDays(THU, -7).toISOString());
    const yesterday = record('b', addDays(THU, -1).toISOString());
    expect(ids(dailyTasks(p(), THU, [lastWeek]))).toContain('scan');
    expect(ids(dailyTasks(p(), THU, [yesterday]))).not.toContain('scan');
  });
});

describe('the log', () => {
  const day = dayKey(THU);

  it('uses the local calendar day', () => {
    expect(day).toBe('2026-11-26');
  });

  it('answers, un-answers and counts progress', () => {
    let b: LogBook = {};
    b = answer(b, day, 'massage', 'done');
    b = answer(b, day, 'finasteride', 'skipped');
    expect(progress(b, day, ['massage', 'finasteride', 'quickLog'])).toEqual({ done: 1, total: 3 });
    b = answer(b, day, 'massage', undefined);
    expect(b[day].answers.massage).toBeUndefined();
  });

  it('a quick log ticks off the quick-log task', () => {
    const b = logQuick({}, day, { shedding: 'normal', stress: 2, sleepHours: 7 });
    expect(b[day]).toEqual({ quick: { shedding: 'normal', stress: 2, sleepHours: 7 }, answers: { quickLog: 'done' } });
  });

  const activeDays = (offsets: number[]): LogBook =>
    Object.fromEntries(offsets.map((o) => [dayKey(addDays(THU, -o)), { answers: { massage: 'done' as const } }]));

  it('counts a streak, and today not done yet never breaks it', () => {
    expect(streak(activeDays([0, 1, 2]), THU)).toBe(3);
    expect(streak(activeDays([1, 2, 3]), THU)).toBe(3);
    expect(streak({}, THU)).toBe(0);
  });

  it('forgives one missed day per week, not two', () => {
    expect(streak(activeDays([0, 1, 3, 4]), THU)).toBe(4); // missed day 2
    expect(streak(activeDays([0, 2, 4, 5]), THU)).toBe(2); // two misses within a week
    expect(streak(activeDays([0, 1, 3, 4, 5, 6, 7, 8, 9, 11, 12]), THU)).toBe(11); // misses 8 days apart
  });

  it('measures adherence over medication days answered', () => {
    let b: LogBook = {};
    for (let i = 0; i < 4; i++) b = answer(b, dayKey(addDays(THU, -i)), 'finasteride', i === 2 ? 'skipped' : 'done');
    expect(adherence(b, THU, ['finasteride'])).toBe(0.75);
    expect(adherence(b, THU, [])).toBeUndefined();
    expect(adherence({}, THU, ['finasteride'])).toBeUndefined();
  });

  it('no guilt: the missed-dose note shows only when yesterday was opened and a dose was not taken', () => {
    const y = dayKey(addDays(THU, -1));
    expect(missedYesterday({}, THU, ['finasteride'])).toBe(false);
    expect(missedYesterday(answer({}, y, 'massage', 'done'), THU, ['finasteride'])).toBe(true);
    expect(missedYesterday(answer({}, y, 'finasteride', 'done'), THU, ['finasteride'])).toBe(false);
    expect(missedYesterday(answer({}, y, 'massage', 'done'), THU, [])).toBe(false);
  });
});

describe('scalp massage', () => {
  it('is a 4-minute routine in six steps, with a 2-minute quick version', () => {
    expect(ROUTINE).toHaveLength(6);
    expect(totalSeconds(ROUTINE)).toBe(240);
    expect(totalSeconds(routineFor('quick'))).toBeLessThanOrEqual(130);
  });

  it('the minoxidil version spreads the product instead of pinch-and-lift', () => {
    expect(routineFor('full').find((s) => s.title === 'Top')!.movement).toMatch(/pinch-and-lift/);
    expect(routineFor('minoxidil').find((s) => s.title === 'Top')!.movement).not.toMatch(/pinch/);
  });

  it('knows which step is running', () => {
    expect(stepAt(ROUTINE, 0)).toEqual({ index: 0, left: 30 });
    expect(stepAt(ROUTINE, 31)).toEqual({ index: 1, left: 44 });
    expect(stepAt(ROUTINE, 240)).toBeNull();
    expect(mmss(75)).toBe('1:15');
  });
});

describe('reminders', () => {
  it('are off until turned on', () => {
    expect(reminderPlan(p(), DEFAULT_REMINDERS, THU)).toEqual([]);
  });

  it('never name a medication on the lock screen', () => {
    const plan = reminderPlan(p({ treatments: ['finasteride', 'minoxidil'] }), { ...DEFAULT_REMINDERS, enabled: true }, THU);
    expect(plan.map((r) => r.id)).toEqual(['morning', 'evening', 'scan']);
    for (const r of plan) expect(`${r.title} ${r.body}`).not.toMatch(/finasteride|minoxidil|dutasteride/i);
  });

  it('remind the day before a trial ends, as the paywall promises', () => {
    const profile = p({ subscription: { plan: 'annual', startedAt: THU.toISOString(), trialEndsAt: addDays(THU, 3).toISOString(), test: true } });
    const trial = reminderPlan(profile, { ...DEFAULT_REMINDERS, enabled: true }, THU).find((r) => r.id === 'trial');
    expect(trial?.trigger).toEqual({ type: 'date', date: addDays(THU, 2) });
  });
});
