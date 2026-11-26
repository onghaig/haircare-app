import { PLANS, trialEnd, type PlanId } from './plans';

export interface Subscription {
  plan: PlanId;
  startedAt: string;
  trialEndsAt: string | null;
  /** True when no real payment happened (test purchases, before StoreKit is connected). */
  test: boolean;
}

/**
 * Where purchases go. Screens talk to this interface only, so StoreKit (or RevenueCat) slots in
 * later without touching them. Until the App Store products exist, the test service grants the
 * subscription on the device and never charges.
 */
export interface PurchaseService {
  readonly isTest: boolean;
  purchase(plan: PlanId, now: Date): Promise<Subscription>;
}

export class TestPurchaseService implements PurchaseService {
  readonly isTest = true;

  async purchase(plan: PlanId, now: Date): Promise<Subscription> {
    const end = trialEnd(PLANS[plan], now);
    return { plan, startedAt: now.toISOString(), trialEndsAt: end ? end.toISOString() : null, test: true };
  }
}

/** Premium while subscribed. (Expiry and cancellation come with StoreKit.) */
export function isPremium(profile: { subscription?: Subscription }): boolean {
  return !!profile.subscription;
}
