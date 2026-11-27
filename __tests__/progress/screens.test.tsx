import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import ProgressScreen from '@/app/(tabs)/progress';
import VerdictScreen from '@/app/verdict';
import { addDays } from '@/plan/tasks';

import { makeProviders } from '../../test-utils/providers';
import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const adult = { age: 30, sex: 'male' as const, completedAt: '2026-01-01T00:00:00Z' };
const daysAgo = (n: number) => addDays(new Date(), -n).toISOString();

beforeEach(() => jest.clearAllMocks());

describe('Progress tab', () => {
  it('asks for a first scan when there is nothing to compare', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<ProgressScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Start your first scan' }));
    expect(router.push).toHaveBeenCalledWith('/scan/session');
  });

  it('shows the baseline and when the first verdict arrives', async () => {
    const { wrap } = makeProviders({ profile: adult, scans: [record('a', daysAgo(0))] });
    await render(wrap(<ProgressScreen />));
    expect(await screen.findByText('Your baseline is set')).toBeOnTheScreen();
    expect(screen.getByText(/Your first verdict arrives on/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Baseline front photo')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Days on plan 0% of the last 30 days/)).toBeOnTheScreen();
    expect(screen.queryByTestId('trend-chart')).toBeNull();
  });

  it('says when the only scan was low confidence', async () => {
    const { wrap } = makeProviders({ profile: adult, scans: [record('a', daysAgo(0), { lowConfidence: true, quality: 40 })] });
    await render(wrap(<ProgressScreen />));
    expect(await screen.findByText('No baseline yet')).toBeOnTheScreen();
  });

  it('compares with the baseline, draws the trend and opens a ready report', async () => {
    const scans = [
      record('a', daysAgo(60)),
      record('b', daysAgo(30), { hairline: { centreMM: 70, leftTempleMM: 75, rightTempleMM: 77 } }),
      record('c', daysAgo(2), { hairline: { centreMM: 73, leftTempleMM: 77, rightTempleMM: 79 } }),
    ];
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<ProgressScreen />));
    expect(await screen.findByTestId('progress-verdict')).toHaveTextContent('Losing ground');
    expect(screen.getByTestId('trend-chart')).toBeOnTheScreen();
    expect(screen.getByLabelText('Latest front photo')).toBeOnTheScreen();
    expect(screen.getByText('Month 2 report is ready')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'See your report' }));
    expect(router.push).toHaveBeenCalledWith('/verdict');
  });
});

describe('Verdict story', () => {
  it('walks through every card and closes', async () => {
    const scans = [record('a', daysAgo(60)), record('b', daysAgo(2), { hairline: { centreMM: 69, leftTempleMM: 72, rightTempleMM: 73 } })];
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<VerdictScreen />));
    expect(await screen.findByText('Month 2: Holding steady')).toBeOnTheScreen();
    expect(screen.getByLabelText('Page 1 of 7')).toBeOnTheScreen();
    const titles = ['Before and after', 'The numbers', 'What you did', 'What might explain it', 'Too early to tell', 'Next month'];
    for (const t of titles) {
      await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      // The scans-vs-forecast card waits for the forecast.
      expect(await screen.findByRole('header', { name: t }, { timeout: 5000 })).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('header', { name: 'Too early to tell' })).toBeOnTheScreen();
    expect(screen.getByTestId('versus-chart')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows the numbers as no real change inside the margin', async () => {
    const scans = [record('a', daysAgo(60)), record('b', daysAgo(2), { hairline: { centreMM: 69, leftTempleMM: 77, rightTempleMM: 73 } })];
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<VerdictScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Centre: no real change')).toBeOnTheScreen();
    expect(screen.getByLabelText('Left temple: 6 mm higher')).toBeOnTheScreen();
  });
});
