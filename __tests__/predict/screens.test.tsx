import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';

import PredictScreen from '@/app/(tabs)/predict';
import ShareScreen from '@/app/share';

import { answer } from '@/plan/log';
import { addDays, dayKey } from '@/plan/tasks';

import { makeProviders } from '../../test-utils/providers';
import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const adult = {
  age: 28,
  sex: 'male' as const,
  zones: ['temples' as const],
  family: { father: { status: 'bald' as const } },
  completedAt: '2026-11-01T00:00:00Z',
};
const premium = { ...adult, subscription: { plan: 'annual' as const, startedAt: '2026-11-26T10:00:00Z', trialEndsAt: null, test: true } };
const wait = { timeout: 8000 };
// The forecast waits for the first scan, as in the app.
const scans = [record('first', '2026-11-01T00:05:00Z')];

beforeEach(() => jest.clearAllMocks());

describe('Predict tab', () => {
  it('free: year 1 of both bands, the options list with evidence, 10-year numbers locked', async () => {
    const { wrap } = makeProviders({ profile: { ...adult, treatments: ['minoxidil'] }, scans });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('predict-headline', {}, wait)).toHaveTextContent(/^At 29:N.*N.*$/);
    expect(screen.getByLabelText(/Years after 1 locked/)).toBeOnTheScreen();
    expect(screen.queryByText(/Chance of Norwood/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Oral finasteride' })).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Evidence: Strong').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole('button', { name: 'See what each option does for you' }));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    await fireEvent.press(screen.getByRole('tab', { name: '10 years' }));
    expect(screen.getByTestId('future-blur')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share your forecast' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/share', params: { years: '1' } });
  });

  it('Premium: Your Plan shows the chance before (red) and with the plan (green), split by what the plan does', async () => {
    const { wrap } = makeProviders({ profile: { ...premium, treatments: ['minoxidil'] }, scans });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('plan-odds', {}, wait)).toHaveTextContent(/^Your PlanNorwood \d:.*%.*%By age 38\./);
    expect(screen.getByTestId('plan-odds-before')).toHaveTextContent(/%$/);
    expect(screen.getByTestId('plan-odds-with')).toHaveTextContent(/%$/);
    const byRole = screen.getByTestId('plan-by-role');
    expect(byRole).toHaveTextContent(/Grows hair.*Minoxidil/);
    expect(byRole).toHaveTextContent(/Slows loss.*Nothing in your plan/);
    await fireEvent.press(screen.getByRole('link', { name: 'Options to discuss' }));
    expect(router.push).toHaveBeenCalledWith('/options');
    await fireEvent.press(screen.getByRole('tab', { name: 'Without plan' }));
    expect(screen.getByTestId('future-headline')).toHaveTextContent(/without plan$/);
    expect(screen.queryByText(/recommended/i)).toBeNull();
  });

  it('nudges the logged gap in the real routine', async () => {
    const today = new Date();
    let log = {};
    for (let i = 0; i < 7; i++) log = answer(log, dayKey(addDays(today, -i)), 'minoxidil', i === 2 || i === 5 ? 'skipped' : 'done');
    const { wrap } = makeProviders({ profile: { ...premium, treatments: ['minoxidil'] }, scans, log });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('predict-nudge', {}, wait)).toHaveTextContent('You do minoxidil 5 of 7 days. It only works while you keep it up.');
  });

  it('under-18s get the outlook: no prescriptions, no 10-year odds', async () => {
    const { wrap } = makeProviders({ profile: { ...premium, age: 16 }, scans });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('predict-headline', {}, wait)).toHaveTextContent(/^Likely at 17: N/);
    expect(screen.getByText('Your outlook')).toBeOnTheScreen();
    expect(screen.getByText('Scalp massage')).toBeOnTheScreen();
    expect(screen.queryByText(/finasteride|minoxidil|Rx/i)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByTestId('future-blur')).toBeNull();
  });
});

describe('Share card', () => {
  it('captures the card and opens the share sheet', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ years: '5' });
    const { wrap } = makeProviders({ profile: premium, scans });
    await render(wrap(<ShareScreen />));
    expect(await screen.findByTestId('share-card', {}, wait)).toBeOnTheScreen();
    expect(screen.getByText('Me at 33, likely')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share image' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(captureRef).toHaveBeenCalled();
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0][0]).toBe('file:///tmp/share.png');
  });

  it('falls back to year 1 for free users and explains when sharing fails', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ years: '10' });
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<ShareScreen />));
    expect(await screen.findByText('Me at 29, likely', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share image' }));
    expect(await screen.findByText(/Try a screenshot instead/)).toBeOnTheScreen();
  });
});
