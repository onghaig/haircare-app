/** Plans and prices (spec: pricing, to be A/B tested). Configuration, not logic. */
export type PlanId = 'annual' | 'weekly' | 'monthly';

export interface Plan {
  id: PlanId;
  label: string;
  priceUSD: number;
  period: 'year' | 'week' | 'month';
  trialDays: number;
  /** Shown only under "More options". */
  hidden?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  annual: { id: 'annual', label: 'Annual', priceUSD: 49.99, period: 'year', trialDays: 3 },
  weekly: { id: 'weekly', label: 'Weekly', priceUSD: 6.99, period: 'week', trialDays: 0 },
  monthly: { id: 'monthly', label: 'Monthly', priceUSD: 12.99, period: 'month', trialDays: 0, hidden: true },
};

export const DEFAULT_PLAN: PlanId = 'annual';

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** Price per week, for the annual plan's anchor ("$0.96 a week"). Rounded down to the cent. */
export function weeklyEquivalent(plan: Plan): number {
  const weeks = plan.period === 'year' ? 52 : plan.period === 'month' ? 52 / 12 : 1;
  return Math.floor((plan.priceUSD / weeks) * 100) / 100;
}

export function trialEnd(plan: Plan, from: Date): Date | null {
  return plan.trialDays > 0 ? new Date(from.getTime() + plan.trialDays * 86_400_000) : null;
}

/** "29 Nov": the day the trial ends, stated plainly on the paywall. */
export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function planLine(plan: Plan): string {
  if (plan.trialDays > 0) return `${plan.trialDays} days free, then billed ${plan.period === 'year' ? 'yearly' : plan.period === 'month' ? 'monthly' : 'weekly'}`;
  return 'No trial';
}

/** The billed price, the most prominent price on the paywall (App Store guideline 3.1.2). */
export function billedLabel(plan: Plan): { price: string; per: string } {
  return { price: usd(plan.priceUSD), per: { year: '/yr', month: '/mo', week: '/wk' }[plan.period] };
}

/** Secondary line under the billed price: the weekly equivalent, for longer plans. */
export function equivalentLabel(plan: Plan): string | null {
  return plan.period === 'week' ? null : `about ${usd(weeklyEquivalent(plan))} a week`;
}

/** What happens when the trial ends, in words, under the button. */
export function trialLine(plan: Plan, end: Date | null): string {
  return end
    ? `Free until ${shortDate(end)}, then ${usd(plan.priceUSD)} a ${plan.period}. We'll remind you the day before. Cancel any time in Settings.`
    : `${usd(plan.priceUSD)} a ${plan.period}. Cancel any time in Settings.`;
}

/**
 * Terms of use: Apple's standard licence agreement until our own is published. Privacy opens the
 * in-app privacy page. Both must be on the paywall (App Store guideline 3.1.2).
 */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export function ctaLabel(plan: Plan): string {
  return plan.trialDays > 0 ? `Start ${plan.trialDays}-day free trial` : `Subscribe for ${usd(plan.priceUSD)} a ${plan.period}`;
}
