import { Directory, File, Paths } from 'expo-file-system';

import { addDays, dayKey, type TaskId } from './tasks';

export type Answer = 'done' | 'skipped';
export type Shedding = 'less' | 'normal' | 'more';

export interface QuickLog {
  shedding: Shedding;
  /** 1 (calm) to 5 (very stressed). */
  stress: number;
  sleepHours: number;
}

export interface DayLog {
  answers: Partial<Record<TaskId, Answer>>;
  quick?: QuickLog;
}

export type LogBook = Record<string, DayLog>;

export interface LogStore {
  load(): Promise<LogBook>;
  save(book: LogBook): Promise<void>;
}

export class MemoryLogStore implements LogStore {
  constructor(private book: LogBook = {}) {}
  async load() {
    return this.book;
  }
  async save(book: LogBook) {
    this.book = book;
  }
}

export class FileLogStore implements LogStore {
  private readonly root = new Directory(Paths.document, 'plan');
  private readonly file = new File(this.root, 'log.json');
  async load(): Promise<LogBook> {
    if (!this.file.exists) return {};
    try {
      return JSON.parse(this.file.textSync()) as LogBook;
    } catch {
      return {};
    }
  }
  async save(book: LogBook) {
    if (!this.root.exists) this.root.create({ intermediates: true });
    // Synchronous: the async write sometimes never settled on the iOS simulator.
    this.file.writeSync(JSON.stringify(book));
  }
}

export function answer(book: LogBook, day: string, task: TaskId, a: Answer | undefined): LogBook {
  const prev = book[day] ?? { answers: {} };
  const answers = { ...prev.answers };
  if (a) answers[task] = a;
  else delete answers[task];
  return { ...book, [day]: { ...prev, answers } };
}

export function logQuick(book: LogBook, day: string, quick: QuickLog): LogBook {
  const prev = book[day] ?? { answers: {} };
  return { ...book, [day]: { quick, answers: { ...prev.answers, quickLog: 'done' } } };
}

/** Done tasks out of today's list (skips count as answered but not done). */
export function progress(book: LogBook, day: string, taskIds: TaskId[]): { done: number; total: number } {
  const a = book[day]?.answers ?? {};
  return { done: taskIds.filter((t) => a[t] === 'done').length, total: taskIds.length };
}

/** A day counts towards the streak when anything on the plan was done. */
function active(book: LogBook, day: string): boolean {
  return Object.values(book[day]?.answers ?? {}).includes('done');
}

/**
 * Consecutive active days up to today. No guilt: a streak survives one missed day per week
 * (spec), and today not being done yet never breaks it.
 */
export function streak(book: LogBook, today: Date): number {
  let count = 0;
  let lastMiss: number | null = null;
  const start = active(book, dayKey(today)) ? 0 : 1;
  for (let i = start; i < 400; i++) {
    if (active(book, dayKey(addDays(today, -i)))) {
      count++;
      continue;
    }
    // One forgiven miss per 7 days, and only between two active days.
    const forgivable = count > 0 && (lastMiss == null || i - lastMiss >= 7) && active(book, dayKey(addDays(today, -i - 1)));
    if (!forgivable) break;
    lastMiss = i;
  }
  return count;
}

/** Share of medication days answered "done" over the last `days` days (feeds the forecast). */
export function adherence(book: LogBook, today: Date, medIds: TaskId[], days = 28): number | undefined {
  if (medIds.length === 0) return undefined;
  let answered = 0;
  let done = 0;
  for (let i = 0; i < days; i++) {
    const a = book[dayKey(addDays(today, -i))]?.answers ?? {};
    for (const m of medIds) {
      if (a[m]) answered++;
      if (a[m] === 'done') done++;
    }
  }
  return answered === 0 ? undefined : done / answered;
}

/** "Missed yesterday? Just take today's dose as usual." Shown only when a medication was skipped or left blank. */
export function missedYesterday(book: LogBook, today: Date, medIds: TaskId[]): boolean {
  if (medIds.length === 0) return false;
  const y = book[dayKey(addDays(today, -1))];
  if (!y) return false; // a new user, or the app wasn't opened: no nagging
  return medIds.some((m) => y.answers[m] !== 'done');
}
