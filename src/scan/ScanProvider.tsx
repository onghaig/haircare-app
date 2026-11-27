import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ScanRecord } from './session';
import { useAiPreviewServices } from '@/visualize/AiPreviewProvider';

import { baselineOf, FileScanStore, latestOf, type ScanStore } from './store';

interface ScanContextValue {
  records: ScanRecord[];
  loaded: boolean;
  baseline?: ScanRecord;
  latest?: ScanRecord;
  save(record: ScanRecord): Promise<ScanRecord>;
  remove(id: string): Promise<void>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ store, children }: { store?: ScanStore; children: ReactNode }) {
  const [s] = useState<ScanStore>(() => store ?? new FileScanStore());
  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const previews = useAiPreviewServices().store;

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
      // AI previews made from this scan's photo go with it.
      previews.removeForScan(id);
      setRecords(await s.list());
    },
    [s, previews],
  );

  const value = useMemo(
    () => ({ records, loaded, baseline: baselineOf(records), latest: latestOf(records), save, remove }),
    [records, loaded, save, remove],
  );
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScans(): ScanContextValue {
  const v = useContext(ScanContext);
  if (!v) throw new Error('useScans must be used inside <ScanProvider>');
  return v;
}
