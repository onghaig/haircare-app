import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import TodayScreen from '@/app/(tabs)/index';
import QuickLogScreen from '@/app/log';
import MassageScreen from '@/app/massage';
import { dayKey } from '@/plan/tasks';

import { makeProviders } from '../../test-utils/providers';
import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const adult = { age: 28, sex: 'male' as const, treatments: ['finasteride' as const], completedAt: '2026-11-01T00:00:00Z' };
const today = () => dayKey(new Date());

beforeEach(() => jest.clearAllMocks());

describe('Today', () => {
  it('lists the plan, answers a dose in one tap, and fills the ring', async () => {
    const { wrap, stores } = makeProviders({ profile: adult, scans: [record('s', new Date().toISOString())] });
    await render(wrap(<TodayScreen />));
    expect(await screen.findByRole('checkbox', { name: 'Finasteride' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Scalp massage' })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Quick log' })).toBeOnTheScreen();
    expect(screen.getByLabelText('0 of 3 done today')).toBeOnTheScreen();
    // Scanned today: no weekly scan card.
    expect(screen.queryByText('Weekly scan due today')).toBeNull();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Finasteride' }));
    expect(await screen.findByLabelText('1 of 3 done today')).toBeOnTheScreen();
    expect(screen.getByText('1-day streak')).toBeOnTheScreen();
    expect((await stores.log.load())[today()].answers.finasteride).toBe('done');
  });

  it('skips a dose without guilt', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<TodayScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip Finasteride' }));
    expect(await screen.findByText('Skipped today')).toBeOnTheScreen();
  });

  it('opens the massage, the quick log and a due scan', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<TodayScreen />));
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Scalp massage' }));
    expect(router.push).toHaveBeenCalledWith('/massage');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Quick log' }));
    expect(router.push).toHaveBeenCalledWith('/log');
    expect(screen.getByText('Your first scan sets your baseline')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start your first scan' }));
    expect(router.push).toHaveBeenCalledWith('/scan/session');
  });

  it('turns on reminders that never name a medication', async () => {
    const { wrap, stores } = makeProviders({ profile: adult });
    await render(wrap(<TodayScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn on reminders' }));
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3));
    const bodies = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.map((c) => c[0].content.body);
    expect(bodies.join(' ')).not.toMatch(/finasteride/i);
    expect((await stores.profile.load()).reminders?.enabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Turn on reminders' })).toBeNull();
  });

  it('shows the forecast card once the forecast is ready', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<TodayScreen />));
    expect(await screen.findByText(/^Likely at 33: N/, {}, { timeout: 5000 })).toBeOnTheScreen();
  });
});

describe('Scalp massage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs the steps with a timer and ticks the massage off at the end', async () => {
    const { wrap, stores } = makeProviders({ profile: adult });
    await render(wrap(<MassageScreen />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Quick, 2 min' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Warm-up')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 6')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(16_000));
    expect(screen.getByText('Hairline')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(screen.getByText('Hairline')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    for (let i = 0; i < 130; i++) await act(async () => jest.advanceTimersByTime(1000));
    expect(screen.getByText('Done. Nice work.')).toBeOnTheScreen();
    expect((await stores.log.load())[today()].answers.massage).toBe('done');
  });
});

describe('Quick log', () => {
  it('saves three answers and ticks the log off', async () => {
    const { wrap, stores } = makeProviders({ profile: adult });
    await render(wrap(<QuickLogScreen />));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('radio', { name: 'More than usual' }));
    await fireEvent.press(screen.getByRole('radio', { name: '4' }));
    await fireEvent.press(screen.getByRole('radio', { name: '7 h' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await stores.log.load())[today()]).toEqual({
      quick: { shedding: 'more', stress: 4, sleepHours: 7 },
      answers: { quickLog: 'done' },
    });
  });
});
