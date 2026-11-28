import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { isHeadMapAvailable } from '@modules/headmap';

import { FileDraftStore, isDraftFresh, type DraftStore, type ScanDraft } from './draft';
import type { HairAnalysis } from './hairAnalysis';
import { analyseScanHair, needsHairAnalysis } from './hairRunner';
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
  /** Read this scan's hair now (a screen showing it asks). Scans saved earlier are read on their own. */
  requestHairRead(id: string): void;
  /** A scan left part-way in the last day, or null. */
  draft: ScanDraft | null;
  saveDraft(d: ScanDraft): Promise<void>;
  clearDraft(): Promise<void>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

/**
 * Hair is read when a screen asks for it (after this short wait), or, for scans already saved
 * when the app opened, after the longer wait. A scan just taken is not read on its own: the
 * finish moment and the forecast reveal right after it need the phone to themselves.
 */
export const HAIR_READ_DELAY_MS = 800;
export const HAIR_READ_STARTUP_DELAY_MS = 10_000;

export function ScanProvider({
  store,
  drafts,
  readHair,
  children,
}: {
  store?: ScanStore;
  drafts?: DraftStore;
  /** Reads hair quality from a scan's photos. Defaults to the on-device reader where the scan module exists. */
  readHair?: ((scan: ScanRecord) => Promise<HairAnalysis | null>) | null;
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

  // Reads hair quality for saved scans that don't have it yet, one at a time, in the background.
  // The result is saved on the scan, so the stage estimate and forecast pick it up.
  const reader = readHair === undefined ? (isHeadMapAvailable ? analyseScanHair : null) : readHair;
  const tried = useRef(new Set<string>());
  // Scans that may be read: those there at startup, and any a screen asked for.
  const eligible = useRef(new Map<string, number>());
  const [asked, setAsked] = useState(0);
  const requestHairRead = useCallback((id: string) => {
    if (eligible.current.get(id) === HAIR_READ_DELAY_MS) return;
    eligible.current.set(id, HAIR_READ_DELAY_MS);
    setAsked((n) => n + 1);
  }, []);
  const seeded = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded || !reader || busy.current) return;
    if (!seeded.current) {
      seeded.current = true;
      for (const r of records) if (!eligible.current.has(r.id)) eligible.current.set(r.id, HAIR_READ_STARTUP_DELAY_MS);
    }
    const attempted = tried.current;
    const wait = eligible.current;
    const next = records.find((r) => wait.has(r.id) && !attempted.has(r.id) && needsHairAnalysis(r));
    if (!next) return;
    attempted.add(next.id);
    busy.current = true;
    let started = false;
    const t = setTimeout(async () => {
      started = true;
      try {
        const hair = await reader(next);
        if (!hair || !mounted.current) return;
        // Save onto the current copy, and only if its photos are still the ones that were read.
        const current = (await s.list()).find((r) => r.id === next.id);
        const same = current && JSON.stringify(current.views) === JSON.stringify(next.views);
        if (!same) return;
        await s.save({ ...current, hair });
      } catch {
        // Hair quality is a bonus: a failure leaves the scan as it was.
      } finally {
        busy.current = false;
        // Show the result, and look for the next scan that needs reading.
        if (mounted.current) setRecords(await s.list());
      }
    }, wait.get(next.id) ?? HAIR_READ_STARTUP_DELAY_MS);
    return () => {
      // A read already under way finishes and saves; one still waiting is put back.
      if (started) return;
      clearTimeout(t);
      busy.current = false;
      attempted.delete(next.id);
    };
  }, [loaded, records, reader, s, asked]);

  const value = useMemo(
    () => ({
      records,
      loaded,
      baseline: baselineOf(records),
      latest: latestOf(records),
      save,
      remove,
      requestHairRead,
      draft,
      saveDraft,
      clearDraft,
    }),
    [records, loaded, save, remove, requestHairRead, draft, saveDraft, clearDraft],
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
