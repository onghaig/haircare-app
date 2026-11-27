import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import AiPreviewConsentScreen from '@/app/ai-preview';
import { FutureLook } from '@/components/reveal/FutureLook';
import { useScans } from '@/scan/ScanProvider';
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
const free = { age: 30, sex: 'male' as const, completedAt: '2026-11-01T00:00:00Z' };
// AI pictures are only made for subscribers.
const adult = { ...free, subscription: { plan: 'annual' as const, startedAt: '2026-11-26T10:00:00Z', trialEndsAt: null, test: true } };
const agreed = { ...adult, aiPreview: { consentAt: '2026-11-26T00:00:00Z' } };

function fakeProvider(impl?: () => Promise<{ imageBase64: string; mimeType: string }>): PreviewProvider & { generate: jest.Mock } {
  return { name: 'fake', generate: jest.fn(impl ?? (async () => ({ imageBase64: 'QUk=', mimeType: 'image/png' }))) };
}

beforeEach(() => jest.clearAllMocks());

describe('Future look with the AI preview', () => {
  it('shows your own photo with the forecast hairline when no preview service is set up', async () => {
    const withLine = [record('s1', '2026-11-20T09:00:00Z', { hairline: { centreMM: 68, curve: [[0.3, 0.3], [0.5, 0.26], [0.7, 0.3]] } })];
    const { wrap } = makeProviders({ profile: agreed, scans: withLine });
    await render(wrap(<FutureLook stage={4} age={35} years={5} locked={false} />));
    expect(screen.queryByTestId('future-photo')).toBeNull();
    expect(await screen.findByTestId('future-own-photo')).toBeOnTheScreen();
    expect(screen.getByTestId('future-own-photo-projected')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(screen.getByText('Rough preview on your photo, dashed line at your likely hairline. Not a medical prediction')).toBeOnTheScreen();
  });

  it('never draws a face: with no scan it says so in words', async () => {
    const { wrap } = makeProviders({ profile: agreed, scans: [] });
    await render(wrap(<FutureLook stage={3.2} age={35} years={5} locked={false} />));
    expect(await screen.findByTestId('no-photo')).toHaveTextContent('N3 at 35Do a scan to see this on your own photo.');
  });

  it('asks before any photo leaves the phone', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: adult, scans, ai: { provider } });
    await render(wrap(<FutureLook stage={3.2} age={35} years={5} locked={false} />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Show the hair change with AI' }));
    expect(router.push).toHaveBeenCalledWith('/ai-preview');
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('never offers it to under-18s', async () => {
    const provider = fakeProvider();
    const { wrap } = makeProviders({ profile: { ...agreed, age: 16 }, scans, ai: { provider } });
    await render(wrap(<FutureLook stage={3.2} age={21} years={5} locked={false} />));
    expect(screen.queryByRole('button', { name: /AI/ })).toBeNull();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('makes the preview once agreed, shows it labelled as AI, and keeps it blurred when locked', async () => {
    let finish: () => void = () => {};
    const provider = fakeProvider(
      () => new Promise((resolve) => (finish = () => resolve({ imageBase64: 'QUk=', mimeType: 'image/png' }))),
    );
    const prepare = jest.fn(async () => 'U01BTEw=');
    const store = new MemoryPreviewStore();
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { provider, prepare, store } });
    await render(wrap(<FutureLook stage={3.2} age={35} years={5} locked />));
    expect(await screen.findByTestId('ai-preview-loading')).toBeOnTheScreen();
    await waitFor(() => expect(provider.generate).toHaveBeenCalled());
    await act(async () => finish());
    expect(await screen.findByTestId('future-photo')).toBeOnTheScreen();
    expect(screen.getByTestId('future-blur')).toBeOnTheScreen();
    expect(screen.getByText('AI illustration from your forecast. Estimate only.')).toBeOnTheScreen();
    expect(prepare).toHaveBeenCalledWith('file:///scans/s1/front.heic');
    expect(provider.generate).toHaveBeenCalledWith({ imageBase64: 'U01BTEw=', stage: 3, years: 5 });
    expect(store.files.has('s1-s3.0-y5')).toBe(true);
  });

  it('reuses a saved preview instead of making another', async () => {
    const provider = fakeProvider();
    const store = new MemoryPreviewStore();
    await store.put('s1-s3.0-y5', 'QUk=');
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { provider, store } });
    await render(wrap(<FutureLook stage={3.1} age={35} years={5} locked={false} />));
    expect(await screen.findByTestId('future-photo')).toBeOnTheScreen();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('says what went wrong and can try again', async () => {
    let fail = true;
    const provider = fakeProvider(async () => {
      if (fail) throw new Error('Too many previews right now.');
      return { imageBase64: 'QUk=', mimeType: 'image/png' };
    });
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { provider } });
    await render(wrap(<FutureLook stage={3.2} age={35} years={5} locked={false} />));
    expect(await screen.findByText('Couldn’t make your AI preview: Too many previews right now.')).toBeOnTheScreen();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('future-photo')).toBeOnTheScreen();
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('deletes a scan’s previews with the scan', async () => {
    const store = new MemoryPreviewStore();
    await store.put('s1-s3.0-y5', 'QUk=');
    await store.put('other-s3.0-y5', 'QUk=');
    let remove: ((id: string) => Promise<void>) | undefined;
    function Grab() {
      remove = useScans().remove;
      return null;
    }
    const { wrap } = makeProviders({ profile: agreed, scans, ai: { store } });
    await render(wrap(<Grab />));
    await act(async () => remove!('s1'));
    expect([...store.files.keys()]).toEqual(['other-s3.0-y5']);
  });
});

describe('AI preview consent', () => {
  it('explains what leaves the phone, and records a yes', async () => {
    const { wrap, stores } = makeProviders({ profile: adult, ai: { provider: fakeProvider() } });
    await render(wrap(<AiPreviewConsentScreen />));
    expect(await screen.findByText('Your photo leaves your phone for this')).toBeOnTheScreen();
    expect(screen.getByText('Nothing is kept on the server')).toBeOnTheScreen();
    expect(screen.getByText(/Estimate only/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Agree and make my preview' }));
    await waitFor(async () => expect((await stores.profile.load()).aiPreview?.consentAt).toBeTruthy());
    expect(router.back).toHaveBeenCalled();
  });

  it('turning it off deletes every preview on the phone', async () => {
    const store = new MemoryPreviewStore();
    await store.put('s1-s3.0-y5', 'QUk=');
    const { wrap, stores } = makeProviders({ profile: agreed, ai: { provider: fakeProvider(), store } });
    await render(wrap(<AiPreviewConsentScreen />));
    await fireEvent.press(await screen.findByRole('button', { name: 'Turn off AI previews' }));
    await waitFor(async () => expect((await stores.profile.load()).aiPreview?.declinedAt).toBeTruthy());
    expect(store.files.size).toBe(0);
  });

  it('is not available under 18', async () => {
    const { wrap } = makeProviders({ profile: { ...adult, age: 16 } });
    await render(wrap(<AiPreviewConsentScreen />));
    expect(await screen.findByText('Not available under 18')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Agree and make my preview' })).toBeNull();
  });
});
