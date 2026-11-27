import { fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import type { HairGrid } from '@modules/headmap';
import PanoramaScreen from '@/app/scan/panorama';
import { compareZone, comparisonText, gridCells, photoPlacement, ZONES, zoneCoverage } from '@/scan/scalpMap';
import { ScanProvider } from '@/scan/ScanProvider';
import { MemoryScanStore } from '@/scan/store';

import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'now' })),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const ALL = ['front', 'leftTemple', 'rightTemple', 'top', 'crown'] as const;
const flat = (v: number): HairGrid => ({ cols: 12, rows: 16, values: Array(192).fill(v) });
const zone = (v: (typeof ALL)[number]) => ZONES.find((z) => z.view === v)!;

function scanWith(id: string, takenAt: string, coverage: Partial<Record<(typeof ALL)[number], number>>, score = 90) {
  const views = Object.fromEntries(
    ALL.map((v) => [v, { uri: `file:///scans/${id}/${v}.jpg`, score, ...(coverage[v] != null ? { hairGrid: flat(coverage[v]!) } : {}) }]),
  );
  return record(id, takenAt, { views });
}

describe('scalp map layout', () => {
  it('has one zone per scan view, inside the map', () => {
    expect(ZONES.map((z) => z.view).sort()).toEqual([...ALL].sort());
    for (const z of ZONES) {
      expect(z.box.x).toBeGreaterThanOrEqual(0);
      expect(z.box.x + z.box.w).toBeLessThanOrEqual(200);
    }
    // Your left is on the left when you look down at your own head.
    expect(zone('leftTemple').box.x).toBeLessThan(zone('rightTemple').box.x);
    expect(zone('front').box.y).toBeLessThan(zone('crown').box.y);
  });

  it('fills each zone with that zone’s part of the photo (the hair, not the face)', () => {
    for (const z of ZONES) {
      const p = photoPlacement(z);
      expect(p.w / p.h).toBeCloseTo(9 / 16);
      // The roi, placed on the map, covers the zone's box.
      const rx = p.x + z.roi.x * p.w;
      const ry = p.y + z.roi.y * p.h;
      expect(rx).toBeLessThanOrEqual(z.box.x + 1e-9);
      expect(ry).toBeLessThanOrEqual(z.box.y + 1e-9);
      expect(rx + z.roi.w * p.w).toBeGreaterThanOrEqual(z.box.x + z.box.w - 1e-9);
      expect(ry + z.roi.h * p.h).toBeGreaterThanOrEqual(z.box.y + z.box.h - 1e-9);
    }
    // A temple zone shows the top of its photo, not the middle where the face is.
    const t = zone('leftTemple');
    const p = photoPlacement(t);
    expect((t.box.y + t.box.h - p.y) / p.h).toBeLessThanOrEqual(t.roi.y + t.roi.h + 1e-9);
  });

  it('places the hair grid on the photo and only keeps cells that can show', () => {
    const z = zone('crown');
    const cells = gridCells(z, flat(0.5));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(192);
    expect(cells.every((c) => c.value === 0.5)).toBe(true);
  });

  it('measures coverage only in the zone’s part of the photo', () => {
    const values = Array(192).fill(0);
    // Hair only in the top quarter of the photo.
    for (let i = 0; i < 12 * 4; i++) values[i] = 1;
    const grid = { cols: 12, rows: 16, values };
    expect(zoneCoverage(zone('front'), grid)!).toBeGreaterThan(zoneCoverage(zone('crown'), grid)!);
  });
});

describe('zone comparison against your first scan', () => {
  const base = scanWith('base', '2026-01-01T09:00:00Z', { front: 0.6, crown: 0.6, top: 0.6, leftTemple: 0.6 });

  it('calls small changes the same, and shows bigger ones as a rounded range', () => {
    const now = scanWith('now', '2026-11-01T09:00:00Z', { front: 0.62, crown: 0.36, top: 0.84, leftTemple: 0.6 });
    expect(comparisonText(compareZone(zone('front'), now, base))).toBe('About the same as your first scan (within ±10%).');
    const crown = compareZone(zone('crown'), now, base);
    expect(crown).toEqual({ kind: 'less', low: 30, high: 50 });
    expect(comparisonText(crown)).toBe('Roughly 30–50% less hair coverage seen than your first scan.');
    expect(compareZone(zone('top'), now, base)).toEqual({ kind: 'more', low: 30, high: 50 });
  });

  it('says when there is nothing fair to compare', () => {
    const now = scanWith('now', '2026-11-01T09:00:00Z', { front: 0.6 });
    expect(compareZone(zone('front'), base, base)).toEqual({ kind: 'first' });
    expect(compareZone(zone('crown'), now, base)).toEqual({ kind: 'unavailable', reason: 'noMap' });
    expect(compareZone(zone('rightTemple'), scanWith('n', '2026-11-01T09:00:00Z', { rightTemple: 0.5 }), base)).toEqual({
      kind: 'unavailable',
      reason: 'noMap',
    });
    const blurry = scanWith('b', '2026-11-01T09:00:00Z', { front: 0.6 }, 40);
    expect(comparisonText(compareZone(zone('front'), blurry, base))).toBe('Photo too unclear to compare.');
  });
});

describe('scalp map screen', () => {
  it('opens on the map, switches layers and lists each zone against the first scan', async () => {
    const base = scanWith('base', '2026-01-01T09:00:00Z', { front: 0.6, crown: 0.6 });
    const now = scanWith('now', '2026-11-01T09:00:00Z', { front: 0.6, crown: 0.3 });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: 'now' });
    await render(
      <ScanProvider store={new MemoryScanStore([base, now])}>
        <PanoramaScreen />
      </ScanProvider>,
    );
    expect(await screen.findByText('Your scalp map')).toBeOnTheScreen();
    expect(screen.getByTestId('scalp-map')).toBeOnTheScreen();
    expect(screen.getByTestId('zone-row-crown')).toHaveTextContent(/Roughly 40–60% less/);
    expect(screen.getByTestId('zone-row-front')).toHaveTextContent(/About the same/);
    expect(screen.getByText(/not a medical measurement/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Hair only' }));
    expect(screen.getByRole('tab', { name: 'Hair only' })).toBeSelected();
    await fireEvent.press(screen.getByTestId('zone-row-crown'));
    expect(screen.getByTestId('zone-row-crown')).toBeSelected();
  });
});
