import type { ReactNode } from 'react';

import { PurchasesProvider } from '@/paywall/PurchasesProvider';
import type { LogBook } from '@/plan/log';
import { MemoryLogStore } from '@/plan/log';
import { PlanProvider } from '@/plan/PlanProvider';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile, type Profile } from '@/profile/types';
import { ForecastProvider } from '@/reveal/ForecastProvider';
import { ScanProvider } from '@/scan/ScanProvider';
import type { ScanRecord } from '@/scan/session';
import { MemoryScanStore } from '@/scan/store';

export interface Seed {
  profile?: Partial<Profile>;
  scans?: ScanRecord[];
  log?: LogBook;
}

/** Every app provider with in-memory stores, as the root layout nests them. */
export function makeProviders(seed: Seed = {}) {
  const stores = {
    profile: new MemoryProfileStore({ ...emptyProfile(), ...seed.profile }),
    scans: new MemoryScanStore(seed.scans ?? []),
    log: new MemoryLogStore(seed.log ?? {}),
  };
  const wrap = (ui: ReactNode) => (
    <PurchasesProvider>
      <ProfileProvider store={stores.profile}>
        <PlanProvider store={stores.log}>
          <ForecastProvider samples={3000}>
            <ScanProvider store={stores.scans}>{ui}</ScanProvider>
          </ForecastProvider>
        </PlanProvider>
      </ProfileProvider>
    </PurchasesProvider>
  );
  return { stores, wrap };
}
