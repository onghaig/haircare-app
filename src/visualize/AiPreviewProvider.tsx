import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { FilePreviewStore, preparePhoto, type PreviewStore } from './cache';
import { createPreviewProvider, type PreviewProvider } from './provider';

interface AiPreviewServices {
  provider: PreviewProvider | null;
  store: PreviewStore;
  prepare(uri: string): Promise<string>;
}

const Ctx = createContext<AiPreviewServices | null>(null);

/** The real services by default; tests and stories pass stand-ins. */
export function AiPreviewProvider({ children, ...over }: Partial<AiPreviewServices> & { children: ReactNode }) {
  const { provider, store, prepare } = over;
  const value = useMemo<AiPreviewServices>(
    () => ({
      provider: provider === undefined ? createPreviewProvider() : provider,
      store: store ?? new FilePreviewStore(),
      prepare: prepare ?? preparePhoto,
    }),
    [provider, store, prepare],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Outside a provider (older screens, tests): no AI service, so the drawing shows. */
const NONE: AiPreviewServices = {
  provider: null,
  store: { get: () => null, put: async () => '', removeForScan: () => {}, removeAll: () => {} },
  prepare: async () => '',
};

export function useAiPreviewServices(): AiPreviewServices {
  return useContext(Ctx) ?? NONE;
}
