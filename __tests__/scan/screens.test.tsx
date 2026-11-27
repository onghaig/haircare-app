import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import ScanTab from '@/app/(tabs)/scan';
import ScanResultScreen from '@/app/scan/[id]';
import ScanSessionScreen from '@/app/scan/session';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';
import { ScanProvider } from '@/scan/ScanProvider';
import { MemoryScanStore } from '@/scan/store';

import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'b' })),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const withScans = (ui: ReactNode, seed = [] as ReturnType<typeof record>[]) => (
  <ProfileProvider store={new MemoryProfileStore({ ...emptyProfile(), revealSeenAt: '2026-11-01T00:00:00Z' })}>
    <ScanProvider store={new MemoryScanStore(seed)}>{ui}</ScanProvider>
  </ProfileProvider>
);

describe('Scan tab', () => {
  it('invites the first scan when there is no history', async () => {
    await render(withScans(<ScanTab />));
    expect(await screen.findByText('Your first scan sets your baseline')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start your first scan' }));
    expect(router.push).toHaveBeenCalledWith('/scan/session');
  });

  it('shows the latest hairline numbers with honest change labels, and history', async () => {
    const seed = [
      record('a', '2026-10-01T10:00:00Z', { hairline: { centreMM: 66, leftTempleMM: 70, rightTempleMM: 72 } }),
      record('b', '2026-11-20T10:00:00Z', { hairline: { centreMM: 71, leftTempleMM: 72, rightTempleMM: 73 } }),
    ];
    await render(withScans(<ScanTab />, seed));
    expect(await screen.findByText('History')).toBeOnTheScreen();
    expect(screen.getByLabelText('Centre 71 millimetres')).toBeOnTheScreen();
    expect(screen.getByText('Moved up')).toBeOnTheScreen(); // centre +5 mm, beyond 3.5 mm
    expect(screen.getAllByText('No real change')).toHaveLength(2); // temples within 5 mm
    expect(screen.getByText('Baseline')).toBeOnTheScreen();
  });
});

describe('Scan result', () => {
  it('shows quality and hairline numbers for the scan', async () => {
    await render(withScans(<ScanResultScreen />, [record('a', '2026-10-01T10:00:00Z'), record('b', '2026-10-08T10:00:00Z', { quality: 88 })]));
    expect(await screen.findByRole('header', { name: 'Scan complete' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Scan quality 88 out of 100')).toBeOnTheScreen();
    expect(screen.getByText('Counts toward your trends.')).toBeOnTheScreen();
  });

  it('calls the first good scan the baseline and flags low confidence', async () => {
    await render(withScans(<ScanResultScreen />, [record('b', '2026-10-08T10:00:00Z')]));
    expect(await screen.findByRole('header', { name: 'Baseline saved' })).toBeOnTheScreen();
  });

  it('explains a low-confidence scan', async () => {
    await render(withScans(<ScanResultScreen />, [record('b', '2026-10-08T10:00:00Z', { quality: 45, lowConfidence: true })]));
    expect(await screen.findByText(/won.t count toward your trends/)).toBeOnTheScreen();
  });
});

describe('Redo and delete a scan', () => {
  afterEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'b' }));

  it('deletes only after confirming, removing it from the phone and the history', async () => {
    const store = new MemoryScanStore([record('a', '2026-10-01T10:00:00Z'), record('b', '2026-10-08T10:00:00Z')]);
    await render(
      <ProfileProvider store={new MemoryProfileStore({ ...emptyProfile(), revealSeenAt: '2026-11-01T00:00:00Z' })}>
        <ScanProvider store={store}>
          <ScanResultScreen />
        </ScanProvider>
      </ProfileProvider>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete this scan' }));
    expect(screen.getByRole('header', { name: 'Delete this scan?' })).toBeOnTheScreen();
    expect(screen.getByText(/photos and measurements are removed from this phone/)).toBeOnTheScreen();

    // Changing your mind keeps it.
    await fireEvent.press(screen.getByRole('button', { name: 'Keep this scan' }));
    expect(screen.queryByRole('header', { name: 'Delete this scan?' })).toBeNull();
    expect(await store.list()).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete this scan' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Delete scan' }));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith('/scan'));
    expect((await store.list()).map((r) => r.id)).toEqual(['a']);
    expect(screen.getByText('Scan deleted.')).toBeOnTheScreen();
  });

  it('warns that deleting the baseline moves it to the next oldest scan, and the tab follows', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'a' });
    await render(
      withScans(
        <>
          <ScanResultScreen />
          <ScanTab />
        </>,
        [record('a', '2026-10-01T10:00:00Z'), record('b', '2026-10-08T10:00:00Z')],
      ),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete this scan' }));
    expect(screen.getByText(/your next oldest scan becomes the baseline/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete scan' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Scan from/ })).toHaveLength(1));
    expect(screen.getByText('Baseline')).toBeOnTheScreen();
  });

  it('deleting the only scan says the next scan sets a new baseline, and the tab starts over', async () => {
    await render(
      withScans(
        <>
          <ScanResultScreen />
          <ScanTab />
        </>,
        [record('b', '2026-10-08T10:00:00Z')],
      ),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Delete this scan' }));
    expect(screen.getByText(/your next scan sets a new one/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete scan' }));
    expect(await screen.findByText('Your first scan sets your baseline')).toBeOnTheScreen();
  });

  it('redo confirms, then starts a new scan that will replace this one', async () => {
    await render(withScans(<ScanResultScreen />, [record('a', '2026-10-01T10:00:00Z'), record('b', '2026-10-08T10:00:00Z')]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Redo this scan' }));
    expect(screen.getByText(/replaced once the new one is saved/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start the redo' }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/scan/session', params: { replaces: 'b' } });
  });
});

describe('Scan session', () => {
  it('asks about hair state first, then opens the camera with the guide', async () => {
    await render(withScans(<ScanSessionScreen />));
    expect(await screen.findByText('Before you scan')).toBeOnTheScreen();
    // First scan: no "same length as last time" question.
    expect(screen.queryByText('About the same length as last scan')).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'My hair is dry' }));
    expect(screen.getByRole('checkbox', { name: 'My hair is dry' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('button', { name: 'Start scan' }));
    await waitFor(() => expect(screen.getByText('Front: hairline')).toBeOnTheScreen());
    expect(screen.getByText('Line up with the outline')).toBeOnTheScreen();
    // Without a native build the camera explains itself instead of showing black.
    expect(screen.getByText(/needs a development build/)).toBeOnTheScreen();
    expect(screen.getByLabelText('View 1 of 5')).toBeOnTheScreen();
  });

  it('closes with the close button', async () => {
    await render(withScans(<ScanSessionScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Close scan' }));
    expect(router.back).toHaveBeenCalled();
  });
});

