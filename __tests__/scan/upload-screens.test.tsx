import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import ScanTab from '@/app/(tabs)/scan';
import ScanResultScreen from '@/app/scan/[id]';
import UploadPhotoScreen from '@/app/scan/upload';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';
import { ScanProvider } from '@/scan/ScanProvider';
import type { ScanRecord } from '@/scan/session';
import { MemoryScanStore } from '@/scan/store';

import { record, report } from '../../test-utils/scanFixtures';

const mockAnalyze = jest.fn();
jest.mock('@modules/headmap', () => ({
  isHeadMapAvailable: true,
  analyzeImageAsync: (...a: unknown[]) => mockAnalyze(...a),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const hairline = { foreheadVisible: true, interPupilPx: 120, centreMM: 70, leftTempleMM: 74, rightTempleMM: 75, templeRecessionIPD: 0.2, curve: [[0.3, 0.3], [0.7, 0.3]] as [number, number][] };
const pick = (exif: Record<string, unknown> | null) =>
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/p.jpg', width: 900, height: 1200, exif }] });

function setup(seed: ScanRecord[] = []) {
  const store = new MemoryScanStore(seed);
  const ui = (node: ReactNode) => (
    <ProfileProvider store={new MemoryProfileStore({ ...emptyProfile(), revealSeenAt: '2026-11-01T00:00:00Z' })}>
      <ScanProvider store={store}>{node}</ScanProvider>
    </ProfileProvider>
  );
  return { store, ui };
}

beforeEach(() => jest.clearAllMocks());

describe('Add a past photo', () => {
  it('measures a photo, dates it from EXIF and adds it to the timeline', async () => {
    pick({ DateTimeOriginal: '2021:03:12 14:05:33', OffsetTimeOriginal: '+00:00', GPSLatitude: 51.5 });
    mockAnalyze.mockResolvedValue(report('front', ['centred'], { score: 100, hairline, frameSize: [900, 1200] }));
    const { store, ui } = setup([record('a', '2026-10-01T10:00:00Z')]);
    await render(ui(<UploadPhotoScreen />));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByText(/^Taken .*2021, from the photo/)).toBeOnTheScreen();
    expect(mockAnalyze).toHaveBeenCalledWith('file:///cache/p.jpg', 'front');
    await fireEvent.press(screen.getByRole('button', { name: 'Add to your timeline' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const saved = (await store.list()).find((r) => r.source === 'upload')!;
    expect(saved).toMatchObject({ takenAt: '2021-03-12T14:05:33.000Z', dateFrom: 'photo', hairline: { centreMM: 70 } });
    // Only the date is kept from the metadata: no location.
    expect(JSON.stringify(saved)).not.toMatch(/GPS|51\.5/);
  });

  it('says plainly when a photo can’t be used', async () => {
    pick(null);
    mockAnalyze.mockResolvedValue(report('front', ['faceFound'], { score: 0 }));
    const { store, ui } = setup();
    await render(ui(<UploadPhotoScreen />));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByText('This photo can’t be used')).toBeOnTheScreen();
    expect(screen.getByText(/couldn’t find a face/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add to your timeline' })).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it('asks for a month when the photo has no date', async () => {
    pick(null);
    mockAnalyze.mockResolvedValue(report('top', [], { score: 100, hairGrid: { cols: 1, rows: 1, values: [0.8] }, frameSize: [900, 1200] }));
    const { store, ui } = setup();
    await render(ui(<UploadPhotoScreen />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Top of head' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByText('No date in this photo. Roughly when was it taken?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Later month' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: '1 year earlier' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add to your timeline' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const [saved] = await store.list();
    expect(saved.dateFrom).toBe('you');
    expect(new Date(saved.takenAt).getFullYear()).toBe(new Date().getFullYear() - 1);
    expect(Object.keys(saved.views)).toEqual(['top']);
  });
});

describe('Uploaded photos elsewhere', () => {
  const upload: ScanRecord = { ...record('old', '2020-05-01T10:00:00Z'), source: 'upload', dateFrom: 'photo', hairState: undefined, faceWidthPx: undefined };

  it('lists them in history without a quality score and offers the upload', async () => {
    const { ui } = setup([upload, record('a', '2026-10-01T10:00:00Z')]);
    await render(ui(<ScanTab />));
    expect(await screen.findByText('Your photo')).toBeOnTheScreen();
    expect(screen.getByText('Baseline')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add a past photo' }));
    expect(router.push).toHaveBeenCalledWith('/scan/upload');
  });

  it('still asks for a first scan when there are only photos', async () => {
    const { ui } = setup([upload]);
    await render(ui(<ScanTab />));
    expect(await screen.findByRole('button', { name: 'Start your first scan' })).toBeOnTheScreen();
  });

  it('shows what a photo measured, without redo', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'old' });
    const { ui } = setup([upload, record('a', '2026-10-01T10:00:00Z')]);
    await render(ui(<ScanResultScreen />));
    expect(await screen.findByRole('header', { name: 'Photo added' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Centre 68 millimetres')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Redo this scan' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete this photo' })).toBeOnTheScreen();
  });
});
