import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { FileDraftStore, isDraftFresh, type DraftStore, type ScanDraft } from './draft';
import type { ScanRecord } from './session';
import { baselineOf, FileScanStore, latestOf, type ScanStore } from './store';

interface ScanContextValue {
  records: ScanRecord[];
  loaded: boolean;
  baseline?: ScanRecord;
  latest?: ScanRecord;
  save(record: ScanRecord): Promise<ScanRecord>;
  remove(id: string): Promise<void>;
  /** A scan left part-way in the last day, or null. */
  draft: ScanDraft | null;
  saveDraft(d: ScanDraft): Promise<void>;
  clearDraft(): Promise<void>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({
  store,
  drafts,
  children,
}: {
  store?: ScanStore;
  drafts?: DraftStore;
  children: ReactNode;
}) {
  const [s] = useState<ScanStore>(() => store ?? new FileScanStore());
  const [d] = useState<DraftStore>(() => drafts ?? new FileDraftStore());
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ScanDraft | null>(null);

  useEffect(() => {
    let live = true;
    d.load().then((x) => {
      if (!live) return;
      if (isDraftFresh(x, new Date())) setDraft(x);
      else if (x) void d.clear();
    });
    return () => {
      live = false;
    };
  }, [d]);

  const saveDraft = useCallback(
    async (x: ScanDraft) => {
      await d.save(x);
      setDraft(await d.load());
    },
    [d],
  );

  const clearDraft = useCallback(async () => {
    await d.clear();
    setDraft(null);
  }, [d]);

  useEffect(() => {
    let live = true;
    s.list().then((r) => {
      if (live) {
        setRecords(r);
        setLoaded(true);
      }
    });
    return () => {
      live = false;
    };
  }, [s]);

  const save = useCallback(
    async (record: ScanRecord) => {
      const saved = await s.save(record);
      setRecords(await s.list());
      return saved;
    },
    [s],
  );

  const remove = useCallback(
    async (id: string) => {
      await s.remove(id);
      setRecords(await s.list());
    },
    [s],
  );

  const value = useMemo(
    () => ({
      records,
      loaded,
      baseline: baselineOf(records),
      latest: latestOf(records),
      save,
      remove,
      draft,
      saveDraft,
      clearDraft,
    }),
    [records, loaded, save, remove, draft, saveDraft, clearDraft],
  );
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

/** The scans, or null outside a ScanProvider (for providers that can work without them). */
export function useOptionalScans(): ScanContextValue | null {
  return useContext(ScanContext);
}

export function useScans(): ScanContextValue {
  const v = useContext(ScanContext);
  if (!v) throw new Error('useScans must be used inside <ScanProvider>');
  return v;
}
