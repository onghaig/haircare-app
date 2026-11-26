// The scan screen against a simulated native camera: the parts Jest can't reach through the
// "needs a development build" fallback (camera errors, the shutter, a full five-view run).
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import ScanSessionScreen from '@/app/scan/session';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';
import { ScanProvider } from '@/scan/ScanProvider';
import { SCAN_ORDER } from '@/scan/session';
import { MemoryScanStore } from '@/scan/store';

import { capture } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCamera: { props: any; capture: jest.Mock } = { props: null, capture: jest.fn() };

jest.mock('@modules/headmap', () => {
  const { View } = jest.requireActual('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    isHeadMapAvailable: true,
    requestCameraPermissionAsync: jest.fn(async () => 'granted'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HeadMapCameraView: React.forwardRef(function FakeCamera(props: any, ref: any) {
      mockCamera.props = props;
      React.useImperativeHandle(ref, () => ({ capture: mockCamera.capture, resetCapture: jest.fn() }));
      return React.createElement(View, { testID: 'native-camera' });
    }),
  };
});

async function openCamera(store = new MemoryScanStore(), revealSeenAt?: string) {
  await render(
    <ProfileProvider store={new MemoryProfileStore({ ...emptyProfile(), revealSeenAt })}>
      <ScanProvider store={store}>
        <ScanSessionScreen />
      </ScanProvider>
    </ProfileProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Start scan' }));
  await screen.findByTestId('native-camera');
  return store;
}

beforeEach(() => {
  mockCamera.props = null;
  mockCamera.capture.mockClear();
  jest.mocked(router.replace).mockClear();
});

describe('Scan session with the native camera', () => {
  it('shows a camera error instead of hanging silently', async () => {
    await openCamera();
    await act(async () => mockCamera.props.onError({ nativeEvent: { message: 'Camera unavailable' } }));
    expect(screen.getByText('Camera problem')).toBeOnTheScreen();
    expect(screen.getByText('Camera unavailable')).toBeOnTheScreen();
  });

  it('"Take photo now" fires the native shutter', async () => {
    await openCamera();
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo now' }));
    expect(mockCamera.capture).toHaveBeenCalledTimes(1);
  });

  it('runs all five views to a saved scan and opens its result', async () => {
    const store = await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
    await act(async () => mockCamera.props.onError({ nativeEvent: { message: 'Camera unavailable' } }));
    for (const view of SCAN_ORDER) {
      await act(async () => mockCamera.props.onCapture({ nativeEvent: capture(view) }));
    }
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const saved = await store.list();
    expect(saved).toHaveLength(1);
    expect(Object.keys(saved[0].views).sort()).toEqual([...SCAN_ORDER].sort());
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/scan/[id]', params: { id: saved[0].id } });
  });

  it('opens the forecast reveal after the very first finished scan', async () => {
    const store = await openCamera();
    for (const view of SCAN_ORDER) {
      await act(async () => mockCamera.props.onCapture({ nativeEvent: capture(view) }));
    }
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/reveal/analysing'));
    expect(await store.list()).toHaveLength(1);
  });

  it('always captures the crown: a spoken 3-second self-timer, which can be cancelled', async () => {
    jest.useFakeTimers();
    try {
      const Speech = jest.requireMock('expo-speech') as { speak: jest.Mock };
      await openCamera(new MemoryScanStore(), '2026-11-01T00:00:00Z');
      for (const view of SCAN_ORDER.slice(0, -1)) {
        await act(async () => mockCamera.props.onCapture({ nativeEvent: capture(view) }));
      }
      expect(screen.getByLabelText('View 5 of 5')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Take photo now' })).toBeNull();

      // Cancel first.
      await fireEvent.press(screen.getByRole('button', { name: 'Take crown photo in 3 seconds' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel timer' }));
      await act(async () => jest.advanceTimersByTime(4000));
      expect(mockCamera.capture).not.toHaveBeenCalled();

      Speech.speak.mockClear();
      await fireEvent.press(screen.getByRole('button', { name: 'Take crown photo in 3 seconds' }));
      expect(screen.getByText('3')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(1000));
      expect(screen.getByText('2')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(1000));
      expect(screen.getByText('1')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(1000));
      expect(mockCamera.capture).toHaveBeenCalledTimes(1);
      expect(Speech.speak.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['3', '2', '1']));
    } finally {
      jest.useRealTimers();
    }
  });
});
