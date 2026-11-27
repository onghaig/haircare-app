import { useMemo } from 'react';

import { useProfile } from '@/profile/ProfileProvider';
import { useForecast } from '@/reveal/ForecastProvider';
import { useScans } from '@/scan/ScanProvider';
import { estimateStage } from '@/scan/stageEstimate';

/** Today's stage: the scan's estimate, else the forecast's, else a full hairline. */
export function useCurrentStage(): { stage: number; measured: boolean } {
  const { profile } = useProfile();
  const { latest } = useScans();
  const { forecast } = useForecast();
  return useMemo(() => {
    const est = estimateStage(latest, profile);
    if (est) return { stage: est.stage, measured: true };
    return { stage: forecast ? Math.round(forecast.stageNow.p50 * 2) / 2 : 1, measured: false };
  }, [latest, profile, forecast]);
}
