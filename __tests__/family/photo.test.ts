import { photoStage, statusForStage } from '@/family/photoAnalysis';

import { report } from '../../test-utils/scanFixtures';

describe('relative photo analysis', () => {
  it('needs a visible forehead, and gives a stage with a wide range', () => {
    expect(photoStage(report('front'))).toBeNull();
    const hairline = { foreheadVisible: false, templeRecessionIPD: 0.4, centreMM: 70, curve: [] } as never;
    expect(photoStage(report('front', [], { hairline }))).toBeNull();
  });

  it('maps a stage to a status', () => {
    expect(statusForStage(1)).toBe('full');
    expect(statusForStage(3)).toBe('receding');
    expect(statusForStage(5)).toBe('bald');
  });
});
