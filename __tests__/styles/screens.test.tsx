import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import PredictScreen from '@/app/(tabs)/predict';
import StyleGalleryScreen from '@/app/styles';
import StyleScreen from '@/app/styles/[id]';
import TransplantScreen from '@/app/transplant';
import type { PreviewProvider } from '@/visualize/provider';

import { makeProviders, MemoryPreviewStore } from '../../test-utils/providers';
import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const scans = [record('s1', '2026-11-20T09:00:00Z')];
const adult = { age: 25, sex: 'male' as const, zones: ['temples' as const], family: { father: { status: 'bald' as const } }, completedAt: '2026-11-01T00:00:00Z' };
const agreed = { ...adult, aiPreview: { consentAt: '2026-11-26T00:00:00Z' } };
const premium = { subscription: { plan: 'annual' as const, startedAt: '2026-11-26T10:00:00Z', trialEndsAt: null, test: true } };
const wait = { timeout: 8000 };

function fakeProvider(): PreviewProvider & { generate: jest.Mock } {
  return { name: 'fake', generate: jest.fn(async () => ({ imageBase64: 'QUk=', mimeType: 'image/png' })) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

describe('Hairstyle gallery', () => {
  it('lists every style with how it plays with thinning, and makes no AI images', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { provider } });
    await render(wrap(<StyleGalleryScreen />));
    expect(await screen.findByText(/^Picked for your scan: N/)).toBeOnTheScreen();
    expect(screen.getByTestId('style-buzz')).toHaveTextContent(/Buzz cut(Hides thinning|Works for you)/);
    expect(screen.getAllByText('Shows thinning').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('style-crop'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/styles/[id]', params: { id: 'crop' } });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('offers AI on your own photo, asking first', async () => {
    const { wrap } = makeProviders({ profile: adult, scans, ai: { provider: fakeProvider() } });
    await render(wrap(<StyleGalleryScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Try them on your own photo (AI)' }));
    expect(router.push).toHaveBeenCalledWith('/ai-preview');
  });

  it('shares a vote card of the best four', async () => {
    jest.spyOn(Sharing, 'isAvailableAsync').mockResolvedValue(true);
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<StyleGalleryScreen />));
    expect(await screen.findByTestId('vote-card')).toHaveTextContent(/WHICH ONE SHOULD I GET\?1\. .*4\. /);
    await fireEvent.press(screen.getByRole('button', { name: 'Share the vote card' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(captureRef).toHaveBeenCalled();
  });
});

describe('One hairstyle', () => {
  it('without a preview service: the sketch, the fit, and what to tell the barber', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'crop' });
    const { wrap } = makeProviders({ profile: agreed, scans });
    await render(wrap(<StyleScreen />));
    expect(await screen.findByText('Sketch at your stage')).toBeOnTheScreen();
    expect(screen.getByTestId('barber-line')).toHaveTextContent(/blunt fringe/);
    expect(screen.getByRole('adjustable', { name: 'Now or French crop' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Next: / }));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/styles/[id]', params: expect.objectContaining({ id: expect.any(String) }) });
  });

  it('once agreed, tries it on your photo and saves it with the scan', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'crop' });
    const provider = fakeProvider();
    const store = new MemoryPreviewStore();
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { provider, store, prepare: async () => 'U01BTEw=' } });
    await render(wrap(<StyleScreen />));
    expect(await screen.findByTestId('style-photo')).toBeOnTheScreen();
    expect(screen.getByTestId('style-now-photo')).toBeOnTheScreen();
    expect(screen.getByText('AI try-on. Your hairline is kept as it is.')).toBeOnTheScreen();
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'style', style: 'crop', imageBase64: 'U01BTEw=' }));
    expect(store.files.has('s1-style-crop')).toBe(true);
  });

  it('never makes one for under-18s', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'buzz' });
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: { ...agreed, age: 16 }, scans, ai: { provider } });
    await render(wrap(<StyleScreen />));
    expect(await screen.findByText('Sketch at your stage')).toBeOnTheScreen();
    expect(provider.generate).not.toHaveBeenCalled();
  });
});

describe('Transplant preview', () => {
  it('shows the restored look, the limits, and a placeholder clinic link', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { provider } });
    await render(wrap(<TransplantScreen />));
    expect(await screen.findByTestId('transplant-photo')).toBeOnTheScreen();
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'restore' }));
    expect(screen.getByText('Illustration of a possible result, not a promise')).toBeOnTheScreen();
    expect(screen.getByText('It moves hair, it doesn’t stop loss')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Find a clinic' })).toBeDisabled();
    expect(screen.getByTestId('clinic-soon')).toHaveTextContent('Clinic search is coming soon.');
  });

  it('is not offered under 18', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: { ...agreed, age: 16 }, scans, ai: { provider } });
    await render(wrap(<TransplantScreen />));
    expect(await screen.findByText('Not available under 18')).toBeOnTheScreen();
    expect(provider.generate).not.toHaveBeenCalled();
  });
});

describe('Two futures on Predict', () => {
  it('Premium with a plan: drag between doing nothing and your plan at 30, 35 and 40', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: { ...agreed, ...premium, treatments: ['finasteride'] }, scans, ai: { provider } });
    await render(wrap(<PredictScreen />));
    expect(await screen.findByTestId('two-futures', {}, wait)).toBeOnTheScreen();
    for (const a of [30, 35, 40]) expect(screen.getByRole('tab', { name: `At ${a}` })).toBeOnTheScreen();
    expect(screen.getByRole('adjustable', { name: 'Doing nothing or Your plan' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'At 40' }));
    expect(screen.getByTestId('two-futures-line')).toHaveTextContent(/^At 40: N[\d.]+ doing nothing, N[\d.]+ on your plan\.$/);
    // Both futures at 40 are made with 15 years.
    await waitFor(() => expect(provider.generate.mock.calls.filter(([r]) => r.years === 15).length).toBe(2));
  });

  it('free: locked, and makes nothing', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: { ...agreed, treatments: ['finasteride'] }, scans, ai: { provider } });
    await render(wrap(<PredictScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Unlock two futures' }, wait));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    await act(async () => {});
    expect(provider.generate.mock.calls.every(([r]) => r.years === 1)).toBe(true);
  });

  it('links to the try-ons', async () => {
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<PredictScreen />));
    await fireEvent.press(await screen.findByRole('link', { name: 'Try a hairstyle' }, wait));
    expect(router.push).toHaveBeenCalledWith('/styles');
    await fireEvent.press(screen.getByRole('link', { name: 'Transplant preview' }));
    expect(router.push).toHaveBeenCalledWith('/transplant');
  });
});
