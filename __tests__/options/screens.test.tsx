import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import OptionDetailScreen from '@/app/options/[id]';
import HowOptionsWorkScreen from '@/app/options/how';
import CompareOptionsScreen from '@/app/options/index';
import { illustrativeLine } from '@/options/illustrate';

import { makeProviders } from '../../test-utils/providers';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const adult = { age: 28, sex: 'male' as const, zones: ['temples' as const], family: { father: { status: 'bald' as const } }, completedAt: '2026-11-01T00:00:00Z' };
const premium = { ...adult, subscription: { plan: 'annual' as const, startedAt: '2026-11-26T10:00:00Z', trialEndsAt: null, test: true } };
const wait = { timeout: 8000 };

beforeEach(() => jest.clearAllMocks());

describe('Compare options', () => {
  it('Premium: every option on the 10-year scale, grouped by what it does', async () => {
    const { wrap } = makeProviders({ profile: { ...premium, treatments: ['minoxidil'] } });
    await render(wrap(<CompareOptionsScreen />));
    expect(await screen.findByRole('button', { name: /^Oral finasteride: .*%$/ }, wait)).toBeOnTheScreen();
    expect(screen.getByText('SLOWS LOSS')).toBeOnTheScreen();
    expect(screen.getByText('GROWS HAIR')).toBeOnTheScreen();
    expect(screen.getByText('SLOWS LOSS AND GROWS HAIR')).toBeOnTheScreen();
    expect(screen.getByTestId('option-minoxidil')).toHaveTextContent(/Your plan/);
    expect(screen.getByText(/Not counted: ketoconazole shampoo, sleep, stress, food/)).toBeOnTheScreen();
    expect(screen.queryByText(/recommended|best for you/i)).toBeNull();
    await fireEvent.press(screen.getByRole('link', { name: 'How these work' }));
    expect(router.push).toHaveBeenCalledWith('/options/how');
  });

  it('free: the list and evidence, no personal numbers', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<CompareOptionsScreen />));
    expect(await screen.findByRole('button', { name: 'Oral finasteride' })).toBeOnTheScreen();
    expect(screen.queryByText(/%/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'See what each option does for you' }));
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('under-18s see no prescription options', async () => {
    const { wrap } = makeProviders({ profile: { ...premium, age: 16 } });
    await render(wrap(<CompareOptionsScreen />));
    expect(await screen.findByTestId('option-massage')).toBeOnTheScreen();
    expect(screen.queryByText(/finasteride|minoxidil|dutasteride|Rx/i)).toBeNull();
  });
});

describe('Option detail', () => {
  it('a prescription: forecast change as a range, trade-offs, a provider handoff, and "I already take this"', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'finasteride' });
    const { wrap, stores } = makeProviders({ profile: premium });
    await render(wrap(<OptionDetailScreen />));
    expect(await screen.findAllByText(/%$/, {}, wait)).toHaveLength(2);
    expect(screen.getByText('Trade-offs')).toBeOnTheScreen();
    expect(screen.getByLabelText('Prescription only')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Talk to a licensed provider' }));
    expect(screen.getByTestId('no-partner')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'I already take this' }));
    expect((await stores.profile.load())?.treatments).toEqual(['finasteride']);
    expect(router.back).toHaveBeenCalled();
  }, 15_000);

  it('never opens a prescription for under-18s, even by link', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'finasteride' });
    const { wrap } = makeProviders({ profile: { ...premium, age: 16 } });
    await render(wrap(<OptionDetailScreen />));
    expect(await screen.findByText('Not available')).toBeOnTheScreen();
    expect(screen.queryByText(/finasteride/i)).toBeNull();
  });

  it('free users see the option but not their numbers', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'minoxidil' });
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<OptionDetailScreen />));
    expect(await screen.findByText('Your numbers are in Premium.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'I already use this' })).toBeOnTheScreen();
  });
});

describe('How options work', () => {
  it('draws the three shapes', async () => {
    await render(<HowOptionsWorkScreen />);
    expect(screen.getByLabelText('Slowing loss: the line flattens')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Growing hair/)).toBeOnTheScreen();
  });

  it('slowing flattens; growing lifts with the same slope and fades after stopping', () => {
    const at = (k: Parameters<typeof illustrativeLine>[0], m: number) => illustrativeLine(k, m);
    expect(at('slows', 48)).toBeLessThan(at('none', 48));
    expect(at('none', 48) - at('grows', 48)).toBeCloseTo(at('none', 12) - at('grows', 12));
    expect(at('grows-stopped', 40)).toBeCloseTo(at('none', 40));
  });
});
