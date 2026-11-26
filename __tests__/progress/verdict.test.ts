import { logQuick, answer, type LogBook } from '@/plan/log';
import { addDays, dayKey } from '@/plan/tasks';
import {
  adjustments,
  consistency,
  deltaLabel,
  explanations,
  latestReport,
  metricChanges,
  overallVerdict,
  reportSchedule,
  summarisePeriod,
  trendScans,
  versusForecast,
} from '@/progress/verdict';
import { emptyProfile } from '@/profile/types';

import { record } from '../../test-utils/scanFixtures';

const base = new Date('2026-09-01T09:00:00Z');
const at = (days: number) => addDays(base, days).toISOString();
const adult = { ...emptyProfile(), age: 30 };

describe('trend scans', () => {
  it('drops low-confidence scans and scans without numbers, oldest first', () => {
    const scans = trendScans([
      record('b', at(7)),
      record('low', at(3), { lowConfidence: true, quality: 50 }),
      record('none', at(5), { hairline: null }),
      record('a', at(0)),
    ]);
    expect(scans.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('overall verdict', () => {
  const b = record('b', at(0));
  it('calls small changes holding steady', () => {
    const now = record('n', at(60), { hairline: { centreMM: 70, leftTempleMM: 74, rightTempleMM: 75 } });
    expect(overallVerdict(metricChanges(b, now))).toBe('holding');
  });
  it('needs two points past the noise to call a loss', () => {
    const one = record('n', at(60), { hairline: { centreMM: 72, leftTempleMM: 71, rightTempleMM: 73 } });
    expect(overallVerdict(metricChanges(b, one))).toBe('holding');
    const two = record('n', at(60), { hairline: { centreMM: 72, leftTempleMM: 77, rightTempleMM: 73 } });
    expect(overallVerdict(metricChanges(b, two))).toBe('worse');
  });
  it('calls a gain only when nothing got worse', () => {
    const gain = record('n', at(60), { hairline: { centreMM: 64, leftTempleMM: 65, rightTempleMM: 73 } });
    expect(overallVerdict(metricChanges(b, gain))).toBe('better');
    const mixed = record('n', at(60), { hairline: { centreMM: 64, leftTempleMM: 65, rightTempleMM: 79 } });
    expect(overallVerdict(metricChanges(b, mixed))).toBe('holding');
  });
});

describe('report schedule', () => {
  const b = record('b', at(0));
  it('waits eight weeks, then reports every four', () => {
    expect(reportSchedule(b, addDays(base, 10))).toEqual({ due: null, next: addDays(base, 56), month: 2 });
    expect(reportSchedule(b, addDays(base, 56)).due).toEqual(addDays(base, 56));
    const later = reportSchedule(b, addDays(base, 90));
    expect(later).toEqual({ due: addDays(base, 84), next: addDays(base, 112), month: 3 });
  });
});

describe('the period', () => {
  function book(days: number, fill: (d: string, i: number, b: LogBook) => LogBook): LogBook {
    let b: LogBook = {};
    for (let i = 0; i < days; i++) b = fill(dayKey(addDays(base, 56 - i)), i, b);
    return b;
  }

  it('summarises massage, sleep, stress and shedding', () => {
    const b = book(28, (d, i, acc) => {
      let n = i % 2 ? answer(acc, d, 'massage', 'done') : acc;
      if (i < 10) n = logQuick(n, d, { shedding: i < 4 ? 'more' : 'normal', stress: 4, sleepHours: 5 });
      return n;
    });
    const s = summarisePeriod(b, addDays(base, 28), addDays(base, 56));
    expect(s).toEqual({ days: 28, massageDays: 14, logs: 10, avgSleep: 5, avgStress: 4, moreSheddingDays: 4 });
    const why = explanations('worse', s, 0.5, adult, 56);
    expect(why.join(' ')).toMatch(/about 50% of days/);
    expect(why.join(' ')).toMatch(/Stress was high/);
    expect(why.join(' ')).toMatch(/under 6 hours/);
    expect(why.join(' ')).toMatch(/more shedding/);
  });

  it('never diagnoses and says so when nothing stands out', () => {
    const s = { days: 28, massageDays: 28, logs: 10, avgSleep: 8, avgStress: 1, moreSheddingDays: 0 };
    expect(explanations('holding', s, 1, adult, 56)).toEqual(['Nothing in your log stands out. Keep going as you are.']);
    expect(explanations('holding', s, undefined, { ...adult, treatments: ['minoxidil'] }, 56)[0]).toMatch(/4 to 6 months/);
  });

  it('points under-18s to a parent and a doctor, not a prescription', () => {
    const s = { days: 28, massageDays: 28, logs: 10, moreSheddingDays: 0 };
    expect(adjustments('worse', s, undefined, { ...adult, age: 16 }).join(' ')).toMatch(/parent and a doctor/);
    expect(adjustments('worse', s, undefined, adult).join(' ')).toMatch(/dermatologist/);
    expect(adjustments('holding', s, undefined, adult).join(' ')).not.toMatch(/dermatologist/);
  });

  it('tracks treatment, or plan days when there is none', () => {
    const today = addDays(base, 56);
    const b = book(30, (d, i, acc) => answer(acc, d, 'finasteride', i % 4 ? 'done' : 'skipped'));
    expect(consistency(b, today, ['finasteride']).share).toBeCloseTo(0.73, 1);
    expect(consistency(b, today, []).label).toBe('Days on plan');
  });
});

describe('latest report', () => {
  const scans = [record('a', at(0)), record('b', at(50), { hairline: { centreMM: 69, leftTempleMM: 71, rightTempleMM: 74 } })];
  it('is null before the first verdict or without a second scan', () => {
    expect(latestReport(scans, {}, adult, [], addDays(base, 40))).toBeNull();
    expect(latestReport(scans.slice(0, 1), {}, adult, [], addDays(base, 60))).toBeNull();
  });
  it('compares the baseline with the latest good scan', () => {
    const r = latestReport(scans, {}, adult, [], addDays(base, 60))!;
    expect(r.month).toBe(2);
    expect(r.verdict).toBe('holding');
    expect(r.latest.id).toBe('b');
    expect(r.versusForecast).toBe(versusForecast('holding'));
    expect(r.adjustments.at(-1)).toMatch(/Keep scanning weekly/);
  });
  it('follows deleted scans: no baseline, a new baseline, or an earlier latest', () => {
    const three = [...scans, record('c', at(57), { hairline: { centreMM: 74, leftTempleMM: 77, rightTempleMM: 78 } })];
    const now = addDays(base, 60);
    expect(latestReport(three, {}, adult, [], now)!.latest.id).toBe('c');
    // Latest deleted: the report falls back to the one before.
    expect(latestReport(three.filter((r) => r.id !== 'c'), {}, adult, [], now)!.latest.id).toBe('b');
    // Baseline deleted: the next oldest is the baseline, so the eight weeks start again from it.
    const noBase = three.filter((r) => r.id !== 'a');
    expect(trendScans(noBase)[0].id).toBe('b');
    expect(latestReport(noBase, {}, adult, [], now)).toBeNull();
    // Everything deleted: nothing to report.
    expect(latestReport([], {}, adult, [], now)).toBeNull();
  });
});

it('rounds changes to whole millimetres', () => {
  expect(deltaLabel(4.6)).toBe('5 mm higher');
  expect(deltaLabel(-3.8)).toBe('4 mm lower');
  expect(deltaLabel(0.2)).toBe('no change');
});
