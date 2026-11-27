import { createContext, useContext, useState, type ReactNode } from 'react';

import { TestPurchaseService, type PurchaseService } from './purchases';

const PurchasesContext = createContext<PurchaseService | null>(null);

export function PurchasesProvider({ service, children }: { service?: PurchaseService; children: ReactNode }) {
  const [s] = useState<PurchaseService>(() => service ?? new TestPurchaseService());
  return <PurchasesContext.Provider value={s}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): PurchaseService {
  const v = useContext(PurchasesContext);
  if (!v) throw new Error('usePurchases must be used inside <PurchasesProvider>');
  return v;
}
