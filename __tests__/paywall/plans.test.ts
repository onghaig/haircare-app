import { ctaLabel, planLine, PLANS, shortDate, trialEnd, weeklyEquivalent } from '@/paywall/plans';
import { isPremium, TestPurchaseService } from '@/paywall/purchases';

describe('plans', () => {
  it('anchors the annual plan at its weekly price, rounded down', () => {
    expect(weeklyEquivalent(PLANS.annual)).toBe(0.96);
    expect(weeklyEquivalent(PLANS.weekly)).toBe(6.99);
  });

  it('states the trial plainly, with its end date', () => {
    expect(planLine(PLANS.annual)).toBe('3 days free, then $49.99 a year');
    expect(planLine(PLANS.weekly)).toBe('No trial');
    const end = trialEnd(PLANS.annual, new Date('2026-11-26T12:00:00Z'))!;
    expect(shortDate(end)).toBe('29 Nov');
    expect(trialEnd(PLANS.weekly, new Date())).toBeNull();
  });

  it('names the button after what happens', () => {
    expect(ctaLabel(PLANS.annual)).toBe('Start free trial');
    expect(ctaLabel(PLANS.weekly)).toBe('Subscribe for $6.99 a week');
  });

  it('keeps monthly under "More options"', () => {
    expect(PLANS.monthly.hidden).toBe(true);
  });
});

describe('test purchases', () => {
  it('grants a test subscription with the trial end, and never charges', async () => {
    const s = new TestPurchaseService();
    expect(s.isTest).toBe(true);
    const sub = await s.purchase('annual', new Date('2026-11-26T12:00:00Z'));
    expect(sub).toEqual({ plan: 'annual', startedAt: '2026-11-26T12:00:00.000Z', trialEndsAt: '2026-11-29T12:00:00.000Z', test: true });
    expect((await s.purchase('weekly', new Date())).trialEndsAt).toBeNull();
    expect(isPremium({ subscription: sub })).toBe(true);
    expect(isPremium({})).toBe(false);
  });
});
