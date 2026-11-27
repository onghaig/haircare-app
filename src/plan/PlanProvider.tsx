import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { FileLogStore, type LogBook, type LogStore } from './log';

interface PlanContextValue {
  book: LogBook;
  loaded: boolean;
  change(fn: (b: LogBook) => LogBook): Promise<void>;
}

const PlanContext = createContext<PlanContextValue | null>(null);

/** The daily log. Like the profile, every change queues behind the first load. */
export function PlanProvider({ store, children }: { store?: LogStore; children: ReactNode }) {
  const [s] = useState<LogStore>(() => store ?? new FileLogStore());
  const [book, setBook] = useState<LogBook>({});
  const [loaded, setLoaded] = useState(false);
  const chain = useRef<Promise<LogBook> | null>(null);
  const after = useCallback(() => (chain.current ??= s.load().catch(() => ({}))), [s]);

  useEffect(() => {
    let live = true;
    void after().then((b) => {
      if (!live) return;
      setBook(b);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [after]);

  const change = useCallback(
    async (fn: (b: LogBook) => LogBook) => {
      const next = after().then(async (b) => {
        const n = fn(b);
        setBook(n);
        try {
          await s.save(n);
        } catch {
          // Keep it in memory; the next change saves again.
        }
        return n;
      });
      chain.current = next;
      await next;
    },
    [after, s],
  );

  const value = useMemo(() => ({ book, loaded, change }), [book, loaded, change]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const v = useContext(PlanContext);
  if (!v) throw new Error('usePlan must be used inside <PlanProvider>');
  return v;
}
