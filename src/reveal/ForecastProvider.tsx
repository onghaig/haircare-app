import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ForecastModel, type Forecast } from '@/forecast';
import { toForecastInput } from '@/profile/forecastInput';
import { useProfile } from '@/profile/ProfileProvider';

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
  const input = useMemo(() => toForecastInput(profile), [profile]);
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
