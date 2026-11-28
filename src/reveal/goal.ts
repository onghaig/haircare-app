import type { Goal } from '@/profile/types';

/**
 * What the person said they want most, carried into the reveal, the paywall and Today
 * (spec: the goal "shapes plan tone and paywall messaging"). Null fields keep the default copy.
 */
export interface GoalCopy {
  /** One line under today's stage on the reveal. */
  sentence: string | null;
  /** The reveal's main button. */
  cta: string | null;
  /** Paywall headline. */
  headline: string | null;
  /** Paywall benefits, in order. */
  benefits: string[] | null;
  /** The line under the forecast card on Today. */
  today: string | null;
}

const NONE: GoalCopy = { sentence: null, cta: null, headline: null, benefits: null, today: null };

export function goalCopy(goal: Goal | undefined, lowRisk: boolean): GoalCopy {
  switch (goal) {
    case 'keep':
      return {
        ...NONE,
        sentence: lowRisk ? null : 'Goal: keep what you have.',
        headline: 'Keep what you have',
        benefits: [
          'Weekly scans that catch change early',
          'You vs your forecast, every month',
          'Year-by-year forecast to age 50',
          'Your daily plan, adjusted monthly',
        ],
        today: null,
      };
    case 'regrow':
      return {
        ...NONE,
        sentence: 'Goal: regrow.',
        headline: 'See what’s working',
        benefits: [
          'Monthly before and after, measured the same way',
          'You vs your forecast, every month',
          'What each option is likely to change',
          'Your daily plan, adjusted monthly',
        ],
        today: 'Results show at 6 to 12 months.',
      };
    case 'know':
      return {
        ...NONE,
        sentence: null,
        cta: lowRisk ? null : 'See your full forecast',
        headline: 'See where your hair is heading',
        benefits: [
          'Year-by-year forecast to age 50',
          'Family breakdown for every relative',
          'Your forecast, refreshed every month',
          'Weekly scans that catch change early',
        ],
        today: null,
      };
    case 'shave':
      return {
        ...NONE,
        sentence: null,
        cta: 'See your forecast and options',
        headline: 'Decide with the full picture',
        benefits: [
          'Year-by-year forecast',
          'You vs your forecast, every month',
          'Your options and odds',
          'Weekly scans if you want to keep watching',
        ],
        today: null,
      };
    default:
      return NONE;
  }
}
