import { ForecastModel, type Forecast } from '@/forecast';
import { selfReportedStage, toForecastInput } from '@/profile/forecastInput';
import { emptyProfile, type Profile } from '@/profile/types';
import {
  analysisCounters,
  confidenceLabel,
  faceForStage,
  isLowRisk,
  rangeLabel,
  showsFuturePreview,
  stageLabel,
  zoneSummary,
} from '@/reveal/reveal';

import { record } from '../../test-utils/scanFixtures';

const p = (extra: Partial<Profile> = {}): Profile => ({ ...emptyProfile(), ...extra });

describe('labels', () => {
  it('rounds stages to the nearest half', () => {
    expect(stageLabel(2.1)).toBe('N2');
    expect(stageLabel(2.3)).toBe('N2.5');
    expect(stageLabel(2.8)).toBe('N3');
  });

  it('shows a range, collapsing when narrow', () => {
    expect(rangeLabel({ p10: 1.9, p50: 2.2, p90: 3.1 })).toBe('N2 to N3');
    expect(rangeLabel({ p10: 2.0, p50: 2.1, p90: 2.2 })).toBe('N2');
  });
});

describe('the drawn future face', () => {
  it('gets more receded with stage and is bald only at the top stages', () => {
    expect(faceForStage(1)).toEqual({ recede: 0, top: 0 });
    expect(faceForStage(2.5).recede).toBeCloseTo(0.6);
    expect(faceForStage(3).recede).toBeGreaterThan(faceForStage(2).recede);
    expect(faceForStage(5).top).toBeLessThan(0.9);
    expect(faceForStage(7).top).toBe(1);
    expect(faceForStage(0)).toEqual(faceForStage(1));
    expect(faceForStage(9)).toEqual(faceForStage(7));
  });
});

describe('zones', () => {
  it('names the weakest and strongest zones with one honest sentence', () => {
    expect(zoneSummary(p({ zones: ['temples'] }))).toEqual({
      weakest: 'Temples',
      strongest: 'Top',
      sentence: 'Your temples are changing faster than your top.',
    });
    expect(zoneSummary(p({ zones: ['crown', 'top'] })).sentence).toBe('Your crown is changing faster than your hairline.');
    expect(zoneSummary(p({ worriedOnly: true })).weakest).toBeNull();
    expect(zoneSummary(p({ zones: ['allOver'] })).weakest).toBe('All over');
  });
});

describe('self-reported stage', () => {
  it('is rough: worried 1, front 2, crown or both 3', () => {
    expect(selfReportedStage(p())).toBeNull();
    expect(selfReportedStage(p({ worriedOnly: true }))).toBe(1);
    expect(selfReportedStage(p({ zones: ['temples'] }))).toBe(2);
    expect(selfReportedStage(p({ zones: ['crown'] }))).toBe(3);
    expect(selfReportedStage(p({ zones: ['hairline', 'top'] }))).toBe(3);
    expect(toForecastInput(p({ age: 30, zones: ['temples'] }))?.observations).toEqual([
      { age: 30, stage: 2, source: 'self_report' },
    ]);
  });
});

describe('forecast-driven reveal', () => {
  const run = (profile: Profile): Forecast =>
    new ForecastModel().forecast(toForecastInput(profile)!, { years: [1, 3, 5, 10], samples: 20_000 });

  it('calls a young man with no family loss low risk, and one with heavy family loss not', () => {
    const low = run(p({ age: 20, worriedOnly: true, family: { father: { status: 'full' }, maternalGrandfather: { status: 'full' } } }));
    const high = run(
      p({ age: 30, zones: ['temples', 'crown'], family: { father: { status: 'bald', startAge: 30 }, brother: { status: 'bald' } } }),
    );
    expect(isLowRisk(low)).toBe(true);
    expect(isLowRisk(high)).toBe(false);
    expect(['high', 'moderate', 'low']).toContain(confidenceLabel(high));
  });
});

describe('analysis counters and teens', () => {
  it('counts real views, face points and answered relatives', () => {
    const scan = record('a', '2026-11-01T10:00:00Z');
    const c = analysisCounters(p({ age: 24, family: { father: { status: 'bald' }, mother: { status: 'unknown' } } }), scan);
    expect(c.views).toBe(Object.keys(scan.views).length);
    expect(c.points % 478).toBe(0);
    expect(c.relatives).toBe(1);
    expect(c.projectTo).toBe(50);
    expect(analysisCounters(p(), undefined)).toMatchObject({ views: 0, points: 0 });
  });

  it('never shows teens a future-face preview', () => {
    expect(showsFuturePreview(p({ age: 16 }))).toBe(false);
    expect(showsFuturePreview(p({ age: 18 }))).toBe(true);
  });
});
