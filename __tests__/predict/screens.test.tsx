import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { router, useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';

import PredictScreen from '@/app/(tabs)/predict';
import ShareScreen from '@/app/share';

import { makeProviders } from '../../test-utils/providers';

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

beforeEach(() => jest.clearAllMocks());

describe('Predict tab', () => {
  it('shows year 1 free and locks later years behind the paywall', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('predict-headline', {}, wait)).toHaveTextContent(/^Likely at 29: N/);
    expect(screen.getByLabelText(/^Age 38: locked/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: '10 years' }));
    expect(screen.getByTestId('future-blur')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock your forecast' }));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    await fireEvent.press(screen.getByRole('button', { name: 'Share your forecast' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/share', params: { years: '1' } });
  });

  it('unlocks every year and the treatment what-if for Premium', async () => {
    const { wrap } = makeProviders({ profile: premium });
    await render(wrap(<PredictScreen />));
    await fireEvent.press(await screen.findByRole('tab', { name: '10 years' }, wait));
    expect(screen.getByTestId('predict-headline')).toHaveTextContent(/^Likely at 38: N/);
    expect(screen.queryByTestId('future-blur')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Finasteride' }));
    expect(await screen.findByTestId('what-if-result', {}, wait)).toHaveTextContent(/^Finasteride: N.* at 38, versus N.* on your current plan\.$/);
    expect(screen.getByText(/Talk to a doctor/)).toBeOnTheScreen();
  });

  it('has no treatment what-if for under-18s', async () => {
    const { wrap } = makeProviders({ profile: { ...premium, age: 16 } });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('predict-headline', {}, wait)).toBeOnTheScreen();
    expect(screen.queryByText('What if?')).toBeNull();
    expect(screen.queryByText(/Finasteride/)).toBeNull();
  });
});

describe('Share card', () => {
  it('captures the card and opens the share sheet', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ years: '5' });
    const { wrap } = makeProviders({ profile: premium });
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
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<ShareScreen />));
    expect(await screen.findByText('Me at 29, likely', {}, wait)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share image' }));
    expect(await screen.findByText(/Try a screenshot instead/)).toBeOnTheScreen();
  });
});
