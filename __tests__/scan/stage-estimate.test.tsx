import { render, screen } from '@testing-library/react-native';

import type { HairGrid } from '@modules/headmap';
import { StageEstimateCard } from '@/components/scan/StageEstimateCard';
import { toForecastInput } from '@/profile/forecastInput';
import { emptyProfile, type Profile } from '@/profile/types';
import { backStage, estimateStage, frontStage, measuredGrader, setStageGrader, type StageGrader } from '@/scan/stageEstimate';

import { record } from '../../test-utils/scanFixtures';

const flat = (v: number): HairGrid => ({ cols: 12, rows: 16, values: Array(192).fill(v) });

function scan({ recession = 0.05, centre = 62, crown = 0.8, top = 0.8, score = 90 } = {}) {
  return record('s', '2026-11-20T09:00:00Z', {
    quality: score,
    hairline: { centreMM: centre, templeRecessionIPD: recession },
    views: {
      front: { uri: 'f', score },
      top: { uri: 't', score, hairGrid: flat(top) },
      crown: { uri: 'c', score, hairGrid: flat(crown) },
    },
  });
}
const profile: Profile = { ...emptyProfile(), age: 28 };

describe('measured Norwood estimate', () => {
  it('reads a straight hairline and full crown as stage 1', () => {
    const e = estimateStage(scan(), profile)!;
    expect(e.stage).toBe(1);
    expect(e.low).toBe(1);
    expect(e.high).toBe(1.5);
    expect(e.confidence).toBe('moderate');
    expect(e.grader).toBe('measured-v1');
  });

  it('raises the stage with temple recession, a high hairline and a thin crown', () => {
    expect(frontStage(scan({ recession: 0.2 }))!.stage).toBe(2);
    expect(frontStage(scan({ recession: 0.35 }))!.stage).toBe(3);
    expect(frontStage(scan({ recession: 0.05, centre: 85 }))!.stage).toBe(4);
    expect(backStage(scan({ crown: 0.5 }))!.stage).toBe(3);
    expect(backStage(scan({ crown: 0.2 }))!.stage).toBe(5);
    expect(backStage(scan({ crown: 0.1, top: 0.1 }))!.stage).toBe(7);
    expect(estimateStage(scan({ recession: 0.35, crown: 0.4 }), profile)!.stage).toBe(4);
  });

  it('always gives a range, wider when fewer signals are usable', () => {
    const onlyFront = record('s', '2026-11-20T09:00:00Z', { hairline: { templeRecessionIPD: 0.2 }, quality: 90 });
    const e = estimateStage(onlyFront, profile)!;
    expect(e.confidence).toBe('low');
    expect([e.low, e.stage, e.high]).toEqual([1, 2, 3]);
  });

  it('blends in what you told us, as weak evidence', () => {
    const told = { ...profile, zones: ['crown' as const, 'temples' as const] };
    expect(estimateStage(scan(), told)!.stage).toBe(1.5);
    expect(estimateStage(scan(), told)!.signals.at(-1)).toMatch(/where you said/);
  });

  it('gives no estimate from unclear photos', () => {
    expect(estimateStage(scan({ score: 40 }), profile)).toBeNull();
    expect(estimateStage(undefined, profile)).toBeNull();
  });

  it('lets a trained grader replace the measured one', () => {
    const fake: StageGrader = {
      id: 'trained-test',
      estimate: () => ({ stage: 3, low: 2.5, high: 3.5, confidence: 'high', grader: 'trained-test', signals: [] }),
    };
    setStageGrader(fake);
    try {
      expect(estimateStage(scan(), profile)!.grader).toBe('trained-test');
    } finally {
      setStageGrader(measuredGrader);
    }
  });

  it('feeds the forecast in place of the self-report', () => {
    const input = toForecastInput({ ...profile, zones: ['crown'] }, 2.5)!;
    expect(input.observations).toEqual([{ age: 28, stage: 2.5, source: 'scan_estimate' }]);
    expect(toForecastInput({ ...profile, zones: ['crown'] })!.observations![0].source).toBe('self_report');
  });
});

describe('estimate card', () => {
  it('shows the stage, the likely range, the confidence and that it is not a diagnosis', async () => {
    await render(<StageEstimateCard estimate={estimateStage(scan({ recession: 0.2 }), profile)} />);
    expect(screen.getByText('N2')).toBeOnTheScreen();
    expect(screen.getByText(/Likely N1\.5 to N2\.5/)).toBeOnTheScreen();
    expect(screen.getByText(/moderate confidence/)).toBeOnTheScreen();
    expect(screen.getByText(/not a diagnosis/)).toBeOnTheScreen();
  });

  it('says why there is no estimate', async () => {
    await render(<StageEstimateCard estimate={null} />);
    expect(screen.getByText(/Not enough clear photos/)).toBeOnTheScreen();
  });
});
