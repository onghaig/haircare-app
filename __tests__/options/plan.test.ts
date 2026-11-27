import { answer, type LogBook } from '@/plan/log';
import { addDays, dayKey, type TaskId } from '@/plan/tasks';
import { biggestNudge, planByRole, planItems, shareDone, userPlan, weekStrip } from '@/options/plan';
import { emptyProfile, type Profile } from '@/profile/types';

const today = new Date(2026, 10, 26, 12);
const p = (o: Partial<Profile>): Profile => ({ ...emptyProfile(), age: 24, ...o });
/** Log a pattern for a task, oldest first, ending today: 1 done, 0 skipped, null blank. */
function log(book: LogBook, task: TaskId, pattern: (0 | 1 | null)[]): LogBook {
  let b = book;
  pattern.forEach((v, i) => {
    if (v == null) return;
    b = answer(b, dayKey(addDays(today, i - pattern.length + 1)), task, v ? 'done' : 'skipped');
  });
  return b;
}

describe('your plan from the log', () => {
  it('assumes most days for a medication before anything is logged, and leaves massage out', () => {
    const plan = userPlan(p({ treatments: ['minoxidil'] }), {}, today);
    expect(planItems(plan)).toEqual([{ option: 'minoxidil', adherence: 0.9 }]);
    expect(plan[0].source).toBe('assumed');
    expect(plan[0].role).toBe('grows');
  });

  it('uses the real share of days, to the nearest 5%', () => {
    let b = log({}, 'minoxidil', [1, 1, 0, 1, 1, 0, 1]);
    b = log(b, 'massage', [1, 0, 0, 1, 0, 0, 1]);
    const plan = userPlan(p({ treatments: ['minoxidil'] }), b, today);
    expect(planItems(plan)).toEqual([
      { option: 'minoxidil', adherence: 0.7 },
      { option: 'massage', adherence: 0.45 },
    ]);
  });

  it('a blank medication day is unknown, a blank massage day is not done', () => {
    let b = log({}, 'minoxidil', [1, null, 1, null]);
    b = log(b, 'massage', [1, null, null, null]);
    expect(shareDone(b, today, { task: 'minoxidil', kind: 'medication' })).toBe(1);
    expect(shareDone(b, today, { task: 'massage', kind: 'massage' })).toBe(0.25);
  });

  it('under-18s never get medication in their plan', () => {
    const b = log({}, 'massage', [1, 1]);
    expect(planItems(userPlan(p({ age: 16, treatments: ['minoxidil', 'finasteride'] }), b, today))).toEqual([{ option: 'massage', adherence: 1 }]);
  });

  it('splits the plan by what it does', () => {
    const plan = userPlan(p({ treatments: ['minoxidil', 'finasteride'] }), {}, today);
    const by = planByRole(plan);
    expect(by.slows.map((e) => e.option)).toEqual(['finasteride']);
    expect(by.grows.map((e) => e.option)).toEqual(['minoxidil']);
  });
});

describe('week strip and nudge', () => {
  it('shows the last 7 days, oldest first', () => {
    const b = log({}, 'minoxidil', [1, 1, 0, 1, 1, 0, 1]);
    expect(weekStrip(b, today, 'minoxidil')).toEqual([true, true, false, true, true, false, true]);
  });

  it('nudges the item where missed days cost the most', () => {
    let b = log({}, 'minoxidil', [1, 1, 0, 1, 1, 0, 1]);
    b = log(b, 'massage', [1, 1, 1, 1, 0, 1, 1]);
    const plan = userPlan(p({ treatments: ['minoxidil'] }), b, today);
    const n = biggestNudge(plan, b, today)!;
    expect(n.entry.option).toBe('minoxidil');
    expect(n.done).toBe(5);
    expect(n.text).toBe('You do minoxidil 5 of 7 days. It only works while you keep it up.');
  });

  it('a slowing option gets its own wording', () => {
    const b = log({}, 'finasteride', [1, 1, 1, 0, 1, 1, 1]);
    const n = biggestNudge(userPlan(p({ treatments: ['finasteride'] }), b, today), b, today)!;
    expect(n.text).toBe('You took finasteride 6 of the last 7 days. It slows loss best taken every day.');
  });

  it('says nothing when every day was done or nothing is logged', () => {
    const b = log({}, 'minoxidil', [1, 1, 1, 1, 1, 1, 1]);
    expect(biggestNudge(userPlan(p({ treatments: ['minoxidil'] }), b, today), b, today)).toBeNull();
    expect(biggestNudge(userPlan(p({ treatments: ['minoxidil'] }), {}, today), {}, today)).toBeNull();
  });
});
