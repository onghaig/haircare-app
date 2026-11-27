import { fireEvent, render, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import PanoramaScreen from '@/app/scan/panorama';
import ScanResultScreen from '@/app/scan/[id]';
import { arc, availableViews, layersAt, nearestView, stepAngle, wrap } from '@/scan/panorama';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';
import { ScanProvider } from '@/scan/ScanProvider';
import { MemoryScanStore } from '@/scan/store';

import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 's1' })),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const ALL = ['front', 'leftTemple', 'rightTemple', 'top', 'crown'] as const;
const views = Object.fromEntries(ALL.map((v) => [v, { uri: `file:///scans/s1/${v}.jpg`, score: 90 }]));
const scan = record('s1', '2026-11-20T09:00:00Z', { views });

describe('panorama blending', () => {
  it('wraps angles and finds the shortest turn', () => {
    expect(wrap(-60)).toBe(300);
    expect(wrap(420)).toBe(60);
    expect(arc(350, 10)).toBe(20);
    expect(arc(10, 350)).toBe(-20);
  });

  it('shows one photo clearly at its own angle and blends between neighbours', () => {
    expect(layersAt(0, [...ALL])).toEqual([{ view: 'front', opacity: 1 }]);
    expect(layersAt(60, [...ALL])).toEqual([{ view: 'leftTemple', opacity: 1 }]);
    const mid = layersAt(30, [...ALL]);
    expect(mid.map((l) => l.view)).toEqual(['front', 'leftTemple']);
    expect(mid[0].opacity + mid[1].opacity).toBeCloseTo(1);
    expect(layersAt(330, [...ALL]).map((l) => l.view)).toEqual(['rightTemple', 'front']);
  });

  it('skips views the scan does not have', () => {
    const noCrown = ['front', 'leftTemple', 'rightTemple'] as const;
    expect(layersAt(180, [...noCrown]).map((l) => l.view)).toEqual(['leftTemple', 'rightTemple']);
    expect(layersAt(90, ['front'])).toEqual([{ view: 'front', opacity: 1 }]);
    expect(nearestView(170, [...ALL])?.label).toBe('Back');
    expect(availableViews(record('x', '2026-11-20T09:00:00Z'))).toEqual(['front']);
    expect(stepAngle(0, 1, [...ALL])).toBe(60);
    expect(stepAngle(0, -1, [...ALL])).toBe(300);
    expect(stepAngle(60, 1, [...noCrown])).toBe(300);
  });
});

describe('panorama screen', () => {
  beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({ id: 's1' }));

  it('turns around the head by dragging, by the strip, and with VoiceOver', async () => {
    await render(
      <ScanProvider store={new MemoryScanStore([scan])}>
        <PanoramaScreen />
      </ScanProvider>,
    );
    await fireEvent.press(await screen.findByRole('tab', { name: 'Turn around' }));
    expect(await screen.findByTestId('panorama-angle')).toHaveTextContent('Front');
    const viewer = screen.getByTestId('panorama-viewer');
    await fireEvent(viewer, 'responderGrant', { nativeEvent: { pageX: 300 } });
    await fireEvent(viewer, 'responderMove', { nativeEvent: { pageX: 60 } });
    expect(screen.getByTestId('panorama-angle')).toHaveTextContent('Left side');
    await fireEvent.press(screen.getByRole('button', { name: 'Show back' }));
    expect(screen.getByTestId('panorama-angle')).toHaveTextContent('Back');
    await fireEvent.press(screen.getByRole('button', { name: 'Show top' }));
    expect(screen.getByTestId('panorama-angle')).toHaveTextContent('Top');
    await fireEvent(viewer, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('panorama-angle')).toHaveTextContent('Right side');
    await fireEvent(viewer, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('panorama-angle')).toHaveTextContent('Front');
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('opens from the scan result', async () => {
    await render(
      <ProfileProvider store={new MemoryProfileStore(emptyProfile())}>
        <ScanProvider store={new MemoryScanStore([scan])}>
          <ScanResultScreen />
        </ScanProvider>
      </ProfileProvider>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'See your scalp map' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/scan/panorama', params: { id: 's1' } });
  });
});
