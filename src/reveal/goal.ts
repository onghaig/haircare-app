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
        sentence: lowRisk ? null : 'Your goal is to keep what you have. Catching change early is what makes that work.',
        headline: 'Keep what you have',
        benefits: [
          'Weekly scans that catch change early',
          'You vs your forecast, every month',
          'Year-by-year forecast to age 50',
          'Your daily plan, adjusted monthly',
        ],
        today: 'Your goal: keep what you have. The monthly verdict says whether you are.',
      };
    case 'regrow':
      return {
        ...NONE,
        sentence: 'Your goal is to regrow. Your scans will show what’s working, month by month.',
        headline: 'See what’s working',
        benefits: [
          'Monthly before and after, measured the same way',
          'You vs your forecast, every month',
          'What each option is likely to change',
          'Your daily plan, adjusted monthly',
        ],
        today: 'Your goal: regrow. Results show at 6 to 12 months, so steady days matter most.',
      };
    case 'know':
      return {
        ...NONE,
        sentence: 'You want to know where it’s heading. Here’s the honest version, as a range.',
        cta: lowRisk ? null : 'See your full forecast',
        headline: 'See where your hair is heading',
        benefits: [
          'Year-by-year forecast to age 50',
          'Family breakdown for every relative',
          'Your forecast, refreshed every month',
          'Weekly scans that catch change early',
        ],
        today: 'Your forecast updates after every monthly verdict.',
      };
    case 'shave':
      return {
        ...NONE,
        sentence: 'You’re thinking of shaving it. Plenty of people own it and never look back.',
        cta: 'See your forecast and options',
        headline: 'Decide with the full picture',
        benefits: [
          'Year-by-year forecast, so you can choose your timing',
          'You vs your forecast, every month',
          'Your options, with honest odds',
          'Weekly scans if you want to keep watching',
        ],
        today: 'Your forecast shows when change is likely, so the timing is your call.',
      };
    default:
      return NONE;
  }
}
