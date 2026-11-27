import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { HairQualityCard } from '@/components/scan/HairQualityCard';
import { hairScore, ruleAnalyser, type HairAnalysis } from '@/scan/hairAnalysis';
import { needsHairAnalysis } from '@/scan/hairRunner';
import { HAIR_READ_DELAY_MS, ScanProvider, useScans } from '@/scan/ScanProvider';
import { estimateStage, densityStage } from '@/scan/stageEstimate';
import { MemoryScanStore } from '@/scan/store';
import { emptyProfile } from '@/profile/types';

import { record } from '../../test-utils/scanFixtures';
import { synthFace, synthHair } from '../../test-utils/synthHair';

const grid = { cols: 24, rows: 32, values: new Array(24 * 32).fill(0.8) };
const dryClean = { dry: true, noProduct: true, sameLength: true };

function analysis(scalp = 0): HairAnalysis {
  const f = synthFace();
  const t = synthHair({ scalp, shine: 100, box: { x0: 0.1, x1: 0.9, y0: 0.25, y1: 0.95 } });
  return ruleAnalyser.analyse(
    [
      { view: 'front', rgb: f.rgb, grid: f.grid, anchors: f.anchors, score: 90 },
      { view: 'top', rgb: t.rgb, grid: t.grid, score: 90 },
      { view: 'crown', rgb: t.rgb, grid: t.grid, score: 90 },
    ],
    dryClean,
  );
}

const withPhotos = (extra = {}) =>
  record('a', '2026-11-20T09:00:00Z', {
    views: { front: { uri: 'file:///f.jpg', score: 95, hairGrid: grid }, top: { uri: 'file:///t.jpg', score: 90, hairGrid: grid } },
    ...extra,
  });

describe('hair score', () => {
  it('scores thick shiny hair higher than thin hair, as a range', () => {
    const thick = analysis(0).score!;
    const thin = analysis(0.6).score!;
    expect(thick.value).toBeGreaterThan(thin.value);
    expect(thick.low).toBeLessThan(thick.value);
    expect(thick.high).toBeGreaterThan(thick.value);
    expect(thick.parts.map((p) => p.key)).toEqual(['thickness', 'smoothness', 'shine']);
  });

  it('needs at least two parts', () => {
    const q = analysis(0).quality;
    expect(hairScore({ ...q, frizz: { value: null, reason: 'x' }, shine: { value: null, reason: 'x' } }, null)).toBeNull();
  });
});

describe('scalp show-through in the stage estimate', () => {
  it('raises the estimate when a lot of scalp shows', () => {
    const thin = withPhotos({ hair: analysis(0.6) });
    expect(densityStage(thin)!.stage).toBe(4);
    expect(densityStage(withPhotos({ hair: analysis(0) }))!.stage).toBe(1);
    const e = estimateStage(thin, { ...emptyProfile(), age: 30 })!;
    expect(e.stage).toBeGreaterThanOrEqual(3.5);
    expect(e.signals.join(' ')).toMatch(/scalp shows through/);
  });
});

describe('reading hair after a scan is saved', () => {
  it('only reads scans with clear photos that haven’t been read', () => {
    expect(needsHairAnalysis(withPhotos())).toBe(true);
    expect(needsHairAnalysis(withPhotos({ hair: analysis(0) }))).toBe(false);
    expect(needsHairAnalysis(record('b', '2026-11-20T09:00:00Z'))).toBe(false);
  });

  it('saves the reading on the scan in the background', async () => {
    jest.useFakeTimers();
    const store = new MemoryScanStore([withPhotos()]);
    const hair = analysis(0);
    const readHair = jest.fn(async () => hair);
    function Probe() {
      const { records } = useScans();
      return <Text>{records[0]?.hair ? 'read' : 'not yet'}</Text>;
    }
    await render(
      <ScanProvider store={store} drafts={{ load: async () => null, save: async () => {}, clear: async () => {} }} readHair={readHair}>
        <Probe />
      </ScanProvider>,
    );
    await screen.findByText('not yet');
    await act(async () => {
      jest.advanceTimersByTime(HAIR_READ_DELAY_MS + 10);
    });
    jest.useRealTimers();
    await waitFor(() => expect(screen.getByText('read')).toBeTruthy());
    expect(readHair).toHaveBeenCalledTimes(1);
    expect((await store.list())[0].hair?.analyser).toBe('rules-v1');
  });
});

describe('hair card', () => {
  it('shows the score, the bars and each trait with how sure it is', async () => {
    await render(<HairQualityCard scan={withPhotos({ hair: analysis(0) })} />);
    expect(screen.getByText('Your hair score')).toBeTruthy();
    expect(screen.getByLabelText(/Hair score \d+ out of 100, likely \d+ to \d+/)).toBeTruthy();
    expect(screen.getByText('Thickness')).toBeTruthy();
    expect(screen.getByLabelText(/Thickness on top: Thick/)).toBeTruthy();
    expect(screen.getByLabelText(/Curl pattern: Straight/)).toBeTruthy();
    expect(screen.getByText(/can’t show split ends/)).toBeTruthy();
    expect(screen.getByText('Share my hair score')).toBeTruthy();
  });

  it('shares the score panel as an image', async () => {
    const { captureRef } = jest.requireMock('react-native-view-shot');
    const Sharing = jest.requireMock('expo-sharing');
    await render(<HairQualityCard scan={withPhotos({ hair: analysis(0) })} />);
    fireEvent.press(screen.getByText('Share my hair score'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(captureRef).toHaveBeenCalled();
  });

  it('says when it can’t read the hair', async () => {
    await render(<HairQualityCard scan={record('b', '2026-11-20T09:00:00Z')} />);
    expect(screen.getByText(/Not enough clear photos/)).toBeTruthy();
  });
});
