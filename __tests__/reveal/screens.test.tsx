import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import AnalysingScreen from '@/app/reveal/analysing';
import RevealScreen from '@/app/reveal';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile, type Profile } from '@/profile/types';
import { MemoryLogStore } from '@/plan/log';
import { PlanProvider } from '@/plan/PlanProvider';
import { ForecastProvider } from '@/reveal/ForecastProvider';
import { ANALYSING_MS } from '@/reveal/reveal';
import { ScanProvider } from '@/scan/ScanProvider';
import { SCAN_ORDER } from '@/scan/session';
import { MemoryScanStore } from '@/scan/store';

import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const adult: Partial<Profile> = {
  age: 26,
  sex: 'male',
  zones: ['temples'],
  family: { father: { status: 'bald', startAge: 30 }, maternalGrandfather: { status: 'bald' } },
  completedAt: '2026-11-26T10:00:00Z',
};

const firstScan = record('first', '2026-11-26T10:05:00Z', {
  views: Object.fromEntries(SCAN_ORDER.map((v) => [v, { uri: `file:///scans/first/${v}.heic`, score: 90 }])),
});

function setup(ui: ReactNode, seed: Partial<Profile> = adult) {
  const profiles = new MemoryProfileStore({ ...emptyProfile(), ...seed });
  const tree = (
    <ProfileProvider store={profiles}>
      <PlanProvider store={new MemoryLogStore()}>
        <ForecastProvider samples={5000}>
          <ScanProvider store={new MemoryScanStore([firstScan])}>{ui}</ScanProvider>
        </ForecastProvider>
      </PlanProvider>
    </ProfileProvider>
  );
  return { profiles, tree };
}

beforeEach(() => jest.clearAllMocks());

describe('Analysing', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ticks real counters up, locks at the free share, then opens the reveal', async () => {
    await render(setup(<AnalysingScreen />).tree);
    expect(screen.getByText('Building your forecast')).toBeOnTheScreen();
    expect(screen.getByText('0%')).toBeOnTheScreen();

    await act(async () => jest.advanceTimersByTime(ANALYSING_MS / 2));
    expect(screen.queryByTestId('analysis-locked')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(ANALYSING_MS / 2 + 200));
    expect(screen.getByText('73%')).toBeOnTheScreen();
    expect(screen.getByTestId('analysis-locked')).toBeOnTheScreen();
    expect(screen.getByText('5 of 5')).toBeOnTheScreen();
    expect(screen.getByText('Relatives analysed')).toBeOnTheScreen();
    expect(screen.getByText('Hairline points traced')).toBeOnTheScreen();
    expect(screen.getByText('Projecting to age 50')).toBeOnTheScreen();

    await act(async () => jest.advanceTimersByTime(1000));
    expect(router.replace).toHaveBeenCalledWith('/reveal');
  });
});

describe('Reveal', () => {
  it('shows today free, the future look blurred and labelled, and later years frosted', async () => {
    const { profiles, tree } = setup(<RevealScreen />);
    await render(tree);
    expect(await screen.findByText('Your Norwood timeline', {}, { timeout: 5000 })).toBeOnTheScreen();

    expect(screen.getByLabelText(/^Norwood [\d.]+ today/)).toBeOnTheScreen();
    // A good scan backs the stage; confidence never goes above moderate until the grader is validated.
    expect(screen.getByTestId('reveal-source')).toHaveTextContent('From your scan and your answers. Norwood today.');
    expect(screen.getByTestId('reveal-confidence')).toHaveTextContent(/^(Low|Moderate) confidence$/);
    expect(screen.queryByTestId('reveal-retake')).toBeNull();
    expect(screen.getByText('Temples')).toBeOnTheScreen();
    expect(screen.getByText('You in 5 years')).toBeOnTheScreen();
    expect(screen.getByTestId('future-blur')).toBeOnTheScreen();
    expect(screen.getByText('Rough preview on your photo, dashed line at your likely hairline. Not a medical prediction')).toBeOnTheScreen();
    // Year 1 free, 3, 5 and 10 frosted.
    expect(screen.getAllByTestId('timeline-frost')).toHaveLength(3);

    await fireEvent.press(screen.getByRole('tab', { name: '10 years' }));
    expect(screen.getByText('You in 10 years')).toBeOnTheScreen();
    expect(screen.getByText(/Age 36, projected/)).toBeOnTheScreen();

    await waitFor(async () => expect((await profiles.load()).revealSeenAt).toBeDefined());
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock your future look' }));
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('never shows teens a future face, only the timeline', async () => {
    await render(setup(<RevealScreen />, { ...adult, age: 16 }).tree);
    expect(await screen.findByText('Your Norwood timeline', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.queryByTestId('future-blur')).toBeNull();
    expect(screen.queryByText(/You in \d+ year/)).toBeNull();
  });

  it('tells low-risk users their forecast looks stable and sells tracking instead', async () => {
    await render(
      setup(<RevealScreen />, {
        age: 19,
        sex: 'male',
        worriedOnly: true,
        family: { father: { status: 'full' }, maternalGrandfather: { status: 'full' }, paternalGrandfather: { status: 'full' } },
        completedAt: '2026-11-26T10:00:00Z',
      }).tree,
    );
    expect(await screen.findByText(/Looks stable for now/, {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Unlock tracking and your plan' })).toBeOnTheScreen();
  });

  it('shows everything unblurred once subscribed', async () => {
    await render(
      setup(<RevealScreen />, {
        ...adult,
        subscription: { plan: 'annual', startedAt: '2026-11-26T10:00:00Z', trialEndsAt: '2026-11-29T10:00:00Z', test: true },
      }).tree,
    );
    expect(await screen.findByText('Your Norwood timeline', {}, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.queryByTestId('future-blur')).toBeNull();
    expect(screen.queryAllByTestId('timeline-frost')).toHaveLength(0);
    expect(screen.getByText('Rough preview on your photo, dashed line at your likely hairline. Not a medical prediction')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.dismissAll).toHaveBeenCalled();
  });
});
