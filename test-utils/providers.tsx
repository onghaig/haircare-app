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
import { AiPreviewProvider } from '@/visualize/AiPreviewProvider';
import type { PreviewStore } from '@/visualize/cache';
import type { PreviewProvider } from '@/visualize/provider';

export interface Seed {
  profile?: Partial<Profile>;
  scans?: ScanRecord[];
  log?: LogBook;
  /** AI preview service stand-ins. Without them there's no service, as when none is deployed. */
  ai?: { provider?: PreviewProvider | null; store?: PreviewStore; prepare?: (uri: string) => Promise<string> };
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
            <AiPreviewProvider provider={seed.ai?.provider ?? null} store={seed.ai?.store ?? new MemoryPreviewStore()} prepare={seed.ai?.prepare ?? (async () => 'UEhPVE8=')}>
              <ScanProvider store={stores.scans}>{ui}</ScanProvider>
            </AiPreviewProvider>
          </ForecastProvider>
        </PlanProvider>
      </ProfileProvider>
    </PurchasesProvider>
  );
  return { stores, wrap };
}

/** Previews kept in memory, keyed like the file store. */
export class MemoryPreviewStore implements PreviewStore {
  files = new Map<string, string>();
  get(key: string) {
    return this.files.has(key) ? `file:///ai-previews/${key}.png` : null;
  }
  async put(key: string, imageBase64: string) {
    this.files.set(key, imageBase64);
    return `file:///ai-previews/${key}.png`;
  }
  removeForScan(scanId: string) {
    for (const k of [...this.files.keys()]) if (k.startsWith(`${scanId}-`)) this.files.delete(k);
  }
  removeAll() {
    this.files.clear();
  }
}
