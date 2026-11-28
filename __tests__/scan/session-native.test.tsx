// The scan screen against a simulated native camera: the parts Jest can't reach through the
// "needs a development build" fallback (camera errors, the shutter, a full five-view run).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import ScanSessionScreen from '@/app/scan/session';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';
import { MemoryDraftStore } from '@/scan/draft';
import { FINISH_MS } from '@/components/scan/ScanFinish';
import { MANUAL_AFTER_MS } from '@/scan/guidance';
import { ScanProvider } from '@/scan/ScanProvider';
import { CELL_COUNT, FACE_CELLS, PANO_STALL_MS } from '@/scan/headCoverage';
import { SCAN_ORDER, SHOW_CAPTURED_MS } from '@/scan/session';
import { MemoryScanStore } from '@/scan/store';

import { capture, record, report } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCamera: { props: any; capture: jest.Mock; startBurst: jest.Mock; finishPanorama: jest.Mock } = {
  props: null,
  capture: jest.fn(),
  startBurst: jest.fn(),
  finishPanorama: jest.fn(),
};

jest.mock('@modules/headmap', () => {
  const { View } = jest.requireActual('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    isHeadMapAvailable: true,
    requestCameraPermissionAsync: jest.fn(async () => 'granted'),
    prepareVoiceAudioAsync: jest.fn(async () => {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HeadMapCameraView: React.forwardRef(function FakeCamera(props: any, ref: any) {
      mockCamera.props = props;
      React.useImperativeHandle(ref, () => ({
        capture: mockCamera.capture,
        resetCapture: jest.fn(),
        startBurst: mockCamera.startBurst,
        finishPanorama: mockCamera.finishPanorama,
        resetPanorama: jest.fn(async () => {}),
      }));
      return React.createElement(View, { testID: 'native-camera' });
    }),
  };
});

async function openCamera(store = new MemoryScanStore(), revealSeenAt?: string) {
  await render(
    <ProfileProvider store={new MemoryProfileStore({ ...emptyProfile(), revealSeenAt })}>
      <ScanProvider store={store} drafts={new MemoryDraftStore()}>
        <ScanSessionScreen />
      </ScanProvider>
    </ProfileProvider>,
  );
  // A first scan offers a practice view; these tests go straight to the scan.
  await fireEvent.press(await screen.findByRole('button', { name: /^(Start scan|Skip to the scan)$/ }));
  await screen.findByTestId('native-camera');
  return store;
}

/** The camera reports a photo; the finished line holds for a moment, then the next view starts. */
async function shot(view: (typeof SCAN_ORDER)[number]) {
  if (view === 'crown') {
    // Someone helping taps "take photo now": the burst's best frame comes back, you check it, and keep it.
    await fireEvent.press(screen.getByRole('button', { name: 'Someone’s helping: take photo now' }));
    await act(async () => mockCamera.props.onCapture({ nativeEvent: { ...capture('crown'), burst: true } }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep this photo' }));
    await wholeHead();
    return;
  }
  await act(async () => mockCamera.props.onCapture({ nativeEvent: capture(view) }));
  await act(async () => jest.advanceTimersByTime(SHOW_CAPTURED_MS));
}

const ALL_CELLS = Array.from({ length: CELL_COUNT }, (_, c) => c);

/** The whole-head panorama: the face sweep fills the front and sides, the back camera the rest. */
async function wholeHead() {
  await screen.findByTestId('panorama-face');
  await act(async () => mockCamera.props.onPanorama({ nativeEvent: { mode: 'face', filled: [...FACE_CELLS], ok: true } }));
  expect(screen.getByTestId('panorama-back')).toBeOnTheScreen();
  expect(mockCamera.props.panorama).toBe('back');
  await act(async () => mockCamera.props.onPanorama({ nativeEvent: { mode: 'back', filled: ALL_CELLS, ok: true } }));
  expect(mockCamera.finishPanorama).toHaveBeenCalled();
  await act(async () =>
    mockCamera.props.onPanoramaDone({
      nativeEvent: { frames: [{ uri: 'file:///pano-18.jpg', cell: 18, azimuth: 195, elevation: 50, mode: 'back', report: report('crown') }] },
    }),
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockCamera.props = null;
  mockCamera.capture.mockClear();
  mockCamera.startBurst.mockClear();
  mockCamera.finishPanorama.mockClear();
  jest.mocked(router.replace).mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Scan session with the native camera', () => {
  it('shows a camera error instead of hanging silently', async () => {
    await openCamera();
    await act(async () => mockCamera.props.onError({ nativeEvent: { message: 'Camera unavailable' } }));
    // Said in plain words, with the manual shutter as a way on.
    expect(screen.getByText('No camera found')).toBeOnTheScreen();
    expect(screen.queryByText('Camera unavailable')).toBeNull();
    expect(screen.getByRole('button', { name: 'Having trouble? Take it anyway' })).toBeOnTheScreen();
  });

  it('offers the manual shutter only after a view has been stuck for a while', async () => {
    await openCamera();
    await act(async () => mockCamera.props.onQuality({ nativeEvent: report('front', ['pose']) }));
    expect(screen.queryByRole('button', { name: 'Having trouble? Take it anyway' })).toBeNull();
    await act(async () => jest.advanceTimersByTime(MANUAL_AFTER_MS + 1000));
    await fireEvent.press(screen.getByRole('button', { name: 'Having trouble? Take it anyway' }));
    expect(mockCamera.capture).toHaveBeenCalledTimes(1);
  });

  it('runs all five views to a saved scan and opens its result', async () => {
    const store = await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    await act(async () => mockCamera.props.onError({ nativeEvent: { message: 'Camera unavailable' } }));
    for (const view of SCAN_ORDER) await shot(view);
    // The finish moment holds for a beat before moving on.
    expect(await screen.findByTestId('scan-finish')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(FINISH_MS));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const saved = await store.list();
    expect(saved).toHaveLength(1);
    expect(Object.keys(saved[0].views).sort()).toEqual([...SCAN_ORDER].sort());
    expect(saved[0].panorama?.map((f) => f.cell)).toEqual([18]);
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/scan/[id]', params: { id: saved[0].id } });
  });

  it('"Redo last photo" goes back to the view just taken and drops that photo', async () => {
    await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    expect(screen.queryByRole('button', { name: /Redo last photo/ })).toBeNull();
    await shot('front');
    await shot('leftTemple');
    expect(screen.getByLabelText('View 3 of 5')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Redo last photo: Left temple' }));
    expect(screen.getByLabelText('View 2 of 5')).toBeOnTheScreen();
    expect(mockCamera.props.view).toBe('leftTemple');
    // Then the scan carries on from where it was.
    await shot('leftTemple');
    expect(mockCamera.props.view).toBe('rightTemple');
  });

  it('a redo replaces the old scan only once the new one has saved', async () => {
    const old = record('old', '2026-11-10T09:00:00Z');
    const keep = record('keep', '2026-11-01T09:00:00Z');
    jest.mocked(useLocalSearchParams).mockReturnValue({ replaces: 'old' });
    const store = await openCamera(new MemoryScanStore([keep, old]), '2026-11-01T00:00:00Z');
    for (const view of SCAN_ORDER.slice(0, -1)) await shot(view);
    expect((await store.list()).map((r) => r.id)).toEqual(['keep', 'old']);
    await shot('crown');
    // The finish moment holds for a beat before moving on.
    expect(await screen.findByTestId('scan-finish')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(FINISH_MS));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const ids = (await store.list()).map((r) => r.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('keep');
    expect(ids).not.toContain('old');
    jest.mocked(useLocalSearchParams).mockReturnValue({});
  });

  it('opens the forecast reveal after the very first finished scan', async () => {
    const store = await openCamera();
    for (const view of SCAN_ORDER) await shot(view);
    // The finish moment holds for a beat before moving on.
    expect(await screen.findByTestId('scan-finish')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(FINISH_MS));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/reveal/analysing'));
    expect(await store.list()).toHaveLength(1);
  });

  it('crown: one photo from high above on a spoken countdown, then a check with a density estimate', async () => {
    const Speech = jest.requireMock('expo-speech') as { speak: jest.Mock };
    await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    for (const view of SCAN_ORDER.slice(0, -1)) await shot(view);
    expect(screen.getByLabelText('View 5 of 5')).toBeOnTheScreen();
    expect(screen.getByText('Hold the phone up high')).toBeOnTheScreen();
    expect(mockCamera.props.autoCapture).toBe(false);
    expect(Speech.speak.mock.calls.map((c) => c[0]).some((l: string) => /high above your head/.test(l))).toBe(true);

    Speech.speak.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByTestId('crown-countdown')).toHaveTextContent('4');
    expect(mockCamera.startBurst).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) await act(async () => jest.advanceTimersByTime(1000));
    const said = Speech.speak.mock.calls.map((c) => c[0]);
    expect(said).toEqual(expect.arrayContaining(['4', '3', '2', '1']));
    // No aiming: the countdown ends straight in the photo.
    expect(mockCamera.startBurst).toHaveBeenCalledWith(1000);
    expect(screen.getByText('Hold still')).toBeOnTheScreen();

    // A miss: check it, retake it, then keep the next one.
    await act(async () =>
      mockCamera.props.onCapture({ nativeEvent: { ...capture('crown', 40, { failed: ['hairInFrame'] }), burst: true } }),
    );
    expect(screen.getByTestId('crown-review')).toBeOnTheScreen();
    expect(screen.getByText('Not much hair in this one')).toBeOnTheScreen();
    expect(screen.queryByTestId('crown-estimate')).toBeNull();
    expect(mockCamera.props.active).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Retake crown photo' }));
    expect(screen.getByTestId('crown-countdown')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo now' }));
    expect(mockCamera.startBurst).toHaveBeenCalledTimes(2);
    // A thinning crown: hair all round, scalp showing in the middle.
    const cols = 12;
    const rows = 16;
    const values = Array.from({ length: cols * rows }, (_, i) => {
      const d = Math.hypot((i % cols) + 0.5 - 6, Math.floor(i / cols) + 0.5 - 8);
      return d > 5.5 ? 0 : d < 4.2 ? 0.1 : 1;
    });
    await act(async () => mockCamera.props.onCapture({ nativeEvent: { ...capture('crown', 100, { hairGrid: { cols, rows, values } }), burst: true } }));
    expect(screen.getByText('Looks usable')).toBeOnTheScreen();
    expect(screen.getByTestId('crown-estimate')).toHaveTextContent(/thinning|scalp/);
    expect(screen.getByTestId('crown-estimate')).toHaveTextContent(/not a diagnosis/);
    await fireEvent.press(screen.getByRole('button', { name: 'Keep this photo' }));
    await wholeHead();
    // The finish moment holds for a beat before moving on.
    expect(await screen.findByTestId('scan-finish')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(FINISH_MS));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it('whole head: talks you round your head, shows what is covered, and never traps you', async () => {
    const Speech = jest.requireMock('expo-speech') as { speak: jest.Mock };
    const store = await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    for (const view of SCAN_ORDER.slice(0, -1)) await shot(view);
    Speech.speak.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Someone’s helping: take photo now' }));
    await act(async () => mockCamera.props.onCapture({ nativeEvent: { ...capture('crown'), burst: true } }));
    await fireEvent.press(screen.getByRole('button', { name: 'Keep this photo' }));

    // The face sweep: front camera, the coverage picture, and a spoken start.
    expect(await screen.findByTestId('panorama-face')).toBeOnTheScreen();
    expect(mockCamera.props.panorama).toBe('face');
    expect(mockCamera.props.view).toBe('front');
    expect(mockCamera.props.autoCapture).toBe(false);
    expect(screen.getByTestId('head-coverage')).toBeOnTheScreen();
    expect(Speech.speak.mock.calls.map((c) => c[0]).some((l: string) => /whole head/.test(l))).toBe(true);
    // Half the front filled: the hint says which way to turn.
    await act(async () => mockCamera.props.onPanorama({ nativeEvent: { mode: 'face', filled: [0, 1, 2], ok: true } }));
    expect(screen.getByTestId('panorama-hint')).toHaveTextContent(/left shoulder/);
    expect(screen.getByTestId('panorama-count')).toHaveTextContent(/^3 of 25 areas/);
    // Stuck: a way on appears instead of a dead end.
    expect(screen.queryByRole('button', { name: 'Next: the back of my head' })).toBeNull();
    await act(async () => jest.advanceTimersByTime(PANO_STALL_MS + 1000));
    await fireEvent.press(screen.getByRole('button', { name: 'Next: the back of my head' }));

    // The back: back camera, helper instructions, and finishing with gaps if it has to.
    expect(screen.getByTestId('panorama-back')).toBeOnTheScreen();
    expect(mockCamera.props.panorama).toBe('back');
    expect(Speech.speak.mock.calls.map((c) => c[0]).some((l: string) => /someone helps/.test(l))).toBe(true);
    await act(async () => mockCamera.props.onPanorama({ nativeEvent: { mode: 'back', filled: [0, 1, 2, 6], azimuth: 180, ok: true } }));
    await act(async () => jest.advanceTimersByTime(PANO_STALL_MS + 1000));
    await fireEvent.press(screen.getByRole('button', { name: 'Finish now (21 areas missing)' }));
    expect(mockCamera.finishPanorama).toHaveBeenCalledTimes(1);
    await act(async () => mockCamera.props.onPanoramaDone({ nativeEvent: { frames: [] } }));
    expect(await screen.findByTestId('scan-finish')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(FINISH_MS));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(await store.list()).toHaveLength(1);
  });

  it('temples take the photo as soon as the hairline is clear, without waiting for the line to draw', async () => {
    await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    await fireEvent(screen.getByTestId('scan-camera'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    await act(async () => jest.advanceTimersByTime(1600));
    await shot('front');
    expect(mockCamera.props.view).toBe('leftTemple');
    // No draw wait on the temple: the camera's auto-capture is on from the start, so it fires as
    // soon as its checks (turned, hairline traced, light, still) pass.
    expect(mockCamera.props.autoCapture).toBe(true);
  });

  it('lets the green line finish drawing before the photo, then holds it with "Got it"', async () => {
    await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    await fireEvent(screen.getByTestId('scan-camera'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
    expect(await screen.findByTestId('hairline-template')).toBeOnTheScreen();
    expect(mockCamera.props.autoCapture).toBe(false);
    await act(async () => jest.advanceTimersByTime(1600));
    expect(mockCamera.props.autoCapture).toBe(true);

    await act(async () => mockCamera.props.onCapture({ nativeEvent: capture('front') }));
    expect(screen.getByText('Got it')).toBeOnTheScreen();
    expect(screen.getByLabelText('View 1 of 5')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(SHOW_CAPTURED_MS));
    expect(screen.getByLabelText('View 2 of 5')).toBeOnTheScreen();
  });

  it('says so when the scan cannot be saved, instead of hanging', async () => {
    const store = new MemoryScanStore();
    jest.spyOn(store, 'save').mockRejectedValue(new Error('Disk full'));
    await openCamera(store, '2026-11-01T00:00:00Z');
    for (const view of SCAN_ORDER) await shot(view);
    expect(await screen.findByText('Couldn’t save this scan')).toBeOnTheScreen();
    expect(screen.getByText('Disk full')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('talks you through each view by default', async () => {
    const Speech = jest.requireMock('expo-speech') as { speak: jest.Mock };
    Speech.speak.mockClear();
    const { prepareVoiceAudioAsync } = jest.requireMock('@modules/headmap') as { prepareVoiceAudioAsync: jest.Mock };
    await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    expect(prepareVoiceAudioAsync).toHaveBeenCalled();
    expect(Speech.speak.mock.calls[0][0]).toBe('Let’s start with your hairline. Pull your hair back off your forehead. Then look straight at the phone, chin level.');
    expect(screen.getByTestId('hair-back')).toHaveTextContent('Pull your hair back off your forehead, so the hairline shows');
    expect(screen.getByRole('switch', { name: 'Voice guidance' })).toBeChecked();
    await shot('front');
    expect(Speech.speak.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(Got it\.|Nice, got that one\.|Perfect\.)$/),
        expect.stringMatching(/^Now your left temple\. Pull your hair back off your left temple\. Then show your left temple: turn your nose toward your right shoulder/),
      ]),
    );
  });
});
