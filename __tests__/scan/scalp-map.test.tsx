import { fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import PanoramaScreen from '@/app/scan/panorama';
import { zonePaths } from '@/components/scan/ScalpMap';
import { canMap, compareZone, comparisonText, scanHairMap } from '@/scan/scalpMap';
import { ScanProvider } from '@/scan/ScanProvider';
import { MemoryScanStore } from '@/scan/store';

import { record } from '../../test-utils/scanFixtures';
import { synthViews } from '../../test-utils/synthHead';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'now' })),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/scan/scalpRender', () => ({ renderScalpImage: jest.fn(async () => 'file:///cache/scalp-maps/now-v1.bmp') }));

const full = (id: string, takenAt: string) => record(id, takenAt, { views: synthViews(id) });
const baldOnTop = (id: string, takenAt: string) => record(id, takenAt, { views: synthViews(id, { baldAbove: 100 }) });

describe('scalp map from the head model', () => {
  it('maps every zone of a full scan, and none of a scan from before landmarks were saved', () => {
    const map = scanHairMap(full('a', '2026-01-01T09:00:00Z'));
    for (const z of ['front', 'leftTemple', 'rightTemple', 'top', 'crown'] as const) expect(map.zones[z]).not.toBeNull();
    const old = record('old', '2026-01-01T09:00:00Z', { views: { front: { uri: 'f', score: 90 } } });
    expect(canMap(old)).toBe(false);
    expect(comparisonText(compareZone('front', old, undefined))).toBe('No photo reaches this zone.');
  });

  it('compares each zone with your first scan as a rounded range', () => {
    const base = full('base', '2026-01-01T09:00:00Z');
    const now = baldOnTop('now', '2026-11-01T09:00:00Z');
    expect(compareZone('top', base, base)).toEqual({ kind: 'first' });
    const top = compareZone('top', now, base);
    expect(top.kind).toBe('less');
    // One scan showing less is not a loss yet: it could be light or angle.
    expect(comparisonText(top, 'top')).toBe('Possible change on top. Your next scan will confirm it.');
    const confirmed = compareZone('top', now, base, { previous: baldOnTop('mid', '2026-10-01T09:00:00Z') });
    expect(confirmed).toMatchObject({ kind: 'less', confirmed: true });
    expect(comparisonText(confirmed)).toMatch(/^Roughly \d+–\d+% less hair coverage seen than your first scan\.$/);
    expect(compareZone('rightTemple', full('n2', '2026-11-01T09:00:00Z'), base)).toEqual({ kind: 'same', margin: 10 });
  });

  it('leaves unclear photos out of the comparison', () => {
    const base = full('base', '2026-01-01T09:00:00Z');
    const blurry = record('b', '2026-11-01T09:00:00Z', { views: synthViews('b', { score: 40 }) });
    expect(comparisonText(compareZone('front', blurry, base))).toBe('Photos too unclear to compare here.');
  });

  it('draws the zone outlines inside the map', () => {
    const paths = zonePaths(200);
    expect(paths).toHaveLength(7);
    for (const d of paths) {
      for (const n of d.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
        expect(n).toBeGreaterThanOrEqual(-0.01);
        expect(n).toBeLessThanOrEqual(200.01);
      }
    }
  });
});

describe('scalp map screen', () => {
  it('opens on the mapped head, switches layers and lists each zone against the first scan', async () => {
    const base = full('base', '2026-01-01T09:00:00Z');
    const now = baldOnTop('now', '2026-11-01T09:00:00Z');
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'now' });
    await render(
      <ScanProvider store={new MemoryScanStore([base, now])}>
        <PanoramaScreen />
      </ScanProvider>,
    );
    expect(await screen.findByText('Your scalp map')).toBeOnTheScreen();
    expect(await screen.findByTestId('scalp-map-image')).toBeOnTheScreen();
    expect(screen.getByTestId('zone-row-top')).toHaveTextContent(/Possible change on top/);
    expect(screen.getByTestId('zone-row-front')).toHaveTextContent(/About the same/);
    expect(screen.getByText(/not a medical measurement/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Hair only' }));
    expect(screen.getByRole('tab', { name: 'Hair only' })).toBeSelected();
    expect(screen.queryByTestId('scalp-map-image')).toBeNull();
    await fireEvent.press(screen.getByTestId('zone-row-top'));
    expect(screen.getByTestId('zone-row-top')).toBeSelected();
  });
});
