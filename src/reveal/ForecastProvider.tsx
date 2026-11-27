import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ForecastModel, type Forecast } from '@/forecast';
import { adherence } from '@/plan/log';
import { usePlan } from '@/plan/PlanProvider';
import { dailyTasks } from '@/plan/tasks';
import { toForecastInput } from '@/profile/forecastInput';
import { useProfile } from '@/profile/ProfileProvider';
import { useOptionalScans } from '@/scan/ScanProvider';
import { estimateStage } from '@/scan/stageEstimate';

interface ForecastContextValue {
  /** Null while computing, or until the profile has an age. */
  forecast: Forecast | null;
}

const ForecastContext = createContext<ForecastContextValue | null>(null);

const YEARS = [1, 3, 5, 10, 15];

/**
 * Runs the on-device forecast whenever the profile's model inputs change. The work is deferred
 * off the render, and an unchanged input never re-runs it.
 */
export function ForecastProvider({ samples = 200_000, children }: { samples?: number; children: ReactNode }) {
  const { profile } = useProfile();
  const { book } = usePlan();
  const latest = useOptionalScans()?.latest;
  const scanStage = useMemo(() => estimateStage(latest, profile)?.stage ?? null, [latest, profile]);
  const input = useMemo(() => {
    const base = toForecastInput(profile, scanStage);
    if (!base) return null;
    // Daily check-ins scale the treatment effect (spec: adherence a in the projection).
    const now = new Date();
    const meds = dailyTasks(profile, now, []).filter((t) => t.kind === 'medication').map((t) => t.id);
    const a = adherence(book, now, meds);
    return a == null ? base : { ...base, adherence: Math.round(a * 20) / 20 };
  }, [profile, book, scanStage]);
  const key = input ? JSON.stringify(input) : null;
  const [result, setResult] = useState<{ key: string; forecast: Forecast } | null>(null);

  useEffect(() => {
    if (!key) return;
    let live = true;
    const t = setTimeout(() => {
      const forecast = new ForecastModel().forecast(JSON.parse(key), { years: YEARS, samples });
      if (live) setResult({ key, forecast });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, samples]);

  const value = useMemo(() => ({ forecast: result && result.key === key ? result.forecast : null }), [result, key]);
  return <ForecastContext.Provider value={value}>{children}</ForecastContext.Provider>;
}

export function useForecast(): ForecastContextValue {
  const v = useContext(ForecastContext);
  if (!v) throw new Error('useForecast must be used inside <ForecastProvider>');
  return v;
}
