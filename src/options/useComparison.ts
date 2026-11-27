import { useEffect, useMemo, useState } from 'react';

import { ForecastModel, type Forecast, type PlanItem } from '@/forecast';
import { HEADLINE_YEARS, WHAT_IF_SAMPLES } from '@/predict/predict';
import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';

import { optionPlan, visibleOptions, type CatalogId } from './catalog';

/**
 * Every counted option the user can see, each tried on its own and taken most days, run on the
 * same simulated people as "do nothing". Off the render; null while computing or when disabled.
 */
export function useComparison(enabled = true, only?: CatalogId): Forecast | null {
  const { profile } = useProfile();
  const { input, samples } = useForecast();
  const paths = useMemo(() => {
    const out: Record<string, PlanItem[]> = {};
    for (const o of visibleOptions(profile)) if (o.items.length && (!only || o.id === only)) out[o.id] = optionPlan(o);
    return out;
  }, [profile, only]);
  const n = Math.min(WHAT_IF_SAMPLES, samples);
  const key = enabled && input ? JSON.stringify({ input, paths, n }) : null;
  const [result, setResult] = useState<{ key: string; forecast: Forecast } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const t = setTimeout(() => {
      const { input: u, paths: p, n: count } = JSON.parse(key);
      const forecast = new ForecastModel().forecast(u, { years: [1, HEADLINE_YEARS], samples: count, paths: p });
      if (live) setResult({ key, forecast });
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  return result && result.key === key ? result.forecast : null;
}
